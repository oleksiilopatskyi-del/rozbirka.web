// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type EdgeEnv } from './router'

function env(): EdgeEnv {
  return {
    ASSETS: {
      // eslint-disable-next-line @typescript-eslint/require-await
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname
        if (path === '/index.html') {
          return new Response('<html>app</html>', {
            headers: { 'content-type': 'text/html', etag: '"index"' },
          })
        }
        if (path === '/app.html') {
          return new Response('<html>shell</html>', {
            headers: { 'content-type': 'text/html', etag: '"shell"' },
          })
        }
        if (path === '/404.html') {
          return new Response('<html>missing</html>', {
            headers: { 'content-type': 'text/html' },
          })
        }
        if (path.startsWith('/assets/')) {
          return new Response('asset', {
            headers: {
              'content-type': 'image/avif',
              etag: '"asset"',
            },
          })
        }
        if (path === '/fonts/visuelt.css') {
          return new Response('@font-face{}', {
            headers: { 'content-type': 'text/css' },
          })
        }
        return new Response('missing', { status: 404 })
      }),
    },
  }
}

describe('edge routing', () => {
  it('redirects www and HTTP to the HTTPS apex preserving path and query', async () => {
    const www = await handleRequest(
      new Request('https://www.rozbirka.pro/privacy?from=www'),
      env(),
    )
    expect(www.status).toBe(308)
    expect(www.headers.get('location')).toBe(
      'https://rozbirka.pro/privacy?from=www',
    )

    const http = await handleRequest(
      new Request('http://rozbirka.pro/marketplace?q=part'),
      env(),
    )
    expect(http.status).toBe(308)
    expect(http.headers.get('location')).toBe(
      'https://rozbirka.pro/marketplace?q=part',
    )
  })

  it('does not force HTTPS for the local Worker test server', async () => {
    const response = await handleRequest(
      new Request('http://127.0.0.1:4173/'),
      env(),
    )
    expect(response.status).toBe(200)
  })

  it('serves the prerendered landing only for the root route', async () => {
    const response = await handleRequest(
      new Request('https://rozbirka.pro/'),
      env(),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('app')
  })

  it.each([
    '/privacy',
    '/login',
    '/account',
    '/marketplace',
    '/marketplace/listings/fara-1',
    '/marketplace/shops/demo',
  ])('serves the SPA shell for %s', async (path) => {
    const response = await handleRequest(
      new Request(`https://rozbirka.pro${path}`),
      env(),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('shell')
  })

  it('returns immutable assets without losing MIME or ETag', async () => {
    const response = await handleRequest(
      new Request('https://rozbirka.pro/assets/hero-AbCd1234.avif'),
      env(),
    )
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(response.headers.get('content-type')).toBe('image/avif')
    expect(response.headers.get('etag')).toBe('"asset"')
  })

  it('serves the deferred font stylesheet as a revalidated static asset', async () => {
    const response = await handleRequest(
      new Request('https://rozbirka.pro/fonts/visuelt.css'),
      env(),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css')
    expect(response.headers.get('cache-control')).toBe(
      'max-age=0, must-revalidate',
    )
  })

  it('adds noindex to private and QA SPA responses', async () => {
    const privatePage = await handleRequest(
      new Request('https://rozbirka.pro/account'),
      env(),
    )
    const qaPage = await handleRequest(
      new Request('https://qa.rozbirka.pro/privacy'),
      env(),
    )
    expect(privatePage.headers.get('x-robots-tag')).toBe('noindex')
    expect(qaPage.headers.get('x-robots-tag')).toBe('noindex')
  })

  it.each(['/screens', '/screens/header', '/unknown'])(
    'returns a real 404 for %s',
    async (path) => {
      const response = await handleRequest(
        new Request(`https://rozbirka.pro${path}`),
        env(),
      )
      expect(response.status).toBe(404)
      expect(await response.text()).toContain('missing')
    },
  )
})
