import { SiteHeader } from '@/components/site/header'
import { Hero } from '@/components/site/hero'
import { Features } from '@/components/site/features'
import { Pricing } from '@/components/site/pricing'
import { FAQ } from '@/components/site/faq'
import { CtaBanner } from '@/components/site/cta-banner'
import { SiteFooter } from '@/components/site/site-footer'

function App() {
  return (
    <>
      <a
        href="#main"
        className="bg-brand text-brand-foreground sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:px-5 focus:py-3 focus:text-sm focus:font-medium"
      >
        До основного контенту
      </a>
      <div className="min-h-screen bg-black text-white">
        <SiteHeader />
        <main id="main">
          <Hero />
          <Features />
          <Pricing />
          <FAQ />
          <CtaBanner />
        </main>
        <SiteFooter />
      </div>
    </>
  )
}

export default App
