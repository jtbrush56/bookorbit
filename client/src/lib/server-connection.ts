import { Capacitor } from '@capacitor/core'

/**
 * Only native builds (Capacitor) need a server URL: they have no origin of their
 * own to make relative requests against. The installed PWA and the plain browser
 * client are served by the BookOrbit server itself, so every call below is a no-op
 * for them and behaves exactly as it did before this module existed.
 */
const STORAGE_KEY = 'bookorbit.serverUrl'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function getServerUrl(): string | null {
  if (!isNativePlatform()) return null
  return localStorage.getItem(STORAGE_KEY)
}

export function setServerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''))
}

export function clearServerUrl(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Prefixes an absolute-path API request (e.g. `/api/v1/auth/login`) with the configured server, when set. */
export function resolveApiUrl(path: string): string {
  const base = getServerUrl()
  return base ? `${base}${path}` : path
}

/** Same idea for a socket.io namespace (e.g. `/notifications`): socket.io needs a full URL when there's no origin to connect against. */
export function resolveSocketUrl(namespace: string): string {
  const base = getServerUrl()
  return base ? `${base}${namespace}` : namespace
}
