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

  it('keeps resumable invitation and scan deep links in production', () => {
    const paths = createAppRoutes(false).map((route) => route.path)
    expect(paths).toContain('/invite/:code')
    expect(paths).toContain('/scan/:qrCode')
  })

  it('registers the cabinet parent and lazy children', () => {
    const app = createAppRoutes(false).find(
      (route) => route.path === '/app/:tenant',
    )
    const childPaths = app?.children?.map((route) => route.path)

    expect(app?.lazy).toEqual(expect.any(Function))
    expect(childPaths).toContain('dashboard')
    expect(childPaths).toContain('settings/billing/plans')
    expect(childPaths).toContain('settings/billing/payments')
    expect(app?.children?.at(-1)?.path).toBe('*')
    expect(
      app?.children
        ?.filter((route) => route.path !== undefined)
        .every((route) => route.lazy !== undefined),
    ).toBe(true)
  })
})
