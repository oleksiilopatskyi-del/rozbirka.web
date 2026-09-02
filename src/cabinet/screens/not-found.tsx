import { Link } from 'react-router'
import { Compass } from 'lucide-react'
import { Button, StateScreen } from '@/components/app'
import { cabinetPath } from '../cabinet-paths'
import { useCabinet } from '../CabinetContext'

export function CabinetNotFoundScreen() {
  const { targetTenant } = useCabinet()

  return (
    <StateScreen
      actions={
        targetTenant === null ? undefined : (
          <Button asChild variant="primary">
            <Link to={cabinetPath(targetTenant.slug, 'dashboard')}>
              До головної
            </Link>
          </Button>
        )
      }
      className="min-h-[50dvh] content-center"
      description="Перевірте адресу або поверніться на головну сторінку кабінету."
      icon={<Compass aria-hidden />}
      role="alert"
      title="Сторінку не знайдено"
    />
  )
}
