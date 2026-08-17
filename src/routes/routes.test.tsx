import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { createAppRoutes } from './routes'

const cabinetRoute = () =>
  createAppRoutes(false).find((route) => route.path === '/app/:tenant')!

const loadRoute = async (route: NonNullable<ReturnType<typeof cabinetRoute>>) =>
  (route.lazy as () => Promise<{ element: ReactNode }>)()

const elementTypeNames = (node: ReactNode): string[] => {
  if (!isValidElement(node)) return []
  const type = node.type
  const name =
    typeof type === 'function'
      ? type.name
      : typeof type === 'string'
        ? type
        : ''
  const children = (node.props as { children?: ReactNode }).children
  return [name, ...elementTypeNames(children)]
}

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
    const app = cabinetRoute()
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

  it('mounts the responsive cabinet shell inside the tenant provider', async () => {
    const loaded = await loadRoute(cabinetRoute())

    expect(elementTypeNames(loaded.element)).toEqual([
      'RequireAuth',
      'CabinetProvider',
      'CabinetShell',
    ])
  })

  it.each([
    ['dashboard', 'CabinetHomeScreen'],
    ['settings/billing/overview', 'SubscriptionScreen'],
    ['settings/billing/plans', 'PlansScreen'],
    ['settings/billing/payments', 'PaymentsScreen'],
    ['settings/profile', 'ProfileScreen'],
  ])(
    'loads %s through its distinct released screen',
    async (path, screenName) => {
      const route = cabinetRoute().children?.find(
        (child) => child.path === path,
      )
      const loaded = await loadRoute(route!)
      const element = loaded.element as ReactElement<{
        screen?: { displayName?: string; name?: string }
      }>

      expect(
        element.props.screen?.displayName ?? element.props.screen?.name,
      ).toBe(screenName)
    },
  )

  it('keeps unreleased module routes on the shared lazy boundary', async () => {
    const route = cabinetRoute().children?.find(
      (child) => child.path === 'cars',
    )
    const loaded = await loadRoute(route!)
    const element = loaded.element as ReactElement

    expect(
      typeof element.type === 'function' ? element.type.name : element.type,
    ).toBe('CabinetModuleRoute')
  })
})
