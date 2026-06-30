// ---------------------------------------------------------------------------
// Calcolo del cartellino mensile a partire dalle timbrature.
//
// Modello "dichiara attività": ogni timbratura indica l'attività che INIZIA in
// quel momento e chiude la precedente. Tipi:
//   • travel = viaggio (pagato, MAI straordinario)
//   • work   = lavoro (ordinario fino alla soglia, poi straordinario)
//   • break  = pausa (NON pagata, non conteggiata)
//   • end    = fine giornata (chiude l'ultimo segmento, durata nulla)
// ('in'/'out' storici sono mappati su work/end per compatibilità.)
//
// Ogni intervallo tra due timbrature è un segmento dell'attività dichiarata
// dalla prima; le ore sono attribuite al giorno in cui sono svolte (fuso orario
// locale), ripartendo i segmenti che superano la mezzanotte. I valori NON sono
// arrotondati: sono il tempo effettivo (precisione al minuto a video, esatto
// nel CSV). Lo straordinario è calcolato SOLO sulle ore di lavoro.
//
// È una stima di supporto: le anomalie (giornata non chiusa, ecc.) sono
// segnalate ma non "indovinate".
// ---------------------------------------------------------------------------

import { clockingChecks } from './clockingFlags.js'

const MS_PER_HOUR = 3600000

const WEEKDAY_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })
const TIME_FMT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const MONTH_FMT = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

// Tipi di attività e relative etichette.
export const ACTIVITIES = {
  travel: { label: 'Viaggio', short: 'Viaggio' },
  work: { label: 'Lavoro', short: 'Lavoro' },
  break: { label: 'Pausa', short: 'Pausa' },
  end: { label: 'Fine giornata', short: 'Fine' },
}

// Mappa eventuali timbrature storiche 'in'/'out' sui nuovi tipi.
export function normalizeKind(kind) {
  if (kind === 'in') return 'work'
  if (kind === 'out') return 'end'
  if (kind === 'travel' || kind === 'work' || kind === 'break' || kind === 'end') return kind
  return 'work'
}

// Chiave giorno YYYY-MM-DD nel fuso orario LOCALE (non UTC).
export function localDateKey(value) {
  const d = new Date(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatTimeLocal(value) {
  if (!value) return ''
  return TIME_FMT.format(new Date(value))
}

export function monthLabel(year, month0) {
  const label = MONTH_FMT.format(new Date(year, month0, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Ore (numero) → "8:05" (precisione al minuto). Non arrotonda a unità di lavoro.
export function hoursToHM(hours) {
  const totalMin = Math.round((hours || 0) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// Ore (numero) → "8,09" con virgola decimale (per Excel italiano / CSV).
export function hoursDecimal(hours) {
  return (hours || 0).toFixed(2).replace('.', ',')
}

// Ripartisce un intervallo tra i giorni locali che attraversa → { 'YYYY-MM-DD': ms }.
function splitIntervalByDay(startMs, endMs) {
  const segs = {}
  let cur = new Date(startMs)
  const end = new Date(endMs)
  while (cur < end) {
    const nextMidnight = new Date(cur)
    nextMidnight.setHours(24, 0, 0, 0)
    const segEnd = nextMidnight < end ? nextMidnight : end
    const key = localDateKey(cur)
    segs[key] = (segs[key] || 0) + (segEnd - cur)
    cur = segEnd
  }
  return segs
}

const NOTE = { open: 'in servizio', unclosed: 'manca Fine giornata' }

// Costruisce il cartellino di UN dipendente per il mese (year, month0 = 0–11).
export function buildEmployeeTimesheet(clockings, year, month0, thresholdHours) {
  const sorted = [...clockings].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))

  const byDay = {} // k -> { work, travel, break } in ms
  const notesByDay = {}
  const addNote = (k, n) => {
    notesByDay[k] = notesByDay[k] || []
    if (!notesByDay[k].includes(n)) notesByDay[k].push(n)
  }
  const addMs = (k, act, ms) => {
    const d = (byDay[k] = byDay[k] || { work: 0, travel: 0, break: 0 })
    d[act] = (d[act] || 0) + ms
  }

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const act = normalizeKind(cur.kind)
    if (act === 'end') continue // chiude soltanto: nessun segmento proprio
    const next = sorted[i + 1]
    if (!next) {
      addNote(localDateKey(cur.punchedAt), NOTE.open) // segmento ancora aperto
      continue
    }
    const s = Date.parse(cur.punchedAt)
    const e = Date.parse(next.punchedAt)
    if (!(e > s)) continue
    if (localDateKey(cur.punchedAt) !== localDateKey(next.punchedAt)) {
      addNote(localDateKey(cur.punchedAt), NOTE.unclosed) // attraversa la mezzanotte
    }
    const segs = splitIntervalByDay(s, e)
    for (const k in segs) addMs(k, act, segs[k])
  }

  // Prima/ultima timbratura e timbratura di "fine" per giorno.
  const firstByDay = {}
  const endByDay = {}
  for (const c of sorted) {
    const k = localDateKey(c.punchedAt)
    if (!firstByDay[k] || c.punchedAt < firstByDay[k]) firstByDay[k] = c.punchedAt
    if (normalizeKind(c.kind) === 'end') {
      if (!endByDay[k] || c.punchedAt > endByDay[k]) endByDay[k] = c.punchedAt
    }
  }

  // Anomalie anti-frode del giorno (Livello 1): confluiscono nelle Note, quindi
  // sono visibili nel cartellino e nel CSV. Solo i controlli "da verificare".
  const verifyByDay = {}
  for (const c of sorted) {
    for (const x of clockingChecks(c)) {
      if (x.level !== 'warn') continue
      const k = localDateKey(c.punchedAt)
      ;(verifyByDay[k] = verifyByDay[k] || new Set()).add(x.label)
    }
  }
  for (const k in verifyByDay) addNote(k, `⚠ verifica: ${[...verifyByDay[k]].join(', ')}`)

  // Clienti del giorno: nomi distinti (in ordine) dalle timbrature di "lavoro".
  // L'etichetta arriva già risolta da chi costruisce il cartellino (clientLabel),
  // oppure è il testo libero (clientName) per i clienti non in anagrafica.
  const clientsByDay = {}
  for (const c of sorted) {
    if (normalizeKind(c.kind) !== 'work') continue
    const lab = c.clientLabel || c.clientName
    if (!lab) continue
    const k = localDateKey(c.punchedAt)
    const list = (clientsByDay[k] = clientsByDay[k] || [])
    if (!list.includes(lab)) list.push(lab)
  }

  const daysInMonth = new Date(year, month0 + 1, 0).getDate()
  const rows = []
  const totals = { work: 0, travel: 0, break: 0, ordinary: 0, overtime: 0, paid: 0 }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month0, d)
    const k = localDateKey(dateObj)
    const dd = byDay[k] || { work: 0, travel: 0, break: 0 }
    const workHours = dd.work / MS_PER_HOUR
    const travelHours = dd.travel / MS_PER_HOUR
    const breakHours = dd.break / MS_PER_HOUR
    const ordinaryHours = Math.min(workHours, thresholdHours)
    const overtimeHours = Math.max(0, workHours - thresholdHours)
    const paidHours = workHours + travelHours
    totals.work += workHours
    totals.travel += travelHours
    totals.break += breakHours
    totals.ordinary += ordinaryHours
    totals.overtime += overtimeHours
    totals.paid += paidHours
    const dow = dateObj.getDay()
    const weekday = WEEKDAY_FMT.format(dateObj)
    rows.push({
      date: k,
      day: d,
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      isWeekend: dow === 0 || dow === 6,
      workHours,
      travelHours,
      breakHours,
      ordinaryHours,
      overtimeHours,
      paidHours,
      start: formatTimeLocal(firstByDay[k]),
      end: formatTimeLocal(endByDay[k] || ''),
      notes: notesByDay[k] || [],
      clients: clientsByDay[k] || [],
    })
  }
  return { rows, totals }
}

// --- CSV --------------------------------------------------------------------

const CSV_SEP = ';'
const CSV_HEADER = [
  'Giorno',
  'Giorno sett.',
  'Inizio',
  'Fine',
  'Ore lavorate',
  'di cui straordinarie',
  'Ore viaggio',
  'Ore pausa',
  'Totale retribuito',
  'Note',
]

function csvRow(values) {
  return values
    .map((v) => {
      const s = String(v ?? '')
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(CSV_SEP)
}

function csvDataRow(r, includeClient) {
  const cells = [
    r.date,
    r.weekday,
    r.start,
    r.end,
    hoursDecimal(r.workHours),
    hoursDecimal(r.overtimeHours),
    hoursDecimal(r.travelHours),
    hoursDecimal(r.breakHours),
    hoursDecimal(r.paidHours),
    r.notes.join(' / '),
  ]
  if (includeClient) cells.push((r.clients || []).join(', '))
  return cells
}

function csvTotalsCells(totals) {
  return [
    hoursDecimal(totals.work),
    hoursDecimal(totals.overtime),
    hoursDecimal(totals.travel),
    hoursDecimal(totals.break),
    hoursDecimal(totals.paid),
  ]
}

// CSV di un singolo dipendente (intestazione + righe giornaliere + totali).
// `meta.includeClient` aggiunge la colonna "Cliente".
export function timesheetToCsv({ rows, totals }, meta) {
  const inc = !!meta.includeClient
  const tail = inc ? ['', ''] : [''] // colonne Note (+ Cliente) nella riga totali
  const lines = []
  lines.push(csvRow(['Dipendente', meta.employeeName]))
  lines.push(csvRow(['Mese', meta.monthLabel]))
  lines.push(csvRow(['Soglia ore ordinarie/giorno (solo lavoro)', hoursDecimal(meta.thresholdHours)]))
  lines.push('')
  lines.push(csvRow(inc ? [...CSV_HEADER, 'Cliente'] : CSV_HEADER))
  for (const r of rows) lines.push(csvRow(csvDataRow(r, inc)))
  lines.push(csvRow(['Totali', '', '', '', ...csvTotalsCells(totals), ...tail]))
  return '\uFEFF' + lines.join('\r\n')
}

// CSV combinato di più dipendenti (colonna Dipendente + totali per persona).
export function combinedTimesheetToCsv(perEmployee, meta) {
  const inc = !!meta.includeClient
  const tail = inc ? ['', ''] : ['']
  const lines = []
  lines.push(csvRow(['Mese', meta.monthLabel]))
  lines.push(csvRow(['Soglia ore ordinarie/giorno (solo lavoro)', hoursDecimal(meta.thresholdHours)]))
  lines.push('')
  lines.push(csvRow(inc ? ['Dipendente', ...CSV_HEADER, 'Cliente'] : ['Dipendente', ...CSV_HEADER]))
  const grand = { work: 0, travel: 0, break: 0, overtime: 0, paid: 0 }
  for (const emp of perEmployee) {
    for (const r of emp.timesheet.rows) lines.push(csvRow([emp.name, ...csvDataRow(r, inc)]))
    const t = emp.timesheet.totals
    lines.push(csvRow([`${emp.name} — TOTALE`, '', '', '', '', ...csvTotalsCells(t), ...tail]))
    lines.push('')
    grand.work += t.work
    grand.travel += t.travel
    grand.break += t.break
    grand.overtime += t.overtime
    grand.paid += t.paid
  }
  lines.push(csvRow(['TOTALE GENERALE', '', '', '', '', ...csvTotalsCells({ ...grand, ordinary: 0 }), ...tail]))
  return '\uFEFF' + lines.join('\r\n')
}

// --- Riepilogo per cliente --------------------------------------------------

// Aggrega le ore di LAVORO per cliente. Per ogni dipendente si percorrono le
// timbrature in ordine: la durata di un segmento di "lavoro" (fino alla
// timbratura successiva) è attribuita al cliente di quel segmento.
// `resolveLabel(clocking)` restituisce il nome visibile del cliente.
// Ritorna un array ordinato per ore decrescenti, con:
//   { key, label, hours, sessions, days, employees: string[] }
export function buildClientSummary(clockings, resolveLabel) {
  const byEmp = {}
  for (const c of clockings) (byEmp[c.employeeId] = byEmp[c.employeeId] || []).push(c)

  const acc = {} // key -> aggregato
  for (const empId in byEmp) {
    const sorted = byEmp[empId].slice().sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]
      if (normalizeKind(cur.kind) !== 'work') continue
      const key = cur.clientId || (cur.clientName ? `free:${cur.clientName}` : null)
      if (!key) continue
      const label = resolveLabel(cur) || cur.clientName || '—'
      const a = (acc[key] = acc[key] || { key, label, hours: 0, sessions: 0, employees: new Set(), days: new Set() })
      a.label = label
      a.sessions += 1
      a.employees.add(empId)
      a.days.add(localDateKey(cur.punchedAt))
      const next = sorted[i + 1]
      if (next) {
        const ms = Date.parse(next.punchedAt) - Date.parse(cur.punchedAt)
        if (ms > 0) a.hours += ms / MS_PER_HOUR
      }
    }
  }

  return Object.values(acc)
    .map((a) => ({ key: a.key, label: a.label, hours: a.hours, sessions: a.sessions, days: a.days.size, employees: [...a.employees] }))
    .sort((x, y) => y.hours - x.hours)
}

// Ore di LAVORO per cliente, suddivise per dipendente (per i grafici).
// Ritorna un array ordinato per ore decrescenti:
//   { key, label, total, byEmp: { [employeeId]: hours } }
export function buildClientEmployeeHours(clockings, resolveLabel) {
  const byEmp = {}
  for (const c of clockings) (byEmp[c.employeeId] = byEmp[c.employeeId] || []).push(c)
  const acc = {}
  for (const empId in byEmp) {
    const sorted = byEmp[empId].slice().sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]
      if (normalizeKind(cur.kind) !== 'work') continue
      const key = cur.clientId || (cur.clientName ? `free:${cur.clientName}` : null)
      if (!key) continue
      const next = sorted[i + 1]
      const ms = next ? Date.parse(next.punchedAt) - Date.parse(cur.punchedAt) : 0
      if (ms <= 0) continue
      const h = ms / MS_PER_HOUR
      const a = (acc[key] = acc[key] || { key, label: resolveLabel(cur) || cur.clientName || '—', total: 0, byEmp: {} })
      a.label = resolveLabel(cur) || a.label
      a.total += h
      a.byEmp[empId] = (a.byEmp[empId] || 0) + h
    }
  }
  return Object.values(acc).sort((x, y) => y.total - x.total)
}

// Estrae i singoli SEGMENTI di lavoro (utile ai grafici, anche filtrati per
// cliente). Per ogni timbratura di "lavoro" calcola la durata fino alla
// successiva e ne riporta cliente, giorno e ore.
// Ritorna: [{ empId, clientKey, clientLabel, day, month, hours }]
export function buildWorkSegments(clockings, resolveLabel) {
  const byEmp = {}
  for (const c of clockings) (byEmp[c.employeeId] = byEmp[c.employeeId] || []).push(c)
  const segs = []
  for (const empId in byEmp) {
    const sorted = byEmp[empId].slice().sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]
      if (normalizeKind(cur.kind) !== 'work') continue
      const next = sorted[i + 1]
      const ms = next ? Date.parse(next.punchedAt) - Date.parse(cur.punchedAt) : 0
      if (ms <= 0) continue
      const clientKey = cur.clientId || (cur.clientName ? `free:${cur.clientName}` : null)
      const day = localDateKey(cur.punchedAt)
      segs.push({
        empId,
        clientKey,
        clientLabel: clientKey ? (resolveLabel ? resolveLabel(cur) : '') || cur.clientName || '—' : null,
        day,
        month: day.slice(0, 7),
        hours: ms / MS_PER_HOUR,
      })
    }
  }
  return segs
}

// CSV del riepilogo per cliente. `nameOf(id)` risolve il nome del dipendente.
export function clientSummaryToCsv(summary, meta, nameOf = (id) => id) {
  const lines = []
  lines.push(csvRow(['Mese', meta.monthLabel]))
  lines.push('')
  lines.push(csvRow(['Cliente', 'Ore lavorate', 'Interventi', 'Giorni', 'Dipendenti']))
  for (const r of summary) {
    lines.push(csvRow([r.label, hoursDecimal(r.hours), r.sessions, r.days, r.employees.map(nameOf).join(', ')]))
  }
  return '﻿' + lines.join('\r\n')
}

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'export'
}

// Avvia il download di un file di testo nel browser.
export function downloadTextFile(filename, content, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
