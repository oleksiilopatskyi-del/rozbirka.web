export interface EdgeEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const spaPaths = [
  /^\/$/,
  /^\/privacy\/?$/,
  /^\/login\/?$/,
  /^\/account\/?$/,
  /^\/marketplace\/?$/,
  /^\/marketplace\/listings\/[^/]+\/?$/,
  /^\/marketplace\/shops\/[^/]+\/?$/,
]

const prototypePath = /^\/screens(?:\/|$)/
const staticPath =
  /^\/(?:robots\.txt|sitemap\.xml|favicon\.svg|og-cover\.webp|fonts\/[^/]+\.woff2)$/

function withHeaders(response: Response, headers: Record<string, string>) {
  const next = new Headers(response.headers)
  for (const [name, value] of Object.entries(headers)) next.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: next,
  })
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
    /^\/(?:login|account)(?:\/|$)/.test(url.pathname)
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
  const url = new URL(request.url)

  if (url.protocol === 'http:' || url.hostname === 'www.rozbirka.pro') {
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

  if (spaPaths.some((pattern) => pattern.test(url.pathname))) {
    const response = await env.ASSETS.fetch(
      assetRequest(request, '/index.html'),
    )
    return withHeaders(response, {
      'Cache-Control': 'max-age=0, must-revalidate',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  return notFound(request, env)
}
