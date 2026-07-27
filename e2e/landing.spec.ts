import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('landing interactions work without serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])

  await page.getByRole('button', { name: 'Наступна' }).click()
  await page.getByRole('button', { name: 'Зупинити автопрокрутку' }).click()
  await expect(
    page.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('link', { name: 'Почати 14 днів безкоштовно' }),
  ).toHaveAttribute('href', '/login?plan=pro_monthly')
})

test('hero content is immediately visible with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Знаєш де кожна деталь і де твої гроші',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Спробувати безкоштовно' }),
  ).toBeVisible()

  const visibleLine = page.getByText('Знаєш', { exact: true })
  await expect(visibleLine).toHaveCSS('animation-name', 'none')
  await expect(visibleLine).toHaveCSS('opacity', '1')
  await expect(visibleLine).toHaveCSS('transform', 'none')
})

test('direct SPA deep links mount one matching page without hydration warnings', async ({
  page,
}) => {
  const hydrationWarnings: string[] = []
  page.on('console', (message) => {
    if (/hydrat|No HydrateFallback/i.test(message.text())) {
      hydrationWarnings.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    if (/hydrat/i.test(error.message)) hydrationWarnings.push(error.message)
  })

  await page.goto('/privacy')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Як ми поводимось з даними',
    }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Знаєш де кожна деталь і де твої гроші',
    }),
  ).toHaveCount(0)
  expect(hydrationWarnings).toEqual([])
})

test.describe('responsive matrix', () => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    test(`has no horizontal overflow at ${width}px`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'chromium',
        'The screenshot matrix is captured once in desktop Chromium',
      )
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/', { waitUntil: 'networkidle' })
      await page
        .locator('img')
        .evaluateAll(async (images: HTMLImageElement[]) => {
          await Promise.all(
            images.map(async (image) => {
              image.loading = 'eager'
              await image.decode().catch(() => undefined)
            }),
          )
        })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth === window.innerWidth,
        ),
      ).toBe(true)
      const platformSuffix = process.platform === 'linux' ? '-linux' : ''
      await expect(page).toHaveScreenshot(
        `landing-${width}${platformSuffix}.png`,
        {
          fullPage: true,
          animations: 'disabled',
        },
      )
    })
  }
})
