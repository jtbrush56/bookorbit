import { isFileOffline, readOfflineFile } from '@/features/offline/lib/offline-files'
import { audioMimeType } from './audio-mime-type'

export interface OfflineAudioFile {
  id: number
  format: string | null
}

/**
 * Resolves local blob-URL overrides for audiobook files already downloaded via the offline
 * feature. Files that aren't offline (or aren't on a native build at all) are left unmapped so
 * callers fall back to network streaming for them.
 */
export async function resolveOfflineAudioSources(files: OfflineAudioFile[]): Promise<Map<number, string>> {
  const overrides = new Map<number, string>()
  await Promise.all(
    files.map(async (file) => {
      if (!isFileOffline(file.id)) return
      const buffer = await readOfflineFile(file.id)
      if (!buffer) return
      const blob = new Blob([buffer], { type: audioMimeType(file.format) })
      overrides.set(file.id, URL.createObjectURL(blob))
    }),
  )
  return overrides
}

export function releaseOfflineAudioSources(overrides: Map<number, string>): void {
  for (const src of overrides.values()) URL.revokeObjectURL(src)
  overrides.clear()
}
