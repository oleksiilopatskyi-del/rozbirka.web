import QRCode from 'qrcode'

export interface PrintableSticker {
  id: string
  name: string
  qrCode: string
  quantity: number
  carLabel: string | null
}

export interface RenderedSticker extends PrintableSticker {
  resumeUrl: string
  qrSvg: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const stickerResumeUrl = (qrCode: string, origin: string) =>
  new URL(`/scan/${encodeURIComponent(qrCode)}`, origin).href

export const buildStickerSvg = (resumeUrl: string) =>
  QRCode.toString(resumeUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  })

export const renderStickers = async (
  stickers: PrintableSticker[],
  origin: string,
): Promise<RenderedSticker[]> =>
  Promise.all(
    stickers.flatMap((sticker) =>
      Array.from({ length: sticker.quantity }, async () => {
        const resumeUrl = stickerResumeUrl(sticker.qrCode, origin)
        return {
          ...sticker,
          quantity: 1,
          resumeUrl,
          qrSvg: await buildStickerSvg(resumeUrl),
        }
      }),
    ),
  )

export const buildStickerHtml = async (
  stickers: PrintableSticker[],
  origin: string,
) => {
  const rendered = await renderStickers(stickers, origin)
  const cards = rendered
    .map(
      (sticker) => `<article class="sticker">
  <div class="qr" role="img" aria-label="QR-код ${escapeHtml(sticker.name)}">${sticker.qrSvg}</div>
  <strong>${escapeHtml(sticker.name)}</strong>
  ${sticker.carLabel ? `<span>${escapeHtml(sticker.carLabel)}</span>` : ''}
  <a href="${escapeHtml(sticker.resumeUrl)}">${escapeHtml(sticker.resumeUrl)}</a>
</article>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Стікери Rozbirka</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;padding:12mm;display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
    .sticker{break-inside:avoid;border:1px solid #222;padding:4mm;display:grid;gap:2mm;text-align:center}
    .qr svg{display:block;width:100%;height:auto}
    a{font-size:8px;overflow-wrap:anywhere}
    @media print{body{padding:0}.sticker{page-break-inside:avoid}}
  </style>
</head>
<body>${cards}</body>
</html>`
}
