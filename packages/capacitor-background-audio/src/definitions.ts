import type { PluginListenerHandle } from '@capacitor/core'

export interface LoadOptions {
  /** Absolute, already-resolved URL to the audio file (see resolveApiUrl() on the client side). */
  url: string
  /** Extra HTTP headers the native player sends with its own request, e.g. an Authorization bearer token. */
  headers?: Record<string, string>
  title: string
  artist?: string
  /** Absolute URL to a cover image, shown in the lock-screen / notification now-playing UI. */
  artworkUrl?: string
  startPositionSeconds?: number
}

export interface SeekOptions {
  positionSeconds: number
}

export interface RateOptions {
  rate: number
}

export interface VolumeOptions {
  volume: number
}

export interface MetadataOptions {
  title: string
  artist?: string
  artworkUrl?: string
}

export interface PlaybackStatus {
  isPlaying: boolean
  positionSeconds: number
  durationSeconds: number
}

export interface PositionUpdateEvent {
  positionSeconds: number
  durationSeconds: number
}

export interface RemoteSeekEvent {
  positionSeconds: number
}

export interface BackgroundAudioErrorEvent {
  message: string
}

/**
 * Drives native background audio playback (foreground service + MediaSession on Android,
 * AVPlayer + AVAudioSession on iOS) with lock-screen transport controls. The web implementation
 * is a real, usable fallback built on an <audio> element and the Media Session API; the native
 * implementations are an unverified scaffold - see the package README before relying on them.
 */
export interface BackgroundAudioPlugin {
  /** Loads a track without starting playback. Replaces whatever was previously loaded. */
  load(options: LoadOptions): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  /** Stops playback and releases native playback resources (foreground service / audio session). */
  stop(): Promise<void>
  seek(options: SeekOptions): Promise<void>
  setRate(options: RateOptions): Promise<void>
  setVolume(options: VolumeOptions): Promise<void>
  /** Updates now-playing metadata (e.g. moving to the next chapter file) without reloading the source. */
  updateMetadata(options: MetadataOptions): Promise<void>
  getStatus(): Promise<PlaybackStatus>

  addListener(eventName: 'play' | 'pause' | 'ended', listenerFunc: () => void): Promise<PluginListenerHandle>
  addListener(eventName: 'positionUpdate', listenerFunc: (event: PositionUpdateEvent) => void): Promise<PluginListenerHandle>
  addListener(
    eventName: 'remoteNext' | 'remotePrevious' | 'remoteSkipForward' | 'remoteSkipBackward',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>
  addListener(eventName: 'remoteSeek', listenerFunc: (event: RemoteSeekEvent) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'error', listenerFunc: (event: BackgroundAudioErrorEvent) => void): Promise<PluginListenerHandle>

  removeAllListeners(): Promise<void>
}
