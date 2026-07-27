import { MarketplaceScreen } from '@/features/marketplace/marketplace-screen'
import { MarketplaceLayout } from './marketplace-layout'

export function MarketplaceApp() {
  return (
    <MarketplaceLayout>
      <MarketplaceScreen />
    </MarketplaceLayout>
  )
}
