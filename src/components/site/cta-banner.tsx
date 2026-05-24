import { Download } from 'lucide-react'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'
import { AppStoreBadge, GooglePlayBadge } from '@/components/site/store-badges'
import ctaPhones from '@/assets/cta-phones.png'

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
            <a
              href="#download-app"
              className="group inline-flex h-[64px] w-fit items-center gap-3 rounded-full bg-black pr-2 pl-7 text-[15px] text-white transition-all duration-300 hover:scale-[1.03] hover:bg-black/80"
            >
              <span>Завантажити</span>
              <span className="bg-brand grid size-12 place-items-center rounded-full transition-transform duration-300 group-hover:translate-y-0.5">
                <Download className="size-5 text-black" aria-hidden />
              </span>
            </a>
          </div>

          <img
            src={ctaPhones}
            alt="rozbirka на телефонах"
            width={668}
            height={374}
            loading="lazy"
            decoding="async"
            className="anim-float-slow absolute top-1/2 right-0 hidden h-[90%] w-auto max-w-none -translate-y-1/2 object-contain object-right [filter:drop-shadow(0_30px_50px_rgba(0,0,0,0.55))_drop-shadow(0_10px_20px_rgba(0,0,0,0.4))] lg:block"
          />

          <div className="absolute top-6 right-6 z-10 flex flex-col gap-3">
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </div>
      </PageContainer>
    </Section>
  )
}
