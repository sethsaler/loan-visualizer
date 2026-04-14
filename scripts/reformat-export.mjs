#!/usr/bin/env node
import * as fs from 'node:fs'

function parseUsDate(s) {
  const [m, d, y] = s.trim().split('/').map(Number)
  if (!m || !d || !y) return 0
  return new Date(y, m - 1, d).getTime()
}

function money(s) {
  const n = Number.parseFloat(String(s).replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const raw = fs.readFileSync(0, 'utf8')
const lines = raw.split(/\r?\n/).filter((l) => l.trim())

const rows = []
let fileIndex = 0
for (const line of lines) {
  const p = line.split('\t')
  if (p.length < 6) continue
  const [date, type, c3, c4, c5, c6] = p
  rows.push({
    fileIndex: fileIndex++,
    date: date.trim(),
    type: type.trim(),
    principal: money(c3),
    interest: money(c4),
    other: money(c5),
    total: money(c6),
  })
}

rows.sort((a, b) => {
  const ta = parseUsDate(a.date)
  const tb = parseUsDate(b.date)
  if (ta !== tb) return ta - tb
  return b.fileIndex - a.fileIndex
})

let balance = 0
const enriched = []
for (const r of rows) {
  const t = r.type.toLowerCase()
  if (t === 'disbursement') {
    balance += r.principal
    enriched.push({ ...r, balanceAfter: balance, include: false })
    continue
  }
  if (t === 'capitalized interest') {
    const cap = r.principal + r.interest + r.other
    if (cap !== 0) balance += cap
    enriched.push({ ...r, balanceAfter: balance, include: false })
    continue
  }
  if (t === 'adjustment') {
    enriched.push({ ...r, balanceAfter: balance, include: false })
    continue
  }
  if (t === 'payment') {
    balance += r.principal
    enriched.push({ ...r, balanceAfter: balance, include: true })
    continue
  }
  enriched.push({ ...r, balanceAfter: balance, include: false })
}

const payments = enriched.filter((x) => x.include)
let n = 1
const out = ['Period,Date,Principal,Interest,Balance']
for (const p of payments) {
  const pr = Math.abs(p.principal)
  const int = Math.abs(p.interest)
  out.push(
    `${n},${p.date},${pr.toFixed(2)},${int.toFixed(2)},${Math.max(0, p.balanceAfter).toFixed(2)}`,
  )
  n += 1
}

console.log(out.join('\n'))
