// @vitest-environment node
/// <reference types="node" />
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { productSeoEntries } from './product-seo'

describe('SEO surface', () => {
  it('publishes canonical social and structured metadata', async () => {
    const html = await readFile('index.html', 'utf8')
    expect(html).toContain(
      '<link data-product-seo rel="canonical" href="https://rozbirka.pro/"',
    )
    expect(html).toContain('property="og:url" content="https://rozbirka.pro/"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"@type": "SoftwareApplication"')
  })

  it('publishes valid robots, sitemap, and branded 404 files', async () => {
    const [robots, sitemap, notFound] = await Promise.all([
      readFile('public/robots.txt', 'utf8'),
      readFile('public/sitemap.xml', 'utf8'),
      readFile('public/404.html', 'utf8'),
    ])
    expect(robots).toBe(
      'User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /login\nSitemap: https://rozbirka.pro/sitemap.xml\n',
    )
    expect(sitemap).toContain('<loc>https://rozbirka.pro/</loc>')
    expect(sitemap).toContain('<loc>https://rozbirka.pro/privacy</loc>')
    for (const seo of productSeoEntries.filter(
      (entry) => entry.includeInSitemap,
    )) {
      expect(sitemap).toContain(`<loc>${seo.canonical}</loc>`)
    }
    expect(sitemap).not.toMatch(/screens|account|login/)
    expect(notFound).toContain('<title>Сторінку не знайдено — rozbirka</title>')
    expect(notFound).toContain('href="/"')
  })
})
