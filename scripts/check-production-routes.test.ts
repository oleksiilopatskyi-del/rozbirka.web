// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  buildRouteTargets,
  productionCanonical,
  retryRouteCheck,
  validateProductionResponses,
} from './check-production-routes.mjs'

function validResponses() {
  return {
    home: { status: 200, contentType: 'text/html' },
    unknown: { status: 404, contentType: 'text/html' },
    robots: { status: 200, contentType: 'text/plain' },
    sitemap: { status: 200, contentType: 'application/xml' },
    asset: {
      status: 200,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    api: {
      status: 200,
      contentType: 'application/json',
      body: '[{"code":"pro_monthly"}]',
    },
    spaRoutes: {
      privacy: {
        status: 200,
        contentType: 'text/html',
        body: '<link href="https://rozbirka.pro/privacy" data-product-seo rel="alternate canonical">',
        canonical: 'https://rozbirka.pro/privacy',
      },
      listing: {
        status: 200,
        contentType: 'text/html',
        body: '<link data-product-seo href="https://rozbirka.pro/marketplace/listings/qa-probe" media="all" rel="canonical">',
        canonical: 'https://rozbirka.pro/marketplace/listings/qa-probe',
      },
    },
    retiredRoutes: {
      inventory: {
        status: 404,
        contentType: 'text/html',
        xRobotsTag: 'noindex',
      },
      sales: {
        status: 404,
        contentType: 'text/html',
        xRobotsTag: 'noindex',
      },
    },
    prototypes: {
      screens: { status: 404 },
      header: { status: 404 },
    },
    redirects: {
      http: {
        status: 308,
        location: 'https://rozbirka.pro/privacy?source=http',
      },
      www: {
        status: 308,
        location: 'https://rozbirka.pro/privacy?source=www',
      },
    },
  }
}

describe('production route validation', () => {
  it('probes the API gateway instead of the landing origin', () => {
    expect(
      buildRouteTargets(
        'https://rozbirka.pro',
        'https://api.rozbirka.pro',
        '/assets/app.js',
      ),
    ).toMatchObject({
      home: 'https://rozbirka.pro/',
      api: 'https://api.rozbirka.pro/api/v1/billing/plans',
      asset: 'https://rozbirka.pro/assets/app.js',
      retiredInventory: 'https://rozbirka.pro/oblik-avtozapchastyn',
      retiredSales: 'https://rozbirka.pro/oblik-prodazhiv-avtozapchastyn',
    })
  })

  it('expects production canonical metadata when probing QA', () => {
    expect(productionCanonical('https://qa.rozbirka.pro/privacy')).toBe(
      'https://rozbirka.pro/privacy',
    )
  })

  it('accepts the complete production response contract', () => {
    expect(() => validateProductionResponses(validResponses())).not.toThrow()
  })

  it('retries a transient post-deploy response without weakening validation', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new Error('unknown route must return 404'))
      .mockResolvedValueOnce(validResponses())
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(
      retryRouteCheck(check, { attempts: 3, delayMs: 1000, sleep }),
    ).resolves.toEqual(validResponses())
    expect(check).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('still fails after the retry budget is exhausted', async () => {
    const error = new Error('home must return 200')
    const check = vi.fn().mockRejectedValue(error)
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(
      retryRouteCheck(check, { attempts: 3, delayMs: 1000, sleep }),
    ).rejects.toBe(error)
    expect(check).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      'soft 404',
      (value: ReturnType<typeof validResponses>) => {
        value.unknown.status = 200
      },
    ],
    [
      'API HTML fallback',
      (value: ReturnType<typeof validResponses>) => {
        value.api.contentType = 'text/html'
        value.api.body = '<html>app</html>'
      },
    ],
    [
      'mutable fingerprinted asset',
      (value: ReturnType<typeof validResponses>) => {
        value.asset.cacheControl = 'max-age=0'
      },
    ],
    [
      'production prototype route',
      (value: ReturnType<typeof validResponses>) => {
        value.prototypes.screens.status = 200
      },
    ],
    [
      'broken SPA deep link',
      (value: ReturnType<typeof validResponses>) => {
        value.spaRoutes.privacy.status = 404
      },
    ],
    [
      'wrong deep-link canonical',
      (value: ReturnType<typeof validResponses>) => {
        value.spaRoutes.privacy.body =
          '<link rel="canonical" href="https://rozbirka.pro/">'
      },
    ],
    [
      'retired route returns 200',
      (value: ReturnType<typeof validResponses>) => {
        value.retiredRoutes.inventory.status = 200
      },
    ],
    [
      'retired route is indexable',
      (value: ReturnType<typeof validResponses>) => {
        value.retiredRoutes.inventory.xRobotsTag = ''
      },
    ],
    [
      'wrong canonical redirect',
      (value: ReturnType<typeof validResponses>) => {
        value.redirects.www.location = 'https://www.rozbirka.pro/privacy'
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const responses = validResponses()
    mutate(responses)
    expect(() => validateProductionResponses(responses)).toThrow()
  })
})
