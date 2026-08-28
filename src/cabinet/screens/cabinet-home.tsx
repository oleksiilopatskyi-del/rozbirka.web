import { useCabinet } from '../CabinetContext'

export function CabinetHomeScreen() {
  const { targetTenant } = useCabinet()
  const tenantName = targetTenant?.name ?? 'вашій розбірці'

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8">
      <header className="grid gap-2">
        <p className="text-brand text-xs font-medium tracking-[0.18em] uppercase">
          Кабінет
        </p>
        <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
          Вітаємо в {tenantName}
        </h1>
        <p className="text-sm text-neutral-400">Ваш робочий простір готовий.</p>
      </header>
      <div className="bg-surface-1 min-w-0 rounded-3xl border border-white/[0.06] p-5 sm:p-6">
        <h2 className="text-base font-medium text-white">Почніть роботу</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
          Доступні для вашої ролі розділи зібрані в навігації кабінету.
        </p>
      </div>
    </section>
  )
}
