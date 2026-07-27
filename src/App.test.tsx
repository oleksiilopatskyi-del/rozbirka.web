import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'
import App from './App'
import { AuthProvider } from '@/auth/AuthContext'

describe('App', () => {
  it('рендерить лендінг з хедером', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(
      screen.getAllByRole('link', { name: /rozbirka/i }).length,
    ).toBeGreaterThan(0)
  })
})
