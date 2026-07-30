import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { NavLinks } from './nav-links'

describe('NavLinks', () => {
  it('uses homepage destinations from a non-home route', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <NavLinks />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Можливості' })).toHaveAttribute(
      'href',
      '/#features',
    )
    expect(screen.getByRole('link', { name: 'Тарифи' })).toHaveAttribute(
      'href',
      '/#pricing',
    )
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute(
      'href',
      '/#faq',
    )
  })
})
