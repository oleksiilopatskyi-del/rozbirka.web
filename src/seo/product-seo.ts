export type ProductSeoPath =
  | '/'
  | '/oblik-avtozapchastyn'
  | '/oblik-prodazhiv-avtozapchastyn'

export interface SeoBaseline {
  status: 'pending-external-tools'
  volume: null
  difficulty: null
  impressions: null
  clicks: null
  ctr: null
  position: null
}

export interface SeoBreadcrumb {
  name: string
  path: ProductSeoPath
}

export interface ProductSeoEntry {
  path: ProductSeoPath
  canonical: string
  title: string
  description: string
  primaryQuery: string
  supportingQueries: readonly string[]
  intent: 'commercial-category' | 'commercial-use-case'
  ogImage: 'https://rozbirka.pro/og-cover.webp'
  breadcrumbs: readonly SeoBreadcrumb[]
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
    breadcrumbs: [],
    faqSchema: true,
    indexable: true,
    includeInSitemap: true,
    baseline: pendingBaseline,
  },
  {
    path: '/oblik-avtozapchastyn',
    canonical: 'https://rozbirka.pro/oblik-avtozapchastyn',
    title: 'Облік автозапчастин для авторозбірки | rozbirka',
    description:
      'Ведіть складський облік автозапчастин: картки деталей, фото, місця зберігання, залишки, резерви, пошук і QR-стікери в rozbirka.',
    primaryQuery: 'облік автозапчастин',
    supportingQueries: [
      'програма для складу автозапчастин',
      'складський облік автозапчастин',
    ],
    intent: 'commercial-use-case',
    ogImage: 'https://rozbirka.pro/og-cover.webp',
    breadcrumbs: [
      { name: 'Головна', path: '/' },
      { name: 'Облік автозапчастин', path: '/oblik-avtozapchastyn' },
    ],
    faqSchema: true,
    indexable: true,
    includeInSitemap: true,
    baseline: pendingBaseline,
  },
  {
    path: '/oblik-prodazhiv-avtozapchastyn',
    canonical: 'https://rozbirka.pro/oblik-prodazhiv-avtozapchastyn',
    title: 'Облік продажів автозапчастин і замовлень | rozbirka',
    description:
      'Керуйте продажами автозапчастин: замовленнями, клієнтами, оплатами, касами та звітами в одному мобільному застосунку rozbirka.',
    primaryQuery: 'облік продажів автозапчастин',
    supportingQueries: [
      'програма для магазину автозапчастин',
      'облік замовлень автозапчастин',
    ],
    intent: 'commercial-use-case',
    ogImage: 'https://rozbirka.pro/og-cover.webp',
    breadcrumbs: [
      { name: 'Головна', path: '/' },
      {
        name: 'Облік продажів автозапчастин',
        path: '/oblik-prodazhiv-avtozapchastyn',
      },
    ],
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
