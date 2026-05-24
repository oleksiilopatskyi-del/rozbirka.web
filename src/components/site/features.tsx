import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'
import avtoImg from '@/assets/features/avto.svg'
import intakeImg from '@/assets/features/intake.svg'
import partsImg from '@/assets/features/parts.svg'
import stickersImg from '@/assets/features/stickers.svg'
import ordersImg from '@/assets/features/orders.svg'
import customersImg from '@/assets/features/customers.svg'
import cashImg from '@/assets/features/cash.svg'
import analyticsImg from '@/assets/features/analytics.svg'
import reportsImg from '@/assets/features/reports.svg'
import teamImg from '@/assets/features/team.svg'

interface Feature {
  title: string
  bullets?: string[]
  image?: string
}

const features: Feature[] = [
  {
    title: 'Авто',
    image: avtoImg,
    bullets: [
      'Розбирай авто — система рахує кожну деталь',
      'Прозорий прибуток по кожному кузову',
      'Точно знаєш скільки вклав і скільки забрав',
      'Від VIN до останньої гайки — все в одному профілі',
      'Бачиш, яке авто окупилось найкраще',
      'Фото, документи, історія — без папок і Excel',
    ],
  },
  {
    title: 'Партії',
    image: intakeImg,
    bullets: [
      'Закупив партію — додав одним рухом, без переписування',
      'Бачиш звідки прийшла кожна деталь і скільки коштувала',
      'Прибуток по партії окремо — точно, без здогадок',
      'Розумієш, який постачальник приніс найбільше',
      'Видно, скільки лишилось продавати з партії',
      'Повна історія кожної партії — нічого не плутаєш',
    ],
  },
  {
    title: 'Склад',
    image: partsImg,
    bullets: [
      'Кожна деталь на своєму місці — знаходиш за секунди',
      'Шукай по машині, партії або коду — миттєво',
      'Історія кожної запчастини: хто додав, продав, редагував',
      'Видно, що вільне, що зарезервовано, що в замовленні',
      'Фото, ціна, стан — повний паспорт кожної деталі',
      'Чітко бачиш скільки на складі і на яку суму',
    ],
  },
  {
    title: 'Стікери',
    image: stickersImg,
    bullets: [
      'Друкуєш стікер на кожну деталь: QR + назва',
      'Сканування з телефону — миттєво відкриває картку',
      'Додаєш запчастину в замовлення скануванням QR',
      'Знайшов деталь на полиці — знаєш все за секунду',
      'Передруковуєш втрачений стікер за два кліки',
    ],
  },
  {
    title: 'Замовлення',
    image: ordersImg,
    bullets: [
      'Збираєш замовлення в кілька кліків: клієнт, деталь, ціна',
      'Ціна фіксується в доларах — стабільно, без прив’язки до курсу',
      'Оплата гнучка: кілька платежів, різні валюти й рахунки',
      'Бачиш статус від резерву до відвантаження',
      'Клієнт привʼязаний — вся історія покупок під рукою',
      'Швидкі чеки й накладні — без ручної рутини',
    ],
  },
  {
    title: 'Клієнти',
    image: customersImg,
    bullets: [
      'База клієнтів завжди під рукою: контакти й історія',
      'Зателефонувати чи написати — в один тап з картки',
      'Усі замовлення клієнта в одному списку',
      'Створюєш нове замовлення прямо з картки клієнта',
      'Швидкий пошук: телефон, імʼя або номер замовлення',
    ],
  },
  {
    title: 'Каси',
    image: cashImg,
    bullets: [
      'Кілька кас на різні валюти й рахунки — не плутаєш',
      'Бачиш баланс кожної каси в реальному часі',
      'Оплата автоматично заходить у потрібну касу',
      'Переміщуєш гроші між касами в один клік',
      'Звіт по касі: доходи, витрати, рухи за день і місяць',
    ],
  },
  {
    title: 'Аналітика',
    image: analyticsImg,
    bullets: [
      'Дашборд за день, тиждень або місяць — у три кліки',
      'Топ запчастин: що продається, що залежалось',
      'Знаєш яка машина окупилась, а яка тягне в мінус',
      'Маржа й прибуток у реальному часі',
      'Динаміка продажів — графіки замість таблиць',
    ],
  },
  {
    title: 'Звіти',
    image: reportsImg,
    bullets: [
      'Готові звіти по продажах, складу, фінансах',
      'За будь-який період: день, місяць, рік',
      'Шаблони під різні задачі: податкова, інвентаризація, аудит',
      'Експорт у PDF — для бухгалтера або в архів',
      'Друкуєш і відправляєш — без ручного редагування',
    ],
  },
  {
    title: 'Команда',
    image: teamImg,
    bullets: [
      'Додаєш співробітників — кожному своя роль і доступ',
      'Бачиш хто і що зробив — повний журнал дій',
      'Розумієш хто скільки продав і заробив',
      'Налаштовуєш права: що може бачити, що редагувати',
      'Без зайвих очей: продавець не бачить собівартість',
    ],
  },
]

export function Features() {
  const scrollerRef = useRef<HTMLUListElement>(null)

  const scrollByCard = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    const firstCard = el.firstElementChild as HTMLElement | null
    const cardWidth = firstCard?.clientWidth ?? el.clientWidth / 3
    el.scrollBy({ left: direction * cardWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    let paused = false
    const pause = () => {
      paused = true
    }
    const resume = () => {
      paused = false
    }
    el.addEventListener('mouseenter', pause)
    el.addEventListener('mouseleave', resume)
    el.addEventListener('focusin', pause)
    el.addEventListener('focusout', resume)

    const id = window.setInterval(() => {
      if (paused) return
      const card = el.firstElementChild as HTMLElement | null
      if (!card) return
      const cardWidth = card.clientWidth
      const atEnd = el.scrollLeft + el.clientWidth + 8 >= el.scrollWidth
      if (atEnd) {
        el.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        el.scrollBy({ left: cardWidth, behavior: 'smooth' })
      }
    }, 3500)

    return () => {
      window.clearInterval(id)
      el.removeEventListener('mouseenter', pause)
      el.removeEventListener('mouseleave', resume)
      el.removeEventListener('focusin', pause)
      el.removeEventListener('focusout', resume)
    }
  }, [])

  return (
    <Section id="features" className="py-16 lg:py-24">
      <PageContainer>
        <div className="bg-surface-1 rounded-(--radius-section) ring-1 ring-white/[0.04]">
          <header className="flex flex-col items-start gap-8 px-8 pt-12 lg:px-14 lg:pt-16">
            <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
              Модулі
            </span>
            <div className="flex w-full flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
              <div className="flex flex-col gap-6">
                <h2 className="text-[44px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[72px]">
                  <span className="block">Поточні фічі</span>
                  <span className="text-brand block">rozbirka</span>
                </h2>
                <p className="max-w-[340px] text-[14px] leading-[1.5] text-neutral-500">
                  Десять модулів — один інтерфейс. Від обліку авто до фінансів
                  і команди.
                </p>
              </div>

              <div className="hidden gap-2 lg:flex">
                <NavCircle
                  direction="prev"
                  onClick={() => scrollByCard(-1)}
                />
                <NavCircle direction="next" onClick={() => scrollByCard(1)} />
              </div>
            </div>
          </header>

          <ul
            ref={scrollerRef}
            role="list"
            className="mt-12 flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] lg:mt-16"
          >
            {features.map((f) => (
              <FeatureCard key={f.title} feature={f} />
            ))}
          </ul>
        </div>
      </PageContainer>
    </Section>
  )
}

function NavCircle({
  direction,
  onClick,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
}) {
  const Icon = direction === 'prev' ? ArrowLeft : ArrowRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Попередня' : 'Наступна'}
      className="group/nav grid size-12 place-items-center rounded-full text-white ring-1 ring-white/15 transition-all duration-300 hover:bg-white/[0.06] hover:ring-white/30 active:scale-95"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const hasBullets = (feature.bullets ?? []).length > 0

  return (
    <li className="group flex w-[85%] shrink-0 snap-start flex-col gap-8 border-l border-white/[0.06] p-8 first:border-l-0 md:w-[50%] lg:w-[calc(100%/3)] lg:p-10">
      <div
        className={`relative aspect-[4/5] overflow-hidden rounded-[28px] ${feature.image ? '' : 'bg-brand'}`}
      >
        {feature.image ? (
          <img
            src={feature.image}
            alt={`Скриншот фічі ${feature.title}`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full scale-[1.15] object-contain object-center transition-transform duration-700 ease-out group-hover:scale-[1.22]"
          />
        ) : (
          <PhoneSilhouette className="absolute top-1/2 left-1/2 h-[82%] -translate-x-1/2 -translate-y-1/2" />
        )}
      </div>

      <div className="flex flex-col gap-5">
        <h3 className="text-[28px] leading-[1.05] font-medium tracking-[-0.01em] whitespace-pre-line lg:text-[32px]">
          {feature.title}
        </h3>

        {hasBullets && (
          <ul role="list" className="flex flex-col gap-2.5">
            {feature.bullets!.map((b) => (
              <li
                key={b}
                className="flex gap-3 text-[14px] leading-[1.5] text-neutral-300"
              >
                <PlayIcon className="text-brand mt-1.5 size-2.5 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

function PhoneSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="2"
        y="2"
        width="156"
        height="316"
        rx="28"
        fill="#0a0a0a"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1.5"
      />
      <rect
        x="60"
        y="10"
        width="40"
        height="10"
        rx="5"
        fill="rgba(255,255,255,0.12)"
      />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M2 1l8 5-8 5z" />
    </svg>
  )
}
