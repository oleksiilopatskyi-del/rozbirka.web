import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '@/api/marketplace'
import { MarketplaceScreen } from './marketplace-screen'

vi.mock('@/api/marketplace', () => ({ marketplaceApi: { getCatalog: vi.fn() } }))
const mockGet = vi.mocked(marketplaceApi.getCatalog)

const sample = {
  total: 1,
  listings: [{
    slug: 'fara-1', title: 'Фара права LED', price: 6400, currency: 'UAH', photo: null,
    condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5', vehicleYear: 2014,
    oemCode: '8R0941004', quantityAvailable: 1,
    shop: { slug: 'shop-1', name: 'AvtoParts', city: 'Львів' },
  }],
}

describe('MarketplaceScreen', () => {
  beforeEach(() => { mockGet.mockReset(); mockGet.mockResolvedValue(sample) })

  it('loads and renders catalog cards as links to detail', async () => {
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    const card = await screen.findByRole('link', { name: /фара права led/i })
    expect(card).toHaveAttribute('href', '/marketplace/listings/fara-1')
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('passes search query to the API', async () => {
    const user = userEvent.setup()
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    await screen.findByRole('link', { name: /фара/i })
    await user.type(screen.getByRole('searchbox'), '8R0941004')
    await user.click(screen.getByRole('button', { name: /знайти/i }))
    expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({ q: '8R0941004' }))
  })

  it('shows empty state when no listings', async () => {
    mockGet.mockResolvedValue({ total: 0, listings: [] })
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    expect(await screen.findByText(/нічого не знайдено/i)).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    expect(await screen.findByText(/каталог тимчасово недоступний/i)).toBeInTheDocument()
  })
})
