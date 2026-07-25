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
      await expect(page).toHaveScreenshot(`landing-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      })
    })
  }
})
