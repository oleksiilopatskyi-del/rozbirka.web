// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  assertProductDocument,
  documentPathForRoute,
  injectProductDocument,
} from './prerender-helpers.mjs'

const seo = {
  path: '/oblik-avtozapchastyn',
  title: 'Облік & "запчастин" <rozbirka>',
  description: 'Склад & "резерви" <деталей>',
  canonical: 'https://rozbirka.pro/oblik-avtozapchastyn?ref=a&b=c',
  ogImage: 'https://rozbirka.pro/og-cover.webp',
  breadcrumbs: [
    { name: 'Головна', path: '/' },
    { name: 'Облік автозапчастин', path: '/oblik-avtozapchastyn' },
  ],
}

const structuredDataJson = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${seo.canonical}#webpage`,
      url: seo.canonical,
      name: seo.title,
      description: seo.description,
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${seo.canonical}#breadcrumbs`,
      itemListElement: seo.breadcrumbs.map((breadcrumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: breadcrumb.name,
        item: `https://rozbirka.pro${breadcrumb.path}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${seo.canonical}#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Чи є запчастини на складі?',
          acceptedAnswer: { '@type': 'Answer', text: 'Так.' },
        },
      ],
    },
  ],
})

const template = `<!doctype html>
<html><head>
<title data-product-seo>Base title</title>
<meta data-product-seo name="description" content="Base description" />
<link data-product-seo rel="canonical" href="https://rozbirka.pro/" />
<meta data-product-seo property="og:title" content="Base title" />
<meta data-product-seo property="og:description" content="Base description" />
<meta data-product-seo property="og:url" content="https://rozbirka.pro/" />
<meta data-product-seo property="og:image" content="https://rozbirka.pro/base.webp" />
<meta data-product-seo name="twitter:card" content="summary" />
<meta data-product-seo name="twitter:title" content="Base title" />
<meta data-product-seo name="twitter:description" content="Base description" />
<meta data-product-seo name="twitter:image" content="https://rozbirka.pro/base.webp" />
<script data-product-seo data-product-json-ld type="application/ld+json">{}</script>
</head><body><div id="root"></div></body></html>`

describe('documentPathForRoute', () => {
  it('maps the homepage to the root document', () => {
    expect(documentPathForRoute('/')).toBe('dist/index.html')
  })

  it('maps a product route to its nested document', () => {
    expect(documentPathForRoute('/oblik-avtozapchastyn')).toBe(
      'dist/oblik-avtozapchastyn/index.html',
    )
  })

  it('strips leading and trailing route slashes', () => {
    expect(documentPathForRoute('/oblik-avtozapchastyn/')).toBe(
      'dist/oblik-avtozapchastyn/index.html',
    )
  })
})

describe('injectProductDocument', () => {
  it('replaces marked metadata, JSON-LD, and the empty root', () => {
    const html = injectProductDocument({
      template,
      renderedBody: '<main><h1>Облік запчастин</h1></main>',
      seo,
      structuredDataJson,
    })

    expect(html).toContain(
      '<title data-product-seo>Облік &amp; "запчастин" &lt;rozbirka&gt;</title>',
    )
    expect(html).toContain(
      'name="description" content="Склад &amp; &quot;резерви&quot; &lt;деталей&gt;"',
    )
    expect(html).toContain(
      'rel="canonical" href="https://rozbirka.pro/oblik-avtozapchastyn?ref=a&amp;b=c"',
    )
    expect(html).toContain(
      'property="og:title" content="Облік &amp; &quot;запчастин&quot; &lt;rozbirka&gt;"',
    )
    expect(html).toContain(
      'property="og:url" content="https://rozbirka.pro/oblik-avtozapchastyn?ref=a&amp;b=c"',
    )
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain(
      `<script data-product-seo data-product-json-ld type="application/ld+json">${structuredDataJson}</script>`,
    )
    expect(html).toContain(
      '<div id="root"><main><h1>Облік запчастин</h1></main></div>',
    )
  })

  it('replaces marked metadata when the template is Prettier-formatted', () => {
    const formattedTemplate = template.replaceAll(
      '<meta data-product-seo ',
      '<meta\n  data-product-seo\n  ',
    )

    const html = injectProductDocument({
      template: formattedTemplate,
      renderedBody: '<main><h1>Облік запчастин</h1></main>',
      seo,
      structuredDataJson,
    })

    expect(html).toContain(
      'name="description" content="Склад &amp; &quot;резерви&quot; &lt;деталей&gt;"',
    )
  })
})

describe('assertProductDocument', () => {
  const validHtml = injectProductDocument({
    template,
    renderedBody: '<main><h1>Облік запчастин</h1></main>',
    seo,
    structuredDataJson,
  })

  it('accepts a complete product document', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml,
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).not.toThrow()
  })

  it('reports no H1 elements descriptively', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace('<h1>Облік запчастин</h1>', ''),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} must contain exactly one H1; found 0`)
  })

  it('reports two H1 elements descriptively', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace('</main>', '<h1>Ще один заголовок</h1></main>'),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} must contain exactly one H1; found 2`)
  })

  it('reports a missing canonical descriptively', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace('rel="canonical"', 'rel="alternate"'),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} must contain exactly one canonical; found 0`)
  })

  it('reports an empty root descriptively', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(
          '<div id="root"><main><h1>Облік запчастин</h1></main></div>',
          '<h1>Облік запчастин</h1><div id="root"></div>',
        ),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} has an empty prerender root`)
  })

  it('rejects a unique but incorrect title', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(
          'Облік &amp; "запчастин" &lt;rozbirka&gt;',
          'Інший унікальний title',
        ),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} title does not match manifest`)
  })

  it('rejects a unique but incorrect description', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(
          'Склад &amp; &quot;резерви&quot; &lt;деталей&gt;',
          'Інший унікальний description',
        ),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} description does not match manifest`)
  })

  it.each([
    [
      'OG title',
      'property="og:title" content="Облік &amp; &quot;запчастин&quot; &lt;rozbirka&gt;"',
      'property="og:title" content="Застарілий OG title"',
    ],
    [
      'Twitter image',
      'name="twitter:image" content="https://rozbirka.pro/og-cover.webp"',
      'name="twitter:image" content="https://rozbirka.pro/stale.webp"',
    ],
  ])('rejects a stale %s field', (_label, current, stale) => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(current, stale),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} ${_label} does not match manifest`)
  })

  it('rejects malformed JSON-LD', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(structuredDataJson, '{invalid'),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} has invalid product JSON-LD`)
  })

  it('rejects an empty JSON-LD graph', () => {
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(structuredDataJson, '{}'),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} JSON-LD must use the Schema.org context`)
  })

  it('rejects duplicate required metadata nodes', () => {
    const canonical = `<link data-product-seo rel="canonical" href="${seo.canonical.replaceAll('&', '&amp;')}" />`
    const unmarkedDuplicate = canonical.replace(' data-product-seo', '')
    expect(() =>
      assertProductDocument({
        html: validHtml.replace(canonical, `${canonical}${unmarkedDuplicate}`),
        seo,
        expectedH1: 'Облік запчастин',
      }),
    ).toThrow(`${seo.path} must contain exactly one canonical; found 2`)
  })
})
