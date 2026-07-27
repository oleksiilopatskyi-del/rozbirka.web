import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/auth/AuthContext'
import { router } from '@/routes/router'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

function loadDeferredVisuelt() {
  if (document.querySelector('link[data-visuelt]')) return
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = '/fonts/visuelt.css'
  stylesheet.dataset['visuelt'] = 'true'
  document.head.append(stylesheet)
}

function scheduleDeferredFonts() {
  window.setTimeout(loadDeferredVisuelt, 0)
}

if (document.readyState === 'complete') {
  scheduleDeferredFonts()
} else {
  window.addEventListener('load', scheduleDeferredFonts, { once: true })
}

const app = (
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>
)

if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, app)
} else {
  createRoot(rootEl).render(app)
}
