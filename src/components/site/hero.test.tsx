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

  it('reveals heading lines, copy, and CTA in the approved sequence', () => {
    const { container } = render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    )

    const expectedAnimatedLines = [
      ['де кожна', '100ms'],
      ['деталь і де', '200ms'],
      ['твої гроші', '300ms'],
    ] as const

    const firstLine = screen.getByText('Знаєш')
    expect(firstLine).toHaveClass('anim-fade-up-visible')
    expect(firstLine).not.toHaveClass('anim-fade-up')
    expect(firstLine).not.toHaveAttribute('style')

    expectedAnimatedLines.forEach(([text, delay]) => {
      const line = screen.getByText(text)
      expect(line).toHaveClass('anim-fade-up')
      expect(line).toHaveStyle({ animationDelay: delay })
    })

    const copy = screen.getByText(
      "Застосунок, який об'єднує фінанси, функції та управління в одному інтерфейсі.",
    )
    expect(copy).toHaveClass('anim-fade-up')
    expect(copy).toHaveStyle({ animationDelay: '520ms' })

    const cta = screen.getByRole('link', {
      name: 'Спробувати безкоштовно',
    }).parentElement
    expect(cta).toHaveClass('anim-fade-up')
    expect(cta).toHaveStyle({ animationDelay: '680ms' })
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })
})
