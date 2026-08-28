import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { ScannerScreen } from './ScannerScreen'
import { normalizeScanCode } from './scan-code'

const scannerMocks = vi.hoisted(() => ({
  resolveQr: vi
    .fn<
      (
        code: string,
        options: { signal: AbortSignal },
      ) => Promise<{ id: string; name: string }>
    >()
    .mockResolvedValue({ id: 'part-1', name: 'Bumper' }),
}))
vi.mock('@/api/scanners', () => ({
  scannersApi: {
    resolveQr: scannerMocks.resolveQr,
    decodeVin: { available: false },
    decodeOem: { available: false },
  },
}))
vi.mock('../CabinetContext', () => ({
  useCabinet: () => ({ targetTenant: { slug: 'yard' } }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  scannerMocks.resolveQr.mockClear()
})

it('keeps manual and file fallbacks visible after camera denial', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  expect(
    await screen.findByText(
      'Камера недоступна. Введіть код або виберіть файл.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('QR-код')).toBeInTheDocument()
  expect(screen.getByLabelText('Файл QR-коду')).toBeInTheDocument()
})

it('does not reveal a part until manual code submission completes tenant-authorized lookup', async () => {
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('QR-код'), {
    target: { value: 'QR-123' },
  })
  expect(screen.queryByText('Bumper')).not.toBeInTheDocument()
  fireEvent.submit(
    screen.getByRole('button', { name: 'Знайти деталь' }).closest('form')!,
  )
  expect(await screen.findByText('Bumper')).toBeInTheDocument()
  expect(scannerMocks.resolveQr).toHaveBeenCalledWith(
    'QR-123',
    expect.any(Object),
  )
})

it('stops a stream that resolves after the scanner unmounts', async () => {
  let resolveStream: ((stream: MediaStream) => void) | undefined
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        resolveStream = resolve
      }),
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  const stop = vi.fn()
  const { unmount } = render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  unmount()
  resolveStream?.({ getTracks: () => [{ stop }] } as unknown as MediaStream)
  await Promise.resolve()

  expect(stop).toHaveBeenCalledOnce()
})

it('normalizes an own-origin scan link before tenant-authorized lookup', () => {
  expect(
    normalizeScanCode(`${window.location.origin}/scan/QR-123%2Fpart`),
  ).toBe('QR-123/part')
  expect(normalizeScanCode(' QR-123 ')).toBe('QR-123')
})

it('remains usable for manual QR resolution after StrictMode remounts effects', async () => {
  render(
    <StrictMode>
      <MemoryRouter>
        <ScannerScreen definition={{} as never} />
      </MemoryRouter>
    </StrictMode>,
  )
  fireEvent.change(screen.getByLabelText('QR-код'), {
    target: { value: 'QR-strict' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Знайти деталь' }))
  expect(await screen.findByText('Bumper')).toBeInTheDocument()
})

it('attaches an accepted stream after the camera video mounts', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const stream = { getTracks: () => [] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  const video = await screen.findByLabelText<HTMLVideoElement>('Камера QR')
  expect(video.srcObject).toBe(stream)
})

it('waits for post-mount video readiness and repeats live detection until a QR resolves', async () => {
  const detect = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ rawValue: 'QR-live' }])
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = detect
    },
  )
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const stream = { getTracks: () => [] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  const video = await screen.findByLabelText('Камера QR')
  expect(detect).not.toHaveBeenCalled()

  fireEvent.canPlay(video)
  await vi.waitFor(() => expect(detect).toHaveBeenCalledTimes(1))
  expect(frames).toHaveLength(1)
  frames.shift()?.(0)

  expect(await screen.findByText('Bumper')).toBeInTheDocument()
  expect(scannerMocks.resolveQr).toHaveBeenCalledWith(
    'QR-live',
    expect.any(Object),
  )
})

it('cancels the repeated live detector loop when the camera stops', async () => {
  const detect = vi.fn().mockResolvedValue([])
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = detect
    },
  )
  const cancelAnimationFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(71))
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const stop = vi.fn()
  const stream = {
    getTracks: () => [{ stop }],
  } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  fireEvent.canPlay(await screen.findByLabelText('Камера QR'))
  await vi.waitFor(() => expect(detect).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Зупинити камеру' }))

  expect(stop).toHaveBeenCalledOnce()
  expect(cancelAnimationFrame).toHaveBeenCalledWith(71)
})

it('resolves a QR detected from a selected file', async () => {
  const detect = vi.fn().mockResolvedValue([{ rawValue: 'QR-file' }])
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = detect
    },
  )
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )
  const file = new File(['qr'], 'qr.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Файл QR-коду'), {
    target: { files: [file] },
  })

  expect(await screen.findByText('Bumper')).toBeInTheDocument()
  expect(detect).toHaveBeenCalledWith(file)
  expect(scannerMocks.resolveQr).toHaveBeenCalledWith(
    'QR-file',
    expect.any(Object),
  )
})

it('stops the active camera after a successful manual lookup', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const stop = vi.fn()
  const stream = {
    getTracks: () => [{ stop }],
  } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  await screen.findByLabelText('Камера QR')
  fireEvent.change(screen.getByLabelText('QR-код'), {
    target: { value: 'QR-manual' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Знайти деталь' }))

  expect(await screen.findByText('Bumper')).toBeInTheDocument()
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
  expect(screen.queryByLabelText('Камера QR')).not.toBeInTheDocument()
})

it('stops the active camera after a successful file lookup', async () => {
  const detect = vi.fn().mockResolvedValue([{ rawValue: 'QR-file' }])
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = detect
    },
  )
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const stop = vi.fn()
  const stream = {
    getTracks: () => [{ stop }],
  } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  await screen.findByLabelText('Камера QR')
  fireEvent.change(screen.getByLabelText('Файл QR-коду'), {
    target: { files: [new File(['qr'], 'qr.png', { type: 'image/png' })] },
  })

  expect(await screen.findByText('Bumper')).toBeInTheDocument()
  expect(stop).toHaveBeenCalledOnce()
  expect(screen.queryByLabelText('Камера QR')).not.toBeInTheDocument()
})

it('stops the old stream when a camera retry is denied', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const stop = vi.fn()
  const getUserMedia = vi
    .fn()
    .mockResolvedValueOnce({
      getTracks: () => [{ stop }],
    })
    .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))
  await screen.findByLabelText('Камера QR')
  fireEvent.click(screen.getByRole('button', { name: 'Увімкнути камеру' }))

  expect(
    await screen.findByText(
      'Камера недоступна. Введіть код або виберіть файл.',
    ),
  ).toBeInTheDocument()
  expect(stop).toHaveBeenCalledOnce()
})

it('rejects a delayed camera generation after a newer retry is denied', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  let finishFirst: ((stream: MediaStream) => void) | undefined
  const getUserMedia = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          finishFirst = resolve
        }),
    )
    .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  const stop = vi.fn()
  render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )

  const enable = screen.getByRole('button', { name: 'Увімкнути камеру' })
  fireEvent.click(enable)
  fireEvent.click(enable)
  expect(
    await screen.findByText(
      'Камера недоступна. Введіть код або виберіть файл.',
    ),
  ).toBeInTheDocument()
  await act(async () => {
    finishFirst?.({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    await Promise.resolve()
  })

  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
  expect(screen.queryByLabelText('Камера QR')).not.toBeInTheDocument()
})

it('ignores delayed file detection after unmount and aborts an active lookup', async () => {
  let finishDetection: ((results: { rawValue: string }[]) => void) | undefined
  const detect = vi.fn(
    () =>
      new Promise<{ rawValue: string }[]>((resolve) => {
        finishDetection = resolve
      }),
  )
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = detect
    },
  )
  let finishLookup: ((value: { id: string; name: string }) => void) | undefined
  scannerMocks.resolveQr.mockImplementationOnce(
    (_code, options: { signal: AbortSignal }) =>
      new Promise((resolve) => {
        finishLookup = resolve
        expect(options.signal.aborted).toBe(false)
      }),
  )
  const first = render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('QR-код'), {
    target: { value: 'QR-pending' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Знайти деталь' }))
  const signal = scannerMocks.resolveQr.mock.calls[0]?.[1].signal
  first.unmount()
  expect(signal?.aborted).toBe(true)
  finishLookup?.({ id: 'part-1', name: 'Bumper' })

  const second = render(
    <MemoryRouter>
      <ScannerScreen definition={{} as never} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Файл QR-коду'), {
    target: { files: [new File(['qr'], 'late.png', { type: 'image/png' })] },
  })
  second.unmount()
  finishDetection?.([{ rawValue: 'QR-late' }])
  await Promise.resolve()

  expect(scannerMocks.resolveQr).toHaveBeenCalledTimes(1)
})
