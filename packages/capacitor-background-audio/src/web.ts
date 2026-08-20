import { WebPlugin } from '@capacitor/core'
import type { BackgroundAudioPlugin, LoadOptions, MetadataOptions, PlaybackStatus, RateOptions, SeekOptions, VolumeOptions } from './definitions'

/**
 * Web/PWA fallback. A browser tab has no way to guarantee playback survives a locked screen or a
 * backgrounded tab, so this is a best-effort implementation on a plain <audio> element plus the
 * Media Session API - it is not a substitute for the native plugins, which are what this package
 * exists to provide. See the package README for their status.
 */
export class BackgroundAudioWeb extends WebPlugin implements BackgroundAudioPlugin {
  private audio: HTMLAudioElement | null = null
  private positionTimer: ReturnType<typeof setInterval> | null = null

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      const audio = new Audio()
      audio.addEventListener('play', () => this.notifyListeners('play', null))
      audio.addEventListener('pause', () => this.notifyListeners('pause', null))
      audio.addEventListener('ended', () => this.notifyListeners('ended', null))
      this.audio = audio
    }
    return this.audio
  }

  async load(options: LoadOptions): Promise<void> {
    const audio = this.ensureAudio()
    this.stopPositionTimer()
    audio.pause()
    audio.src = options.url
    audio.currentTime = options.startPositionSeconds ?? 0
    this.applyMetadata(options)
    this.startPositionTimer()
  }

  async play(): Promise<void> {
    await this.ensureAudio().play()
  }

  async pause(): Promise<void> {
    this.ensureAudio().pause()
  }

  async stop(): Promise<void> {
    const audio = this.ensureAudio()
    audio.pause()
    audio.currentTime = 0
    this.stopPositionTimer()
  }

  async seek(options: SeekOptions): Promise<void> {
    this.ensureAudio().currentTime = options.positionSeconds
  }

  async setRate(options: RateOptions): Promise<void> {
    this.ensureAudio().playbackRate = options.rate
  }

  async setVolume(options: VolumeOptions): Promise<void> {
    this.ensureAudio().volume = options.volume
  }

  async updateMetadata(options: MetadataOptions): Promise<void> {
    this.applyMetadata(options)
  }

  async getStatus(): Promise<PlaybackStatus> {
    const audio = this.ensureAudio()
    return {
      isPlaying: !audio.paused,
      positionSeconds: audio.currentTime,
      durationSeconds: Number.isFinite(audio.duration) ? audio.duration : 0,
    }
  }

  private applyMetadata(options: MetadataOptions): void {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: options.title,
      artist: options.artist ?? '',
      artwork: options.artworkUrl ? [{ src: options.artworkUrl }] : [],
    })
    navigator.mediaSession.setActionHandler('play', () => void this.play())
    navigator.mediaSession.setActionHandler('pause', () => void this.pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => this.notifyListeners('remotePrevious', null))
    navigator.mediaSession.setActionHandler('nexttrack', () => this.notifyListeners('remoteNext', null))
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime !== 'number') return
      this.ensureAudio().currentTime = details.seekTime
      this.notifyListeners('remoteSeek', { positionSeconds: details.seekTime })
    })
  }

  private startPositionTimer(): void {
    this.stopPositionTimer()
    this.positionTimer = setInterval(() => {
      const audio = this.ensureAudio()
      this.notifyListeners('positionUpdate', {
        positionSeconds: audio.currentTime,
        durationSeconds: Number.isFinite(audio.duration) ? audio.duration : 0,
      })
    }, 1000)
  }

  private stopPositionTimer(): void {
    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer)
      this.positionTimer = null
    }
  }
}
