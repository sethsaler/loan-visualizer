import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { parseLoanInput, type PaymentRow } from './lib/parseLoan'
import defaultLoanActivity from './data/loan-activity.csv?raw'

const SAMPLE = `Period,Principal,Interest,Balance
1,1000.00,2000.00,97000.00
2,1010.00,1990.00,95990.00
3,1020.00,1980.00,94970.00`

const SERVICER_SAMPLE = `Date,Description,Principal,Interest,Fees,Total
01/01/2000,DISBURSEMENT,"$100,000.00",$0.00,$0.00,"$100,000.00"
02/01/2000,PAYMENT,-$500.00,-$500.00,$0.00,"-$1,000.00"`

const fmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function chartData(rows: PaymentRow[], beginBalance: number) {
  const opening = {
    label: 'Opening',
    period: 0,
    Principal: 0,
    Interest: 0,
    Balance: beginBalance,
  }
  const rest = rows.map((r) => ({
    label: r.date ?? String(r.period),
    period: r.period,
    Principal: r.principal,
    Interest: r.interest,
    Balance: r.balance,
  }))
  return [opening, ...rest]
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm shadow-xl">
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 tabular-nums">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-[var(--color-ink)]">{fmt.format(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [text, setText] = useState(() => defaultLoanActivity.trim())

  const result = useMemo(() => parseLoanInput(text), [text])
  const warnings = result.ok ? result.warnings : []

  const rows = result.ok ? result.rows : []
  const data = useMemo(() => {
    if (!result.ok || !rows.length) return []
    return chartData(rows, result.beginBalance)
  }, [rows, result])

  const totals = useMemo(() => {
    if (!result.ok || !rows.length) return null
    const interest = rows.reduce((s, r) => s + r.interest, 0)
    const principal = rows.reduce((s, r) => s + r.principal, 0)
    return {
      interest,
      principal,
      payments: rows.length,
      beginBalance: result.beginBalance,
      endBalance: result.endBalance,
    }
  }, [rows, result])

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setText(reader.result)
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="text-left">
        <p className="mb-1 font-mono text-xs tracking-widest text-[var(--color-accent)] uppercase">
          Loan schedule
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Payment visualizer
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--color-muted)]">
          Default format is your servicer CSV:{' '}
          <code className="rounded bg-[var(--color-surface-elevated)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--color-ink)]">
            Date,Description,Principal,Interest,Fees,Total
          </code>
          — append rows in{' '}
          <code className="rounded bg-[var(--color-surface-elevated)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--color-ink)]">
            src/data/loan-activity.csv
          </code>
          . HTML exports with a DOCTYPE line are fine; the parser finds the header. You can also
          paste a plain amortization table (period, principal, interest, balance). Bars show
          principal and interest paid per payment; the line is principal outstanding. Summary
          cards include beginning and ending balance.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="schedule">
              Schedule data
            </label>
            <textarea
              id="schedule"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="min-h-[220px] w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 font-mono text-sm leading-relaxed text-[var(--color-ink)] outline-none ring-[var(--color-accent)]/30 placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:ring-2"
              placeholder="Date,Description,Principal,Interest,Fees,Total — or amortization CSV…"
            />
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
                Load file
                <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} />
              </label>
              <button
                type="button"
                onClick={() => setText(defaultLoanActivity.trim())}
                className="rounded-lg border border-transparent px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Reload saved activity
              </button>
              <button
                type="button"
                onClick={() => setText(SAMPLE)}
                className="rounded-lg border border-transparent px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Amortization sample
              </button>
              <button
                type="button"
                onClick={() => setText(SERVICER_SAMPLE)}
                className="rounded-lg border border-transparent px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Servicer sample
              </button>
            </div>
          </div>
          {warnings.length > 0 && (
            <ul className="list-inside list-disc text-sm text-amber-400/90">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {!result.ok && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {result.error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {totals && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <dt className="text-xs font-medium text-[var(--color-muted)]">Beginning balance</dt>
                <dd className="mt-1 font-mono text-lg text-[var(--color-balance)]">{fmt.format(totals.beginBalance)}</dd>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <dt className="text-xs font-medium text-[var(--color-muted)]">Ending balance</dt>
                <dd className="mt-1 font-mono text-lg text-[var(--color-balance)]">{fmt.format(totals.endBalance)}</dd>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <dt className="text-xs font-medium text-[var(--color-muted)]">Principal paid (sum)</dt>
                <dd className="mt-1 font-mono text-lg text-[var(--color-ink)]">{fmt.format(totals.principal)}</dd>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <dt className="text-xs font-medium text-[var(--color-muted)]">Interest paid (sum)</dt>
                <dd className="mt-1 font-mono text-lg text-[var(--color-interest)]">{fmt.format(totals.interest)}</dd>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <dt className="text-xs font-medium text-[var(--color-muted)]">Payments</dt>
                <dd className="mt-1 font-mono text-lg text-[var(--color-ink)]">{totals.payments}</dd>
              </div>
            </dl>
          )}

          {result.ok && data.length > 0 && (
            <div className="h-[380px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#2a3441" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#8b9aab', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#2a3441' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: '#8b9aab', fontSize: 11 }}
                    tickFormatter={(v) => `$${Number(v) / 1000}k`}
                    tickLine={false}
                    axisLine={{ stroke: '#2a3441' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: '#fbbf24', fontSize: 11 }}
                    tickFormatter={(v) => `$${Number(v) / 1000}k`}
                    tickLine={false}
                    axisLine={{ stroke: '#2a3441' }}
                  />
                  <Tooltip content={<TooltipContent />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => <span className="text-[var(--color-muted)]">{value}</span>}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="Principal"
                    stackId="pay"
                    fill="var(--color-principal)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="Interest"
                    stackId="pay"
                    fill="var(--color-interest)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="Balance"
                    stroke="var(--color-balance)"
                    strokeWidth={2}
                    dot={false}
                    name="Balance"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
