import type { CabinetModuleDefinition } from '../module-registry'
import { PaymentsScreen } from '../billing/payments-screen'
import { PlansScreen } from '../billing/plans-screen'
import { SubscriptionScreen } from '../billing/subscription-screen'

export function CabinetModuleScreen({
  definition,
}: {
  definition: CabinetModuleDefinition
}) {
  if (definition.key === 'billing') return <SubscriptionScreen />
  if (definition.key === 'plans') return <PlansScreen />
  if (definition.key === 'payments') return <PaymentsScreen />

  return (
    <section className="px-6 py-8">
      <h1 className="text-2xl font-medium text-white">
        {definition.navigation?.label ?? definition.key}
      </h1>
    </section>
  )
}
