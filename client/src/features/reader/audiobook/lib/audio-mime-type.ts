const AUDIO_MIME_BY_FORMAT: Record<string, string> = {
  m4b: 'audio/mp4',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
}

export function audioMimeType(format: string | null): string {
  if (!format) return 'audio/mpeg'
  return AUDIO_MIME_BY_FORMAT[format.toLowerCase()] ?? 'audio/mpeg'
}
