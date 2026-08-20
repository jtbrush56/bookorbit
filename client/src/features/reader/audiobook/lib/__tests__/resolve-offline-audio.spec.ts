import { beforeEach, describe, expect, it, vi } from 'vitest'

const isFileOffline = vi.hoisted(() => vi.fn<(fileId: number) => boolean>())
const readOfflineFile = vi.hoisted(() => vi.fn<(fileId: number) => Promise<ArrayBuffer | null>>())
vi.mock('@/features/offline/lib/offline-files', () => ({ isFileOffline, readOfflineFile }))

import { releaseOfflineAudioSources, resolveOfflineAudioSources } from '../resolve-offline-audio'

describe('resolveOfflineAudioSources', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    isFileOffline.mockReset()
    readOfflineFile.mockReset()

    let counter = 0
    createObjectURL = vi.fn<() => string>(() => `blob:audio-${counter++}`)
    revokeObjectURL = vi.fn<(url: string) => void>()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
  })

  it('maps offline files to a blob URL and skips files that are not offline', async () => {
    isFileOffline.mockImplementation((id) => id === 1)
    readOfflineFile.mockResolvedValue(new ArrayBuffer(8))

    const overrides = await resolveOfflineAudioSources([
      { id: 1, format: 'mp3' },
      { id: 2, format: 'mp3' },
    ])

    expect(overrides.get(1)).toBe('blob:audio-0')
    expect(overrides.has(2)).toBe(false)
    expect(readOfflineFile).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('skips a file reported offline whose bytes are missing on disk', async () => {
    isFileOffline.mockReturnValue(true)
    readOfflineFile.mockResolvedValue(null)

    const overrides = await resolveOfflineAudioSources([{ id: 1, format: 'mp3' }])

    expect(overrides.size).toBe(0)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('returns an empty map when nothing is offline (web/PWA builds)', async () => {
    isFileOffline.mockReturnValue(false)

    const overrides = await resolveOfflineAudioSources([{ id: 1, format: 'mp3' }])

    expect(overrides.size).toBe(0)
    expect(readOfflineFile).not.toHaveBeenCalled()
  })

  it('releaseOfflineAudioSources revokes every cached URL and clears the map', () => {
    const overrides = new Map([
      [1, 'blob:audio-0'],
      [2, 'blob:audio-1'],
    ])

    releaseOfflineAudioSources(overrides)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-0')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1')
    expect(overrides.size).toBe(0)
  })
})
