import { unzipSync } from 'fflate'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function isHidden(name: string): boolean {
  return name.split('/').some((segment) => segment.startsWith('.'))
}

function isImage(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name))
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export interface CbzPage {
  data: Uint8Array
  mimeType: string
}

/**
 * Extraction is CPU work on a potentially large archive, so each offline CBZ is decoded once per
 * app session and its pages kept in memory rather than re-unzipped on every page turn.
 */
const archiveCache = new Map<number, CbzPage[]>()

export function clearCbzArchiveCache(fileId: number): void {
  archiveCache.delete(fileId)
}

function extractPages(buffer: ArrayBuffer): CbzPage[] {
  const entries = unzipSync(new Uint8Array(buffer), {
    filter: (file) => !file.name.endsWith('/') && !isHidden(file.name) && isImage(file.name),
  })
  return Object.keys(entries)
    .sort(naturalSort)
    .map((name) => ({ data: entries[name]!, mimeType: MIME_BY_EXTENSION[extensionOf(name)] ?? 'image/jpeg' }))
}

export function getCbzPageCount(fileId: number, buffer: ArrayBuffer): number {
  let pages = archiveCache.get(fileId)
  if (!pages) {
    pages = extractPages(buffer)
    archiveCache.set(fileId, pages)
  }
  return pages.length
}

export function getCbzPage(fileId: number, buffer: ArrayBuffer, pageIndex: number): CbzPage | null {
  let pages = archiveCache.get(fileId)
  if (!pages) {
    pages = extractPages(buffer)
    archiveCache.set(fileId, pages)
  }
  return pages[pageIndex] ?? null
}
