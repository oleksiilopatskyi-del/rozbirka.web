import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no ResizeObserver; provide a no-op polyfill for components that use it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  }
}

// Some jsdom/Node combinations expose `window` without web storage; the app
// touches localStorage at module load, so provide the same in-memory stand-in
// the browser would give us. Inert where jsdom supplies storage itself.
if (typeof window !== 'undefined' && window.localStorage === undefined) {
  const createStorage = (): Storage => {
    const entries = new Map<string, string>()
    return {
      get length() {
        return entries.size
      },
      clear: () => entries.clear(),
      getItem: (key: string) => entries.get(key) ?? null,
      key: (index: number) => [...entries.keys()][index] ?? null,
      removeItem: (key: string) => {
        entries.delete(key)
      },
      setItem: (key: string, value: string) => {
        entries.set(key, String(value))
      },
    }
  }

  Object.defineProperty(window, 'localStorage', { value: createStorage() })
  Object.defineProperty(window, 'sessionStorage', { value: createStorage() })
}

afterEach(() => {
  cleanup()
})
