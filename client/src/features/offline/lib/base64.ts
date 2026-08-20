/**
 * @capacitor/filesystem's native bridge only accepts binary data as a base64 string, so every
 * offline file round-trips through these. Chunked to avoid blowing the call stack (`String.fromCharCode`
 * with a spread) or building one giant intermediate string on large PDFs.
 */
const CHUNK_SIZE = 32_768

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
