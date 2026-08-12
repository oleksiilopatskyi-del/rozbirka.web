// @vitest-environment node
/// <reference types="node" />
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { productSeoEntries } from './product-seo'

describe('SEO surface', () => {
  it('publishes the Rozbirka PNG favicon', async () => {
    const [html, favicon] = await Promise.all([
      readFile('index.html', 'utf8'),
      readFile('public/favicon.png'),
    ])

    expect(html).toContain(
      '<link rel="icon" type="image/png" href="/favicon.png" />',
    )
    expect(favicon.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(favicon.readUInt32BE(16)).toBe(1024)
    expect(favicon.readUInt32BE(20)).toBe(1024)

    const { data, info } = await sharp(favicon)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number) =>
      data[(y * info.width + x) * info.channels + 3]

    expect(info.width).toBe(1024)
    expect(info.height).toBe(1024)
    expect(alphaAt(0, 0)).toBe(0)
    expect(alphaAt(1023, 0)).toBe(0)
    expect(alphaAt(0, 1023)).toBe(0)
    expect(alphaAt(1023, 1023)).toBe(0)
    expect(alphaAt(512, 512)).toBe(255)
  })

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
    expect(sitemap).not.toContain('/marketplace')
    expect(sitemap).not.toContain('/oblik-avtozapchastyn')
    expect(sitemap).not.toContain('/oblik-prodazhiv-avtozapchastyn')
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
