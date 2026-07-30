import { describe, expect, it } from 'vitest'
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

  it('escapes script-terminating characters during serialization', () => {
    expect(serializeStructuredData({ value: '</script>' })).toContain(
      '\\u003c/script>',
    )
  })
})
