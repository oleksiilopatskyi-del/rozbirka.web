import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Hero } from './hero'

describe('Hero conversion', () => {
  it('exposes a stable heading and a real registration destination', () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Знаєш де кожна деталь і де твої гроші',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Спробувати безкоштовно' }),
    ).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Дивитись демо' })).toBeNull()
  })
})
