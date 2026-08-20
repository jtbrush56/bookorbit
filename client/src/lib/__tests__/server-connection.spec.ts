import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isNativePlatform = vi.hoisted(() => vi.fn<() => boolean>(() => false))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

import { clearServerUrl, getServerUrl, isNativePlatform as isNative, resolveApiUrl, resolveSocketUrl, setServerUrl } from '@/lib/server-connection'

describe('server-connection', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false)
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a no-op everywhere on a non-native platform, regardless of a stored URL', () => {
    isNativePlatform.mockReturnValue(false)
    setServerUrl('https://library.example.com')

    expect(isNative()).toBe(false)
    expect(getServerUrl()).toBeNull()
    expect(resolveApiUrl('/api/v1/auth/me')).toBe('/api/v1/auth/me')
    expect(resolveSocketUrl('/notifications')).toBe('/notifications')
  })

  it('prefixes requests with the configured server URL on native platforms', () => {
    isNativePlatform.mockReturnValue(true)
    setServerUrl('https://library.example.com')

    expect(getServerUrl()).toBe('https://library.example.com')
    expect(resolveApiUrl('/api/v1/auth/me')).toBe('https://library.example.com/api/v1/auth/me')
    expect(resolveSocketUrl('/notifications')).toBe('https://library.example.com/notifications')
  })

  it('strips a trailing slash so paths never end up double-slashed', () => {
    isNativePlatform.mockReturnValue(true)
    setServerUrl('https://library.example.com/')

    expect(resolveApiUrl('/api/v1/auth/me')).toBe('https://library.example.com/api/v1/auth/me')
  })

  it('falls back to the relative path on native once cleared', () => {
    isNativePlatform.mockReturnValue(true)
    setServerUrl('https://library.example.com')
    clearServerUrl()

    expect(getServerUrl()).toBeNull()
    expect(resolveApiUrl('/api/v1/auth/me')).toBe('/api/v1/auth/me')
  })
})
