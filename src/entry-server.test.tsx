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
    expect(prerenderManifest.map((entry) => entry.path)).toEqual(['/'])
  })

  it('renders the homepage product route', () => {
    const pathname = '/'
    const expectedH1 = 'Знаєш де кожна деталь і де твої гроші'

    expect(renderRoute(pathname)).toContain(`<h1`)
    expect(renderRoute(pathname)).toContain(expectedH1)
  })

  it('builds homepage structured data from its SEO record', () => {
    const structuredData = structuredDataForRoute('/')

    expect(JSON.stringify(structuredData)).toContain('https://rozbirka.pro/')
  })

  it('provides the expected visible H1 for the homepage', () => {
    expect(expectedH1ForRoute('/')).toBe(
      'Знаєш де кожна деталь і де твої гроші',
    )
  })

  it('rejects routes without a product SEO record', () => {
    expect(() => structuredDataForRoute('/privacy')).toThrow(
      'Missing product SEO for /privacy',
    )
  })

  it('omits the retired use-case section and links from the homepage', () => {
    const html = renderRoute('/')

    expect(html).not.toContain('Усе для щоденної роботи авторозбірки')
    expect(html).not.toContain('/oblik-avtozapchastyn')
    expect(html).not.toContain('/oblik-prodazhiv-avtozapchastyn')
  })
})
