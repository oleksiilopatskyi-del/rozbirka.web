import { join } from 'node:path'

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function replaceMeta(html, attribute, key, content) {
  const pattern = new RegExp(
    `<meta\\s+data-product-seo\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*/?>`,
  )
  return html.replace(
    pattern,
    `<meta data-product-seo ${attribute}="${key}" content="${escapeAttribute(content)}" />`,
  )
}

export function documentPathForRoute(pathname) {
  if (pathname === '/') return join('dist', 'index.html')
  const slug = pathname.replace(/^\/|\/$/g, '')
  return join('dist', slug, 'index.html')
}

export function injectProductDocument({
  template,
  renderedBody,
  seo,
  structuredDataJson,
}) {
  let html = template
    .replace(
      /<title data-product-seo>[\s\S]*?<\/title>/,
      `<title data-product-seo>${seo.title}</title>`,
    )
    .replace(
      /<link\s+data-product-seo\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
      `<link data-product-seo rel="canonical" href="${escapeAttribute(seo.canonical)}" />`,
    )
    .replace(
      /<script\s+data-product-seo\s+data-product-json-ld\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script data-product-seo data-product-json-ld type="application/ld+json">${structuredDataJson}</script>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${renderedBody}</div>`)

  html = replaceMeta(html, 'name', 'description', seo.description)
  html = replaceMeta(html, 'property', 'og:title', seo.title)
  html = replaceMeta(html, 'property', 'og:description', seo.description)
  html = replaceMeta(html, 'property', 'og:url', seo.canonical)
  html = replaceMeta(html, 'property', 'og:image', seo.ogImage)
  html = replaceMeta(html, 'name', 'twitter:card', 'summary_large_image')
  html = replaceMeta(html, 'name', 'twitter:title', seo.title)
  html = replaceMeta(html, 'name', 'twitter:description', seo.description)
  html = replaceMeta(html, 'name', 'twitter:image', seo.ogImage)
  return html
}

export function assertProductDocument({ html, seo, expectedH1 }) {
  const h1Count = html.match(/<h1(?:\s|>)/g)?.length ?? 0
  if (h1Count !== 1) {
    throw new Error(`${seo.path} must contain exactly one H1; found ${h1Count}`)
  }
  const canonical = escapeAttribute(seo.canonical)
  if (!html.includes(`rel="canonical" href="${canonical}"`)) {
    throw new Error(`${seo.path} is missing canonical ${seo.canonical}`)
  }
  const visibleText = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!visibleText.includes(expectedH1)) {
    throw new Error(`${seo.path} is missing expected H1 text`)
  }
  if (!/<div id="root">\s*\S[\s\S]*<\/div>/.test(html)) {
    throw new Error(`${seo.path} has an empty prerender root`)
  }
  const jsonLdCount =
    html.match(/<script[^>]*data-product-json-ld[^>]*>/g)?.length ?? 0
  if (jsonLdCount !== 1) {
    throw new Error(
      `${seo.path} must contain one product JSON-LD script; found ${jsonLdCount}`,
    )
  }
}
