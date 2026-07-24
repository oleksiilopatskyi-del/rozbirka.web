import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'
import { AppStoreBadge, GooglePlayBadge } from '@/components/site/store-badges'
import cta720Avif from '@/assets/optimized/cta/cta-720.avif'
import cta1100Avif from '@/assets/optimized/cta/cta-1100.avif'
import cta720Webp from '@/assets/optimized/cta/cta-720.webp'
import cta1100Webp from '@/assets/optimized/cta/cta-1100.webp'

export function CtaBanner() {
  return (
    <Section id="download" className="py-12">
      <PageContainer width="md">
        <div className="bg-brand relative overflow-hidden rounded-[40px] px-10 py-12 lg:px-14 lg:py-16">
          <div className="relative z-10 flex max-w-[480px] flex-col gap-7">
            <h2 className="text-brand-foreground text-[44px] leading-[0.95] font-light tracking-[-0.03em] lg:text-[60px]">
              <span className="block">Почніть</span>
              <span className="block">керувати авто</span>
              <span className="block font-medium">вже сьогодні.</span>
            </h2>
            <p className="text-brand-foreground/70 max-w-[360px] text-[14px] leading-[1.55] lg:text-[15px]">
              Завантажуй застосунок і тримай весь бізнес у кишені.
            </p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
              <AppStoreBadge />
              <GooglePlayBadge />
            </div>
          </div>

          <picture>
            <source
              media="(min-width: 1024px)"
              type="image/avif"
              srcSet={`${cta720Avif} 720w, ${cta1100Avif} 1100w`}
              sizes="668px"
            />
            <source
              media="(min-width: 1024px)"
              type="image/webp"
              srcSet={`${cta720Webp} 720w, ${cta1100Webp} 1100w`}
              sizes="668px"
            />
            <img
              src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
              alt="rozbirka на телефонах"
              width={668}
              height={374}
              loading="lazy"
              decoding="async"
              className="anim-float-slow absolute top-1/2 right-0 hidden h-[90%] w-auto max-w-none -translate-y-1/2 object-contain object-right [filter:drop-shadow(0_30px_50px_rgba(0,0,0,0.55))_drop-shadow(0_10px_20px_rgba(0,0,0,0.4))] lg:block"
            />
          </picture>
        </div>
      </PageContainer>
    </Section>
  )
}
