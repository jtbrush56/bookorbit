import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>())
vi.mock('@/lib/api', () => ({ api: apiMock }))

const readOfflineFileMock = vi.hoisted(() => vi.fn<(fileId: number) => Promise<ArrayBuffer | null>>())
vi.mock('@/features/offline/lib/offline-files', () => ({ readOfflineFile: readOfflineFileMock }))

const getCbzPageMock = vi.hoisted(() =>
  vi.fn<(fileId: number, buffer: ArrayBuffer, pageIndex: number) => { data: Uint8Array; mimeType: string } | null>(),
)
const getCbzPageCountMock = vi.hoisted(() => vi.fn<(fileId: number, buffer: ArrayBuffer) => number>())
const clearCbzArchiveCacheMock = vi.hoisted(() => vi.fn<(fileId: number) => void>())
vi.mock('@/features/offline/lib/cbz-extract', () => ({
  getCbzPage: getCbzPageMock,
  getCbzPageCount: getCbzPageCountMock,
  clearCbzArchiveCache: clearCbzArchiveCacheMock,
}))

import { useCbz } from '../useCbz'

const FILE_ID = 22
const BOOK_ID = 11

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('useCbz', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    apiMock.mockReset()
    readOfflineFileMock.mockReset().mockResolvedValue(null)
    getCbzPageMock.mockReset()
    getCbzPageCountMock.mockReset()
    clearCbzArchiveCacheMock.mockReset()

    let counter = 0
    createObjectURL = vi.fn<() => string>(() => `blob:page-${counter++}`)
    revokeObjectURL = vi.fn<(url: string) => void>()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
  })

  describe('online', () => {
    it('loads page count and book title from the server', async () => {
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 12 }))
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'Watchmen' }))
        throw new Error(`unexpected request: ${String(input)}`)
      })

      const { load, pageCount, bookTitle, loading, error } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(pageCount.value).toBe(12)
      expect(bookTitle.value).toBe('Watchmen')
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('sets an error when the pages request fails', async () => {
      apiMock.mockResolvedValue(new Response(null, { status: 500 }))

      const { load, error, loading } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(error.value).toBe('Failed to load comic')
      expect(loading.value).toBe(false)
    })

    it('sets an error when the pages request throws (no connectivity)', async () => {
      apiMock.mockRejectedValue(new TypeError('Failed to fetch'))

      const { load, error, loading } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(error.value).toBe('Failed to load comic')
      expect(loading.value).toBe(false)
    })

    it('falls back to an empty title when the book request fails', async () => {
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 3 }))
        return Promise.resolve(new Response(null, { status: 404 }))
      })

      const { load, bookTitle, pageCount } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(pageCount.value).toBe(3)
      expect(bookTitle.value).toBe('')
    })

    it('resolves a page src by fetching it through api() as a blob, not a raw <img src>', async () => {
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 3 }))
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'x' }))
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages/0`) {
          const res = new Response(new Uint8Array([1, 2, 3]), { status: 200 })
          return Promise.resolve(res)
        }
        throw new Error(`unexpected request: ${String(input)}`)
      })

      const { load, resolvePageSrc } = useCbz(FILE_ID, BOOK_ID)
      await load()

      const src = await resolvePageSrc(0)
      expect(src).toBe('blob:page-0')
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })

    it('caches a resolved page src and does not refetch it', async () => {
      let fetchCount = 0
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 3 }))
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'x' }))
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages/0`) {
          fetchCount++
          return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }))
        }
        throw new Error(`unexpected request: ${String(input)}`)
      })

      const { load, resolvePageSrc } = useCbz(FILE_ID, BOOK_ID)
      await load()

      await resolvePageSrc(0)
      await resolvePageSrc(0)

      expect(fetchCount).toBe(1)
    })

    it('coalesces concurrent resolvePageSrc calls for the same page into one fetch', async () => {
      let fetchCount = 0
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 3 }))
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'x' }))
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages/0`) {
          fetchCount++
          return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }))
        }
        throw new Error(`unexpected request: ${String(input)}`)
      })

      const { load, resolvePageSrc } = useCbz(FILE_ID, BOOK_ID)
      await load()

      const [a, b] = await Promise.all([resolvePageSrc(0), resolvePageSrc(0)])

      expect(fetchCount).toBe(1)
      expect(a).toBe(b)
    })

    it('pageUrl returns a placeholder immediately and the real src once resolution completes', async () => {
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 3 }))
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'x' }))
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages/0`) return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }))
        throw new Error(`unexpected request: ${String(input)}`)
      })

      const { load, pageUrl } = useCbz(FILE_ID, BOOK_ID)
      await load()

      const placeholder = pageUrl(0)
      expect(placeholder.startsWith('data:image/gif')).toBe(true)

      await vi.waitFor(() => {
        expect(pageUrl(0)).toBe('blob:page-0')
      })
    })

    it('releasePages revokes all cached object URLs and clears the archive cache', async () => {
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/cbz/files/${FILE_ID}/pages`) return Promise.resolve(jsonResponse({ pageCount: 3 }))
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'x' }))
        return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }))
      })

      const { load, resolvePageSrc, releasePages } = useCbz(FILE_ID, BOOK_ID)
      await load()
      await resolvePageSrc(0)
      await resolvePageSrc(1)

      releasePages()

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:page-0')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:page-1')
      expect(clearCbzArchiveCacheMock).toHaveBeenCalledWith(FILE_ID)
    })
  })

  describe('offline', () => {
    it('reads page count from the local archive instead of the network', async () => {
      const buffer = new ArrayBuffer(8)
      readOfflineFileMock.mockResolvedValue(buffer)
      getCbzPageCountMock.mockReturnValue(5)
      apiMock.mockImplementation((input) => {
        if (input === `/api/v1/books/${BOOK_ID}`) return Promise.resolve(jsonResponse({ title: 'Offline comic' }))
        throw new Error(`unexpected request while offline: ${String(input)}`)
      })

      const { load, pageCount, bookTitle, loading, error } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(pageCount.value).toBe(5)
      expect(bookTitle.value).toBe('Offline comic')
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
      expect(getCbzPageCountMock).toHaveBeenCalledWith(FILE_ID, buffer)
    })

    it('tolerates the book title request failing outright while offline', async () => {
      const buffer = new ArrayBuffer(8)
      readOfflineFileMock.mockResolvedValue(buffer)
      getCbzPageCountMock.mockReturnValue(5)
      apiMock.mockRejectedValue(new TypeError('Failed to fetch'))

      const { load, pageCount, bookTitle, error } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(pageCount.value).toBe(5)
      expect(bookTitle.value).toBe('')
      expect(error.value).toBeNull()
    })

    it('sets an error when the local archive fails to extract', async () => {
      readOfflineFileMock.mockResolvedValue(new ArrayBuffer(8))
      getCbzPageCountMock.mockImplementation(() => {
        throw new Error('corrupt archive')
      })
      apiMock.mockResolvedValue(jsonResponse({ title: 'x' }))

      const { load, error, loading } = useCbz(FILE_ID, BOOK_ID)
      await load()

      expect(error.value).toBe('Failed to load comic')
      expect(loading.value).toBe(false)
    })

    it('resolves a page src from the extracted archive without any network request', async () => {
      const buffer = new ArrayBuffer(8)
      readOfflineFileMock.mockResolvedValue(buffer)
      getCbzPageCountMock.mockReturnValue(2)
      getCbzPageMock.mockReturnValue({ data: new Uint8Array([9, 9, 9]), mimeType: 'image/png' })
      apiMock.mockResolvedValue(jsonResponse({ title: 'x' }))

      const { load, resolvePageSrc } = useCbz(FILE_ID, BOOK_ID)
      await load()

      const src = await resolvePageSrc(0)

      expect(src).toBe('blob:page-0')
      expect(getCbzPageMock).toHaveBeenCalledWith(FILE_ID, buffer, 0)
      expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining('/pages/0'))
    })

    it('rejects when the requested page is out of range in the local archive', async () => {
      const buffer = new ArrayBuffer(8)
      readOfflineFileMock.mockResolvedValue(buffer)
      getCbzPageCountMock.mockReturnValue(2)
      getCbzPageMock.mockReturnValue(null)
      apiMock.mockResolvedValue(jsonResponse({ title: 'x' }))

      const { load, resolvePageSrc } = useCbz(FILE_ID, BOOK_ID)
      await load()

      await expect(resolvePageSrc(99)).rejects.toThrow('Page 99 not found in offline archive')
    })
  })
})
