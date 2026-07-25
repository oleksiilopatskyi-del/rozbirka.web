import { pathToFileURL } from 'node:url'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateProductionResponses(result) {
  assert(result.home.status === 200, 'home must return 200')
  assert(result.home.contentType.includes('text/html'), 'home must be HTML')
  assert(result.unknown.status === 404, 'unknown route must return 404')
  assert(result.robots.status === 200, 'robots must return 200')
  assert(
    result.robots.contentType.includes('text/plain'),
    'robots must be text/plain',
  )
  assert(result.sitemap.status === 200, 'sitemap must return 200')
  assert(
    /xml/.test(result.sitemap.contentType),
    'sitemap must use an XML MIME type',
  )
  assert(result.asset.status === 200, 'fingerprinted asset must return 200')
  assert(
    result.asset.cacheControl === 'public, max-age=31536000, immutable',
    'fingerprinted asset must be immutable',
  )
  assert(result.api.status === 200, 'public billing plans must return 200')
  assert(
    /json/.test(result.api.contentType) && !result.api.body.includes('<html'),
    'public billing plans must return JSON, not the SPA shell',
  )
  for (const [name, response] of Object.entries(result.spaRoutes)) {
    assert(response.status === 200, `${name} must return 200`)
    assert(
      response.contentType.includes('text/html'),
      `${name} must return HTML`,
    )
  }
  for (const [name, response] of Object.entries(result.prototypes)) {
    assert(response.status === 404, `${name} must return 404`)
  }
  if (result.redirects) {
    assert(result.redirects.http.status === 308, 'HTTP must return 308')
    assert(
      result.redirects.http.location ===
        'https://rozbirka.pro/privacy?source=http',
      'HTTP redirect target is wrong',
    )
    assert(result.redirects.www.status === 308, 'www must return 308')
    assert(
      result.redirects.www.location ===
        'https://rozbirka.pro/privacy?source=www',
      'www redirect target is wrong',
    )
  }
}

async function inspect(url, redirect = 'follow') {
  const response = await fetch(url, { redirect })
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('cache-control') ?? '',
    location: response.headers.get('location') ?? '',
    body: await response.text(),
  }
}

export async function checkProductionRoutes(baseUrl) {
  const base = new URL(baseUrl)
  const home = await inspect(new URL('/', base))
  const assetPath = home.body.match(/\/assets\/[^"' ]+/)?.[0]
  assert(assetPath, 'home did not expose a fingerprinted asset')

  const result = {
    home,
    unknown: await inspect(new URL('/definitely-missing', base)),
    robots: await inspect(new URL('/robots.txt', base)),
    sitemap: await inspect(new URL('/sitemap.xml', base)),
    asset: await inspect(new URL(assetPath, base)),
    api: await inspect(new URL('/api/v1/billing/plans', base)),
    spaRoutes: {
      privacy: await inspect(new URL('/privacy', base)),
      listing: await inspect(new URL('/marketplace/listings/qa-probe', base)),
    },
    prototypes: {
      screens: await inspect(new URL('/screens', base)),
      header: await inspect(new URL('/screens/header', base)),
    },
    redirects:
      base.hostname === 'rozbirka.pro'
        ? {
            http: await inspect(
              'http://rozbirka.pro/privacy?source=http',
              'manual',
            ),
            www: await inspect(
              'https://www.rozbirka.pro/privacy?source=www',
              'manual',
            ),
          }
        : undefined,
  }
  validateProductionResponses(result)
  return result
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const baseUrl = process.argv[2]
  if (!baseUrl) throw new Error('Usage: npm run check:routes -- <base-url>')
  await checkProductionRoutes(baseUrl)
}
