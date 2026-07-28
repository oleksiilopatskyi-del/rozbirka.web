import { UseCasePage } from '@/components/seo/use-case-page'
import { getUseCasePage } from '@/content/use-case-pages'
import { getProductSeo } from '@/seo/product-seo'

const path = '/oblik-avtozapchastyn' as const

export function PartsInventoryScreen() {
  const seo = getProductSeo(path)
  if (!seo) throw new Error(`Missing product SEO record for ${path}`)

  return (
    <UseCasePage content={getUseCasePage(path)} breadcrumbs={seo.breadcrumbs} />
  )
}
