import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, QrCode, RotateCcw, ScanLine, SearchX } from 'lucide-react'
import { Link } from 'react-router'
import {
  Button,
  DeniedState,
  EmptyState,
  Fact,
  FactList,
  Field,
  FileField,
  Notice,
  PageBody,
  PageHeader,
  Quantity,
  RecordCard,
  SectionPanel,
  StateScreen,
  StatusPill,
  TextInput,
  type NoticeTone,
  type StatusTone,
} from '@/components/app'
import { scannersApi } from '@/api/scanners'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { normalizeScanCode } from './scan-code'

interface BarcodeResult {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<BarcodeResult[]>
}
type BarcodeDetectorConstructor = new (options: {
  formats: string[]
}) => BarcodeDetectorLike
const stopStream = (stream: MediaStream | null) =>
  stream?.getTracks().forEach((track) => track.stop())

const getDetector = (): BarcodeDetectorConstructor | null =>
  'BarcodeDetector' in globalThis
    ? (globalThis as unknown as { BarcodeDetector: BarcodeDetectorConstructor })
        .BarcodeDetector
    : null

/**
 * What the scanner says between attempts. `inline` messages ride along with the
 * screen; the other two own the result area, because "not found" and "no camera"
 * are outcomes the yard has to act on, not asides.
 */
type ScanNotice =
  | { kind: 'inline'; tone: NoticeTone; text: string }
  | { kind: 'not-found' }
  | { kind: 'camera-denied' }

/**
 * The scanned record, flattened for display. Only fields the server already
 * returned after the tenant-authorized lookup; each stays optional so a lean
 * payload renders fewer facts instead of empty ones.
 */
interface ScannedPart {
  id: string
  name: string
  /** The code as it was submitted — proof of what this card came from. */
  code: string
  qrCode: string | null
  status: string | null
  unit: string | null
  quantityAvailable: number | null
  car: string | null
  photo: { url: string; thumbnailUrl?: string } | null
}

const statusPresentation = (
  status: string,
): { label: string; tone: StatusTone } => {
  if (status === 'available') return { label: 'Доступно', tone: 'ok' }
  if (status === 'reserved') return { label: 'У резерві', tone: 'warn' }
  if (status === 'sold') return { label: 'Продано', tone: 'neutral' }
  return { label: status, tone: 'neutral' }
}

export function ScannerScreen(_props: CabinetModuleScreenProps) {
  const { targetTenant } = useCabinet()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const sequenceRef = useRef(0)
  const scanGenerationRef = useRef(0)
  const fileGenerationRef = useRef(0)
  const requestRef = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)
  const [code, setCode] = useState('')
  const [cameraState, setCameraState] = useState<
    'idle' | 'active' | 'unavailable'
  >('idle')
  const [videoReady, setVideoReady] = useState(false)
  const [status, setStatus] = useState<ScanNotice | null>(null)
  const [part, setPart] = useState<ScannedPart | null>(null)
  const [pending, setPending] = useState(false)

  const shutdownCamera = useCallback(
    (nextState: 'idle' | 'unavailable' = 'idle') => {
      scanGenerationRef.current += 1
      stopStream(streamRef.current)
      streamRef.current = null
      if (mountedRef.current) {
        setVideoReady(false)
        setCameraState(nextState)
      }
    },
    [],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sequenceRef.current += 1
      fileGenerationRef.current += 1
      requestRef.current?.abort()
      shutdownCamera()
    }
  }, [shutdownCamera])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (cameraState !== 'active' || !video || !stream) return
    video.srcObject = stream
    void Promise.resolve(video.play()).catch(() => undefined)
  }, [cameraState])

  const resolve = useCallback(
    async (rawCode: string) => {
      const normalized = normalizeScanCode(rawCode)
      if (!normalized || pendingRef.current) return
      const sequence = ++sequenceRef.current
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      pendingRef.current = true
      setPart(null)
      setPending(true)
      setStatus({
        kind: 'inline',
        tone: 'info',
        text: 'Перевіряємо код у поточній розбірці…',
      })
      try {
        const result = await scannersApi.resolveQr(normalized, {
          signal: controller.signal,
        })
        if (!mountedRef.current || sequence !== sequenceRef.current) return
        shutdownCamera()
        const vehicle = [result.carBrand, result.carModel, result.carYear]
          .filter(Boolean)
          .join(' ')
        const cover = result.photos?.[0]
        setPart({
          id: result.id,
          name: result.name,
          code: normalized,
          qrCode: result.qrCode ?? null,
          status: result.status ?? null,
          unit: result.unit ?? null,
          quantityAvailable: result.quantityAvailable ?? null,
          car: vehicle || null,
          photo: cover
            ? { url: cover.url, thumbnailUrl: cover.thumbnailUrl }
            : null,
        })
        setStatus(null)
      } catch {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          sequence !== sequenceRef.current
        )
          return
        setPart(null)
        setStatus({ kind: 'not-found' })
      } finally {
        if (mountedRef.current && sequence === sequenceRef.current) {
          pendingRef.current = false
          setPending(false)
        }
      }
    },
    [shutdownCamera],
  )

  useEffect(() => {
    const Detector = getDetector()
    const video = videoRef.current
    if (cameraState !== 'active' || !videoReady || !Detector || !video) return
    const generation = ++scanGenerationRef.current
    const detector = new Detector({ formats: ['qr_code'] })
    let frame: number | null = null
    let cancelled = false
    const detect = async () => {
      if (cancelled || generation !== scanGenerationRef.current) return
      try {
        const result = await detector.detect(video)
        if (cancelled || generation !== scanGenerationRef.current) return
        const value = result[0]?.rawValue
        if (value) {
          shutdownCamera()
          await resolve(value)
          return
        }
      } catch {
        if (cancelled || generation !== scanGenerationRef.current) return
      }
      frame = requestAnimationFrame(() => void detect())
    }
    void detect()
    return () => {
      cancelled = true
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [cameraState, resolve, shutdownCamera, videoReady])

  const stopCamera = () => {
    shutdownCamera()
    setStatus({
      kind: 'inline',
      tone: 'info',
      text: 'Камеру зупинено. Введіть код вручну або ввімкніть камеру знову.',
    })
  }

  const enableCamera = async () => {
    shutdownCamera()
    const generation = scanGenerationRef.current
    try {
      const stream = await navigator.mediaDevices?.getUserMedia?.({
        video: { facingMode: 'environment' },
      })
      if (!stream) throw new Error('unsupported')
      if (!mountedRef.current || generation !== scanGenerationRef.current) {
        stopStream(stream)
        return
      }
      streamRef.current = stream
      setVideoReady(false)
      setCameraState('active')
      const Detector = getDetector()
      setStatus(
        Detector
          ? {
              kind: 'inline',
              tone: 'info',
              text: 'Камера ввімкнена. Тримайте стікер у рамці, поки код не зчитається.',
            }
          : {
              kind: 'inline',
              tone: 'warn',
              text: 'Цей браузер не читає QR із камери. Введіть код зі стікера вручну нижче.',
            },
      )
    } catch {
      if (mountedRef.current && generation === scanGenerationRef.current) {
        shutdownCamera('unavailable')
        setStatus({ kind: 'camera-denied' })
      }
    }
  }
  const scanFile = async (file: File | null) => {
    const Detector = getDetector()
    if (!file || !Detector) {
      setStatus({
        kind: 'inline',
        tone: 'warn',
        text: 'Цей браузер не читає QR із зображення. Введіть код зі стікера вручну.',
      })
      return
    }
    const generation = ++fileGenerationRef.current
    try {
      const result = await new Detector({ formats: ['qr_code'] }).detect(file)
      if (!mountedRef.current || generation !== fileGenerationRef.current)
        return
      const value = result[0]?.rawValue
      if (value) {
        shutdownCamera()
        await resolve(value)
      } else
        setStatus({
          kind: 'inline',
          tone: 'warn',
          text: 'На цьому фото QR-коду немає. Сфотографуйте стікер ближче або введіть код вручну.',
        })
    } catch {
      if (mountedRef.current && generation === fileGenerationRef.current)
        setStatus({
          kind: 'inline',
          tone: 'danger',
          text: 'Не вдалося прочитати файл. Виберіть інше фото стікера або введіть код вручну.',
        })
    }
  }

  /** Clears the last result and reopens the camera for the next part in hand. */
  const scanNext = async () => {
    setPart(null)
    setStatus(null)
    setCode('')
    await enableCamera()
  }

  const cameraLive = cameraState === 'active'
  const partStatus = part?.status ? statusPresentation(part.status) : null

  return (
    <PageBody width="narrow">
      <PageHeader eyebrow="Склад" title="QR-сканер" />
      <p className="text-app-muted text-sm">
        Наведіть камеру на стікер деталі. Дані деталі не показуються до
        серверної перевірки доступу.
      </p>

      {cameraLive ? (
        <div className="rounded-panel border-app-line relative overflow-hidden border bg-black">
          <video
            aria-label="Камера QR"
            autoPlay
            className="aspect-4/3 w-full object-cover"
            muted
            onCanPlay={() => setVideoReady(true)}
            playsInline
            ref={videoRef}
          />
          <span
            aria-hidden
            className="border-brand/70 pointer-events-none absolute inset-x-8 inset-y-6 rounded-2xl border-2"
          />
        </div>
      ) : null}

      {part ? (
        <SectionPanel
          description="Переконайтеся, що це та сама деталь, яку тримаєте в руках."
          title="Знайдена деталь"
        >
          <RecordCard
            meta={<span className="break-all">{part.qrCode ?? part.code}</span>}
            photo={part.photo}
            status={<StatusPill tone="ok">Знайдено</StatusPill>}
            title={part.name}
          />
          {/* A lean payload renders fewer facts rather than a row of dashes. */}
          {partStatus ||
          typeof part.quantityAvailable === 'number' ||
          part.car ? (
            <FactList columns={2}>
              {partStatus ? (
                <Fact label="Стан">
                  <StatusPill tone={partStatus.tone}>
                    {partStatus.label}
                  </StatusPill>
                </Fact>
              ) : null}
              {typeof part.quantityAvailable === 'number' ? (
                <Fact label="Доступно">
                  <Quantity unit={part.unit} value={part.quantityAvailable} />
                </Fact>
              ) : null}
              {part.car ? <Fact label="Авто-джерело">{part.car}</Fact> : null}
            </FactList>
          ) : null}
        </SectionPanel>
      ) : pending ? (
        <StateScreen
          description="Звіряємо стікер із деталями цієї розбірки. Це займає секунду."
          icon={<ScanLine aria-hidden />}
          title="Перевіряємо код…"
          tone="brand"
        />
      ) : status?.kind === 'not-found' ? (
        <StateScreen
          description="Стікер може належати іншій розбірці, або деталь уже видалено. Звірте код на стікері й спробуйте ще раз."
          icon={<SearchX aria-hidden />}
          role="alert"
          title="Код не знайдено в цій розбірці"
          tone="warn"
          actions={
            <Button
              className="min-h-14"
              onClick={() => void scanNext()}
              variant="primary"
            >
              <ScanLine aria-hidden />
              Сканувати ще раз
            </Button>
          }
        />
      ) : status?.kind === 'camera-denied' ? (
        <DeniedState
          description="Дозвольте доступ до камери в налаштуваннях браузера й увімкніть її ще раз. Поки що введіть код зі стікера вручну або виберіть його фото."
          title="Камера недоступна"
        />
      ) : cameraLive ? null : (
        <EmptyState
          description="Увімкніть камеру й наведіть її на QR-стікер деталі. Знайдену деталь покажемо тут — перед тим, як відкривати картку."
          icon={<QrCode aria-hidden />}
          title="Готово до сканування"
        />
      )}

      {status?.kind === 'inline' ? (
        <Notice
          role={status.tone === 'danger' ? 'alert' : 'status'}
          tone={status.tone}
        >
          {status.text}
        </Notice>
      ) : null}

      {/* The yard works one-handed: the deciding action stays under the thumb. */}
      <div className="rounded-panel border-app-line bg-app-overlay/95 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 grid gap-2 border p-3 backdrop-blur md:bottom-6">
        {part ? (
          <>
            <Button asChild className="min-h-14 w-full" variant="primary">
              <Link to={`/app/${targetTenant?.slug ?? ''}/parts/${part.id}`}>
                Відкрити картку деталі
              </Link>
            </Button>
            <Button
              className="min-h-14 w-full"
              onClick={() => void scanNext()}
              variant="ghost"
            >
              <ScanLine aria-hidden />
              Сканувати наступний код
            </Button>
          </>
        ) : (
          <>
            {cameraLive ? (
              <Button
                className="min-h-14 w-full"
                onClick={stopCamera}
                variant="ghost"
              >
                Зупинити камеру
              </Button>
            ) : null}
            <Button
              className="min-h-14 w-full"
              onClick={() => void enableCamera()}
              variant={cameraLive ? 'quiet' : 'primary'}
            >
              {cameraLive ? <RotateCcw aria-hidden /> : <Camera aria-hidden />}
              Увімкнути камеру
            </Button>
            {cameraLive ? (
              <p className="text-app-dim text-center text-[11.5px]">
                Зображення завмерло? Увімкніть камеру ще раз.
              </p>
            ) : null}
          </>
        )}
      </div>

      <SectionPanel
        description="Запасний шлях, коли стікер потертий або камера недоступна."
        title="Ввести код вручну"
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void resolve(code)
          }}
        >
          <Field
            hint="Код зі стікера або посилання виду /scan/…"
            label="QR-код"
          >
            <TextInput
              aria-label="QR-код"
              autoComplete="off"
              onChange={(event) => setCode(event.target.value)}
              placeholder="Напр. QR-123"
              value={code}
            />
          </Field>
          <Field
            hint="Фото стікера з галереї — код розпізнаємо із зображення."
            label="Файл QR-коду"
          >
            <FileField
              accept="image/*"
              aria-label="Файл QR-коду"
              onChange={(event) =>
                void scanFile(event.target.files?.[0] ?? null)
              }
              type="file"
            />
          </Field>
          <Button
            aria-busy={pending}
            className="min-h-14 w-full"
            disabled={pending}
            type="submit"
            /* Without a camera this is the only way in, so it takes the fill. */
            variant={
              cameraState === 'unavailable' && !part ? 'primary' : 'ghost'
            }
          >
            Знайти деталь
          </Button>
        </form>
      </SectionPanel>

      <p className="text-app-dim text-[12.5px]">
        VIN та OEM-декодування недоступні: відповідних серверних операцій немає.
      </p>
    </PageBody>
  )
}
