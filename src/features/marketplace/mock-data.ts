import type { MarketplaceCatalogResult } from '@/api/marketplace'

export const mockCatalog: MarketplaceCatalogResult = {
  total: 2,
  listings: [
    {
      slug: 'fara-prava-led-11112222',
      title: 'Фара права LED',
      price: 6400, currency: 'UAH', photo: null,
      condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5 8R', vehicleYear: 2014,
      oemCode: '8R0941004', quantityAvailable: 1,
      shop: { slug: 'avtoparts-lviv', name: 'AvtoParts Lviv', city: 'Львів' },
    },
    {
      slug: 'dzerkalo-live-33334444',
      title: 'Дзеркало ліве',
      price: 2100, currency: 'UAH', photo: null,
      condition: 'good', vehicleMake: 'VW', vehicleModel: 'Passat B7', vehicleYear: 2012,
      oemCode: '3AB857933', quantityAvailable: 2,
      shop: { slug: 'avtoparts-lviv', name: 'AvtoParts Lviv', city: 'Львів' },
    },
  ],
}
