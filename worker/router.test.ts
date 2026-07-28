// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type EdgeEnv } from './router'

function env({ missingProductDocument = false } = {}): EdgeEnv {
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
          return new Response(
            '<html><head><link rel="canonical" href="https://rozbirka.pro/" /><meta property="og:url" content="https://rozbirka.pro/" /></head><body>shell</body></html>',
            {
              headers: {
                'content-type': 'text/html',
                etag: '"shell"',
                'content-length': '999',
              },
            },
          )
        }
        if (
          path === '/oblik-avtozapchastyn/index.html' ||
          path === '/oblik-prodazhiv-avtozapchastyn/index.html'
        ) {
          if (missingProductDocument)
            return new Response('nested document missing', { status: 404 })
          const canonical = `https://rozbirka.pro${path.replace('/index.html', '')}`
          return new Response(
            `<html><head><link data-product-seo rel="canonical" href="${canonical}" /></head><body>product</body></html>`,
            {
              headers: {
                'content-type': 'text/html',
                etag: '"product"',
              },
            },
          )
        }
        if (path === '/404.html') {
          return new Response('<html>branded 404</html>', {
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
    ['/oblik-avtozapchastyn', '/oblik-avtozapchastyn/index.html'],
    ['/oblik-avtozapchastyn/', '/oblik-avtozapchastyn/index.html'],
    [
      '/oblik-prodazhiv-avtozapchastyn',
      '/oblik-prodazhiv-avtozapchastyn/index.html',
    ],
  ])(
    'serves the prerendered product document for %s',
    async (pathname, documentPath) => {
      const response = await handleRequest(
        new Request(`https://rozbirka.pro${pathname}`),
        env(),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/html')
      expect(response.headers.get('cache-control')).toBe(
        'max-age=0, must-revalidate',
      )
      expect(response.headers.get('x-robots-tag')).toBeNull()
      expect(response.headers.get('etag')).toBe('"product"')
      expect(await response.text()).toContain(
        `href="https://rozbirka.pro${documentPath.replace('/index.html', '')}"`,
      )
    },
  )

  it('returns the branded 404 when a prerendered product document is missing', async () => {
    const response = await handleRequest(
      new Request('https://rozbirka.pro/oblik-avtozapchastyn'),
      env({ missingProductDocument: true }),
    )

    expect(response.status).toBe(404)
    const body = await response.text()
    expect(body).toContain('branded 404')
    expect(body).not.toContain('nested document missing')
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

  it('publishes route-specific canonical metadata for indexable deep links', async () => {
    const response = await handleRequest(
      new Request('https://rozbirka.pro/privacy?source=test'),
      env(),
    )
    const html = await response.text()

    expect(html).toContain(
      '<link rel="canonical" href="https://rozbirka.pro/privacy" />',
    )
    expect(html).toContain(
      '<meta property="og:url" content="https://rozbirka.pro/privacy" />',
    )
    expect(response.headers.get('etag')).toBeNull()
    expect(response.headers.get('content-length')).toBeNull()
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

  it('adds noindex to assets served from QA and workers.dev hosts', async () => {
    const qaAsset = await handleRequest(
      new Request('https://qa.rozbirka.pro/assets/hero.avif'),
      env(),
    )
    const previewAsset = await handleRequest(
      new Request(
        'https://rozbirka-pro-web.example.workers.dev/assets/hero.avif',
      ),
      env(),
    )

    expect(qaAsset.headers.get('x-robots-tag')).toBe('noindex')
    expect(previewAsset.headers.get('x-robots-tag')).toBe('noindex')
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
      expect(await response.text()).toContain('branded 404')
    },
  )
})
