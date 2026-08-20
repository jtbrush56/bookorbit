import { reactive, ref } from 'vue'
import { api } from '@/lib/api'
import { readOfflineFile } from '@/features/offline/lib/offline-files'
import { clearCbzArchiveCache, getCbzPage, getCbzPageCount } from '@/features/offline/lib/cbz-extract'

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'

interface BookResponse {
  title?: string
}

export function useCbz(fileId: number, bookId: number) {
  const pageCount = ref(0)
  const bookTitle = ref('')
  const loading = ref(true)
  const error = ref<string | null>(null)

  let offlineBuffer: ArrayBuffer | null = null
  /** Object URLs are stashed in a reactive Map so template `pageUrl()` reads re-render once a page resolves. */
  const resolvedSrc = reactive(new Map<number, string>())
  const inFlight = new Map<number, Promise<string>>()

  async function resolvePageSrc(n: number): Promise<string> {
    const cached = resolvedSrc.get(n)
    if (cached) return cached
    const pending = inFlight.get(n)
    if (pending) return pending

    const promise = (async () => {
      let blob: Blob
      if (offlineBuffer) {
        const page = getCbzPage(fileId, offlineBuffer, n)
        if (!page) throw new Error(`Page ${n} not found in offline archive`)
        blob = new Blob([new Uint8Array(page.data)], { type: page.mimeType })
      } else {
        // Fetched via api() rather than a raw <img src>: Capacitor's native HTTP bridge only
        // intercepts fetch/XHR, not <img> loads, which use the WebView's separate cookie jar.
        const res = await api(`/api/v1/cbz/files/${fileId}/pages/${n}`)
        if (!res.ok) throw new Error(`Failed to load page ${n}`)
        blob = await res.blob()
      }
      const src = URL.createObjectURL(blob)
      resolvedSrc.set(n, src)
      return src
    })()

    inFlight.set(n, promise)
    try {
      return await promise
    } finally {
      inFlight.delete(n)
    }
  }

  function pageUrl(n: number): string {
    const cached = resolvedSrc.get(n)
    if (cached) return cached
    if (!inFlight.has(n)) void resolvePageSrc(n).catch(() => {})
    return TRANSPARENT_PIXEL
  }

  function releasePages(): void {
    for (const src of resolvedSrc.values()) URL.revokeObjectURL(src)
    resolvedSrc.clear()
    inFlight.clear()
    clearCbzArchiveCache(fileId)
  }

  async function load(): Promise<void> {
    offlineBuffer = await readOfflineFile(fileId)

    const bookTitleFetch = api(`/api/v1/books/${bookId}`)
      .then((res) => (res.ok ? (res.json() as Promise<BookResponse>) : null))
      .then((data) => data?.title ?? '')
      .catch(() => '')

    if (offlineBuffer) {
      try {
        pageCount.value = getCbzPageCount(fileId, offlineBuffer)
      } catch {
        error.value = 'Failed to load comic'
        loading.value = false
        return
      }
      bookTitle.value = await bookTitleFetch
      loading.value = false
      return
    }

    const pagesRes = await api(`/api/v1/cbz/files/${fileId}/pages`).catch(() => null)
    if (!pagesRes?.ok) {
      error.value = 'Failed to load comic'
      loading.value = false
      return
    }
    const pagesData = await pagesRes.json()
    pageCount.value = pagesData.pageCount
    bookTitle.value = await bookTitleFetch
    loading.value = false
  }

  return { pageCount, bookTitle, loading, error, pageUrl, resolvePageSrc, releasePages, load }
}
