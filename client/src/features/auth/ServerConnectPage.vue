<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { setServerUrl } from '@/lib/server-connection'

const router = useRouter()
const address = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

function normalizeAddress(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

async function handleSubmit() {
  error.value = null
  const url = normalizeAddress(address.value)
  if (!url) {
    error.value = 'Enter your BookOrbit server address.'
    return
  }

  loading.value = true
  try {
    const res = await fetch(`${url}/api/v1/auth/setup-status`, { credentials: 'include' })
    if (!res.ok) throw new Error('unreachable')
    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null || !('needsSetup' in data)) {
      throw new Error('not-bookorbit')
    }

    setServerUrl(url)
    const needsSetup = (data as { needsSetup?: boolean }).needsSetup === true
    router.push(needsSetup ? '/setup' : '/login')
  } catch {
    error.value = "Couldn't reach a BookOrbit server at that address. Check the URL and try again."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 bg-background">
    <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-serif font-semibold text-foreground">Book<span class="text-primary"> Orbit</span></h1>
        <p class="text-sm text-muted-foreground mt-1">Connect to your BookOrbit server</p>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="space-y-1.5">
          <label for="server-address" class="text-sm font-medium text-foreground">Server address</label>
          <input
            id="server-address"
            v-model="address"
            type="text"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            placeholder="library.example.com"
            required
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p class="text-xs text-muted-foreground">The address of the BookOrbit instance you self-host.</p>
        </div>

        <div v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {{ loading ? 'Connecting…' : 'Connect' }}
        </button>
      </form>
    </div>
  </div>
</template>
