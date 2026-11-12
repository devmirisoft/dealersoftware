export function formatDisplayOrderNumber(value: unknown, orderDate?: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  // Seeded numbers (MS/26/A001) are already final.
  if (/^MS\//i.test(raw)) return raw

  const existing = /^(?:DS|OM)\/(\d{2}-\d{2})\/DMS-(.+)$/i.exec(raw)
  const yearRange = existing?.[1] || resolveFinancialYearRange(orderDate)
  const source = existing?.[2] || raw.split('/').pop()?.replace(/^DMS-/i, '') || raw
  const digits = source.replace(/\D/g, '')
  const sequence = (digits ? digits.replace(/^0+(?=\d)/, '') : source).padStart(3, '0')

  return `DS/${yearRange}/DMS-${sequence}`
}

/** The order's stored number (MS/26/A001); only an order without one gets a number formatted from its id. */
export function orderNumberOf(order: { order_number?: unknown; order_id?: unknown } | null | undefined) {
  return String(order?.order_number ?? '').trim() || formatDisplayOrderNumber(order?.order_id)
}

function resolveFinancialYearRange(orderDate?: unknown) {
  const yearMatch = String(orderDate ?? '').match(/\b(20\d{2})\b/)
  const year = Number(yearMatch ? yearMatch[1] : new Date().getFullYear())
  return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`
}
