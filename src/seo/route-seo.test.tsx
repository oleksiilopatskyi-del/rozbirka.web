import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { homepageFaqEntries } from '@/components/site/faq'
import { getProductSeo } from './product-seo'
import { RouteSeo } from './route-seo'

describe('RouteSeo', () => {
  beforeEach(() => {
    document.head
      .querySelectorAll(
        'script[data-product-json-ld], script[data-test-unrelated-json-ld]',
      )
      .forEach((script) => script.remove())
  })

  it('synchronizes homepage metadata and structured data into the browser head', () => {
    render(<RouteSeo entry={getProductSeo('/')!} faq={homepageFaqEntries} />)

    expect(document.title).toBe(
      'Програма для авторозбірки — облік запчастин і продажів | rozbirka',
    )
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://rozbirka.pro/',
    )
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('програма для авторозбірки'),
    )
    expect(
      document.querySelector('script[data-product-json-ld]'),
    ).not.toBeNull()
  })

  it('updates existing head nodes instead of appending duplicates', () => {
    const entry = getProductSeo('/')!
    const faq = homepageFaqEntries
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

  it('upserts only the tagged route graph and preserves unrelated JSON-LD', () => {
    const unrelatedScript = document.createElement('script')
    unrelatedScript.type = 'application/ld+json'
    unrelatedScript.setAttribute('data-test-unrelated-json-ld', '')
    unrelatedScript.textContent = '{"unrelated":true}'
    document.head.append(unrelatedScript)

    render(<RouteSeo entry={getProductSeo('/')!} faq={homepageFaqEntries} />)

    const scripts = document.head.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    const routeScript = document.head.querySelector(
      'script[type="application/ld+json"][data-product-json-ld]',
    )

    expect(scripts).toHaveLength(2)
    expect(routeScript).not.toBe(unrelatedScript)
    expect(routeScript).toHaveTextContent('https://rozbirka.pro/')
    expect(unrelatedScript).toHaveTextContent('{"unrelated":true}')
    expect(unrelatedScript).not.toHaveAttribute('data-product-json-ld')
  })
})
