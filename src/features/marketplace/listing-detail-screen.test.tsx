import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '@/api/marketplace'
import { ListingDetailScreen } from './listing-detail-screen'

vi.mock('@/api/marketplace', () => ({
  marketplaceApi: { getListing: vi.fn() },
}))
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockGet = vi.mocked(marketplaceApi.getListing)

describe('ListingDetailScreen', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('renders listing details and shop contact', async () => {
    mockGet.mockResolvedValue({
      slug: 'fara-1',
      title: 'Фара права LED',
      description: 'Оригінал',
      price: 6400,
      currency: 'UAH',
      photos: [],
      condition: 'good',
      vehicleMake: 'Audi',
      vehicleModel: 'Q5',
      vehicleYear: 2014,
      oemCode: '8R0941004',
      quantityAvailable: 1,
      shop: {
        slug: 'shop-1',
        name: 'AvtoParts',
        description: null,
        city: 'Львів',
        logoUrl: null,
        phone: '+380501112233',
        messengerUrl: null,
        publicContactName: 'Іван',
      },
    })
    render(
      <MemoryRouter initialEntries={['/marketplace/listings/fara-1']}>
        <Routes>
          <Route
            path="/marketplace/listings/:slugOrId"
            element={<ListingDetailScreen />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /фара права led/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/\+380501112233/)).toBeInTheDocument()
  })

  it('shows not-found when API 404s', async () => {
    mockGet.mockRejectedValue(new Error('404'))
    render(
      <MemoryRouter initialEntries={['/marketplace/listings/missing']}>
        <Routes>
          <Route
            path="/marketplace/listings/:slugOrId"
            element={<ListingDetailScreen />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/оголошення не знайдено/i),
    ).toBeInTheDocument()
  })
})
