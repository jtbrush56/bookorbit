import { describe, expect, it, vi } from 'vitest'

interface MockHowlOptions {
  src: string[]
}

const HowlMock = vi.hoisted(() =>
  vi.fn<(opts: MockHowlOptions) => void>(function MockHowl(this: Record<string, unknown>, _opts: MockHowlOptions) {
    this.state = vi.fn<() => string>(() => 'loaded')
    this.duration = vi.fn<() => number>(() => 100)
    this.seek = vi.fn<() => number>(() => 0)
    this.play = vi.fn<() => void>()
    this.pause = vi.fn<() => void>()
    this.stop = vi.fn<() => void>()
    this.unload = vi.fn<() => void>()
    this.load = vi.fn<() => void>()
    this.once = vi.fn<(event: string, cb: () => void) => void>()
    this.rate = vi.fn<(rate: number) => void>()
    this.volume = vi.fn<(vol: number) => void>()
  }),
)
vi.mock('howler', () => ({ Howl: HowlMock }))

import { useAudioQueue } from '../useAudioQueue'

describe('useAudioQueue offline source', () => {
  it('uses the offline blob URL as the Howl src when the file has one', () => {
    const queue = useAudioQueue(
      [
        { id: 1, format: 'mp3', durationSeconds: 100, offlineSrc: 'blob:audio-1' },
        { id: 2, format: 'mp3', durationSeconds: 100 },
      ],
      () => {},
    )
    queue.activateIndex(0)

    const call = HowlMock.mock.calls.find(([opts]: [MockHowlOptions]) => opts.src[0] === 'blob:audio-1')
    expect(call).toBeDefined()
  })

  it('falls back to the network serve URL when no offline src is set', () => {
    const queue = useAudioQueue([{ id: 5, format: 'mp3', durationSeconds: 100 }], () => {})
    queue.activateIndex(0)

    const call = HowlMock.mock.calls.find(([opts]: [MockHowlOptions]) => opts.src[0] === '/api/v1/books/files/5/serve')
    expect(call).toBeDefined()
  })
})
