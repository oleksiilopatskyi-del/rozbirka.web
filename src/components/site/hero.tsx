import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'
import phoneImg from '@/assets/phone pc.png'

interface TypewriterLine {
  text: string
  className?: string
}

const heroLines: TypewriterLine[] = [
  { text: 'Знаєш' },
  { text: 'де кожна' },
  { text: 'деталь і де' },
  { text: 'твої гроші', className: 'text-brand' },
]

function TypewriterHeading({ lines }: { lines: TypewriterLine[] }) {
  const [revealed, setRevealed] = useState<string[]>(() => lines.map(() => ''))
  const [activeLine, setActiveLine] = useState(0)
  const speed = 35
  const lineGap = 180

  useEffect(() => {
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      setRevealed(lines.map((l) => l.text))
      setActiveLine(lines.length)
      return
    }

    let lineIdx = 0
    let charIdx = 0
    let timer: number | undefined

    const tick = () => {
      if (lineIdx >= lines.length) {
        setActiveLine(lines.length)
        return
      }
      const target = lines[lineIdx]?.text ?? ''
      if (charIdx < target.length) {
        charIdx++
        const snapshot = target.slice(0, charIdx)
        setRevealed((prev) => {
          const next = [...prev]
          next[lineIdx] = snapshot
          return next
        })
        timer = window.setTimeout(tick, speed)
      } else {
        lineIdx++
        charIdx = 0
        setActiveLine(lineIdx)
        timer = window.setTimeout(tick, lineGap)
      }
    }

    tick()
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [lines])

  const done = activeLine >= lines.length

  return (
    <>
      {lines.map((line, i) => {
        const isActive = i === activeLine
        const isLast = i === lines.length - 1
        const showCaret = isActive || (done && isLast)
        return (
          <span key={i} className={`block min-h-[1em] ${line.className ?? ''}`}>
            {revealed[i] || ' '}
            {showCaret && (
              <span
                aria-hidden
                className="ml-[0.05em] inline-block h-[0.85em] w-[0.05em] translate-y-[0.05em] animate-pulse bg-current align-baseline"
              />
            )}
          </span>
        )
      })}
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
            <h1 className="text-[52px] leading-[1] font-light tracking-[-0.035em] sm:text-[76px] lg:text-[108px]">
              <TypewriterHeading lines={heroLines} />
            </h1>

            <p
              className="anim-fade-up max-w-[400px] text-[17px] leading-[1.5] font-normal text-neutral-500"
              style={{ animationDelay: '1700ms' }}
            >
              Застосунок, який об&apos;єднує фінанси, функції та управління в
              одному інтерфейсі.
            </p>

            <div
              className="anim-fade-up mt-3 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '1900ms' }}
            >
              <a
                href="#download"
                className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex h-[72px] items-center rounded-full px-12 text-[16px] font-normal transition-all duration-300 hover:scale-[1.03]"
              >
                Спробувати безкоштовно
              </a>
              <a
                href="#demo"
                className="group inline-flex h-[72px] items-center gap-5 rounded-full pr-2.5 pl-8 text-[16px] font-normal text-white ring-1 ring-white/15 transition-colors hover:bg-white/[0.04]"
              >
                <span>Дивитись демо</span>
                <span className="bg-brand grid size-14 place-items-center rounded-full transition-transform duration-300 group-hover:rotate-45">
                  <ArrowUpRight className="size-5 text-black" aria-hidden />
                </span>
              </a>
            </div>
          </div>

          <div className="hidden lg:block">
            <img
              src={phoneImg}
              alt="Застосунок rozbirka на телефоні"
              width={2076}
              height={2220}
              loading="eager"
              decoding="async"
              className="anim-float-slow ml-auto block h-auto w-full max-w-[680px]"
            />
          </div>
        </div>
      </PageContainer>
    </Section>
  )
}
