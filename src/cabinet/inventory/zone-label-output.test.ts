import { expect, it, vi } from 'vitest'
import { buildZoneLabelHtml } from './zone-label-output'

const qr = vi.hoisted(() => ({ toString: vi.fn() }))

vi.mock('qrcode', () => ({ default: qr }))

it('encodes the raw zone code and renders a thermal-label print sheet', async () => {
  qr.toString.mockResolvedValue('<svg>zone</svg>')

  const html = await buildZoneLabelHtml([
    {
      id: 'zone-1',
      qrCode: 'ZONE-1',
      zoneName: 'A < 1',
      zoneCode: 'A1',
      warehouseName: 'Основний',
    },
  ])

  expect(qr.toString).toHaveBeenCalledWith(
    'ZONE-1',
    expect.objectContaining({ type: 'svg', errorCorrectionLevel: 'M' }),
  )
  expect(html).toContain('@page { size: 40mm 58mm; margin: 0; }')
  expect(html).toContain('A &lt; 1')
  expect(html).toContain('<svg>zone</svg>')
})
