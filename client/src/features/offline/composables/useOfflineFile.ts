import { ref } from 'vue'
import { downloadFileForOffline, isFileOffline, isOfflineSupported, removeOfflineFile } from '../lib/offline-files'

export type OfflineFileStatus = 'unavailable' | 'idle' | 'downloading' | 'downloaded' | 'error'

export function useOfflineFile(fileId: number, bookId: number) {
  const status = ref<OfflineFileStatus>(isOfflineSupported() ? (isFileOffline(fileId) ? 'downloaded' : 'idle') : 'unavailable')
  const error = ref<string | null>(null)

  async function download(): Promise<void> {
    if (status.value === 'downloading' || !isOfflineSupported()) return
    status.value = 'downloading'
    error.value = null
    try {
      await downloadFileForOffline(fileId, bookId)
      status.value = 'downloaded'
    } catch (err) {
      status.value = 'error'
      error.value = err instanceof Error ? err.message : 'Download failed'
    }
  }

  async function remove(): Promise<void> {
    if (status.value !== 'downloaded') return
    await removeOfflineFile(fileId)
    status.value = 'idle'
  }

  return { status, error, download, remove }
}
