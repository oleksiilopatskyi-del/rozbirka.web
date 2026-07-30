export type ProductSeoPath = '/'

export interface SeoBaseline {
  status: 'pending-external-tools'
  volume: null
  difficulty: null
  impressions: null
  clicks: null
  ctr: null
  position: null
}

export interface ProductSeoEntry {
  path: ProductSeoPath
  canonical: string
  title: string
  description: string
  primaryQuery: string
  supportingQueries: readonly string[]
  intent: 'commercial-category'
  ogImage: 'https://rozbirka.pro/og-cover.webp'
  faqSchema: boolean
  indexable: true
  includeInSitemap: true
  baseline: SeoBaseline
}

const pendingBaseline: SeoBaseline = {
  status: 'pending-external-tools',
  volume: null,
  difficulty: null,
  impressions: null,
  clicks: null,
  ctr: null,
  position: null,
}

export const productSeoEntries: readonly ProductSeoEntry[] = [
  {
    path: '/',
    canonical: 'https://rozbirka.pro/',
    title: 'Програма для авторозбірки — облік запчастин і продажів | rozbirka',
    description:
      'rozbirka — програма для авторозбірки: облік авто й запчастин, склад, замовлення, каси, клієнти, QR-стікери та робота команди.',
    primaryQuery: 'програма для авторозбірки',
    supportingQueries: ['CRM для авторозбірки', 'програма для розборки авто'],
    intent: 'commercial-category',
    ogImage: 'https://rozbirka.pro/og-cover.webp',
    faqSchema: true,
    indexable: true,
    includeInSitemap: true,
    baseline: pendingBaseline,
  },
]

export const productSeoPaths = productSeoEntries.map((entry) => entry.path)

export function getProductSeo(pathname: string): ProductSeoEntry | undefined {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname
  return productSeoEntries.find((entry) => entry.path === normalized)
}
