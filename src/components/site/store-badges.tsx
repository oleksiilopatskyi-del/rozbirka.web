import type { SVGProps } from 'react'

const APP_STORE_URL = 'https://apps.apple.com/ua/app/rozbirka/id6762130912'

export function AppStoreBadge() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Завантажити в App Store"
      className="flex min-h-12 items-center gap-2.5 rounded-full bg-black px-4 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08]"
    >
      <AppleLogo className="size-7 text-white" />
      <StoreBadgeText line1="Available on the" line2="App Store" />
    </a>
  )
}

export function GooglePlayBadge() {
  return (
    <div
      aria-label="Google Play — скоро"
      className="flex min-h-12 items-center gap-2.5 rounded-full bg-black/70 px-4 text-white/70 ring-1 ring-white/10"
    >
      <GooglePlayLogo className="size-6 opacity-70" />
      <StoreBadgeText line1="Google Play" line2="Скоро" />
    </div>
  )
}

function StoreBadgeText({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="text-[10px] tracking-wide text-neutral-300">
        {line1}
      </span>
      <span className="mt-0.5 text-[15px] font-semibold text-white">
        {line2}
      </span>
    </div>
  )
}

function AppleLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.13.74 2.8.78.96-.2 1.88-.91 3.04-.83 1.38.11 2.42.66 3.1 1.55-2.79 1.68-2.24 5.46.48 6.46-.55 1.45-1.27 2.91-2.42 5.01zM12.03 7.25c-.16-2.5 1.99-4.39 4.15-4.36.26 2.71-2.49 4.66-4.15 4.36z" />
    </svg>
  )
}

function GooglePlayLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M3.5 2.2C3.2 2.4 3 2.8 3 3.4v17.2c0 .6.2 1 .5 1.2l9.45-9.4z"
        fill="#34A853"
      />
      <path
        d="M16.3 9l-3.35 3.4 3.35 3.4 4.1-2.35c1.13-.65 1.13-2.45 0-3.1z"
        fill="#FBBC04"
      />
      <path
        d="M3.5 2.2c.32-.22.78-.27 1.25 0L16.3 9l-3.35 3.4z"
        fill="#4285F4"
      />
      <path
        d="M3.5 21.8c.32.22.78.27 1.25 0L16.3 15l-3.35-3.4z"
        fill="#EA4335"
      />
    </svg>
  )
}
