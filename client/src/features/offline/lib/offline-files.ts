import { Filesystem, Directory } from '@capacitor/filesystem'
import { isNativePlatform } from '@/lib/server-connection'
import { api } from '@/lib/api'
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64'

/**
 * Offline reading only exists on native builds: the web/PWA client has no equivalent of
 * "reserve device storage for one book, indefinitely" outside the service worker's app-shell
 * cache, which is a different mechanism with its own eviction rules.
 */
export function isOfflineSupported(): boolean {
  return isNativePlatform()
}

interface OfflineManifestEntry {
  fileId: number
  bookId: number
  sizeBytes: number | null
  downloadedAt: string
}

const MANIFEST_KEY = 'bookorbit.offlineFiles'
const STORAGE_DIR = Directory.Data
const pathFor = (fileId: number) => `offline-books/${fileId}.bin`

function readManifest(): OfflineManifestEntry[] {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    return raw ? (JSON.parse(raw) as OfflineManifestEntry[]) : []
  } catch {
    return []
  }
}

function writeManifest(entries: OfflineManifestEntry[]): void {
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries))
}

export function isFileOffline(fileId: number): boolean {
  return isOfflineSupported() && readManifest().some((entry) => entry.fileId === fileId)
}

export function getOfflineManifest(): OfflineManifestEntry[] {
  return readManifest()
}

export async function downloadFileForOffline(fileId: number, bookId: number): Promise<void> {
  const res = await api(`/api/v1/books/files/${fileId}/serve`)
  if (!res.ok) throw new Error(`Download failed with status ${res.status}`)
  const buffer = await res.arrayBuffer()

  await Filesystem.writeFile({
    path: pathFor(fileId),
    data: arrayBufferToBase64(buffer),
    directory: STORAGE_DIR,
    recursive: true,
  })

  const manifest = readManifest().filter((entry) => entry.fileId !== fileId)
  manifest.push({ fileId, bookId, sizeBytes: buffer.byteLength, downloadedAt: new Date().toISOString() })
  writeManifest(manifest)
}

export async function removeOfflineFile(fileId: number): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: pathFor(fileId), directory: STORAGE_DIR })
  } catch {
    // Already gone on disk; still drop it from the manifest below.
  }
  writeManifest(readManifest().filter((entry) => entry.fileId !== fileId))
}

/** Returns null when the file isn't downloaded, so callers can fall back to the network fetch. */
export async function readOfflineFile(fileId: number): Promise<ArrayBuffer | null> {
  if (!isFileOffline(fileId)) return null
  try {
    const result = await Filesystem.readFile({ path: pathFor(fileId), directory: STORAGE_DIR })
    return base64ToArrayBuffer(result.data as string)
  } catch {
    // Manifest and disk disagree (e.g. app storage was cleared) - treat as not downloaded.
    writeManifest(readManifest().filter((entry) => entry.fileId !== fileId))
    return null
  }
}
