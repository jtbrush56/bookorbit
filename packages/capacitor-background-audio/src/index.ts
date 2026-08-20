import { registerPlugin } from '@capacitor/core'
import type { BackgroundAudioPlugin } from './definitions'

const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>('BackgroundAudio', {
  web: () => import('./web.js').then((m) => new m.BackgroundAudioWeb()),
})

export * from './definitions'
export { BackgroundAudio }
