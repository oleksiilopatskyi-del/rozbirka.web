import { Link } from 'react-router'
import { Button, Panel } from '@/components/app'
import type { ApiProblem } from '@/api/contracts'

interface ErrorGuidance {
  title: string
  message: string
}

const BILLING_GUIDANCE: ErrorGuidance = {
  title: 'Підписка потребує уваги',
  message: 'Перевірте стан підписки в налаштуваннях білінгу.',
}
const QUOTA_GUIDANCE: ErrorGuidance = {
  title: 'Ліміт вичерпано',
  message: 'Змініть тариф або звільніть місце, щоб продовжити.',
}
const FEATURE_GUIDANCE: ErrorGuidance = {
  title: 'Функція недоступна на вашому тарифі',
  message: 'Оберіть інший тариф, щоб отримати доступ.',
}

export function DashboardErrorState({
  ariaLabel,
  billingPath,
  genericMessage,
  problem,
  retry,
}: {
  ariaLabel: string
  billingPath: string | null
  genericMessage: string
  problem: ApiProblem
  retry: () => Promise<void>
}) {
  const guidance = dashboardErrorGuidance(problem)

  return (
    <Panel aria-label={ariaLabel} role="alert">
      {guidance === null ? (
        <p className="text-app-muted text-sm">{genericMessage}</p>
      ) : (
        <>
          <h2 className="text-sm font-medium text-white">{guidance.title}</h2>
          <p className="text-app-muted mt-1 text-sm">{guidance.message}</p>
          {billingPath === null ? null : (
            <Button asChild className="mt-3" variant="primary">
              <Link to={billingPath}>Перейти до підписки</Link>
            </Button>
          )}
        </>
      )}
      <div className="mt-3">
        <Button onClick={() => void retry()}>Спробувати ще раз</Button>
      </div>
    </Panel>
  )
}

function dashboardErrorGuidance(problem: ApiProblem): ErrorGuidance | null {
  const code = problem.code
  if (code === 'QUOTA_EXCEEDED') return QUOTA_GUIDANCE
  if (code === 'FEATURE_NOT_AVAILABLE') return FEATURE_GUIDANCE
  if (problem.status === 402) return BILLING_GUIDANCE
  return null
}
