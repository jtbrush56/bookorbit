import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.bookorbit.mobile',
  appName: 'BookOrbit',
  webDir: '../../client/dist',
  plugins: {
    // Routes fetch/XHR through native networking instead of the WebView, so requests to a
    // self-hosted server aren't subject to WebView same-origin/CORS restrictions, and refresh
    // cookies survive in the native cookie jar. See client/src/lib/server-connection.ts.
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
