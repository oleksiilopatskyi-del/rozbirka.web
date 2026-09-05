export const normalizeScanCode = (value: string): string => {
  const code = value.trim()
  try {
    const url = new URL(code)
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith('/scan/')
    ) {
      return decodeURIComponent(url.pathname.slice(6))
    }
  } catch {
    // Raw QR values are valid scanner input.
  }
  return code
}
