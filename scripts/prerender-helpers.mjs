import { join } from 'node:path'

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlText(value) {
  return value
    .replaceAll('&', '&amp;')
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
      `<title data-product-seo>${escapeHtmlText(seo.title)}</title>`,
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

function assertSingleMatch(html, pattern, label, expected, seo) {
  const matches = [...html.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(
      `${seo.path} must contain exactly one ${label}; found ${matches.length}`,
    )
  }
  if (matches[0][1] !== expected) {
    throw new Error(`${seo.path} ${label} does not match manifest`)
  }
}

function assertMetadata(html, seo) {
  assertSingleMatch(
    html,
    /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/g,
    'title',
    escapeHtmlText(seo.title),
    seo,
  )
  assertSingleMatch(
    html,
    /<meta(?=[^>]*\sname="description")(?=[^>]*\scontent="([^"]*)")[^>]*>/g,
    'description',
    escapeAttribute(seo.description),
    seo,
  )
  assertSingleMatch(
    html,
    /<link(?=[^>]*\srel="canonical")(?=[^>]*\shref="([^"]*)")[^>]*>/g,
    'canonical',
    escapeAttribute(seo.canonical),
    seo,
  )

  for (const [label, attribute, key, value] of [
    ['OG title', 'property', 'og:title', seo.title],
    ['OG description', 'property', 'og:description', seo.description],
    ['OG URL', 'property', 'og:url', seo.canonical],
    ['OG image', 'property', 'og:image', seo.ogImage],
    ['Twitter card', 'name', 'twitter:card', 'summary_large_image'],
    ['Twitter title', 'name', 'twitter:title', seo.title],
    ['Twitter description', 'name', 'twitter:description', seo.description],
    ['Twitter image', 'name', 'twitter:image', seo.ogImage],
  ]) {
    assertSingleMatch(
      html,
      new RegExp(
        `<meta(?=[^>]*\\s${attribute}="${key}")(?=[^>]*\\scontent="([^"]*)")[^>]*>`,
        'g',
      ),
      label,
      escapeAttribute(value),
      seo,
    )
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertGraphEntity(graph, type, id, seo) {
  const matches = graph.filter(
    (entry) => isRecord(entry) && entry['@type'] === type,
  )
  if (matches.length === 0) {
    throw new Error(`${seo.path} JSON-LD is missing ${type}`)
  }
  if (matches.length !== 1) {
    throw new Error(
      `${seo.path} JSON-LD must contain exactly one ${type}; found ${matches.length}`,
    )
  }
  if (matches[0]['@id'] !== id) {
    throw new Error(`${seo.path} JSON-LD ${type} does not have expected @id`)
  }
  return matches[0]
}

function assertFaqPage(entity, seo) {
  if (!Array.isArray(entity.mainEntity) || entity.mainEntity.length === 0) {
    throw new Error(`${seo.path} JSON-LD FAQPage must contain questions`)
  }
  for (const question of entity.mainEntity) {
    if (
      !isRecord(question) ||
      question['@type'] !== 'Question' ||
      !isRecord(question.acceptedAnswer) ||
      question.acceptedAnswer['@type'] !== 'Answer'
    ) {
      throw new Error(`${seo.path} JSON-LD FAQPage has invalid question data`)
    }
  }
}

function assertStructuredData(html, seo) {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*data-product-json-ld[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ]
  if (scripts.length !== 1) {
    throw new Error(
      `${seo.path} must contain one product JSON-LD script; found ${scripts.length}`,
    )
  }

  let structuredData
  try {
    structuredData = JSON.parse(scripts[0][1])
  } catch {
    throw new Error(`${seo.path} has invalid product JSON-LD`)
  }
  if (
    !isRecord(structuredData) ||
    structuredData['@context'] !== 'https://schema.org'
  ) {
    throw new Error(`${seo.path} JSON-LD must use the Schema.org context`)
  }
  const graph = Array.isArray(structuredData['@graph'])
    ? structuredData['@graph']
    : []

  if (seo.path === '/') {
    assertGraphEntity(
      graph,
      'Organization',
      'https://rozbirka.pro/#organization',
      seo,
    )
    assertGraphEntity(graph, 'WebSite', 'https://rozbirka.pro/#website', seo)
    const software = assertGraphEntity(
      graph,
      'SoftwareApplication',
      'https://rozbirka.pro/#software',
      seo,
    )
    if (
      software.url !== seo.canonical ||
      software.description !== seo.description
    ) {
      throw new Error(
        `${seo.path} JSON-LD SoftwareApplication does not match manifest`,
      )
    }
  } else {
    const webPage = assertGraphEntity(
      graph,
      'WebPage',
      `${seo.canonical}#webpage`,
      seo,
    )
    if (
      webPage.url !== seo.canonical ||
      webPage.name !== seo.title ||
      webPage.description !== seo.description
    ) {
      throw new Error(`${seo.path} JSON-LD WebPage does not match manifest`)
    }
    const breadcrumbs = assertGraphEntity(
      graph,
      'BreadcrumbList',
      `${seo.canonical}#breadcrumbs`,
      seo,
    )
    if (
      !Array.isArray(breadcrumbs.itemListElement) ||
      breadcrumbs.itemListElement.length !== seo.breadcrumbs.length
    ) {
      throw new Error(
        `${seo.path} JSON-LD BreadcrumbList does not match manifest`,
      )
    }
    for (const [index, breadcrumb] of seo.breadcrumbs.entries()) {
      const item = breadcrumbs.itemListElement[index]
      if (
        !isRecord(item) ||
        item['@type'] !== 'ListItem' ||
        item.position !== index + 1 ||
        item.name !== breadcrumb.name ||
        item.item !== `https://rozbirka.pro${breadcrumb.path}`
      ) {
        throw new Error(
          `${seo.path} JSON-LD BreadcrumbList does not match manifest`,
        )
      }
    }
  }

  assertFaqPage(
    assertGraphEntity(graph, 'FAQPage', `${seo.canonical}#faq`, seo),
    seo,
  )
}

export function assertProductDocument({ html, seo, expectedH1 }) {
  const h1Count = html.match(/<h1(?:\s|>)/g)?.length ?? 0
  if (h1Count !== 1) {
    throw new Error(`${seo.path} must contain exactly one H1; found ${h1Count}`)
  }
  assertMetadata(html, seo)
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
  assertStructuredData(html, seo)
}
