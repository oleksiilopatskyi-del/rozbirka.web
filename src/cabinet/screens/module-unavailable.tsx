import type { CabinetModuleDefinition } from '../module-registry'

export function ModuleUnavailableScreen({
  definition,
}: {
  definition: CabinetModuleDefinition
}) {
  return (
    <section
      className="grid min-h-[50dvh] place-items-center px-6 py-12 text-center"
      role="status"
    >
      <div className="grid max-w-md gap-3">
        <h1 className="text-2xl font-medium text-white">
          Модуль готується до запуску
        </h1>
        <p className="text-sm leading-6 text-neutral-400">
          {definition.navigation?.label ?? definition.key} поки недоступний у
          кабінеті.
        </p>
      </div>
    </section>
  )
}
