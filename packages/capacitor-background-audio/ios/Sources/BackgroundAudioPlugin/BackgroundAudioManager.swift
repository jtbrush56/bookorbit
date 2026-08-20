import AVFoundation
import MediaPlayer
import UIKit

protocol BackgroundAudioManagerDelegate: AnyObject {
    func backgroundAudioDidPlay()
    func backgroundAudioDidPause()
    func backgroundAudioDidEnd()
    func backgroundAudioDidUpdatePosition(positionSeconds: Double, durationSeconds: Double)
    func backgroundAudioDidReceiveRemoteNext()
    func backgroundAudioDidReceiveRemotePrevious()
    func backgroundAudioDidReceiveRemoteSeek(positionSeconds: Double)
    func backgroundAudioDidReceiveRemoteSkipForward()
    func backgroundAudioDidReceiveRemoteSkipBackward()
    func backgroundAudioDidError(message: String)
}

/// Owns the AVPlayer, the AVAudioSession background-playback configuration, and the lock-screen /
/// Control Center now-playing info plus remote command handlers. Kept free of Capacitor types so
/// it can be reasoned about independently of the plugin bridge.
///
/// Unverified: never compiled against a real Xcode toolchain or run on a device/simulator. See
/// the package README before relying on this.
final class BackgroundAudioManager: NSObject {
    weak var delegate: BackgroundAudioManagerDelegate?

    private var player: AVPlayer?
    private var timeObserverToken: Any?
    private var statusObservation: NSKeyValueObservation?
    private var currentTitle: String = ""
    private var currentArtist: String = ""
    private var artwork: MPMediaItemArtwork?

    override init() {
        super.init()
        configureAudioSession()
        configureRemoteCommandCenter()
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true)
        } catch {
            delegate?.backgroundAudioDidError(message: "Failed to configure AVAudioSession: \(error.localizedDescription)")
        }
    }

    private func configureRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.play()
            return .success
        }
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.delegate?.backgroundAudioDidReceiveRemoteNext()
            return .success
        }
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            self?.delegate?.backgroundAudioDidReceiveRemotePrevious()
            return .success
        }
        commandCenter.skipForwardCommand.preferredIntervals = [30]
        commandCenter.skipForwardCommand.addTarget { [weak self] _ in
            self?.delegate?.backgroundAudioDidReceiveRemoteSkipForward()
            return .success
        }
        commandCenter.skipBackwardCommand.preferredIntervals = [15]
        commandCenter.skipBackwardCommand.addTarget { [weak self] _ in
            self?.delegate?.backgroundAudioDidReceiveRemoteSkipBackward()
            return .success
        }
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.delegate?.backgroundAudioDidReceiveRemoteSeek(positionSeconds: event.positionTime)
            return .success
        }
    }

    func load(url: URL, headers: [String: String], title: String, artist: String?, artworkUrl: URL?, startPositionSeconds: Double) {
        removeTimeObserver()
        statusObservation?.invalidate()

        currentTitle = title
        currentArtist = artist ?? ""
        artwork = nil

        var options: [String: Any] = [:]
        if !headers.isEmpty {
            options["AVURLAssetHTTPHeaderFieldsKey"] = headers
        }
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePlayerDidFinishPlaying),
            name: .AVPlayerItemDidPlayToEndTime,
            object: item,
        )

        if let existingPlayer = player {
            existingPlayer.replaceCurrentItem(with: item)
        } else {
            player = AVPlayer(playerItem: item)
        }

        statusObservation = item.observe(\.status, options: [.new]) { [weak self] observedItem, _ in
            guard let self else { return }
            switch observedItem.status {
            case .readyToPlay:
                let seekTime = CMTime(seconds: startPositionSeconds, preferredTimescale: 600)
                self.player?.seek(to: seekTime)
                self.updateNowPlayingInfo()
            case .failed:
                self.delegate?.backgroundAudioDidError(message: observedItem.error?.localizedDescription ?? "Failed to load audio item")
            default:
                break
            }
        }

        if let artworkUrl {
            loadArtwork(from: artworkUrl)
        }

        addTimeObserver()
        updateNowPlayingInfo()
    }

    func play() {
        player?.play()
        delegate?.backgroundAudioDidPlay()
        updateNowPlayingInfo()
    }

    func pause() {
        player?.pause()
        delegate?.backgroundAudioDidPause()
        updateNowPlayingInfo()
    }

    func stop() {
        player?.pause()
        removeTimeObserver()
        statusObservation?.invalidate()
        statusObservation = nil
        player = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func seek(positionSeconds: Double) {
        let time = CMTime(seconds: positionSeconds, preferredTimescale: 600)
        player?.seek(to: time)
        updateNowPlayingInfo()
    }

    func setRate(_ rate: Float) {
        guard let player else { return }
        if player.timeControlStatus == .playing {
            player.rate = rate
        }
        updateNowPlayingInfo()
    }

    func setVolume(_ volume: Float) {
        player?.volume = volume
    }

    func updateMetadata(title: String, artist: String?, artworkUrl: URL?) {
        currentTitle = title
        currentArtist = artist ?? ""
        if let artworkUrl {
            loadArtwork(from: artworkUrl)
        } else {
            updateNowPlayingInfo()
        }
    }

    func status() -> (isPlaying: Bool, positionSeconds: Double, durationSeconds: Double) {
        let isPlaying = player?.timeControlStatus == .playing
        let position = player?.currentTime().seconds ?? 0
        let duration = player?.currentItem?.duration.seconds ?? 0
        return (isPlaying, position.isFinite ? position : 0, duration.isFinite ? duration : 0)
    }

    private func addTimeObserver() {
        let interval = CMTime(seconds: 1, preferredTimescale: 600)
        timeObserverToken = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self else { return }
            let duration = self.player?.currentItem?.duration.seconds ?? 0
            self.delegate?.backgroundAudioDidUpdatePosition(
                positionSeconds: time.seconds.isFinite ? time.seconds : 0,
                durationSeconds: duration.isFinite ? duration : 0,
            )
        }
    }

    private func removeTimeObserver() {
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }
    }

    @objc private func handlePlayerDidFinishPlaying() {
        delegate?.backgroundAudioDidEnd()
    }

    private func loadArtwork(from url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let image = UIImage(data: data) else { return }
            let artworkImage = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                self.artwork = artworkImage
                self.updateNowPlayingInfo()
            }
        }.resume()
    }

    private func updateNowPlayingInfo() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTitle,
            MPMediaItemPropertyArtist: currentArtist,
        ]
        if let duration = player?.currentItem?.duration.seconds, duration.isFinite {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let position = player?.currentTime().seconds, position.isFinite {
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
        }
        info[MPNowPlayingInfoPropertyPlaybackRate] = player?.timeControlStatus == .playing ? Double(player?.rate ?? 1) : 0
        if let artwork {
            info[MPMediaItemPropertyArtwork] = artwork
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
