// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildRouteTargets,
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
        body: '<link rel="canonical" href="https://rozbirka.pro/privacy">',
        canonical: 'https://rozbirka.pro/privacy',
      },
      listing: {
        status: 200,
        contentType: 'text/html',
        body: '<link rel="canonical" href="https://rozbirka.pro/marketplace/listings/qa-probe">',
        canonical: 'https://rozbirka.pro/marketplace/listings/qa-probe',
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
    })
  })

  it('accepts the complete production response contract', () => {
    expect(() => validateProductionResponses(validResponses())).not.toThrow()
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
