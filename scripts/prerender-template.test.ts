// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { productSeoEntries } from '../src/seo/product-seo'

describe('product prerender template', () => {
  it('marks every replaceable product SEO node with stable selectors', async () => {
    const html = await readFile(resolve('index.html'), 'utf8')

    expect(html).toContain('<title data-product-seo>')
    expect(html).toContain(productSeoEntries[0].title)
    expect(html).toContain(`content="${productSeoEntries[0].description}"`)
    expect(html.match(/data-product-seo/g)).toHaveLength(12)
    expect(html).toContain('data-product-seo data-product-json-ld')
  })
})
