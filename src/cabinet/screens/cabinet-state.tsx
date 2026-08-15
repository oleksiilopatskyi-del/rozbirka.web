import type { CabinetModuleDefinition } from '../module-registry'

export function CabinetModuleScreen({
  definition,
}: {
  definition: CabinetModuleDefinition
}) {
  return (
    <section className="px-6 py-8">
      <h1 className="text-2xl font-medium text-white">
        {definition.navigation?.label ?? definition.key}
      </h1>
    </section>
  )
}
