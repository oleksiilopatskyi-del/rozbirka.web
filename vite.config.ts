/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assertCabinetParityBuildCompatibility } from './src/config/cabinet-feature-flags'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_')
  assertCabinetParityBuildCompatibility(
    mode,
    environment.VITE_CABINET_PARITY_COMPATIBILITY,
  )

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-router')) return 'router'
              if (id.includes('lucide-react')) return 'icons'
              if (id.includes('react-dom') || id.includes('/react/'))
                return 'react'
            }
            return undefined
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      include: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'scripts/**/*.{test,spec}.ts',
        'worker/**/*.{test,spec}.ts',
      ],
    },
  }
})
