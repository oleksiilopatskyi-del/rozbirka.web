import { Link } from 'react-router'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'
import hero720Avif from '@/assets/optimized/hero/hero-720.avif'
import hero1080Avif from '@/assets/optimized/hero/hero-1080.avif'
import hero720Webp from '@/assets/optimized/hero/hero-720.webp'
import hero1080Webp from '@/assets/optimized/hero/hero-1080.webp'

interface HeroLine {
  text: string
  className?: string
  delay?: string
  visibleFromStart?: boolean
}

const heroLines: HeroLine[] = [
  { text: 'Знаєш', visibleFromStart: true },
  { text: 'де кожна', delay: '100ms' },
  { text: 'деталь і де', delay: '200ms' },
  { text: 'твої гроші', className: 'text-brand', delay: '300ms' },
]

function AnimatedHeading({ lines }: { lines: HeroLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <span
          key={line.text}
          className={`${line.visibleFromStart ? 'anim-fade-up-visible' : 'anim-fade-up'} block min-h-[1em] ${line.className ?? ''}`}
          style={line.delay ? { animationDelay: line.delay } : undefined}
        >
          {line.text}
        </span>
      ))}
    </>
  )
}

export function Hero() {
  return (
    <Section
      id="top"
      className="overflow-hidden pt-12 pb-0 lg:pt-8"
      aria-label="Головний блок"
    >
      <PageContainer>
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[minmax(0,720px)_1fr] lg:gap-12">
          <div className="flex flex-col gap-6 lg:self-start lg:pl-16">
            <h1
              className="text-[44px] leading-[1] font-light tracking-[-0.035em] sm:text-[64px] lg:text-[88px]"
              style={{ fontFamily: '"Visuelt Hero", system-ui, sans-serif' }}
            >
              <span className="sr-only">
                Знаєш де кожна деталь і де твої гроші
              </span>
              <span aria-hidden>
                <AnimatedHeading lines={heroLines} />
              </span>
            </h1>

            <p
              className="anim-fade-up max-w-[400px] text-[17px] leading-[1.5] font-normal text-neutral-400"
              style={{ animationDelay: '520ms' }}
            >
              Застосунок, який об&apos;єднує фінанси, функції та управління в
              одному інтерфейсі.
            </p>

            <div
              className="anim-fade-up mt-3 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '680ms' }}
            >
              <Link
                to="/login"
                className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex min-h-[72px] items-center rounded-full px-12 text-[16px] font-normal transition-all duration-300 hover:scale-[1.03]"
              >
                Спробувати безкоштовно
              </Link>
            </div>
          </div>

          <div className="hidden lg:block">
            <picture>
              <source
                media="(min-width: 1024px)"
                type="image/avif"
                srcSet={`${hero720Avif} 720w, ${hero1080Avif} 1080w`}
                sizes="680px"
              />
              <source
                media="(min-width: 1024px)"
                type="image/webp"
                srcSet={`${hero720Webp} 720w, ${hero1080Webp} 1080w`}
                sizes="680px"
              />
              <img
                src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                width={2076}
                height={2220}
                alt="Застосунок rozbirka на телефоні"
                decoding="async"
                fetchPriority="high"
                className="anim-float-slow ml-auto block h-auto w-full max-w-[680px]"
              />
            </picture>
          </div>
        </div>
      </PageContainer>
    </Section>
  )
}
