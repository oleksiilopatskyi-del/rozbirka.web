import { useEffect } from 'react'
import type { ProductSeoEntry } from './product-seo'
import { buildStructuredData, serializeStructuredData } from './structured-data'

interface FaqEntry {
  question: string
  answer: string
}

interface RouteSeoProps {
  entry: ProductSeoEntry
  faq: readonly FaqEntry[]
}

function upsertHeadElement<T extends HTMLElement>(
  selector: string,
  create: () => T,
): T {
  const existing = document.head.querySelector<T>(selector)
  if (existing) return existing

  const element = create()
  document.head.append(element)
  return element
}

function setMeta(
  attribute: 'name' | 'property',
  value: string,
  content: string,
) {
  const meta = upsertHeadElement(`meta[${attribute}="${value}"]`, () => {
    const element = document.createElement('meta')
    element.setAttribute(attribute, value)
    return element
  })
  meta.content = content
}

function syncHead(entry: ProductSeoEntry, faq: readonly FaqEntry[]) {
  const title = upsertHeadElement('title', () =>
    document.createElement('title'),
  )
  title.textContent = entry.title

  setMeta('name', 'description', entry.description)

  const canonical = upsertHeadElement('link[rel="canonical"]', () => {
    const link = document.createElement('link')
    link.rel = 'canonical'
    return link
  })
  canonical.href = entry.canonical

  setMeta('property', 'og:title', entry.title)
  setMeta('property', 'og:description', entry.description)
  setMeta('property', 'og:url', entry.canonical)
  setMeta('property', 'og:image', entry.ogImage)
  setMeta('name', 'twitter:card', 'summary_large_image')
  setMeta('name', 'twitter:title', entry.title)
  setMeta('name', 'twitter:description', entry.description)
  setMeta('name', 'twitter:image', entry.ogImage)

  const jsonLdScripts = Array.from(
    document.head.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  )
  const script =
    jsonLdScripts.find((item) => item.hasAttribute('data-product-json-ld')) ??
    jsonLdScripts[0] ??
    upsertHeadElement(
      'script[type="application/ld+json"][data-product-json-ld]',
      () => {
        const element = document.createElement('script')
        element.type = 'application/ld+json'
        element.setAttribute('data-product-json-ld', '')
        return element
      },
    )

  script.type = 'application/ld+json'
  script.setAttribute('data-product-json-ld', '')
  script.textContent = serializeStructuredData(buildStructuredData(entry, faq))

  for (const candidate of jsonLdScripts) {
    if (candidate !== script) candidate.remove()
  }
}

export function RouteSeo({ entry, faq }: RouteSeoProps) {
  useEffect(() => {
    syncHead(entry, faq)
  }, [entry, faq])

  return null
}
