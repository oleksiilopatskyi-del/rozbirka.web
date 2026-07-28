import { Link } from 'react-router'
import { PageContainer } from '@/components/layout/page-container'
import { Section } from '@/components/layout/section'

const useCases = [
  {
    heading: 'Облік автозапчастин на складі',
    body: 'Створюйте картки деталей і зберігайте їхній зв’язок з авто або партією. Швидко знаходьте потрібну запчастину та бачте її актуальний статус.',
    label: 'Облік автозапчастин',
    path: '/oblik-avtozapchastyn',
  },
  {
    heading: 'Облік продажів і замовлень',
    body: 'Збирайте замовлення, зберігайте історію клієнтів і контролюйте оплати. Каси та рух коштів залишаються в одному робочому процесі.',
    label: 'Облік продажів автозапчастин',
    path: '/oblik-prodazhiv-avtozapchastyn',
  },
] as const

export function UseCaseLinks() {
  return (
    <Section aria-labelledby="use-cases-heading" className="py-16 lg:py-24">
      <PageContainer>
        <div className="bg-surface-1 rounded-(--radius-section) p-8 ring-1 ring-white/[0.04] lg:p-14">
          <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
            Робочі процеси
          </span>
          <h2
            id="use-cases-heading"
            className="mt-6 max-w-2xl text-[44px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[72px]"
          >
            Усе для щоденної роботи авторозбірки
          </h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {useCases.map((useCase) => (
              <article
                key={useCase.path}
                className="rounded-(--radius-card) bg-black/20 p-6 ring-1 ring-white/[0.06] lg:p-8"
              >
                <h3 className="text-2xl font-medium tracking-[-0.02em]">
                  {useCase.heading}
                </h3>
                <p className="mt-4 max-w-lg leading-relaxed text-neutral-400">
                  {useCase.body}
                </p>
                <Link
                  to={useCase.path}
                  className="text-brand mt-6 inline-flex min-h-11 items-center text-base font-medium hover:opacity-80"
                >
                  {useCase.label}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </PageContainer>
    </Section>
  )
}
