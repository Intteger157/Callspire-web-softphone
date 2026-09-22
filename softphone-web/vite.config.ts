import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayTarget = env.VITE_GATEWAY_URL || 'http://127.0.0.1:8005'

  return {
    plugins: [vue()],
    base: '/softphone/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/softphone/api': {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks: {
            jssip: ['jssip'],
          },
        },
      },
    },
  }
})
