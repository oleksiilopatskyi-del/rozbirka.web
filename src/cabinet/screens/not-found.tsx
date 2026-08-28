import { Link } from 'react-router'
import { cabinetPath } from '../cabinet-paths'
import { useCabinet } from '../CabinetContext'

export function CabinetNotFoundScreen() {
  const { targetTenant } = useCabinet()

  return (
    <section
      className="grid min-h-[50dvh] place-items-center px-6 py-12 text-center"
      role="alert"
    >
      <div className="grid max-w-md justify-items-center gap-4">
        <h1 className="text-2xl font-medium text-white">
          Сторінку не знайдено
        </h1>
        <p className="text-sm leading-6 text-neutral-400">
          Перевірте адресу або поверніться на головну сторінку кабінету.
        </p>
        {targetTenant !== null && (
          <Link
            className="bg-brand text-brand-foreground rounded-full px-5 py-3 text-sm"
            to={cabinetPath(targetTenant.slug, 'dashboard')}
          >
            До головної
          </Link>
        )}
      </div>
    </section>
  )
}
