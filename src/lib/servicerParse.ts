/**
 * Loan servicer export: Date, Description (or Type), Principal, Interest, Fees (or Escrow), Total.
 *
 * Sign convention (typical exports):
 * - Positive principal: new loan principal (draws / disbursements).
 * - Negative principal: principal paid toward the loan (reduces outstanding principal).
 * - Positive interest: interest accrued on balances (e.g. before payment or when capitalized).
 * - Negative interest: interest paid (cash outflow; does not directly change principal balance).
 *
 * Running principal balance is updated from signed principal on each row (draws add, paydowns
 * subtract). Capitalized-interest rows add net accrued principal+interest+other when non-zero.
 */

export type ServicerTxn = {
  fileIndex: number
  date: string
  type: string
  principal: number
  interest: number
  other: number
  total: number
}

const SERVICER_TYPES = new Set([
  'payment',
  'disbursement',
  'capitalized interest',
  'adjustment',
])

export function looksLikeUsDate(s: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s.trim())
}

function parseUsDateMs(s: string): number {
  const [m, d, y] = s.trim().split('/').map(Number)
  if (!m || !d || !y) return NaN
  return new Date(y, m - 1, d).getTime()
}

export function parseMoneyLoose(s: string): number {
  const n = Number.parseFloat(String(s).replace(/[$€£¥]/g, '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

export type ServicerCols = {
  dateIdx: number
  typeIdx: number
  principalIdx: number
  interestIdx: number
  otherIdx: number | null
  totalIdx: number | null
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[#]/g, '')
    .replace(/[\s/-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function parseServicerLayoutFromHeaders(headers: string[]): ServicerCols | null {
  const norm = headers.map(normalizeHeader)
  const n = headers.length
  if (n < 5) return null

  const dateIdx = norm.findIndex(
    (h) => h === 'date' || h.includes('posted') || h === 'transaction_date' || h === 'posting_date',
  )
  const typeIdx = norm.findIndex(
    (h) =>
      h === 'type' ||
      h === 'description' ||
      h === 'transaction_type' ||
      (h.includes('transaction') && !h.includes('date')),
  )
  const principalIdx = norm.findIndex(
    (h) => h.includes('principal') && !h.includes('balance') && !h.includes('payment'),
  )
  const interestIdx = norm.findIndex(
    (h) => (h.includes('interest') || h === 'int') && !h.includes('capital'),
  )
  const escrowIdx = norm.findIndex(
    (h) => h.includes('escrow') || h === 'fees' || h === 'other' || h === 'misc',
  )
  const totalIdx = norm.findIndex(
    (h) =>
      h === 'total' ||
      h === 'amount' ||
      h.includes('payment_amount') ||
      (h.includes('payment') && h !== 'principal_payment'),
  )

  if (dateIdx >= 0 && typeIdx >= 0 && principalIdx >= 0 && interestIdx >= 0) {
    const other =
      escrowIdx >= 0 ? escrowIdx : n >= 6 ? 4 : null
    const total = totalIdx >= 0 ? totalIdx : n >= 6 ? 5 : n - 1
    return {
      dateIdx,
      typeIdx,
      principalIdx,
      interestIdx,
      otherIdx: other,
      totalIdx: total,
    }
  }

  const orderedServicerHeader =
    norm[1] === 'type' ||
    norm[1] === 'description' ||
    norm[0] === 'date' ||
    norm[0] === 'posting_date' ||
    norm[0]?.includes('posted') ||
    norm[0] === 'transaction_date'

  if (n >= 6 && orderedServicerHeader) {
    return { dateIdx: 0, typeIdx: 1, principalIdx: 2, interestIdx: 3, otherIdx: 4, totalIdx: 5 }
  }
  if (n === 5 && orderedServicerHeader) {
    return { dateIdx: 0, typeIdx: 1, principalIdx: 2, interestIdx: 3, otherIdx: null, totalIdx: 4 }
  }
  return null
}

function rowMaxIdx(c: ServicerCols): number {
  return Math.max(
    c.dateIdx,
    c.typeIdx,
    c.principalIdx,
    c.interestIdx,
    c.otherIdx ?? -1,
    c.totalIdx ?? -1,
  )
}

export function parseServicerRow(
  cells: string[],
  cols: ServicerCols,
  fileIndex: number,
): ServicerTxn | null {
  if (cells.length <= rowMaxIdx(cols)) return null
  const date = cells[cols.dateIdx]?.trim() ?? ''
  const type = cells[cols.typeIdx]?.trim() ?? ''
  if (!looksLikeUsDate(date)) return null
  const principal = parseMoneyLoose(cells[cols.principalIdx] ?? '')
  const interest = parseMoneyLoose(cells[cols.interestIdx] ?? '')
  const other =
    cols.otherIdx != null ? parseMoneyLoose(cells[cols.otherIdx] ?? '') : 0
  const total =
    cols.totalIdx != null ? parseMoneyLoose(cells[cols.totalIdx] ?? '') : 0
  return { fileIndex, date, type, principal, interest, other, total }
}

export function isLikelyServicerBodySample(rows: string[][]): boolean {
  let scored = 0
  const sample = rows.slice(0, Math.min(25, rows.length))
  for (const row of sample) {
    if (row.length < 5) continue
    const d = row[0]?.trim() ?? ''
    const t = row[1]?.trim().toLowerCase() ?? ''
    if (!looksLikeUsDate(d)) continue
    if (SERVICER_TYPES.has(t)) scored++
  }
  if (rows.length === 1) return scored === 1
  return scored >= 2
}

export function sortServicerTxns(txns: ServicerTxn[]): ServicerTxn[] {
  return [...txns].sort((a, b) => {
    const ta = parseUsDateMs(a.date)
    const tb = parseUsDateMs(b.date)
    if (ta !== tb) return ta - tb
    return b.fileIndex - a.fileIndex
  })
}
