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
})
