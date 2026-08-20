import type { Router } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useChangePasswordDialog } from '@/composables/useChangePasswordDialog'
import { useSetupStatus } from '@/features/auth/composables/useSetupStatus'
import { getServerUrl, isNativePlatform } from '@/lib/server-connection'

export function registerAuthGuard(router: Router): void {
  router.beforeEach(async (to) => {
    // Native builds have no origin of their own to make relative API calls against, so
    // everything is gated on a configured server until the user picks one.
    if (isNativePlatform() && !getServerUrl()) {
      return to.path === '/connect' ? true : { path: '/connect' }
    }
    if (to.path === '/connect') {
      return { path: '/login' }
    }

    const { fetchSetupStatus, allowRegistration } = useSetupStatus()
    let requiresSetup = false
    try {
      requiresSetup = await fetchSetupStatus()
    } catch {
      // If setup-status cannot be loaded, fall back to normal auth checks.
    }
    if (requiresSetup && to.path !== '/setup') {
      return { path: '/setup' }
    }

    if (!requiresSetup && to.path === '/setup') {
      const { user } = useAuth()
      return user.value ? { path: '/' } : { path: '/login' }
    }

    if (to.path === '/register') {
      const { user } = useAuth()
      if (user.value) return { path: '/' }
      if (!allowRegistration.value) return { path: '/login' }
    }

    if (to.meta.public) return true

    const { user } = useAuth()

    if (!user.value) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (user.value.isDefaultPassword && user.value.provisioningMethod !== 'shared') {
      useChangePasswordDialog().open(true)
      // Allow navigation to '/' but block everything else
      if (to.path !== '/') return { path: '/' }
    }

    if (to.name === 'achievements' && user.value.settings.achievementPreferences?.enabled === false) {
      return { name: 'settings-account-profile' }
    }

    return true
  })
}
