import { Link } from 'react-router'
import { PageContainer } from '@/components/layout/page-container'
import { Section } from '@/components/layout/section'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/header'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import type { UseCasePageContent } from '@/content/use-case-pages'
import { getProductSeo, type SeoBreadcrumb } from '@/seo/product-seo'
import { RouteSeo } from '@/seo/route-seo'

interface UseCasePageProps {
  content: UseCasePageContent
  breadcrumbs: readonly SeoBreadcrumb[]
}

const cardClassName =
  'bg-surface-1 rounded-(--radius-card) p-6 ring-1 ring-white/[0.06] lg:p-8'

export function UseCasePage({ content, breadcrumbs }: UseCasePageProps) {
  const entry = getProductSeo(content.path)

  if (!entry) {
    throw new Error(`Missing SEO metadata for ${content.path}`)
  }

  return (
    <div className="bg-background min-h-screen text-white">
      <RouteSeo entry={entry} faq={content.faq} />
      <SiteHeader />
      <main id="main">
        <Section className="pt-10 pb-16 lg:pt-16 lg:pb-24">
          <PageContainer width="md">
            <div className="flex max-w-4xl flex-col items-start gap-7">
              <Breadcrumbs items={breadcrumbs} />
              <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
                {content.eyebrow}
              </span>
              <h1 className="text-[44px] leading-[0.98] font-light tracking-[-0.03em] lg:text-[72px]">
                {content.h1}
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-neutral-300 lg:text-lg">
                {content.intro}
              </p>
              <Link
                to="/login"
                className="bg-brand text-brand-foreground inline-flex min-h-11 items-center rounded-full px-6 text-sm font-medium transition-opacity hover:opacity-85"
              >
                Спробувати rozbirka
              </Link>
            </div>
          </PageContainer>
        </Section>

        <ContentCards
          heading="Що змінюється в щоденній роботі"
          id="outcomes-heading"
          items={content.outcomes}
          columns="lg:grid-cols-3"
        />
        <ContentCards
          heading="Можливості для цього процесу"
          id="capabilities-heading"
          items={content.capabilities}
          columns="lg:grid-cols-2"
        />

        <Section aria-labelledby="workflow-heading" className="py-16 lg:py-24">
          <PageContainer width="md">
            <h2
              id="workflow-heading"
              className="text-[36px] leading-none font-light tracking-[-0.025em] lg:text-[52px]"
            >
              Як почати
            </h2>
            <ol className="mt-10 grid gap-4 lg:grid-cols-3">
              {content.workflow.map((item, index) => (
                <li key={item.title} className={cardClassName}>
                  <span className="text-brand text-sm font-medium">
                    0{index + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-medium">{item.title}</h3>
                  <p className="mt-3 leading-relaxed text-neutral-400">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </PageContainer>
        </Section>

        <Section aria-labelledby="faq-heading" className="py-16 lg:py-24">
          <PageContainer width="md">
            <h2
              id="faq-heading"
              className="text-[36px] leading-none font-light tracking-[-0.025em] lg:text-[52px]"
            >
              Поширені питання
            </h2>
            <dl className="mt-10 grid gap-4">
              {content.faq.map((item) => (
                <div key={item.question} className={cardClassName}>
                  <dt className="text-xl font-medium">{item.question}</dt>
                  <dd className="mt-3 leading-relaxed text-neutral-400">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </PageContainer>
        </Section>

        <Section aria-labelledby="related-heading" className="py-16 lg:py-24">
          <PageContainer width="md">
            <div className="bg-surface-1 rounded-(--radius-section) max-w-3xl p-8 ring-1 ring-white/[0.06] lg:p-12">
              <h2
                id="related-heading"
                className="text-[36px] leading-none font-light tracking-[-0.025em] lg:text-[52px]"
              >
                Пов’язаний процес
              </h2>
              <p className="mt-6 max-w-2xl leading-relaxed text-neutral-400">
                {content.related.body}
              </p>
              <Link
                to={content.related.path}
                className="text-brand mt-6 inline-flex min-h-11 items-center text-base font-medium hover:opacity-80"
              >
                {content.related.label}
              </Link>
            </div>
          </PageContainer>
        </Section>
      </main>
      <SiteFooter />
    </div>
  )
}

function ContentCards({
  heading,
  id,
  items,
  columns,
}: {
  heading: string
  id: string
  items: readonly { title: string; body: string }[]
  columns: string
}) {
  return (
    <Section aria-labelledby={id} className="py-16 lg:py-24">
      <PageContainer width="md">
        <h2
          id={id}
          className="text-[36px] leading-none font-light tracking-[-0.025em] lg:text-[52px]"
        >
          {heading}
        </h2>
        <ul role="list" className={`mt-10 grid gap-4 ${columns}`}>
          {items.map((item) => (
            <li key={item.title} className={cardClassName}>
              <h3 className="text-xl font-medium">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-neutral-400">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </PageContainer>
    </Section>
  )
}
