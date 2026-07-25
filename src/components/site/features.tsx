import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'

interface ResponsiveImage {
  avif: string
  avif2x: string
  webp: string
  webp2x: string
}

interface Feature {
  title: string
  bullets?: string[]
  image: ResponsiveImage
}

const featureImageUrls = import.meta.glob<string>(
  '../../assets/optimized/features/*.{avif,webp}',
  { eager: true, query: '?url', import: 'default' },
)

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onStoreChange: () => void) {
  if (!window.matchMedia) return () => undefined
  const mediaQuery = window.matchMedia(reducedMotionQuery)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia?.(reducedMotionQuery).matches ?? false
}

function getServerReducedMotionSnapshot() {
  return false
}

function responsiveImage(name: string): ResponsiveImage {
  const get = (file: string) => {
    const path = `../../assets/optimized/features/${file}`
    const url = featureImageUrls[path]
    if (!url) throw new Error(`Missing optimized feature image: ${path}`)
    return url
  }
  return {
    avif: get(`${name}-480.avif`),
    avif2x: get(`${name}-720.avif`),
    webp: get(`${name}-480.webp`),
    webp2x: get(`${name}-720.webp`),
  }
}

const features: Feature[] = [
  {
    title: 'Авто',
    image: responsiveImage('avto'),
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
    image: responsiveImage('intake'),
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
    image: responsiveImage('parts'),
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
    image: responsiveImage('stickers'),
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
    image: responsiveImage('orders'),
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
    image: responsiveImage('customers'),
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
    image: responsiveImage('cash'),
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
    image: responsiveImage('analytics'),
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
    image: responsiveImage('reports'),
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
    image: responsiveImage('team'),
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
  const interactionSurfaceRef = useRef<HTMLDivElement>(null)
  const interactionPausedRef = useRef(false)
  const scrollerRef = useRef<HTMLUListElement>(null)
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  )
  const [userPaused, setUserPaused] = useState(false)
  const autoplayPaused = reducedMotion || userPaused

  const scrollByCard = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    const firstCard = el.firstElementChild as HTMLElement | null
    const cardWidth = firstCard?.clientWidth ?? el.clientWidth / 3
    el.scrollBy({ left: direction * cardWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const interactionSurface = interactionSurfaceRef.current
    if (!interactionSurface) return

    let pointerInside = false
    let focusInside = false
    const updateInteractionPaused = () => {
      interactionPausedRef.current = pointerInside || focusInside
    }
    const pauseForPointer = () => {
      pointerInside = true
      updateInteractionPaused()
    }
    const pauseForFocus = () => {
      focusInside = true
      updateInteractionPaused()
    }
    const resumePointerAfterLeaving = (event: MouseEvent) => {
      const nextTarget = event.relatedTarget
      if (
        nextTarget instanceof Node &&
        interactionSurface.contains(nextTarget)
      ) {
        return
      }
      pointerInside = false
      updateInteractionPaused()
    }
    const resumeFocusAfterLeaving = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget
      if (
        nextTarget instanceof Node &&
        interactionSurface.contains(nextTarget)
      ) {
        return
      }
      focusInside = false
      updateInteractionPaused()
    }
    interactionSurface.addEventListener('mouseover', pauseForPointer)
    interactionSurface.addEventListener('mouseout', resumePointerAfterLeaving)
    interactionSurface.addEventListener('focusin', pauseForFocus)
    interactionSurface.addEventListener('focusout', resumeFocusAfterLeaving)

    return () => {
      interactionPausedRef.current = false
      interactionSurface.removeEventListener('mouseover', pauseForPointer)
      interactionSurface.removeEventListener(
        'mouseout',
        resumePointerAfterLeaving,
      )
      interactionSurface.removeEventListener('focusin', pauseForFocus)
      interactionSurface.removeEventListener(
        'focusout',
        resumeFocusAfterLeaving,
      )
    }
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || userPaused || reducedMotion) return

    const id = window.setInterval(() => {
      if (interactionPausedRef.current) return
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
    }
  }, [userPaused, reducedMotion])

  return (
    <Section id="features" className="py-16 lg:py-24">
      <PageContainer>
        <div
          ref={interactionSurfaceRef}
          className="bg-surface-1 rounded-(--radius-section) ring-1 ring-white/[0.04]"
        >
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
                <p className="max-w-[340px] text-[14px] leading-[1.5] text-neutral-400">
                  Десять модулів — один інтерфейс. Від обліку авто до фінансів і
                  команди.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <NavCircle direction="prev" onClick={() => scrollByCard(-1)} />
                <NavCircle direction="next" onClick={() => scrollByCard(1)} />
                <button
                  type="button"
                  aria-pressed={autoplayPaused}
                  aria-label={
                    autoplayPaused
                      ? 'Увімкнути автопрокрутку'
                      : 'Зупинити автопрокрутку'
                  }
                  disabled={reducedMotion}
                  onClick={() => setUserPaused((value) => !value)}
                  className="grid size-12 place-items-center rounded-full text-white ring-1 ring-white/15 transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {autoplayPaused ? (
                    <Play className="size-4" aria-hidden />
                  ) : (
                    <Pause className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>
          </header>

          <ul
            ref={scrollerRef}
            role="list"
            tabIndex={0}
            aria-label="Карусель модулів rozbirka"
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
      <div className="relative aspect-[4/5] overflow-hidden rounded-[28px]">
        <picture>
          <source
            type="image/avif"
            srcSet={`${feature.image.avif} 480w, ${feature.image.avif2x} 720w`}
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 85vw"
          />
          <img
            src={feature.image.webp}
            srcSet={`${feature.image.webp} 480w, ${feature.image.webp2x} 720w`}
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 85vw"
            width={363}
            height={346}
            alt={`Скриншот фічі ${feature.title}`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full scale-[1.15] object-contain object-center transition-transform duration-700 ease-out group-hover:scale-[1.22]"
          />
        </picture>
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
