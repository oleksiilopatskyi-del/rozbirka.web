const unitFormatter = new Intl.NumberFormat('uk-UA', {
  maximumFractionDigits: 1,
})

/** File size in the unit a person would say out loud. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} Б`
  if (bytes < 1024 * 1024) return `${unitFormatter.format(bytes / 1024)} КБ`
  return `${unitFormatter.format(bytes / (1024 * 1024))} МБ`
}
