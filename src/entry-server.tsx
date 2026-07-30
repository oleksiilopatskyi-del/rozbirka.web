import { renderToString } from 'react-dom/server'
import { MemoryRouter, useRoutes } from 'react-router'
import { AuthProvider } from '@/auth/AuthContext'
import { homepageFaqEntries } from '@/components/site/faq'
import { getProductSeo, productSeoEntries } from '@/seo/product-seo'
import { buildStructuredData } from '@/seo/structured-data'
import { serializeStructuredData } from '@/seo/structured-data'
import { createAppRoutes } from '@/routes/routes'

// eslint-disable-next-line react-refresh/only-export-components -- SSR entry intentionally exports render helpers alongside its internal route component.
function ServerRoutes() {
  return useRoutes(createAppRoutes(false))
}

export function renderRoute(pathname: string): string {
  return renderToString(
    <AuthProvider>
      <MemoryRouter initialEntries={[pathname]}>
        <ServerRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

export const prerenderManifest = productSeoEntries

export { serializeStructuredData }

export function expectedH1ForRoute(pathname: string): string {
  const seo = getProductSeo(pathname)
  if (!seo) throw new Error(`Missing product SEO for ${pathname}`)
  return 'Знаєш де кожна деталь і де твої гроші'
}

export function structuredDataForRoute(pathname: string) {
  const seo = getProductSeo(pathname)
  if (!seo) throw new Error(`Missing product SEO for ${pathname}`)
  return buildStructuredData(seo, homepageFaqEntries)
}
