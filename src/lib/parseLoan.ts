import Papa from 'papaparse'
import {
  type ServicerCols,
  type ServicerTxn,
  isLikelyServicerBodySample,
  parseServicerLayoutFromHeaders,
  parseServicerRow,
  sortServicerTxns,
} from './servicerParse'

export type PaymentRow = {
  period: number
  date: string | null
  principal: number
  interest: number
  totalPayment: number
  balance: number
}

export type ParseResult =
  | {
      ok: true
      rows: PaymentRow[]
      warnings: string[]
      /** Principal outstanding before the first payment row (after draws / cap. interest in servicer path). */
      beginBalance: number
      /** Principal outstanding after the last payment row. */
      endBalance: number
    }
  | { ok: false; error: string }

type LoanField = 'period' | 'date' | 'principal' | 'interest' | 'balance' | 'totalPayment'

const HEADER_ALIASES: Record<string, LoanField> = {
  '#': 'period',
  no: 'period',
  num: 'period',
  number: 'period',
  payment_number: 'period',
  paymentno: 'period',
  period: 'period',
  month: 'period',
  installment: 'period',
  date: 'date',
  payment_date: 'date',
  due: 'date',
  principal: 'principal',
  princ: 'principal',
  principal_paid: 'principal',
  principal_payment: 'principal',
  interest: 'interest',
  int: 'interest',
  interest_paid: 'interest',
  balance: 'balance',
  remaining: 'balance',
  ending_balance: 'balance',
  loan_balance: 'balance',
  remaining_balance: 'balance',
  total: 'totalPayment',
  payment: 'totalPayment',
  total_payment: 'totalPayment',
  payment_amount: 'totalPayment',
  amount: 'totalPayment',
  pmt: 'totalPayment',
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[#]/g, '')
    .replace(/[\s/-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function parseMoney(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const cleaned = t.replace(/[$€£¥]/g, '').replace(/,/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function mapHeaders(headers: string[]): Map<number, LoanField | null> {
  const m = new Map<number, LoanField | null>()
  headers.forEach((raw, i) => {
    const key = normalizeHeader(raw)
    const field =
      HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/_/g, '')] ?? null
    m.set(i, field)
  })
  return m
}

function rowToObject(
  cells: string[],
  colMap: Map<number, LoanField | null>,
): Partial<Record<LoanField, string>> {
  const o: Partial<Record<LoanField, string>> = {}
  cells.forEach((cell, i) => {
    const field = colMap.get(i)
    if (field) o[field] = cell
  })
  return o
}

function buildRows(
  objects: Partial<Record<LoanField, string>>[],
  _warnings: string[],
): PaymentRow[] | null {
  const rows: PaymentRow[] = []
  let prevBalance: number | null = null

  for (let i = 0; i < objects.length; i++) {
    const o = objects[i]
    const periodRaw = o.period?.trim()
    const period = periodRaw ? Number.parseInt(periodRaw, 10) : i + 1
    if (!Number.isFinite(period) || period < 0) continue

    const principal = parseMoney(o.principal ?? '') ?? NaN
    const interest = parseMoney(o.interest ?? '') ?? NaN
    let balance = parseMoney(o.balance ?? '') ?? NaN
    const totalPayment = parseMoney(o.totalPayment ?? '') ?? NaN

    let p = principal
    let int = interest
    let bal = balance
    let total = totalPayment

    if (!Number.isFinite(total) && Number.isFinite(p) && Number.isFinite(int)) {
      total = p + int
    }
    if (!Number.isFinite(p) && Number.isFinite(total) && Number.isFinite(int)) {
      p = total - int
    }
    if (!Number.isFinite(int) && Number.isFinite(total) && Number.isFinite(p)) {
      int = total - p
    }

    if (!Number.isFinite(p) && prevBalance !== null && Number.isFinite(bal) && Number.isFinite(int)) {
      p = prevBalance - bal - int
    }
    if (!Number.isFinite(int) && prevBalance !== null && Number.isFinite(bal) && Number.isFinite(p)) {
      int = prevBalance - bal - p
    }

    if (!Number.isFinite(total) && Number.isFinite(p) && Number.isFinite(int)) {
      total = p + int
    }

    if (
      !Number.isFinite(p) ||
      !Number.isFinite(int) ||
      !Number.isFinite(bal) ||
      !Number.isFinite(total)
    ) {
      continue
    }

    const date = o.date?.trim() || null
    rows.push({
      period: Number.isFinite(period) ? period : rows.length + 1,
      date,
      principal: p,
      interest: int,
      totalPayment: total,
      balance: bal,
    })
    prevBalance = bal
  }

  if (rows.length === 0) return null
  return rows
}

function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) || []).length
  const commas = (line.match(/,/g) || []).length
  if (tabs > commas) return '\t'
  return ','
}

/** Strip HTML DOCTYPE and any junk before `Date,Description,...` or first data row. */
function normalizeLoanExportText(raw: string): string {
  const s = raw.trim()
  const headerMatch = /Date\s*,\s*Description\s*,\s*Principal/i.exec(s)
  if (headerMatch && headerMatch.index !== undefined && headerMatch.index > 0) {
    return s.slice(headerMatch.index).trim()
  }
  return s
}

function tryParseServicerExport(trimmed: string): ParseResult | null {
  const normalized = normalizeLoanExportText(trimmed)
  const firstLine = normalized.split(/\r?\n/)[0] ?? ''
  const delim = detectDelimiter(firstLine)
  const parsed = Papa.parse<string[]>(normalized, {
    skipEmptyLines: 'greedy',
    delimiter: delim,
    header: false,
  })

  const data = (parsed.data as string[][]).filter((row: string[]) =>
    row.some((c: string) => c.trim() !== ''),
  )
  if (data.length === 0) return null

  const firstRow = data[0].map((c: string) => c.trim())
  const looksLikeHeader = firstRow.some((cell: string) => {
    const n = parseMoney(cell)
    return n === null && /[a-z]/i.test(cell)
  })

  let cols: ServicerCols
  let body: string[][]

  if (looksLikeHeader) {
    const layout = parseServicerLayoutFromHeaders(firstRow)
    if (!layout) return null
    cols = layout
    body = data.slice(1)
  } else {
    if (!isLikelyServicerBodySample(data)) return null
    cols =
      data[0].length >= 6
        ? { dateIdx: 0, typeIdx: 1, principalIdx: 2, interestIdx: 3, otherIdx: 4, totalIdx: 5 }
        : { dateIdx: 0, typeIdx: 1, principalIdx: 2, interestIdx: 3, otherIdx: null, totalIdx: 4 }
    body = data
  }

  const txns: ServicerTxn[] = []
  let fileIndex = 0
  for (const cells of body) {
    const t = parseServicerRow(cells, cols, fileIndex++)
    if (t) txns.push(t)
  }
  if (txns.length === 0) return null

  const sorted = sortServicerTxns(txns)

  // Principal outstanding: +principal adds draws; negative principal on payments reduces it.
  // Interest paid (negative in export) does not change principal balance; chart uses abs().
  let balance = 0
  const out: PaymentRow[] = []
  let period = 1
  let beginBalance: number | undefined

  for (const r of sorted) {
    const kind = r.type.toLowerCase()
    if (kind === 'disbursement') {
      balance += r.principal
      continue
    }
    if (kind === 'capitalized interest') {
      const cap = r.principal + r.interest + r.other
      if (cap !== 0) balance += cap
      continue
    }
    if (kind === 'adjustment') {
      continue
    }
    if (kind === 'payment') {
      if (beginBalance === undefined) beginBalance = balance
      balance += r.principal
      const pr = Math.abs(r.principal)
      const int = Math.abs(r.interest)
      out.push({
        period: period++,
        date: r.date,
        principal: pr,
        interest: int,
        totalPayment: pr + int,
        balance: Math.max(0, balance),
      })
    }
  }

  if (out.length === 0 || beginBalance === undefined) return null

  const warnings = [
    'Loan activity format (Date, Description, Principal, Interest, Fees, Total): +principal = draws, −principal = principal paid; +interest = accrued, −interest = interest paid. Balance is principal outstanding after draws, capitalized interest, and payments.',
  ]

  const endBalance = out[out.length - 1].balance

  return { ok: true, rows: out, warnings, beginBalance, endBalance }
}

export function parseLoanInput(raw: string): ParseResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Paste a CSV or table: columns for principal, interest, and balance (plus optional payment # and date).' }
  }

  const servicer = tryParseServicerExport(trimmed)
  if (servicer) return servicer

  const firstLine = trimmed.split(/\r?\n/)[0] ?? ''
  const delim = detectDelimiter(firstLine)
  const parsed = Papa.parse<string[]>(trimmed, {
    skipEmptyLines: 'greedy',
    delimiter: delim,
    header: false,
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false, error: parsed.errors[0]?.message ?? 'Could not parse input.' }
  }

  const data = (parsed.data as string[][]).filter((row: string[]) =>
    row.some((c: string) => c.trim() !== ''),
  )
  if (data.length === 0) {
    return { ok: false, error: 'No rows found.' }
  }

  const warnings: string[] = []
  const firstRow = data[0].map((c: string) => c.trim())
  const looksLikeHeader = firstRow.some((cell: string) => {
    const n = parseMoney(cell)
    return n === null && /[a-z]/i.test(cell)
  })

  let headerRow: string[]
  let body: string[][]
  if (looksLikeHeader) {
    headerRow = firstRow
    body = data.slice(1)
  } else {
    warnings.push('No header row detected; using positions: 1=period, 2=principal, 3=interest, 4=balance (optional 5=total payment).')
    headerRow = ['period', 'principal', 'interest', 'balance', 'total']
    body = data
  }

  const colMap = mapHeaders(headerRow)
  const objects = body.map((cells: string[]) => rowToObject(cells, colMap))
  const rows = buildRows(objects, warnings)

  if (!rows || rows.length === 0) {
    return {
      ok: false,
      error:
        'Could not find numeric principal, interest, and balance (or enough data to infer them). Try including headers like: Period, Principal, Interest, Balance.',
    }
  }

  const beginBalance = rows[0].balance + rows[0].principal
  const endBalance = rows[rows.length - 1].balance

  return { ok: true, rows, warnings, beginBalance, endBalance }
}
