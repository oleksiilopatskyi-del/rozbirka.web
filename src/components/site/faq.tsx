import { useEffect, useId, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'

interface FaqEntry {
  question: string
  answer: string
}

const entries: FaqEntry[] = [
  {
    question: 'Чи бачу я прибуток окремо по кожному авто?',
    answer:
      'Так. Кожне авто має свій профіль з усіма витратами й продажами. Бачиш ROI у відсотках і доларах у реальному часі.',
  },
  {
    question: 'Як швидко я можу почати працювати після реєстрації?',
    answer:
      'За 10 хвилин. Створюєш перше авто, додаєш запчастини — і вже працюєш. Без довгих налаштувань і навчання.',
  },
  {
    question: 'Як працює пробний тиждень?',
    answer:
      'Сім днів повного доступу до всіх модулів — без введення картки. Якщо не підійде — нічого не списується автоматично.',
  },
  {
    question: 'Скільки людей з команди можуть працювати одночасно?',
    answer:
      'Стільки, скільки потрібно. Кожному — окрема роль і права доступу. Власник бачить усе, продавець — лише те, що йому належить.',
  },
  {
    question: 'Чи можна продавати запчастини в доларах?',
    answer:
      'Так. Ціни фіксуються в USD незалежно від курсу. Оплата приймається в будь-якій валюті — гривні, доларах, на різні рахунки й каси.',
  },
  {
    question: 'Чи легко користуватися застосунком?',
    answer:
      'Так. Будь-яка дія — максимум 3 кліки. UI зроблений під роботу однією рукою з телефону: без захованих вкладок, без зайвих кроків. Працює інтуїтивно з першого запуску.',
  },
]

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <Section id="faq" className="py-16 lg:py-24">
      <PageContainer width="md">
        <header className="mb-12 flex flex-col items-start gap-8 lg:mb-16">
          <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
            FAQ
          </span>
          <h2 className="text-[44px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[72px]">
            <span className="block">Поширені</span>
            <span className="text-brand block">питання</span>
          </h2>
        </header>

        <ul role="list" className="flex flex-col gap-3">
          {entries.map((entry, i) => (
            <FaqRow
              key={entry.question}
              number={String(i + 1).padStart(2, '0')}
              entry={entry}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </ul>
      </PageContainer>
    </Section>
  )
}

interface FaqRowProps {
  number: string
  entry: FaqEntry
  isOpen: boolean
  onToggle: () => void
}

function FaqRow({ number, entry, isOpen, onToggle }: FaqRowProps) {
  const panelId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState(0)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => setMaxHeight(el.scrollHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [entry.answer])

  return (
    <li
      className={cn(
        'rounded-[28px] transition-colors duration-300 ease-out',
        isOpen
          ? 'bg-brand text-brand-foreground'
          : 'text-white ring-1 ring-white/[0.08] hover:ring-white/15',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center gap-6 px-6 py-5 text-left lg:px-8 lg:py-6"
      >
        <span
          className={cn(
            'shrink-0 text-[13px] font-medium tracking-[0.05em] tabular-nums',
            isOpen ? 'text-brand-foreground/60' : 'text-brand',
          )}
          aria-hidden
        >
          {number}
        </span>

        <span className="flex-1 text-[16px] leading-[1.3] font-normal lg:text-[18px]">
          {entry.question}
        </span>

        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full ring-1 transition-all duration-300 ease-out',
            isOpen
              ? 'rotate-180 ring-brand-foreground/30'
              : 'rotate-0 ring-white/15',
          )}
        >
          {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-label={entry.question}
        style={{
          maxHeight: isOpen ? `${maxHeight}px` : '0px',
        }}
        className="overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
      >
        <div ref={contentRef}>
          <p
            className={cn(
              'text-brand-foreground/80 max-w-[640px] pr-12 pb-6 pl-[60px] text-[14px] leading-[1.55] transition-opacity duration-300 lg:pl-[68px] lg:text-[15px]',
              isOpen ? 'opacity-100 delay-100' : 'opacity-0',
            )}
          >
            {entry.answer}
          </p>
        </div>
      </div>
    </li>
  )
}
