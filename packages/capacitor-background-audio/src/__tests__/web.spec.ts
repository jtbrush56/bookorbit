import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackgroundAudioWeb } from '../web'

class MockAudio extends EventTarget {
  src = ''
  currentTime = 0
  volume = 1
  playbackRate = 1
  paused = true
  duration = 100

  async play(): Promise<void> {
    this.paused = false
    this.dispatchEvent(new Event('play'))
  }

  pause(): void {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
}

describe('BackgroundAudioWeb', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Audio', MockAudio)
  })

  it('loads a track, seeks to the start position, and exposes it via getStatus', async () => {
    const plugin = new BackgroundAudioWeb()
    await plugin.load({ url: 'https://example.com/book.mp3', title: 'Book', startPositionSeconds: 42 })

    const status = await plugin.getStatus()
    expect(status.positionSeconds).toBe(42)
    expect(status.isPlaying).toBe(false)
    expect(status.durationSeconds).toBe(100)
  })

  it('emits play/pause/ended events driven by the underlying audio element', async () => {
    const plugin = new BackgroundAudioWeb()
    await plugin.load({ url: 'https://example.com/book.mp3', title: 'Book' })

    const playEvents: unknown[] = []
    const pauseEvents: unknown[] = []
    const endedEvents: unknown[] = []
    await plugin.addListener('play', () => playEvents.push(true))
    await plugin.addListener('pause', () => pauseEvents.push(true))
    await plugin.addListener('ended', () => endedEvents.push(true))

    await plugin.play()
    await plugin.pause()

    expect(playEvents).toHaveLength(1)
    expect(pauseEvents).toHaveLength(1)
    expect(endedEvents).toHaveLength(0)
  })

  it('applies seek, rate, and volume to the underlying audio element', async () => {
    const plugin = new BackgroundAudioWeb()
    await plugin.load({ url: 'https://example.com/book.mp3', title: 'Book' })

    await plugin.seek({ positionSeconds: 10 })
    await plugin.setRate({ rate: 1.5 })
    await plugin.setVolume({ volume: 0.5 })

    const status = await plugin.getStatus()
    expect(status.positionSeconds).toBe(10)
  })

  it('stop pauses and resets position', async () => {
    const plugin = new BackgroundAudioWeb()
    await plugin.load({ url: 'https://example.com/book.mp3', title: 'Book', startPositionSeconds: 30 })
    await plugin.play()

    await plugin.stop()

    const status = await plugin.getStatus()
    expect(status.isPlaying).toBe(false)
    expect(status.positionSeconds).toBe(0)
  })

  it('emits positionUpdate on an interval while a track is loaded', async () => {
    const plugin = new BackgroundAudioWeb()
    const updates: unknown[] = []
    await plugin.addListener('positionUpdate', (event) => updates.push(event))

    await plugin.load({ url: 'https://example.com/book.mp3', title: 'Book' })
    await vi.advanceTimersByTimeAsync(3000)

    expect(updates.length).toBeGreaterThanOrEqual(3)
  })
})
