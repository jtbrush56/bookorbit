package app.bookorbit.plugins.backgroundaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat

/**
 * Foreground service owning the actual MediaPlayer instance, the MediaSession used for
 * lock-screen / notification transport controls, and the persistent playback notification.
 * Started so Android keeps it alive and exempt from background execution limits while audio
 * plays, and bound so [BackgroundAudioPlugin] can send commands and receive state callbacks
 * directly without a broadcast round-trip.
 *
 * Unverified: never compiled against a real Android toolchain or run on a device/emulator. See
 * the package README before relying on this.
 */
class BackgroundAudioService : Service() {

    interface Listener {
        fun onPlay()
        fun onPause()
        fun onEnded()
        fun onPositionUpdate(positionSeconds: Double, durationSeconds: Double)
        fun onRemoteNext()
        fun onRemotePrevious()
        fun onRemoteSeek(positionSeconds: Double)
        fun onRemoteSkipForward()
        fun onRemoteSkipBackward()
        fun onError(message: String)
    }

    inner class LocalBinder : Binder() {
        fun getService(): BackgroundAudioService = this@BackgroundAudioService
    }

    private val binder = LocalBinder()
    private var mediaPlayer: MediaPlayer? = null
    private lateinit var mediaSession: MediaSessionCompat
    private val positionHandler = Handler(Looper.getMainLooper())
    private var positionRunnable: Runnable? = null
    private var currentTitle: String = ""
    private var currentArtist: String = ""
    private var currentArtwork: Bitmap? = null

    var listener: Listener? = null

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        mediaSession = MediaSessionCompat(this, "BookOrbitBackgroundAudio").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = this@BackgroundAudioService.play()
                override fun onPause() = this@BackgroundAudioService.pause()
                override fun onSkipToNext() {
                    listener?.onRemoteNext()
                }
                override fun onSkipToPrevious() {
                    listener?.onRemotePrevious()
                }
                override fun onSeekTo(pos: Long) {
                    listener?.onRemoteSeek(pos / 1000.0)
                }
                override fun onFastForward() {
                    listener?.onRemoteSkipForward()
                }
                override fun onRewind() {
                    listener?.onRemoteSkipBackward()
                }
            })
            isActive = true
        }
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> play()
            ACTION_PAUSE -> pause()
            ACTION_NEXT -> listener?.onRemoteNext()
            ACTION_PREVIOUS -> listener?.onRemotePrevious()
        }
        return START_NOT_STICKY
    }

    fun load(url: String, headers: Map<String, String>, title: String, artist: String?, startPositionSeconds: Double) {
        currentTitle = title
        currentArtist = artist ?: ""
        currentArtwork = null

        releasePlayer()
        stopPositionUpdates()

        val player = MediaPlayer()
        player.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        try {
            player.setDataSource(this, Uri.parse(url), headers)
        } catch (e: Exception) {
            listener?.onError("Failed to set audio source: ${e.message}")
            return
        }
        player.setOnPreparedListener {
            val seekMs = (startPositionSeconds * 1000).toInt()
            if (seekMs > 0) it.seekTo(seekMs)
            updateMediaSessionMetadata()
            updatePlaybackState(PlaybackStateCompat.STATE_PAUSED)
        }
        player.setOnCompletionListener {
            listener?.onEnded()
            updatePlaybackState(PlaybackStateCompat.STATE_STOPPED)
        }
        player.setOnErrorListener { _, what, extra ->
            listener?.onError("MediaPlayer error: what=$what extra=$extra")
            true
        }
        mediaPlayer = player
        player.prepareAsync()
    }

    fun play() {
        val player = mediaPlayer ?: return
        try {
            player.start()
        } catch (e: IllegalStateException) {
            listener?.onError("Failed to start playback: ${e.message}")
            return
        }
        updatePlaybackState(PlaybackStateCompat.STATE_PLAYING)
        startForegroundNotification()
        startPositionUpdates()
        listener?.onPlay()
    }

    fun pause() {
        val player = mediaPlayer ?: return
        if (player.isPlaying) player.pause()
        updatePlaybackState(PlaybackStateCompat.STATE_PAUSED)
        stopPositionUpdates()
        listener?.onPause()
        stopForegroundService(removeNotification = false)
    }

    fun stopPlayback() {
        stopPositionUpdates()
        releasePlayer()
        updatePlaybackState(PlaybackStateCompat.STATE_STOPPED)
        stopForegroundService(removeNotification = true)
    }

    fun seek(positionSeconds: Double) {
        mediaPlayer?.seekTo((positionSeconds * 1000).toInt())
        updateMediaSessionMetadata()
    }

    fun setRate(rate: Float) {
        val player = mediaPlayer ?: return
        try {
            val params = player.playbackParams
            params.speed = rate
            player.playbackParams = params
        } catch (e: Exception) {
            listener?.onError("Failed to set playback rate: ${e.message}")
        }
    }

    fun setVolume(volume: Float) {
        mediaPlayer?.setVolume(volume, volume)
    }

    fun updateMetadata(title: String, artist: String?) {
        currentTitle = title
        currentArtist = artist ?: ""
        updateMediaSessionMetadata()
        startForegroundNotification()
    }

    fun status(): Triple<Boolean, Double, Double> {
        val player = mediaPlayer
        val isPlaying = player?.isPlaying ?: false
        val position = (player?.currentPosition ?: 0) / 1000.0
        val duration = (player?.duration?.takeIf { it > 0 } ?: 0) / 1000.0
        return Triple(isPlaying, position, duration)
    }

    private fun startPositionUpdates() {
        stopPositionUpdates()
        val runnable = object : Runnable {
            override fun run() {
                val player = mediaPlayer
                if (player != null) {
                    val position = player.currentPosition / 1000.0
                    val duration = player.duration.takeIf { it > 0 }?.div(1000.0) ?: 0.0
                    listener?.onPositionUpdate(position, duration)
                }
                positionHandler.postDelayed(this, 1000)
            }
        }
        positionRunnable = runnable
        positionHandler.post(runnable)
    }

    private fun stopPositionUpdates() {
        positionRunnable?.let { positionHandler.removeCallbacks(it) }
        positionRunnable = null
    }

    private fun releasePlayer() {
        mediaPlayer?.apply {
            try {
                if (isPlaying) stop()
            } catch (e: IllegalStateException) {
                // Player was never started or is already in a bad state - nothing to stop.
            }
            release()
        }
        mediaPlayer = null
    }

    private fun updatePlaybackState(state: Int) {
        val position = mediaPlayer?.currentPosition?.toLong() ?: 0L
        val actions = PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_FAST_FORWARD or
            PlaybackStateCompat.ACTION_REWIND
        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, position, if (state == PlaybackStateCompat.STATE_PLAYING) 1f else 0f)
                .build(),
        )
    }

    private fun updateMediaSessionMetadata() {
        val duration = mediaPlayer?.duration?.takeIf { it > 0 }?.toLong() ?: 0L
        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration)
        currentArtwork?.let { builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
        mediaSession.setMetadata(builder.build())
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Audiobook playback",
                NotificationManager.IMPORTANCE_LOW,
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundNotification() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun stopForegroundService(removeNotification: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(if (removeNotification) STOP_FOREGROUND_REMOVE else STOP_FOREGROUND_DETACH)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(removeNotification)
        }
        if (removeNotification) stopSelf()
    }

    private fun actionPendingIntent(action: String): PendingIntent {
        val intent = Intent(this, BackgroundAudioService::class.java).setAction(action)
        return PendingIntent.getService(this, action.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun buildNotification(): Notification {
        val isPlaying = mediaPlayer?.isPlaying ?: false
        val playPauseAction = if (isPlaying) {
            NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", actionPendingIntent(ACTION_PAUSE))
        } else {
            NotificationCompat.Action(android.R.drawable.ic_media_play, "Play", actionPendingIntent(ACTION_PLAY))
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setLargeIcon(currentArtwork)
            .addAction(android.R.drawable.ic_media_previous, "Previous", actionPendingIntent(ACTION_PREVIOUS))
            .addAction(playPauseAction)
            .addAction(android.R.drawable.ic_media_next, "Next", actionPendingIntent(ACTION_NEXT))
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .setOngoing(isPlaying)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        stopPositionUpdates()
        releasePlayer()
        mediaSession.isActive = false
        mediaSession.release()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "bookorbit_background_audio"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_PLAY = "app.bookorbit.plugins.backgroundaudio.PLAY"
        private const val ACTION_PAUSE = "app.bookorbit.plugins.backgroundaudio.PAUSE"
        private const val ACTION_NEXT = "app.bookorbit.plugins.backgroundaudio.NEXT"
        private const val ACTION_PREVIOUS = "app.bookorbit.plugins.backgroundaudio.PREVIOUS"
    }
}
