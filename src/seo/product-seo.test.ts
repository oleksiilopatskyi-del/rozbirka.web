import { describe, expect, it } from 'vitest'
import {
  getProductSeo,
  productSeoEntries,
  productSeoPaths,
} from './product-seo'

describe('product SEO registry', () => {
  it('owns only the homepage product route', () => {
    expect(productSeoPaths).toEqual(['/'])
    expect(productSeoEntries).toHaveLength(1)
    expect(getProductSeo('/')).toBe(productSeoEntries[0])
    expect(getProductSeo('/oblik-avtozapchastyn')).toBeUndefined()
    expect(getProductSeo('/oblik-prodazhiv-avtozapchastyn')).toBeUndefined()
  })

  it('provides complete canonical and social metadata', () => {
    for (const entry of productSeoEntries) {
      expect(entry.canonical).toBe('https://rozbirka.pro/')
      expect(entry.title.length).toBeGreaterThan(20)
      expect(entry.description.length).toBeGreaterThan(80)
      expect(entry.ogImage).toBe('https://rozbirka.pro/og-cover.webp')
      expect(entry.indexable).toBe(true)
      expect(entry.includeInSitemap).toBe(true)
    }
  })

  it('normalizes trailing slashes and keeps external metrics unmeasured', () => {
    expect(getProductSeo('/oblik-avtozapchastyn/')).toBeUndefined()
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
