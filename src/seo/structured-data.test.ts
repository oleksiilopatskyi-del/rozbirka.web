import { describe, expect, it } from 'vitest'
import { getUseCasePage } from '@/content/use-case-pages'
import { homepageFaqEntries } from '@/components/site/faq'
import { getProductSeo } from './product-seo'
import { buildStructuredData, serializeStructuredData } from './structured-data'

function occurrences(value: string, text: string): number {
  return value.split(text).length - 1
}

describe('structured data', () => {
  it('builds the required homepage graph from the visible FAQ copy', () => {
    const homeGraph = buildStructuredData(
      getProductSeo('/')!,
      homepageFaqEntries,
    )

    expect(JSON.stringify(homeGraph)).toContain('"@type":"Organization"')
    expect(JSON.stringify(homeGraph)).toContain('"@type":"WebSite"')
    expect(JSON.stringify(homeGraph)).toContain('"@type":"SoftwareApplication"')

    const serialized = serializeStructuredData(homeGraph)
    for (const entry of homepageFaqEntries) {
      expect(occurrences(serialized, entry.question)).toBe(1)
      expect(occurrences(serialized, entry.answer)).toBe(1)
    }
  })

  it('builds the required inventory graph from the visible FAQ copy', () => {
    const inventoryPage = getUseCasePage('/oblik-avtozapchastyn')
    const inventoryGraph = buildStructuredData(
      getProductSeo('/oblik-avtozapchastyn')!,
      inventoryPage.faq,
    )

    expect(JSON.stringify(inventoryGraph)).toContain('"@type":"WebPage"')
    expect(JSON.stringify(inventoryGraph)).toContain('"@type":"BreadcrumbList"')
    expect(JSON.stringify(inventoryGraph)).toContain('"@type":"FAQPage"')

    const serialized = serializeStructuredData(inventoryGraph)
    for (const entry of inventoryPage.faq) {
      expect(occurrences(serialized, entry.question)).toBe(1)
      expect(occurrences(serialized, entry.answer)).toBe(1)
    }
  })

  it('escapes script-terminating characters during serialization', () => {
    expect(serializeStructuredData({ value: '</script>' })).toContain(
      '\\u003c/script>',
    )
  })
})
