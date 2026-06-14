import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { MarketplaceLayout } from './marketplace-layout'

describe('MarketplaceLayout', () => {
  it('renders an isolated marketplace header linking home + account without reading auth', () => {
    render(
      <MemoryRouter>
        <MarketplaceLayout>
          <div>child</div>
        </MarketplaceLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /rozbirka/i })).toHaveAttribute(
      'href',
      '/marketplace',
    )
    expect(screen.getByRole('link', { name: /кабінет/i })).toHaveAttribute(
      'href',
      '/account',
    )
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})
