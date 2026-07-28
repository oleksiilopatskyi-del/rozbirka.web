import type { ProductSeoEntry } from './product-seo'

interface FaqEntry {
  question: string
  answer: string
}

const origin = 'https://rozbirka.pro'

function buildFaqPage(canonical: string, faq: readonly FaqEntry[]) {
  return {
    '@type': 'FAQPage',
    '@id': `${canonical}#faq`,
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  }
}

export function buildStructuredData(
  entry: ProductSeoEntry,
  faq: readonly FaqEntry[],
): Record<string, unknown> {
  const faqPage = buildFaqPage(entry.canonical, faq)

  if (entry.path === '/') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${origin}/#organization`,
          name: 'rozbirka',
          url: `${origin}/`,
        },
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          name: 'rozbirka',
          url: `${origin}/`,
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${origin}/#software`,
          name: 'rozbirka',
          url: entry.canonical,
          description: entry.description,
        },
        faqPage,
      ],
    }
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${entry.canonical}#webpage`,
        url: entry.canonical,
        name: entry.title,
        description: entry.description,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${entry.canonical}#breadcrumbs`,
        itemListElement: entry.breadcrumbs.map((breadcrumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: breadcrumb.name,
          item: `${origin}${breadcrumb.path}`,
        })),
      },
      faqPage,
    ],
  }
}

export function serializeStructuredData(
  value: Record<string, unknown>,
): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
