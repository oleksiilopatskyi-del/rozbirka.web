import { describe, expect, it } from 'vitest'
import { createAppRoutes } from './routes'

describe('production route boundary', () => {
  it('omits prototype routes in production', () => {
    const paths = createAppRoutes(false).map((route) => route.path)
    expect(paths).not.toContain('/screens')
    expect(paths).not.toContain('/screens/header')
  })

  it('keeps prototype routes in development', () => {
    const paths = createAppRoutes(true).map((route) => route.path)
    expect(paths).toContain('/screens')
    expect(paths).toContain('/screens/header')
  })

  it('omits retired ROZ-13 product routes in production and development', () => {
    for (const includePrototypeRoutes of [false, true]) {
      const paths = createAppRoutes(includePrototypeRoutes).map(
        (route) => route.path,
      )
      expect(paths).not.toContain('/oblik-avtozapchastyn')
      expect(paths).not.toContain('/oblik-prodazhiv-avtozapchastyn')
    }
  })

  it('omits retired marketplace routes in production and development', () => {
    for (const includePrototypeRoutes of [false, true]) {
      const paths = createAppRoutes(includePrototypeRoutes).map(
        (route) => route.path,
      )
      expect(paths).not.toContain('/marketplace')
      expect(paths).not.toContain('/marketplace/listings/:slugOrId')
      expect(paths).not.toContain('/marketplace/shops/:slug')
    }
  })
})
