import Capacitor
import Foundation

/// Unverified: never compiled against a real Xcode toolchain or run on a device/simulator. See
/// the package README before relying on this.
@objc(BackgroundAudioPlugin)
public class BackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundAudioPlugin"
    public let jsName = "BackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
    ]

    private lazy var manager: BackgroundAudioManager = {
        let manager = BackgroundAudioManager()
        manager.delegate = self
        return manager
    }()

    @objc func load(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing or invalid 'url'")
            return
        }
        var headers: [String: String] = [:]
        if let headersObject = call.getObject("headers") {
            for (key, value) in headersObject {
                if let stringValue = value as? String {
                    headers[key] = stringValue
                }
            }
        }
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist")
        let artworkUrl = call.getString("artworkUrl").flatMap(URL.init(string:))
        let startPosition = call.getDouble("startPositionSeconds") ?? 0

        manager.load(url: url, headers: headers, title: title, artist: artist, artworkUrl: artworkUrl, startPositionSeconds: startPosition)
        call.resolve()
    }

    @objc func play(_ call: CAPPluginCall) {
        manager.play()
        call.resolve()
    }

    @objc func pause(_ call: CAPPluginCall) {
        manager.pause()
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stop()
        call.resolve()
    }

    @objc func seek(_ call: CAPPluginCall) {
        guard let position = call.getDouble("positionSeconds") else {
            call.reject("Missing 'positionSeconds'")
            return
        }
        manager.seek(positionSeconds: position)
        call.resolve()
    }

    @objc func setRate(_ call: CAPPluginCall) {
        guard let rate = call.getDouble("rate") else {
            call.reject("Missing 'rate'")
            return
        }
        manager.setRate(Float(rate))
        call.resolve()
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        guard let volume = call.getDouble("volume") else {
            call.reject("Missing 'volume'")
            return
        }
        manager.setVolume(Float(volume))
        call.resolve()
    }

    @objc func updateMetadata(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist")
        let artworkUrl = call.getString("artworkUrl").flatMap(URL.init(string:))
        manager.updateMetadata(title: title, artist: artist, artworkUrl: artworkUrl)
        call.resolve()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        let status = manager.status()
        call.resolve([
            "isPlaying": status.isPlaying,
            "positionSeconds": status.positionSeconds,
            "durationSeconds": status.durationSeconds,
        ])
    }
}

extension BackgroundAudioPlugin: BackgroundAudioManagerDelegate {
    func backgroundAudioDidPlay() {
        notifyListeners("play", data: nil)
    }

    func backgroundAudioDidPause() {
        notifyListeners("pause", data: nil)
    }

    func backgroundAudioDidEnd() {
        notifyListeners("ended", data: nil)
    }

    func backgroundAudioDidUpdatePosition(positionSeconds: Double, durationSeconds: Double) {
        notifyListeners("positionUpdate", data: ["positionSeconds": positionSeconds, "durationSeconds": durationSeconds])
    }

    func backgroundAudioDidReceiveRemoteNext() {
        notifyListeners("remoteNext", data: nil)
    }

    func backgroundAudioDidReceiveRemotePrevious() {
        notifyListeners("remotePrevious", data: nil)
    }

    func backgroundAudioDidReceiveRemoteSeek(positionSeconds: Double) {
        notifyListeners("remoteSeek", data: ["positionSeconds": positionSeconds])
    }

    func backgroundAudioDidReceiveRemoteSkipForward() {
        notifyListeners("remoteSkipForward", data: nil)
    }

    func backgroundAudioDidReceiveRemoteSkipBackward() {
        notifyListeners("remoteSkipBackward", data: nil)
    }

    func backgroundAudioDidError(message: String) {
        notifyListeners("error", data: ["message": message])
    }
}
