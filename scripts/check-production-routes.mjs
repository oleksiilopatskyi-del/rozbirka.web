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
    assert(
      response.body.includes(
        `<link rel="canonical" href="${response.canonical}"`,
      ),
      `${name} canonical URL is wrong`,
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

function accessHeaders() {
  const clientId = process.env['CF_ACCESS_CLIENT_ID']
  const clientSecret = process.env['CF_ACCESS_CLIENT_SECRET']
  if (!clientId || !clientSecret) return {}
  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  }
}

async function inspect(url, redirect = 'follow') {
  const response = await fetch(url, {
    redirect,
    headers: accessHeaders(),
  })
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('cache-control') ?? '',
    location: response.headers.get('location') ?? '',
    body: await response.text(),
  }
}

export function productionCanonical(url) {
  return new URL(new URL(url).pathname, 'https://rozbirka.pro').href
}

async function inspectSpaRoute(url) {
  return {
    ...(await inspect(url)),
    canonical: productionCanonical(url),
  }
}

export function buildRouteTargets(baseUrl, apiBaseUrl, assetPath) {
  const base = new URL(baseUrl)
  const apiBase = new URL(apiBaseUrl)
  return {
    home: new URL('/', base).href,
    unknown: new URL('/definitely-missing', base).href,
    robots: new URL('/robots.txt', base).href,
    sitemap: new URL('/sitemap.xml', base).href,
    asset: new URL(assetPath, base).href,
    api: new URL('/api/v1/billing/plans', apiBase).href,
    privacy: new URL('/privacy', base).href,
    listing: new URL('/marketplace/listings/qa-probe', base).href,
    screens: new URL('/screens', base).href,
    header: new URL('/screens/header', base).href,
  }
}

export async function retryRouteCheck(
  check,
  {
    attempts = 5,
    delayMs = 2000,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await check()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(delayMs)
    }
  }
  throw lastError
}

export async function checkProductionRoutes(baseUrl, apiBaseUrl) {
  const home = await inspect(new URL('/', baseUrl))
  const assetPath = home.body.match(/\/assets\/[^"' ]+/)?.[0]
  assert(assetPath, 'home did not expose a fingerprinted asset')
  const targets = buildRouteTargets(baseUrl, apiBaseUrl, assetPath)
  const base = new URL(baseUrl)

  const result = {
    home,
    unknown: await inspect(targets.unknown),
    robots: await inspect(targets.robots),
    sitemap: await inspect(targets.sitemap),
    asset: await inspect(targets.asset),
    api: await inspect(targets.api),
    spaRoutes: {
      privacy: await inspectSpaRoute(targets.privacy),
      listing: await inspectSpaRoute(targets.listing),
    },
    prototypes: {
      screens: await inspect(targets.screens),
      header: await inspect(targets.header),
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
  const apiBaseUrl = process.argv[3]
  if (!baseUrl || !apiBaseUrl) {
    throw new Error(
      'Usage: npm run check:routes -- <landing-base-url> <api-base-url>',
    )
  }
  await retryRouteCheck(() => checkProductionRoutes(baseUrl, apiBaseUrl))
}
