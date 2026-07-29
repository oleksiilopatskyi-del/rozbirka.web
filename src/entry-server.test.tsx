// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  expectedH1ForRoute,
  prerenderManifest,
  renderRoute,
  structuredDataForRoute,
} from './entry-server'

describe('server product routes', () => {
  it('exports all product SEO entries for prerendering', () => {
    expect(prerenderManifest.map((entry) => entry.path)).toEqual([
      '/',
      '/oblik-avtozapchastyn',
      '/oblik-prodazhiv-avtozapchastyn',
    ])
  })

  it.each([
    ['/', 'Знаєш де кожна деталь і де твої гроші'],
    ['/oblik-avtozapchastyn', 'Облік автозапчастин для авторозбірки'],
    [
      '/oblik-prodazhiv-avtozapchastyn',
      'Облік продажів автозапчастин: від замовлення до оплати',
    ],
  ])('renders the product route %s', (pathname, expectedH1) => {
    expect(renderRoute(pathname)).toContain(`<h1`)
    expect(renderRoute(pathname)).toContain(expectedH1)
  })

  it('builds route-specific structured data from its SEO record', () => {
    const structuredData = structuredDataForRoute('/oblik-avtozapchastyn')

    expect(JSON.stringify(structuredData)).toContain(
      'https://rozbirka.pro/oblik-avtozapchastyn',
    )
  })

  it('provides the expected visible H1 for each product route', () => {
    expect(expectedH1ForRoute('/')).toBe(
      'Знаєш де кожна деталь і де твої гроші',
    )
    expect(expectedH1ForRoute('/oblik-avtozapchastyn')).toBe(
      'Облік автозапчастин для авторозбірки без таблиць і хаосу',
    )
  })

  it('rejects routes without a product SEO record', () => {
    expect(() => structuredDataForRoute('/privacy')).toThrow(
      'Missing product SEO for /privacy',
    )
  })
})
