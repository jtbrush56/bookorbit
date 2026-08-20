package app.bookorbit.plugins.backgroundaudio

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Bridges the plugin's JS API to [BackgroundAudioService], which owns the actual MediaPlayer,
 * MediaSession, and foreground-service notification. Unverified: never compiled against a real
 * Android toolchain or run on a device/emulator. See the package README before relying on this.
 */
@CapacitorPlugin(name = "BackgroundAudio")
class BackgroundAudioPlugin : Plugin() {

    private var service: BackgroundAudioService? = null
    private var bound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val localBinder = binder as? BackgroundAudioService.LocalBinder ?: return
            service = localBinder.getService().also { it.listener = pluginListener }
            bound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
            bound = false
        }
    }

    private val pluginListener = object : BackgroundAudioService.Listener {
        override fun onPlay() = notifyListeners("play", JSObject())

        override fun onPause() = notifyListeners("pause", JSObject())

        override fun onEnded() = notifyListeners("ended", JSObject())

        override fun onPositionUpdate(positionSeconds: Double, durationSeconds: Double) {
            val data = JSObject()
            data.put("positionSeconds", positionSeconds)
            data.put("durationSeconds", durationSeconds)
            notifyListeners("positionUpdate", data)
        }

        override fun onRemoteNext() = notifyListeners("remoteNext", JSObject())

        override fun onRemotePrevious() = notifyListeners("remotePrevious", JSObject())

        override fun onRemoteSeek(positionSeconds: Double) {
            val data = JSObject()
            data.put("positionSeconds", positionSeconds)
            notifyListeners("remoteSeek", data)
        }

        override fun onRemoteSkipForward() = notifyListeners("remoteSkipForward", JSObject())

        override fun onRemoteSkipBackward() = notifyListeners("remoteSkipBackward", JSObject())

        override fun onError(message: String) {
            val data = JSObject()
            data.put("message", message)
            notifyListeners("error", data)
        }
    }

    override fun load() {
        super.load()
        val intent = Intent(context, BackgroundAudioService::class.java)
        context.startService(intent)
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    override fun handleOnDestroy() {
        if (bound) {
            context.unbindService(connection)
            bound = false
        }
        super.handleOnDestroy()
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val url = call.getString("url")
        if (url == null) {
            call.reject("Missing 'url'")
            return
        }
        val headersObject = call.getObject("headers")
        val headers = mutableMapOf<String, String>()
        headersObject?.keys()?.forEach { key ->
            val value = headersObject.opt(key)
            if (value is String) headers[key] = value
        }
        val title = call.getString("title") ?: ""
        val artist = call.getString("artist")
        val startPositionSeconds = call.getDouble("startPositionSeconds") ?: 0.0

        val current = service
        if (current == null) {
            call.reject("Background audio service is not bound yet")
            return
        }
        current.load(url, headers, title, artist, startPositionSeconds)
        call.resolve()
    }

    @PluginMethod
    fun play(call: PluginCall) {
        service?.play()
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        service?.pause()
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        service?.stopPlayback()
        call.resolve()
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        val position = call.getDouble("positionSeconds")
        if (position == null) {
            call.reject("Missing 'positionSeconds'")
            return
        }
        service?.seek(position)
        call.resolve()
    }

    @PluginMethod
    fun setRate(call: PluginCall) {
        val rate = call.getDouble("rate")
        if (rate == null) {
            call.reject("Missing 'rate'")
            return
        }
        service?.setRate(rate.toFloat())
        call.resolve()
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        val volume = call.getDouble("volume")
        if (volume == null) {
            call.reject("Missing 'volume'")
            return
        }
        service?.setVolume(volume.toFloat())
        call.resolve()
    }

    @PluginMethod
    fun updateMetadata(call: PluginCall) {
        val title = call.getString("title") ?: ""
        val artist = call.getString("artist")
        service?.updateMetadata(title, artist)
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val current = service
        val result = JSObject()
        if (current == null) {
            result.put("isPlaying", false)
            result.put("positionSeconds", 0.0)
            result.put("durationSeconds", 0.0)
        } else {
            val (isPlaying, position, duration) = current.status()
            result.put("isPlaying", isPlaying)
            result.put("positionSeconds", position)
            result.put("durationSeconds", duration)
        }
        call.resolve(result)
    }
}
