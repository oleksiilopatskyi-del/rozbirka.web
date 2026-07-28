import { describe, expect, it } from 'vitest'
import {
  getProductSeo,
  productSeoEntries,
  productSeoPaths,
} from './product-seo'

describe('product SEO registry', () => {
  it('owns exactly three unique product routes and primary clusters', () => {
    expect(productSeoPaths).toEqual([
      '/',
      '/oblik-avtozapchastyn',
      '/oblik-prodazhiv-avtozapchastyn',
    ])
    expect(new Set(productSeoEntries.map((entry) => entry.path)).size).toBe(3)
    expect(
      new Set(productSeoEntries.map((entry) => entry.primaryQuery)).size,
    ).toBe(3)
  })

  it('provides complete canonical and social metadata', () => {
    for (const entry of productSeoEntries) {
      expect(entry.canonical).toBe(
        entry.path === '/'
          ? 'https://rozbirka.pro/'
          : `https://rozbirka.pro${entry.path}`,
      )
      expect(entry.title.length).toBeGreaterThan(20)
      expect(entry.description.length).toBeGreaterThan(80)
      expect(entry.ogImage).toBe('https://rozbirka.pro/og-cover.webp')
      expect(entry.indexable).toBe(true)
      expect(entry.includeInSitemap).toBe(true)
    }
  })

  it('normalizes trailing slashes and keeps external metrics unmeasured', () => {
    expect(getProductSeo('/oblik-avtozapchastyn/')).toBe(
      getProductSeo('/oblik-avtozapchastyn'),
    )
    for (const entry of productSeoEntries) {
      expect(entry.baseline).toEqual({
        status: 'pending-external-tools',
        volume: null,
        difficulty: null,
        impressions: null,
        clicks: null,
        ctr: null,
        position: null,
      })
    }
  })
})
