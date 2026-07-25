import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import App from '@/App'
import { AuthProvider } from '@/auth/AuthContext'

export function renderLanding(): string {
  return renderToString(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  )
}
