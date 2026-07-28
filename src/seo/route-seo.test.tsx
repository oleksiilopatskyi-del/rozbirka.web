import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getUseCasePage } from '@/content/use-case-pages'
import { getProductSeo } from './product-seo'
import { RouteSeo } from './route-seo'

describe('RouteSeo', () => {
  beforeEach(() => {
    document.head
      .querySelectorAll('script[data-product-json-ld]')
      .forEach((script) => script.remove())
  })

  it('synchronizes inventory metadata and structured data into the browser head', () => {
    render(
      <RouteSeo
        entry={getProductSeo('/oblik-avtozapchastyn')!}
        faq={getUseCasePage('/oblik-avtozapchastyn').faq}
      />,
    )

    expect(document.title).toBe(
      'Облік автозапчастин для авторозбірки | rozbirka',
    )
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://rozbirka.pro/oblik-avtozapchastyn',
    )
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('складський облік автозапчастин'),
    )
    expect(
      document.querySelector('script[data-product-json-ld]'),
    ).not.toBeNull()
  })

  it('updates existing head nodes instead of appending duplicates', () => {
    const entry = getProductSeo('/oblik-avtozapchastyn')!
    const faq = getUseCasePage('/oblik-avtozapchastyn').faq
    const { rerender } = render(<RouteSeo entry={entry} faq={faq} />)

    rerender(<RouteSeo entry={entry} faq={faq} />)

    expect(document.head.querySelectorAll('title')).toHaveLength(1)
    expect(
      document.head.querySelectorAll('meta[name="description"]'),
    ).toHaveLength(1)
    expect(
      document.head.querySelectorAll('link[rel="canonical"]'),
    ).toHaveLength(1)
    expect(
      document.head.querySelectorAll(
        'script[type="application/ld+json"][data-product-json-ld]',
      ),
    ).toHaveLength(1)
  })

  it('adopts an untagged template schema as the single current route graph', () => {
    const legacyScript = document.createElement('script')
    legacyScript.type = 'application/ld+json'
    legacyScript.textContent = '{"stale":true}'
    document.head.append(legacyScript)

    render(
      <RouteSeo
        entry={getProductSeo('/oblik-avtozapchastyn')!}
        faq={getUseCasePage('/oblik-avtozapchastyn').faq}
      />,
    )

    const scripts = document.head.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    const routeScript = document.head.querySelector(
      'script[type="application/ld+json"][data-product-json-ld]',
    )

    expect(scripts).toHaveLength(1)
    expect(routeScript).toBe(legacyScript)
    expect(routeScript).toHaveTextContent(
      'https://rozbirka.pro/oblik-avtozapchastyn',
    )
    expect(routeScript).not.toHaveTextContent('{"stale":true}')
  })
})
