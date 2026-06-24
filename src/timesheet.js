// ---------------------------------------------------------------------------
// Calcolo del cartellino mensile a partire dalle timbrature (entrate/uscite).
//
// Logica e assunzioni (prototipo):
//   • Le timbrature sono eventi 'in' (entrata) e 'out' (uscita). Vengono
//     accoppiate in ordine cronologico: ogni 'in' si chiude con la 'out'
//     successiva, formando un intervallo di lavoro.
//   • Le ore di ciascun intervallo sono attribuite al giorno in cui sono state
//     effettivamente svolte (fuso orario locale del browser); un turno che
//     supera la mezzanotte viene ripartito tra i due giorni.
//   • Per ogni giorno: ore ordinarie = min(lavorate, soglia giornaliera);
//     straordinarie = max(0, lavorate − soglia). La soglia è impostabile.
//   • I valori NON sono arrotondati a quarti/mezze/ore intere: sono il tempo
//     effettivo (precisione al minuto nelle viste, esatto nel CSV).
//
// È una stima di supporto: anomalie come una entrata senza uscita vengono
// segnalate ma non "indovinate".
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3600000

const WEEKDAY_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })
const TIME_FMT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const MONTH_FMT = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

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

// Accoppia gli eventi in intervalli [start, end] e raccoglie le anomalie.
function pairIntervals(clockings) {
  const sorted = [...clockings].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))
  const intervals = []
  const anomalies = []
  let open = null
  for (const c of sorted) {
    if (c.kind === 'in') {
      if (open) anomalies.push({ type: 'missing_out', at: open.punchedAt })
      open = c
    } else {
      if (open) {
        intervals.push({ start: open.punchedAt, end: c.punchedAt })
        open = null
      } else {
        anomalies.push({ type: 'missing_in', at: c.punchedAt })
      }
    }
  }
  if (open) anomalies.push({ type: 'open', at: open.punchedAt })
  return { intervals, anomalies }
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

const NOTE_BY_TYPE = {
  missing_out: 'manca uscita',
  missing_in: 'manca entrata',
  open: 'ancora in servizio',
}

// Costruisce il cartellino di UN dipendente per il mese (year, month0 = 0–11).
// `clockings` può coprire un intervallo più ampio: si filtra per giorno locale.
export function buildEmployeeTimesheet(clockings, year, month0, thresholdHours) {
  const { intervals, anomalies } = pairIntervals(clockings)

  const workedMsByDay = {}
  for (const iv of intervals) {
    const s = Date.parse(iv.start)
    const e = Date.parse(iv.end)
    if (!(e > s)) continue
    const segs = splitIntervalByDay(s, e)
    for (const k in segs) workedMsByDay[k] = (workedMsByDay[k] || 0) + segs[k]
  }

  const firstInByDay = {}
  const lastOutByDay = {}
  for (const c of clockings) {
    const k = localDateKey(c.punchedAt)
    if (c.kind === 'in') {
      if (!firstInByDay[k] || c.punchedAt < firstInByDay[k]) firstInByDay[k] = c.punchedAt
    } else {
      if (!lastOutByDay[k] || c.punchedAt > lastOutByDay[k]) lastOutByDay[k] = c.punchedAt
    }
  }

  const notesByDay = {}
  for (const a of anomalies) {
    const k = localDateKey(a.at)
    const note = NOTE_BY_TYPE[a.type]
    if (!note) continue
    notesByDay[k] = notesByDay[k] || []
    if (!notesByDay[k].includes(note)) notesByDay[k].push(note)
  }

  const daysInMonth = new Date(year, month0 + 1, 0).getDate()
  const rows = []
  const totals = { worked: 0, ordinary: 0, overtime: 0 }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month0, d)
    const k = localDateKey(dateObj)
    const workedHours = (workedMsByDay[k] || 0) / MS_PER_HOUR
    const ordinaryHours = Math.min(workedHours, thresholdHours)
    const overtimeHours = Math.max(0, workedHours - thresholdHours)
    totals.worked += workedHours
    totals.ordinary += ordinaryHours
    totals.overtime += overtimeHours
    const dow = dateObj.getDay()
    const weekday = WEEKDAY_FMT.format(dateObj)
    rows.push({
      date: k,
      day: d,
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      isWeekend: dow === 0 || dow === 6,
      workedHours,
      ordinaryHours,
      overtimeHours,
      firstIn: formatTimeLocal(firstInByDay[k]),
      lastOut: formatTimeLocal(lastOutByDay[k]),
      notes: notesByDay[k] || [],
    })
  }
  return { rows, totals }
}

// --- CSV --------------------------------------------------------------------

const CSV_SEP = ';'
const CSV_HEADER = ['Giorno', 'Giorno sett.', 'Entrata', 'Uscita', 'Ore lavorate', 'Ore ordinarie', 'Ore straordinarie', 'Note']

function csvRow(values) {
  return values
    .map((v) => {
      const s = String(v ?? '')
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(CSV_SEP)
}

// CSV di un singolo dipendente (intestazione + righe giornaliere + totali).
export function timesheetToCsv({ rows, totals }, meta) {
  const lines = []
  lines.push(csvRow(['Dipendente', meta.employeeName]))
  lines.push(csvRow(['Mese', meta.monthLabel]))
  lines.push(csvRow(['Soglia ore ordinarie/giorno', hoursDecimal(meta.thresholdHours)]))
  lines.push('')
  lines.push(csvRow(CSV_HEADER))
  for (const r of rows) {
    lines.push(csvRow([
      r.date,
      r.weekday,
      r.firstIn,
      r.lastOut,
      hoursDecimal(r.workedHours),
      hoursDecimal(r.ordinaryHours),
      hoursDecimal(r.overtimeHours),
      r.notes.join(' / '),
    ]))
  }
  lines.push(csvRow(['Totali', '', '', '', hoursDecimal(totals.worked), hoursDecimal(totals.ordinary), hoursDecimal(totals.overtime), '']))
  return '\uFEFF' + lines.join('\r\n')
}

// CSV combinato di più dipendenti (colonna Dipendente + totali per persona).
export function combinedTimesheetToCsv(perEmployee, meta) {
  const lines = []
  lines.push(csvRow(['Mese', meta.monthLabel]))
  lines.push(csvRow(['Soglia ore ordinarie/giorno', hoursDecimal(meta.thresholdHours)]))
  lines.push('')
  lines.push(csvRow(['Dipendente', ...CSV_HEADER]))
  const grand = { worked: 0, ordinary: 0, overtime: 0 }
  for (const emp of perEmployee) {
    for (const r of emp.timesheet.rows) {
      lines.push(csvRow([
        emp.name,
        r.date,
        r.weekday,
        r.firstIn,
        r.lastOut,
        hoursDecimal(r.workedHours),
        hoursDecimal(r.ordinaryHours),
        hoursDecimal(r.overtimeHours),
        r.notes.join(' / '),
      ]))
    }
    const t = emp.timesheet.totals
    lines.push(csvRow([`${emp.name} — TOTALE`, '', '', '', '', hoursDecimal(t.worked), hoursDecimal(t.ordinary), hoursDecimal(t.overtime), '']))
    lines.push('')
    grand.worked += t.worked
    grand.ordinary += t.ordinary
    grand.overtime += t.overtime
  }
  lines.push(csvRow(['TOTALE GENERALE', '', '', '', '', hoursDecimal(grand.worked), hoursDecimal(grand.ordinary), hoursDecimal(grand.overtime), '']))
  return '\uFEFF' + lines.join('\r\n')
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
