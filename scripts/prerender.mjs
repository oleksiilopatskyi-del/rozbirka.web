import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertProductDocument,
  documentPathForRoute,
  injectProductDocument,
} from './prerender-helpers.mjs'

const indexPath = resolve('dist/index.html')
const serverEntry = resolve('dist-ssr/entry-server.js')
const {
  expectedH1ForRoute,
  prerenderManifest,
  renderRoute,
  serializeStructuredData,
  structuredDataForRoute,
} = await import(pathToFileURL(serverEntry).href)
const appShell = await readFile(indexPath, 'utf8')
const rootMarker = '<div id="root"></div>'
const stylesheetPattern =
  /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/

const productHeadMarkers = [
  /<title data-product-seo>[\s\S]*?<\/title>/,
  /<meta\s+data-product-seo\s+name="description"\s+content="[^"]*"\s*\/?>/,
  /<link\s+data-product-seo\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
  /<meta\s+data-product-seo\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
  /<script\s+data-product-seo\s+data-product-json-ld\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
]

if (!appShell.includes(rootMarker)) {
  throw new Error('Prerender marker was not found in dist/index.html')
}
for (const marker of productHeadMarkers) {
  if (!marker.test(appShell)) {
    throw new Error(`Product SEO marker was not found: ${marker}`)
  }
}

const stylesheetMatch = appShell.match(stylesheetPattern)
if (!stylesheetMatch?.[1]) {
  throw new Error('Production stylesheet was not found in dist/index.html')
}
const css = await readFile(resolve('dist', stylesheetMatch[1].slice(1)), 'utf8')
const heroFont = await readFile(resolve('dist/fonts/VisueltPro-Hero.woff2'))
const criticalCss = css.replace(
  /url\(["']?\/fonts\/VisueltPro-Hero\.woff2["']?\)/,
  `url("data:font/woff2;base64,${heroFont.toString('base64')}")`,
)
const template = appShell.replace(
  stylesheetPattern,
  `<style>${criticalCss}</style>`,
)

await writeFile(resolve('dist/app.html'), appShell)

const generatedDocuments = []
for (const seo of prerenderManifest) {
  const renderedBody = renderRoute(seo.path)
  if (!renderedBody) {
    throw new Error(`Missing React render for ${seo.path}`)
  }

  const html = injectProductDocument({
    template,
    renderedBody,
    seo,
    structuredDataJson: serializeStructuredData(
      structuredDataForRoute(seo.path),
    ),
  })
  assertProductDocument({
    html,
    seo,
    expectedH1: expectedH1ForRoute(seo.path),
  })

  const targetPath = resolve(documentPathForRoute(seo.path))
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, html)
  generatedDocuments.push({ seo, html })
}

function readMetadata(html) {
  return {
    title: html.match(/<title data-product-seo>([\s\S]*?)<\/title>/)?.[1],
    description: html.match(
      /<meta data-product-seo name="description" content="([^"]*)"\s*\/?>/,
    )?.[1],
    canonical: html.match(
      /<link data-product-seo rel="canonical" href="([^"]*)"\s*\/?>/,
    )?.[1],
  }
}

for (const field of ['title', 'description', 'canonical']) {
  const values = generatedDocuments.map(({ html }) => readMetadata(html)[field])
  if (new Set(values).size !== generatedDocuments.length) {
    throw new Error(`Product ${field} metadata must differ between routes`)
  }
}

const sitemapEntries = [
  ...prerenderManifest
    .filter((seo) => seo.includeInSitemap)
    .map((seo) => seo.canonical),
  'https://rozbirka.pro/privacy',
  'https://rozbirka.pro/marketplace',
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries
  .map((canonical) => `  <url><loc>${canonical}</loc></url>`)
  .join('\n')}\n</urlset>\n`
await writeFile(resolve('dist/sitemap.xml'), sitemap)
