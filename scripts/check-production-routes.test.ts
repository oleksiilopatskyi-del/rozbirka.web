// @vitest-environment node
import { expect, it } from 'vitest'
import { validateProductionResponses } from './check-production-routes.mjs'

it('rejects soft 404s and weak asset caching', () => {
  expect(() =>
    validateProductionResponses({
      home: { status: 200, contentType: 'text/html' },
      unknown: { status: 200, contentType: 'text/html' },
      robots: { status: 200, contentType: 'text/html' },
      sitemap: { status: 200, contentType: 'text/html' },
      asset: { status: 200, cacheControl: 'max-age=0' },
    }),
  ).toThrow()
})
