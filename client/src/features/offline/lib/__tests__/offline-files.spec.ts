import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isNativePlatform = vi.hoisted(() => vi.fn<() => boolean>(() => true))
vi.mock('@/lib/server-connection', () => ({ isNativePlatform }))

const apiMock = vi.hoisted(() => vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>())
vi.mock('@/lib/api', () => ({ api: apiMock }))

const writeFile = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
const readFile = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ data: string }>>())
const deleteFile = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile, readFile, deleteFile },
  Directory: { Data: 'DATA' },
}))

import { downloadFileForOffline, isFileOffline, isOfflineSupported, readOfflineFile, removeOfflineFile } from '../offline-files'

const FILE_ID = 101
const BOOK_ID = 42

describe('offline-files', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true)
    localStorage.clear()
    apiMock.mockReset()
    writeFile.mockReset().mockResolvedValue(undefined)
    readFile.mockReset()
    deleteFile.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports unsupported, and never marks a file offline, when not on a native platform', () => {
    isNativePlatform.mockReturnValue(false)
    expect(isOfflineSupported()).toBe(false)
    expect(isFileOffline(FILE_ID)).toBe(false)
  })

  it('downloads a file, writes it to disk as base64, and records it in the manifest', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]) // "%PDF-1"
    apiMock.mockResolvedValue(new Response(bytes, { status: 200 }))

    await downloadFileForOffline(FILE_ID, BOOK_ID)

    expect(apiMock).toHaveBeenCalledWith(`/api/v1/books/files/${FILE_ID}/serve`)
    expect(writeFile).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ path: `offline-books/${FILE_ID}.bin`, directory: 'DATA', recursive: true }),
    )
    expect(isFileOffline(FILE_ID)).toBe(true)
  })

  it('throws and leaves the manifest untouched when the download request fails', async () => {
    apiMock.mockResolvedValue(new Response(null, { status: 503 }))

    await expect(downloadFileForOffline(FILE_ID, BOOK_ID)).rejects.toThrow('Download failed with status 503')
    expect(writeFile).not.toHaveBeenCalled()
    expect(isFileOffline(FILE_ID)).toBe(false)
  })

  it('round-trips the exact bytes through readOfflineFile once downloaded', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252, 253, 254, 255])
    apiMock.mockResolvedValue(new Response(bytes, { status: 200 }))
    await downloadFileForOffline(FILE_ID, BOOK_ID)

    const written = writeFile.mock.calls[0][0] as { data: string }
    readFile.mockResolvedValue({ data: written.data })

    const result = await readOfflineFile(FILE_ID)
    expect(result).not.toBeNull()
    expect(new Uint8Array(result!)).toEqual(bytes)
  })

  it('returns null without touching disk when the file was never downloaded', async () => {
    const result = await readOfflineFile(999)
    expect(result).toBeNull()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('treats a manifest/disk mismatch as not-downloaded and self-heals the manifest', async () => {
    apiMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))
    await downloadFileForOffline(FILE_ID, BOOK_ID)
    readFile.mockRejectedValue(new Error('ENOENT'))

    const result = await readOfflineFile(FILE_ID)
    expect(result).toBeNull()
    expect(isFileOffline(FILE_ID)).toBe(false)
  })

  it('removes a downloaded file from disk and the manifest', async () => {
    apiMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))
    await downloadFileForOffline(FILE_ID, BOOK_ID)

    await removeOfflineFile(FILE_ID)

    expect(deleteFile).toHaveBeenCalledExactlyOnceWith({ path: `offline-books/${FILE_ID}.bin`, directory: 'DATA' })
    expect(isFileOffline(FILE_ID)).toBe(false)
  })
})
