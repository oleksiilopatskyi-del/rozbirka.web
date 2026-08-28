import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
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
  const [status, setStatus] = useState<string | null>(null)
  const [part, setPart] = useState<{ id: string; name: string } | null>(null)
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
      setStatus('Перевіряємо код у поточній розбірці…')
      try {
        const result = await scannersApi.resolveQr(normalized, {
          signal: controller.signal,
        })
        if (!mountedRef.current || sequence !== sequenceRef.current) return
        shutdownCamera()
        setPart(result)
        setStatus(null)
      } catch {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          sequence !== sequenceRef.current
        )
          return
        setPart(null)
        setStatus('QR-код не знайдено або доступ до нього заборонено.')
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
    setStatus('Камеру зупинено. Можна ввести код або вибрати файл.')
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
          ? 'Камера ввімкнена. Наведіть QR-код у кадр.'
          : 'Камера ввімкнена. Автоматичне зчитування недоступне — введіть код вручну.',
      )
    } catch {
      if (mountedRef.current && generation === scanGenerationRef.current) {
        shutdownCamera('unavailable')
        setStatus('Камера недоступна. Введіть код або виберіть файл.')
      }
    }
  }
  const scanFile = async (file: File | null) => {
    const Detector = getDetector()
    if (!file || !Detector) {
      setStatus('Розпізнавання QR у файлі недоступне. Введіть код вручну.')
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
      } else setStatus('QR-код у файлі не знайдено. Введіть код вручну.')
    } catch {
      if (mountedRef.current && generation === fileGenerationRef.current)
        setStatus('Не вдалося зчитати QR із файлу. Введіть код вручну.')
    }
  }
  return (
    <section className="mx-auto grid w-full max-w-3xl gap-4">
      <h1 className="text-3xl text-white">QR-сканер</h1>
      <p className="text-neutral-400">
        Дані деталі не показуються до серверної перевірки доступу.
      </p>
      <button
        className="min-h-11 rounded-full border border-white/[0.12] px-4 text-white"
        onClick={() => void enableCamera()}
        type="button"
      >
        Увімкнути камеру
      </button>
      {cameraState === 'active' ? (
        <>
          <video
            aria-label="Камера QR"
            autoPlay
            muted
            onCanPlay={() => setVideoReady(true)}
            playsInline
            ref={videoRef}
          />
          <button onClick={stopCamera} type="button">
            Зупинити камеру
          </button>
        </>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void resolve(code)
        }}
      >
        <label className="grid gap-1 text-sm text-neutral-300">
          QR-код
          <input
            aria-label="QR-код"
            className="rounded border border-white/[0.12] bg-transparent p-2 text-white"
            onChange={(event) => setCode(event.target.value)}
            value={code}
          />
        </label>
        <label className="grid gap-1 text-sm text-neutral-300">
          Файл QR-коду
          <input
            aria-label="Файл QR-коду"
            accept="image/*"
            onChange={(event) => void scanFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button
          className="min-h-11 rounded-full bg-brand px-4 text-black disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          Знайти деталь
        </button>
      </form>
      {status ? (
        <p role="status" className="text-neutral-400">
          {status}
        </p>
      ) : null}
      {part ? (
        <Link
          className="text-brand underline"
          to={`/app/${targetTenant?.slug ?? ''}/parts/${part.id}`}
        >
          {part.name}
        </Link>
      ) : null}
      <p className="text-neutral-500">
        VIN та OEM-декодування недоступні: відповідних серверних операцій немає.
      </p>
    </section>
  )
}
