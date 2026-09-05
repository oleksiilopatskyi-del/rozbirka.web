import { PageBody, PageHeader } from '@/components/app'
import type { CabinetModuleDefinition } from '../module-registry'

export function CabinetModuleScreen({
  definition,
}: {
  definition: CabinetModuleDefinition
}) {
  return (
    <PageBody>
      <PageHeader title={definition.navigation?.label ?? definition.key} />
    </PageBody>
  )
}
