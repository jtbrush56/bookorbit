<script setup lang="ts">
import { CircleAlert, CloudDownload, HardDriveDownload, Loader2, Trash2 } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOfflineFile } from '../composables/useOfflineFile'

const props = withDefaults(defineProps<{ fileId: number; bookId: number; variant?: 'icon' | 'menu-item' }>(), { variant: 'icon' })
const { status, download, remove } = useOfflineFile(props.fileId, props.bookId)

function handleClick() {
  if (status.value === 'downloaded') void remove()
  else void download()
}

const menuLabel: Record<typeof status.value, string> = {
  unavailable: '',
  idle: 'Download for offline',
  downloading: 'Downloading…',
  downloaded: 'Remove offline copy',
  error: 'Retry offline download',
}
</script>

<template>
  <template v-if="status === 'unavailable'" />

  <button
    v-else-if="variant === 'menu-item'"
    class="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    :disabled="status === 'downloading'"
    @click="handleClick"
  >
    <Loader2 v-if="status === 'downloading'" class="animate-spin" />
    <Trash2 v-else-if="status === 'downloaded'" />
    <CircleAlert v-else-if="status === 'error'" class="text-destructive" />
    <CloudDownload v-else />
    {{ menuLabel[status] }}
  </button>

  <Tooltip v-else>
    <TooltipTrigger as-child>
      <button
        class="inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted"
        :class="status === 'downloaded' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        :disabled="status === 'downloading'"
        @click="handleClick"
      >
        <Loader2 v-if="status === 'downloading'" class="size-3.5 animate-spin" />
        <HardDriveDownload v-else-if="status === 'downloaded'" class="size-3.5" />
        <CircleAlert v-else-if="status === 'error'" class="size-3.5 text-destructive" />
        <CloudDownload v-else class="size-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>
      <span v-if="status === 'downloaded'" class="inline-flex items-center gap-1"><Trash2 class="size-3" /> Remove offline copy</span>
      <span v-else-if="status === 'downloading'">Downloading…</span>
      <span v-else-if="status === 'error'">Download failed, tap to retry</span>
      <span v-else>Download for offline reading</span>
    </TooltipContent>
  </Tooltip>
</template>
