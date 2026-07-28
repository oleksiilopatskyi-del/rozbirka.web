export interface ProductDocumentSeo {
  path: string
  title: string
  description: string
  canonical: string
  ogImage: string
}

export function documentPathForRoute(pathname: string): string

export function injectProductDocument(input: {
  template: string
  renderedBody: string
  seo: ProductDocumentSeo
  structuredDataJson: string
}): string

export function assertProductDocument(input: {
  html: string
  seo: ProductDocumentSeo
  expectedH1: string
}): void
