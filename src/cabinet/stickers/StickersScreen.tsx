import { useEffect, useMemo, useRef, useState } from 'react'
import { partsApi, type PartListItem } from '@/api/parts'
import { stickersApi } from '@/api/stickers'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { evaluateModuleAccess } from '../policy'
import { tenantResetRegistry } from '../tenant-reset-registry'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'
import {
  buildStickerHtml,
  renderStickers,
  type PrintableSticker,
  type RenderedSticker,
} from './sticker-output'

interface QueueItem {
  id: string
  quantity: number
}
interface QueueScope {
  userId: string
  tenantId: string
}
interface StoredQueue {
  version: 1
  expiresAt: number
  items: QueueItem[]
}

const MAX_STICKERS = 200
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000
const queueKey = ({ userId, tenantId }: QueueScope) =>
  `rozbirka.stickers.queue.v1:${userId}:${tenantId}`
const validQueueItem = (value: unknown): value is QueueItem => {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item['id'] === 'string' &&
    item['id'].length > 0 &&
    Number.isInteger(item['quantity']) &&
    Number(item['quantity']) > 0
  )
}
const validQueue = (value: unknown): value is QueueItem[] => {
  if (!Array.isArray(value) || !value.every(validQueueItem)) return false
  return value.reduce((sum, item) => sum + item.quantity, 0) <= MAX_STICKERS
}
const readQueue = (scope: QueueScope): QueueItem[] => {
  if (typeof window === 'undefined') return []
  const key = queueKey(scope)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const stored = JSON.parse(raw) as Partial<StoredQueue>
    if (
      stored.version !== 1 ||
      typeof stored.expiresAt !== 'number' ||
      stored.expiresAt <= Date.now() ||
      !validQueue(stored.items)
    ) {
      localStorage.removeItem(key)
      return []
    }
    return stored.items
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage is unavailable; use an empty in-memory queue.
    }
    return []
  }
}
const writeQueue = (scope: QueueScope, items: QueueItem[]) => {
  if (typeof window === 'undefined') return
  const key = queueKey(scope)
  try {
    if (!items.length) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        expiresAt: Date.now() + QUEUE_TTL_MS,
        items,
      } satisfies StoredQueue),
    )
  } catch {
    // Storage can be blocked or full; the active in-memory queue remains usable.
  }
}
export function StickersScreen({ definition }: CabinetModuleScreenProps) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const { targetTenant, snapshot } = cabinet
  const access =
    cabinet.status === 'ready' && snapshot
      ? { status: 'ready' as const, snapshot, error: null }
      : cabinet.status === 'error'
        ? { status: 'error' as const, snapshot: null, error: cabinet.error }
        : { status: 'loading' as const, snapshot: null, error: null }
  const generationDecision = evaluateModuleAccess(
    definition,
    access,
    'mutation',
  )
  const scope = useMemo(
    () =>
      targetTenant && snapshot?.userId && snapshot.tenantId === targetTenant.id
        ? { userId: snapshot.userId, tenantId: targetTenant.id }
        : null,
    [snapshot, targetTenant],
  )
  const scopeIdentity = scope ? `${scope.userId}:${scope.tenantId}` : 'none'
  return (
    <TenantStickerQueue
      generationDecision={generationDecision.kind}
      key={scopeIdentity}
      requireLatestMutation={requireLatestMutation}
      scope={scope}
    />
  )
}

function TenantStickerQueue({
  scope,
  generationDecision,
  requireLatestMutation,
}: {
  scope: QueueScope | null
  generationDecision: ReturnType<typeof evaluateModuleAccess>['kind']
  requireLatestMutation: ReturnType<
    typeof useLatestMutationGuard
  >['requireLatestMutation']
}) {
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    scope ? readQueue(scope) : [],
  )
  const [id, setId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [parts, setParts] = useState<PartListItem[]>([])
  const [partsUnavailable, setPartsUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printable, setPrintable] = useState<PrintableSticker[]>([])
  const [preview, setPreview] = useState<RenderedSticker[]>([])
  const [busy, setBusy] = useState(false)
  const generationRef = useRef(0)
  const canGenerate = generationDecision === 'allowed'
  const total = useMemo(
    () => queue.reduce((sum, item) => sum + item.quantity, 0),
    [queue],
  )

  useEffect(() => {
    if (scope) writeQueue(scope, queue)
  }, [queue, scope])
  useEffect(() => {
    const controller = new AbortController()
    void partsApi
      .list({ page: 1, pageSize: 100, signal: controller.signal })
      .then(
        (page) => {
          if (controller.signal.aborted) return
          setParts(page.items)
          setPartsUnavailable(false)
        },
        () => {
          if (!controller.signal.aborted) setPartsUnavailable(true)
        },
      )
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!scope) return
    const unregister = tenantResetRegistry.register((resetScope) => {
      if (
        resetScope.userId !== scope.userId ||
        resetScope.tenantId !== scope.tenantId
      )
        return
      try {
        localStorage.removeItem(queueKey(scope))
      } catch {
        // Scope state is still cleared from memory when storage is unavailable.
      }
      setQueue([])
    })
    return unregister
  }, [scope])
  const add = () => {
    if (!canGenerate || partsUnavailable) return
    const nextId = id.trim()
    const nextQuantity = Number(quantity)
    if (!nextId || !Number.isInteger(nextQuantity) || nextQuantity < 1) {
      setError('Вкажіть ID деталі та цілу кількість стікерів.')
      return
    }
    if (total + nextQuantity > MAX_STICKERS) {
      setError(
        `За один раз можна підготувати не більше ${MAX_STICKERS} стікерів.`,
      )
      return
    }
    setQueue((current) => {
      const found = current.find((item) => item.id === nextId)
      return found
        ? current.map((item) =>
            item.id === nextId
              ? { ...item, quantity: item.quantity + nextQuantity }
              : item,
          )
        : [...current, { id: nextId, quantity: nextQuantity }]
    })
    setError(null)
    setPrintable([])
    setPreview([])
    setId('')
    setQuantity('1')
  }
  const clear = () => {
    setQueue([])
    setPrintable([])
    setPreview([])
    setError(null)
  }

  const generate = async () => {
    if (!canGenerate || !queue.length || busy) return
    const generation = ++generationRef.current
    setBusy(true)
    setError(null)
    try {
      const scope = requireLatestMutation({ quota: false })
      const response = await stickersApi.getBatchData(
        queue.map((item) => item.id),
        { signal: scope.signal },
      )
      if (generation !== generationRef.current) return
      const next = queue.map((queued) => {
        const sticker = response.items.find((item) => item.id === queued.id)
        if (!sticker) throw new Error('missing-sticker')
        const vehicle = [sticker.carBrand, sticker.carModel]
          .filter(Boolean)
          .join(' ')
        const vehicleWithYear = [
          vehicle,
          sticker.carYear ? `(${sticker.carYear})` : '',
        ]
          .filter(Boolean)
          .join(' ')
        const carLabel = [sticker.carCode, vehicleWithYear]
          .filter(Boolean)
          .join(' · ')
        return {
          id: sticker.id,
          name: sticker.name,
          qrCode: sticker.qrCode,
          quantity: queued.quantity,
          carLabel: carLabel || null,
        }
      })
      const rendered = await renderStickers(next, window.location.origin)
      if (generation !== generationRef.current) return
      setPrintable(next)
      setPreview(rendered)
    } catch {
      if (generation === generationRef.current)
        setError('Не вдалося підготувати дані стікерів.')
    } finally {
      if (generation === generationRef.current) setBusy(false)
    }
  }
  const artifact = () => buildStickerHtml(printable, window.location.origin)
  const download = async () => {
    try {
      const html = await artifact()
      const url = URL.createObjectURL(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
      )
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = 'rozbirka-stickers.html'
        link.click()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      setError('Не вдалося завантажити макет стікерів.')
    }
  }
  const print = async () => {
    try {
      const html = await artifact()
      const printWindow = window.open('', '_blank')
      if (!printWindow) throw new Error('popup-blocked')
      printWindow.opener = null
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    } catch {
      setError('Не вдалося відкрити макет для друку.')
    }
  }
  const share = async () => {
    try {
      const html = await artifact()
      const file = new File([html], 'rozbirka-stickers.html', {
        type: 'text/html',
      })
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        setError('Обмін файлами не підтримується цим браузером.')
        return
      }
      await navigator.share({
        files: [file],
        title: 'Стікери Rozbirka',
      })
    } catch {
      setError('Не вдалося поділитися макетом стікерів.')
    }
  }

  const labelFor = (partId: string) =>
    parts.find((part) => part.id === partId)?.name ??
    'Деталь недоступна у поточній вибірці'

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-4">
      <h1 className="text-3xl text-white">Стікери</h1>
      <p className="text-neutral-400">Черга стікерів для поточної розбірки</p>
      {!scope ? (
        <p role="alert">
          Відновлення черги заблоковано без стабільної ідентичності користувача
          та розбірки.
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-sm text-neutral-300">
          Деталь
          <select
            aria-label="Деталь"
            className="rounded border border-white/[0.12] bg-transparent p-2 text-white"
            disabled={!canGenerate || partsUnavailable}
            onChange={(event) => setId(event.target.value)}
            value={id}
          >
            <option value="">Оберіть деталь</option>
            {parts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.name}
              </option>
            ))}
            {id && !parts.some((part) => part.id === id) ? (
              <option value={id}>Деталь недоступна у поточній вибірці</option>
            ) : null}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-neutral-300">
          Кількість стікерів
          <input
            aria-label="Кількість стікерів"
            min="1"
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            value={quantity}
          />
        </label>
        <button
          disabled={!canGenerate || partsUnavailable}
          onClick={add}
          type="button"
        >
          Додати
        </button>
      </div>
      {partsUnavailable ? (
        <p role="status">
          Вибір деталей недоступний: список не завантажено, пошук за внутрішнім
          ID вимкнено.
        </p>
      ) : null}
      {!canGenerate ? (
        <p role="status">
          {generationDecision === 'subscription-blocked'
            ? 'Поточна підписка не дозволяє генерацію стікерів.'
            : generationDecision === 'access-loading'
              ? 'Перевіряємо право на генерацію стікерів…'
              : generationDecision === 'access-error'
                ? 'Не вдалося перевірити право на генерацію стікерів.'
                : 'Недостатньо прав для генерації стікерів.'}
        </p>
      ) : null}
      <p className="text-neutral-400">У черзі: {total}</p>
      {queue.map((item) => (
        <div className="flex gap-2 text-white" key={item.id}>
          {labelFor(item.id)} × {item.quantity}
          <button
            aria-label={`Прибрати ${labelFor(item.id)}`}
            disabled={!canGenerate}
            onClick={() => {
              setQueue((current) =>
                current.filter((entry) => entry.id !== item.id),
              )
              setPrintable([])
              setPreview([])
            }}
            type="button"
          >
            Прибрати
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          aria-busy={busy}
          disabled={!queue.length || !canGenerate || busy}
          onClick={() => void generate()}
          type="button"
        >
          Отримати дані стікерів
        </button>
        <button
          disabled={!preview.length || busy}
          onClick={() => void download()}
          type="button"
        >
          Завантажити макет
        </button>
        <button
          disabled={!preview.length || busy}
          onClick={() => void print()}
          type="button"
        >
          Друкувати
        </button>
        <button
          disabled={!preview.length || busy}
          onClick={() => void share()}
          type="button"
        >
          Поділитися
        </button>
        <button
          disabled={!preview.length || busy}
          onClick={clear}
          type="button"
        >
          Підтвердити друк
        </button>
        <button
          disabled={!queue.length || !canGenerate}
          onClick={clear}
          type="button"
        >
          Очистити чергу
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {preview.length ? (
        <section
          aria-label="Макет стікерів"
          className="grid gap-3 sm:grid-cols-3"
        >
          {preview.map((sticker, index) => (
            <article
              className="grid gap-2 rounded bg-white p-3 text-black"
              key={`${sticker.id}-${index}`}
            >
              <div
                aria-label={`QR-код ${sticker.name}`}
                dangerouslySetInnerHTML={{ __html: sticker.qrSvg }}
                role="img"
              />
              <strong>{sticker.name}</strong>
              {sticker.carLabel ? <span>{sticker.carLabel}</span> : null}
              <a href={sticker.resumeUrl}>Відкрити сканування</a>
            </article>
          ))}
        </section>
      ) : null}
    </section>
  )
}
