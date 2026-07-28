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

  it('publishes both ROZ-13 product routes in production', () => {
    const paths = createAppRoutes(false).map((route) => route.path)
    expect(paths).toContain('/oblik-avtozapchastyn')
    expect(paths).toContain('/oblik-prodazhiv-avtozapchastyn')
  })

  it('provides prerendered product route elements without a hydration fallback', () => {
    const routes = createAppRoutes(false)

    for (const path of [
      '/oblik-avtozapchastyn',
      '/oblik-prodazhiv-avtozapchastyn',
    ]) {
      const route = routes.find((candidate) => candidate.path === path)
      expect(route?.element).toBeDefined()
      expect(route?.lazy).toBeUndefined()
      expect(route?.hydrateFallbackElement).toBeUndefined()
    }
  })
})
