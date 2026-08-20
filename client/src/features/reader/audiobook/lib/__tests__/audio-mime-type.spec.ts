import { describe, expect, it } from 'vitest'
import { audioMimeType } from '../audio-mime-type'

describe('audioMimeType', () => {
  it.each([
    ['m4b', 'audio/mp4'],
    ['m4a', 'audio/mp4'],
    ['mp3', 'audio/mpeg'],
    ['opus', 'audio/ogg'],
    ['ogg', 'audio/ogg'],
    ['flac', 'audio/flac'],
  ])('maps %s to %s', (format, expected) => {
    expect(audioMimeType(format)).toBe(expected)
  })

  it('is case-insensitive', () => {
    expect(audioMimeType('MP3')).toBe('audio/mpeg')
  })

  it('falls back to audio/mpeg for an unrecognized or null format', () => {
    expect(audioMimeType('wav')).toBe('audio/mpeg')
    expect(audioMimeType(null)).toBe('audio/mpeg')
  })
})
