import { handleSessionRequest, type SessionEnv } from './session'

export interface EdgeEnv extends SessionEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const spaPaths = [
  /^\/$/,
  /^\/privacy\/?$/,
  /^\/login\/?$/,
  /^\/account\/?$/,
  /^\/invite\/[A-Za-z0-9_-]{4,128}\/?$/,
  /^\/scan\/[A-Za-z0-9._~-]{1,256}\/?$/,
]

const prototypePath = /^\/screens(?:\/|$)/
const staticPath =
  /^\/(?:robots\.txt|sitemap\.xml|favicon\.png|og-cover\.webp|fonts\/[^/]+\.(?:woff2|css))$/
const productDocumentPath: Record<string, string> = {
  '/': '/index.html',
}

const appShellMetadata = {
  privacy: {
    title: 'Політика конфіденційності | rozbirka',
    description:
      'Дізнайтеся, які дані збирає rozbirka, як використовує та захищає їх, а також які права мають користувачі сервісу.',
  },
} as const

function withHeaders(response: Response, headers: Record<string, string>) {
  const next = new Headers(response.headers)
  for (const [name, value] of Object.entries(headers)) next.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: next,
  })
}

async function withCanonicalMetadata(response: Response, url: URL) {
  const canonical = new URL(url.pathname, 'https://rozbirka.pro').href.replace(
    /\/$/,
    '',
  )
  const routeMetadata =
    url.pathname === '/privacy' ? appShellMetadata.privacy : undefined
  const html = (await response.text())
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, (tag) =>
      routeMetadata
        ? tag.replace(/>[\s\S]*?<\/title>/i, `>${routeMetadata.title}</title>`)
        : tag,
    )
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const rel = attributeValue(tag, 'rel')
      return rel?.split(/\s+/).some((token) => token === 'canonical')
        ? replaceAttribute(tag, 'href', canonical)
        : tag
    })
    .replace(/<meta\b[^>]*>/gi, (tag) => {
      const property = attributeValue(tag, 'property')
      const name = attributeValue(tag, 'name')
      if (property === 'og:url') {
        return replaceAttribute(tag, 'content', canonical)
      }
      if (!routeMetadata) return tag
      if (property === 'og:title' || name === 'twitter:title') {
        return replaceAttribute(tag, 'content', routeMetadata.title)
      }
      if (
        property === 'og:description' ||
        name === 'description' ||
        name === 'twitter:description'
      ) {
        return replaceAttribute(tag, 'content', routeMetadata.description)
      }
      return tag
    })
  const headers = new Headers(response.headers)
  headers.delete('Content-Length')
  headers.delete('ETag')
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function attributeValue(tag: string, attribute: string) {
  const match = new RegExp(
    `\\s${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i',
  ).exec(tag)
  return (match?.[1] ?? match?.[2])?.toLowerCase()
}

function replaceAttribute(tag: string, attribute: string, value: string) {
  return tag.replace(
    new RegExp(`(\\s${attribute}\\s*=\\s*)(["'])(.*?)\\2`, 'i'),
    (_match, prefix: string, quote: string) =>
      `${prefix}${quote}${value}${quote}`,
  )
}

function assetRequest(request: Request, path: string) {
  const url = new URL(request.url)
  url.pathname = path
  url.search = ''
  return new Request(url, { method: request.method, headers: request.headers })
}

function shouldNoindex(url: URL) {
  return (
    url.hostname.startsWith('qa.') ||
    url.hostname.endsWith('.workers.dev') ||
    /^\/(?:login|account|invite|scan)(?:\/|$)/.test(url.pathname)
  )
}

async function notFound(request: Request, env: EdgeEnv) {
  const page = await env.ASSETS.fetch(assetRequest(request, '/404.html'))
  const headers = new Headers(page.headers)
  headers.set('Cache-Control', 'max-age=0, must-revalidate')
  headers.set('X-Robots-Tag', 'noindex')
  return new Response(page.body, { status: 404, headers })
}

export async function handleRequest(request: Request, env: EdgeEnv) {
  const sessionResponse = await handleSessionRequest(request, env)
  if (sessionResponse) return sessionResponse

  const url = new URL(request.url)

  const requestHostname = request.headers.get('host')?.split(':')[0] ?? ''
  const isLocalRequest =
    requestHostname === '127.0.0.1' || requestHostname === 'localhost'
  const isProductionHost =
    url.hostname === 'rozbirka.pro' || url.hostname === 'www.rozbirka.pro'
  if (
    !isLocalRequest &&
    ((url.protocol === 'http:' && isProductionHost) ||
      url.hostname === 'www.rozbirka.pro')
  ) {
    url.protocol = 'https:'
    url.hostname = 'rozbirka.pro'
    return Response.redirect(url.toString(), 308)
  }

  if (prototypePath.test(url.pathname)) return notFound(request, env)

  if (url.pathname.startsWith('/assets/')) {
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404) return notFound(request, env)
    return withHeaders(response, {
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  if (staticPath.test(url.pathname)) {
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404) return notFound(request, env)
    return withHeaders(response, {
      'Cache-Control': 'max-age=0, must-revalidate',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  const normalizedProductPath =
    url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname
  const documentPath = productDocumentPath[normalizedProductPath]
  if (documentPath) {
    const response = await env.ASSETS.fetch(assetRequest(request, documentPath))
    if (response.status === 404) return notFound(request, env)
    return withHeaders(response, {
      'Cache-Control': 'max-age=0, must-revalidate',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  if (spaPaths.some((pattern) => pattern.test(url.pathname))) {
    const shellPath = url.pathname === '/' ? '/index.html' : '/app.html'
    let response = await env.ASSETS.fetch(assetRequest(request, shellPath))
    if (url.pathname !== '/') {
      response = await withCanonicalMetadata(response, url)
    }
    return withHeaders(response, {
      'Cache-Control': 'max-age=0, must-revalidate',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  return notFound(request, env)
}
