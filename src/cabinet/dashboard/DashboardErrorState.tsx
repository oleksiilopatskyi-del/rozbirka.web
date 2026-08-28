import { Link } from 'react-router'
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
    <section
      aria-label={ariaLabel}
      className="rounded-2xl border border-white/[0.06] p-4"
      role="alert"
    >
      {guidance === null ? (
        <p className="text-sm text-neutral-400">{genericMessage}</p>
      ) : (
        <>
          <h2 className="text-sm font-medium text-white">{guidance.title}</h2>
          <p className="mt-1 text-sm text-neutral-400">{guidance.message}</p>
          {billingPath === null ? null : (
            <Link
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/[0.12] px-4 text-sm text-white"
              to={billingPath}
            >
              Перейти до підписки
            </Link>
          )}
        </>
      )}
      <button
        className="mt-3 min-h-11 rounded-full border border-white/[0.12] px-4 text-white"
        onClick={() => void retry()}
        type="button"
      >
        Спробувати ще раз
      </button>
    </section>
  )
}

function dashboardErrorGuidance(problem: ApiProblem): ErrorGuidance | null {
  const code = problem.code
  if (code === 'QUOTA_EXCEEDED') return QUOTA_GUIDANCE
  if (code === 'FEATURE_NOT_AVAILABLE') return FEATURE_GUIDANCE
  if (problem.status === 402) return BILLING_GUIDANCE
  return null
}
