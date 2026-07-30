import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('retired SEO use-case URLs return the branded 404 page', async ({
  page,
}) => {
  for (const path of [
    '/oblik-avtozapchastyn',
    '/oblik-avtozapchastyn/',
    '/oblik-prodazhiv-avtozapchastyn',
    '/oblik-prodazhiv-avtozapchastyn/',
  ]) {
    const response = await page.goto(path)

    expect(response?.status(), path).toBe(404)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Сторінку не знайдено' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'На головну' }),
    ).toHaveAttribute('href', '/')
  }
})

test('landing interactions work without serious accessibility violations', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])

  await page.emulateMedia({ reducedMotion: 'no-preference' })
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

  const animatedHeroNodes = [
    page.getByText('Знаєш', { exact: true }),
    page.getByText('де кожна', { exact: true }),
    page.getByText('деталь і де', { exact: true }),
    page.getByText('твої гроші', { exact: true }),
    page.getByText(
      "Застосунок, який об'єднує фінанси, функції та управління в одному інтерфейсі.",
    ),
    page.getByRole('link', { name: 'Спробувати безкоштовно' }).locator('..'),
  ]

  for (const node of animatedHeroNodes) {
    await expect(node).toBeVisible()
    await expect(node).toHaveCSS('animation-name', 'none')
    await expect(node).toHaveCSS('opacity', '1')
    await expect(node).toHaveCSS('transform', 'none')
  }
})

test('hero LCP line is visible from initial paint while later lines stagger', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const firstHeroLine = page.getByText('Знаєш', { exact: true })
  await expect(firstHeroLine).toBeVisible()
  await expect(firstHeroLine).toHaveCSS('opacity', '1')
  await expect(firstHeroLine).toHaveCSS('transform', 'none')
  await expect(firstHeroLine).toHaveCSS('animation-name', 'none')

  await expect(page.getByText('де кожна', { exact: true })).toHaveCSS(
    'animation-name',
    'fade-up',
  )
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
  test('uses identical footer typography on landing and SEO routes', async ({
    page,
  }) => {
    let landingFontFamily = ''

    for (const path of [
      '/',
      '/oblik-avtozapchastyn',
      '/oblik-prodazhiv-avtozapchastyn',
    ]) {
      await page.goto(path)
      await page.evaluate(() => document.fonts.ready)

      const wordmark = page
        .locator('footer p')
        .filter({ hasText: /^rozbirka$/ })
      const fontFamily = await wordmark.evaluate(
        (element) => getComputedStyle(element).fontFamily,
      )

      if (path === '/') {
        landingFontFamily = fontFamily
        expect(fontFamily).toContain('Visuelt Pro')
      } else {
        expect(fontFamily, path).toBe(landingFontFamily)
      }
    }
  })

  for (const { width, expectedFontSize } of [
    { width: 375, expectedFontSize: '44px' },
    { width: 768, expectedFontSize: '64px' },
    { width: 1440, expectedFontSize: '88px' },
  ]) {
    test(`uses compact hero typography at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/')

      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
        'font-size',
        expectedFontSize,
      )
    })
  }

  for (const width of [375, 768, 1440]) {
    test(`shows the complete shared footer wordmark at ${width}px`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 1000 })

      for (const path of [
        '/',
        '/oblik-avtozapchastyn',
        '/oblik-prodazhiv-avtozapchastyn',
      ]) {
        await page.goto(path)

        const footer = page.locator('footer')
        const wordmark = footer.locator('p').filter({ hasText: /^rozbirka$/ })
        await expect(wordmark).toBeVisible()
        await wordmark.scrollIntoViewIfNeeded()

        const isFullyVisible = await wordmark.evaluate((element) => {
          const wordmarkRect = element.getBoundingClientRect()
          const containerRect = element.parentElement?.getBoundingClientRect()

          return (
            containerRect !== undefined &&
            wordmarkRect.top >= containerRect.top &&
            wordmarkRect.bottom <= containerRect.bottom
          )
        })

        expect(isFullyVisible, `${path} at ${width}px`).toBe(true)
      }
    })
  }

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
