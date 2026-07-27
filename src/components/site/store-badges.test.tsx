import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppStoreBadge, GooglePlayBadge } from './store-badges'

describe('store badges', () => {
  it('links App Store to the verified production listing', () => {
    render(<AppStoreBadge />)
    expect(screen.getByRole('link', { name: /app store/i })).toHaveAttribute(
      'href',
      'https://apps.apple.com/ua/app/rozbirka/id6762130912',
    )
  })

  it('renders Google Play as unavailable content instead of a link', () => {
    render(<GooglePlayBadge />)
    expect(screen.queryByRole('link', { name: /google play/i })).toBeNull()
    expect(screen.getByText('Скоро')).toBeInTheDocument()
  })
})
