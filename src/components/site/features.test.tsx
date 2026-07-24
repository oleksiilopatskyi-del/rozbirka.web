import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Features } from './features'

describe('Features carousel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes previous, next, and persistent pause controls', async () => {
    const user = userEvent.setup()
    render(<Features />)
    expect(
      screen.getByRole('button', { name: 'Попередня' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Наступна' })).toBeInTheDocument()
    const pause = screen.getByRole('button', { name: 'Зупинити автопрокрутку' })
    await user.click(pause)
    expect(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts paused when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
    render(<Features />)
    expect(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
