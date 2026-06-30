import { useEffect, useMemo, useState } from 'react'
import { getClockingsInRange, getUserMap } from '../data/api.js'
import { puo } from '../permissions.js'
import { buildEmployeeTimesheet, buildWorkSegments, hoursToHM, monthLabel } from '../timesheet.js'

const PALETTE = [
  '#0d3b66', '#2e9e5b', '#ee964b', '#1f7a8c', '#b7791f', '#6b46c1',
  '#d64545', '#0a7d6b', '#9b287b', '#3d5a80', '#c1666b', '#5b8c5a',
]
const ACT_COLORS = { work: '#2e9e5b', travel: '#ee964b', break: '#9aa6b2' }

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function parseMonth(v) { const [y, m] = v.split('-').map(Number); return { year: y, month0: m - 1 } }
function shortMonth(y, m0) { return new Date(y, m0, 1).toLocaleString('it', { month: 'short' }) }

export default function TimbratureCharts({ user, permConfig = null, clients = [] }) {
  const seeAll = puo(user, 'dati.tutti', permConfig)
  const [month, setMonth] = useState(currentMonthValue)
  const [clientFilter, setClientFilter] = useState('all')
  const [clockings, setClockings] = useState([])
  const [compClockings, setCompClockings] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const { year, month0 } = parseMonth(month)
  const clientsById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  // Dati del mese selezionato.
  useEffect(() => {
    let alive = true
    setLoading(true)
    const from = new Date(year, month0, 1); from.setDate(from.getDate() - 1)
    const to = new Date(year, month0 + 1, 1); to.setDate(to.getDate() + 1)
    Promise.all([getClockingsInRange(from.toISOString(), to.toISOString()), getUserMap()])
      .then(([list, map]) => { if (!alive) return; setClockings(list); setUserMap(map); setLoading(false) })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [year, month0])

  // Dati degli ultimi 6 mesi (per il confronto mensile).
  useEffect(() => {
    let alive = true
    const from = new Date(year, month0 - 5, 1)
    const to = new Date(year, month0 + 1, 1); to.setDate(to.getDate() + 1)
    getClockingsInRange(from.toISOString(), to.toISOString())
      .then((list) => alive && setCompClockings(list))
      .catch(() => {})
    return () => { alive = false }
  }, [year, month0])

  const nameOf = (id) => userMap[id]?.name || id
  const inScope = (id) => seeAll || (userMap[id]?.managerIds || []).includes(user.id)
  const resolveLabel = (c) => c.clientName || clientsById[c.clientId]?.name || ''

  const monthSegs = useMemo(() => {
    const scoped = clockings.filter((c) => inScope(c.employeeId))
    return buildWorkSegments(scoped, resolveLabel).filter((s) => s.month === month)
  }, [clockings, userMap, month]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clienti presenti nei dati (per il menu del filtro).
  const clientOptions = useMemo(() => {
    const m = {}
    for (const s of monthSegs) if (s.clientKey) m[s.clientKey] = s.clientLabel
    return Object.entries(m).map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [monthSegs])

  // Ore per cliente (suddivise per dipendente) — sempre da tutti i clienti.
  const clientHours = useMemo(() => {
    const acc = {}
    for (const s of monthSegs) {
      if (!s.clientKey) continue
      const a = (acc[s.clientKey] = acc[s.clientKey] || { key: s.clientKey, label: s.clientLabel, total: 0, byEmp: {} })
      a.total += s.hours
      a.byEmp[s.empId] = (a.byEmp[s.empId] || 0) + s.hours
    }
    return Object.values(acc).sort((x, y) => y.total - x.total)
  }, [monthSegs])

  // Segmenti filtrati per cliente (per dipendente/giorno/media/confronto).
  const fsegs = useMemo(
    () => (clientFilter === 'all' ? monthSegs : monthSegs.filter((s) => s.clientKey === clientFilter)),
    [monthSegs, clientFilter]
  )

  const perEmp = useMemo(() => {
    const m = {}
    for (const s of fsegs) {
      const e = (m[s.empId] = m[s.empId] || { id: s.empId, name: nameOf(s.empId), work: 0, days: new Set() })
      e.work += s.hours
      e.days.add(s.day)
    }
    return Object.values(m)
      .map((e) => ({ ...e, days: e.days.size, avg: e.work / Math.max(1, e.days.size) }))
      .sort((a, b) => b.work - a.work)
  }, [fsegs]) // eslint-disable-line react-hooks/exhaustive-deps

  const perDay = useMemo(() => {
    const m = {}
    for (const s of fsegs) { const d = Number(s.day.slice(8, 10)); m[d] = (m[d] || 0) + s.hours }
    return m
  }, [fsegs])

  // Ripartizione lavoro/viaggio/pausa (complessiva del mese, non filtrata per cliente).
  const activity = useMemo(() => {
    const byEmp = {}
    for (const c of clockings.filter((x) => inScope(x.employeeId))) (byEmp[c.employeeId] = byEmp[c.employeeId] || []).push(c)
    const a = { work: 0, travel: 0, break: 0 }
    for (const id in byEmp) {
      const ts = buildEmployeeTimesheet(byEmp[id], year, month0, 8)
      a.work += ts.totals.work; a.travel += ts.totals.travel; a.break += ts.totals.break
    }
    return a
  }, [clockings, userMap, year, month0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Confronto: ore di lavoro per gli ultimi 6 mesi (rispettando il filtro cliente).
  const monthly = useMemo(() => {
    const segs = buildWorkSegments(compClockings.filter((c) => inScope(c.employeeId)), resolveLabel)
    const out = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month0 - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const hours = segs
        .filter((s) => s.month === key && (clientFilter === 'all' || s.clientKey === clientFilter))
        .reduce((sum, s) => sum + s.hours, 0)
      out.push({ key, label: shortMonth(d.getFullYear(), d.getMonth()), hours, current: key === month })
    }
    return out
  }, [compClockings, userMap, year, month0, clientFilter, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const empColor = useMemo(() => {
    const ids = new Set(perEmp.map((e) => e.id))
    for (const c of clientHours) for (const id in c.byEmp) ids.add(id)
    const sorted = [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    return Object.fromEntries(sorted.map((id, i) => [id, PALETTE[i % PALETTE.length]]))
  }, [perEmp, clientHours, userMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientHoursShown = clientFilter === 'all' ? clientHours : clientHours.filter((c) => c.key === clientFilter)
  const hasData = activity.work + activity.travel + activity.break > 0
  const filterLabel = clientFilter === 'all' ? null : (clientOptions.find((c) => c.key === clientFilter)?.label || '')

  function exportPng() {
    const svg = buildExportSvg({
      title: `GreenEco · Presenze — ${monthLabel(year, month0)}${filterLabel ? ` · ${filterLabel}` : ''}`,
      clientHours: clientHoursShown, perEmp, activity, perDay, monthly, empColor, nameOf, year, month0,
    })
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = EXPORT_W * scale
      canvas.height = EXPORT_H * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => {
        if (!b) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = `grafici_presenze_${month}${clientFilter !== 'all' ? '_filtrato' : ''}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }, 'image/png')
    }
    img.src = url
  }

  return (
    <div className="board charts">
      <div className="ts-toolbar">
        <label className="ts-field">
          <span>Mese</span>
          <input type="month" value={month} max={currentMonthValue()} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="ts-field ts-field-grow">
          <span>Cliente</span>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">Tutti i clienti</option>
            {clientOptions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <div className="ts-actions">
          <button className="btn-ghost" onClick={exportPng} disabled={!hasData}>⬇ Esporta PNG</button>
        </div>
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : !hasData ? (
        <div className="empty"><p>Nessun dato di presenza per {monthLabel(year, month0)}.</p></div>
      ) : (
        <>
          {filterLabel && <p className="muted small">Filtrato sul cliente <strong>{filterLabel}</strong> (la ripartizione lavoro/viaggio/pausa resta complessiva).</p>}
          <div className="chart-legend">
            {Object.keys(empColor).map((id) => (
              <span key={id} className="legend-item"><span className="legend-dot" style={{ background: empColor[id] }} />{nameOf(id)}</span>
            ))}
          </div>

          <div className="charts-grid">
            <ChartCard title="Ore lavorate per cliente" sub="suddivise per dipendente">
              <StackedClients data={clientHoursShown} empColor={empColor} nameOf={nameOf} />
            </ChartCard>
            <ChartCard title="Ore lavorate per dipendente" sub={filterLabel ? `su ${filterLabel}` : undefined}>
              <EmployeeBars data={perEmp} field="work" empColor={empColor} fmt={hoursToHM} />
            </ChartCard>
            <ChartCard title="Media ore/giorno per dipendente" sub="sui giorni effettivamente lavorati">
              <EmployeeBars data={[...perEmp].sort((a, b) => b.avg - a.avg)} field="avg" empColor={empColor} fmt={hoursToHM} />
            </ChartCard>
            <ChartCard title="Ripartizione del tempo" sub="complessiva · lavoro · viaggio · pausa">
              <ActivityDonut activity={activity} />
            </ChartCard>
            <ChartCard title="Ore lavorate per giorno" sub={monthLabel(year, month0)}>
              <DailyBars perDay={perDay} year={year} month0={month0} />
            </ChartCard>
            <ChartCard title="Confronto mensile" sub="ore lavorate · ultimi 6 mesi">
              <MonthlyBars data={monthly} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

function ChartCard({ title, sub, children }) {
  return (
    <section className="chart-card">
      <h3 className="chart-title">{title}{sub && <span className="chart-sub"> · {sub}</span>}</h3>
      {children}
    </section>
  )
}

function StackedClients({ data, empColor, nameOf }) {
  const top = data.slice(0, 12)
  const max = Math.max(1, ...top.map((c) => c.total))
  if (top.length === 0) return <p className="muted small">Nessuna ora associata a un cliente.</p>
  return (
    <div className="hbars">
      {top.map((c) => {
        const segs = Object.entries(c.byEmp).sort((a, b) => b[1] - a[1])
        return (
          <div className="hbar-row" key={c.key}>
            <span className="hbar-label" title={c.label}>{c.label}</span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${(c.total / max) * 100}%` }}>
                {segs.map(([id, h]) => (
                  <span key={id} className="hbar-seg" style={{ width: `${(h / c.total) * 100}%`, background: empColor[id] || '#888' }} title={`${nameOf(id)}: ${hoursToHM(h)}`} />
                ))}
              </span>
            </span>
            <span className="hbar-value">{hoursToHM(c.total)}</span>
          </div>
        )
      })}
    </div>
  )
}

function EmployeeBars({ data, field, empColor, fmt }) {
  const max = Math.max(1, ...data.map((e) => e[field]))
  if (data.length === 0) return <p className="muted small">Nessun dato.</p>
  return (
    <div className="hbars">
      {data.map((e) => (
        <div className="hbar-row" key={e.id}>
          <span className="hbar-label" title={e.name}>{e.name}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(e[field] / max) * 100}%`, background: empColor[e.id] || 'var(--navy)' }} />
          </span>
          <span className="hbar-value">{fmt(e[field])}</span>
        </div>
      ))}
    </div>
  )
}

function ActivityDonut({ activity }) {
  const segs = [
    { label: 'Lavoro', value: activity.work, color: ACT_COLORS.work },
    { label: 'Viaggio', value: activity.travel, color: ACT_COLORS.travel },
    { label: 'Pausa', value: activity.break, color: ACT_COLORS.break },
  ].filter((s) => s.value > 0)
  const total = segs.reduce((s, x) => s + x.value, 0) || 1
  const R = 54, C = 2 * Math.PI * R
  let off = 0
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Ripartizione del tempo">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#eef1f5" strokeWidth="22" />
        {segs.map((s) => {
          const len = (s.value / total) * C
          const el = (<circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />)
          off += len
          return el
        })}
        <text x="70" y="66" textAnchor="middle" className="donut-c1">{hoursToHM(total)}</text>
        <text x="70" y="82" textAnchor="middle" className="donut-c2">totali</text>
      </svg>
      <div className="donut-legend">
        {segs.map((s) => (
          <div key={s.label} className="legend-item">
            <span className="legend-dot" style={{ background: s.color }} />
            {s.label} <strong>{hoursToHM(s.value)}</strong> <span className="muted">({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DailyBars({ perDay, year, month0 }) {
  const days = new Date(year, month0 + 1, 0).getDate()
  const max = Math.max(1, ...Object.values(perDay))
  return (
    <div className="vbars">
      {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
        const h = perDay[d] || 0
        const dow = new Date(year, month0, d).getDay()
        const weekend = dow === 0 || dow === 6
        return (
          <span key={d} className="vbar-col" title={`Giorno ${d}: ${hoursToHM(h)}`}>
            <span className="vbar" style={{ height: `${(h / max) * 100}%`, background: weekend ? '#c4ccd6' : 'var(--green)' }} />
            <span className="vbar-x">{d}</span>
          </span>
        )
      })}
    </div>
  )
}

function MonthlyBars({ data }) {
  const max = Math.max(1, ...data.map((m) => m.hours))
  return (
    <div className="vbars vbars-month">
      {data.map((m) => (
        <span key={m.key} className="vbar-col" title={`${m.label}: ${hoursToHM(m.hours)}`}>
          <span className="vbar-num">{m.hours > 0 ? Math.round(m.hours) : ''}</span>
          <span className="vbar" style={{ height: `${(m.hours / max) * 100}%`, background: m.current ? 'var(--navy)' : 'var(--green)' }} />
          <span className="vbar-x">{m.label}</span>
        </span>
      ))}
    </div>
  )
}

// --- Export PNG: composizione SVG (nessuna libreria) ------------------------
const EXPORT_W = 1200
const EXPORT_H = 920
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function svgText(x, y, s, { size = 13, weight = 400, fill = '#1c2430', anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`
}
function panel(x, y, w, h, title) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="#d8dee6"/>` + svgText(x + 16, y + 26, title, { size: 14, weight: 700, fill: '#0d3b66' })
}
function hbarsSvg(x, y, w, rows, { color }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const lblW = 130, valW = 52, trackX = x + lblW, trackW = w - lblW - valW
  let out = ''
  rows.slice(0, 8).forEach((r, i) => {
    const ry = y + i * 26
    out += svgText(x, ry + 12, r.label.length > 20 ? r.label.slice(0, 19) + '…' : r.label, { size: 12 })
    out += `<rect x="${trackX}" y="${ry + 2}" width="${trackW}" height="14" rx="5" fill="#eef2f7"/>`
    if (Array.isArray(r.segs)) {
      let sx = trackX
      const fullW = (r.value / max) * trackW
      r.segs.forEach((sg) => { const sw = (sg.value / r.value) * fullW; out += `<rect x="${sx}" y="${ry + 2}" width="${Math.max(0, sw)}" height="14" rx="2" fill="${sg.color}"/>`; sx += sw })
    } else {
      out += `<rect x="${trackX}" y="${ry + 2}" width="${(r.value / max) * trackW}" height="14" rx="5" fill="${r.color || color}"/>`
    }
    out += svgText(x + w, ry + 12, r.text, { size: 11.5, anchor: 'end', fill: '#5b6470' })
  })
  return out
}
function donutSvg(cx, cy, activity) {
  const segs = [
    { label: 'Lavoro', value: activity.work, color: ACT_COLORS.work },
    { label: 'Viaggio', value: activity.travel, color: ACT_COLORS.travel },
    { label: 'Pausa', value: activity.break, color: ACT_COLORS.break },
  ].filter((s) => s.value > 0)
  const total = segs.reduce((s, x) => s + x.value, 0) || 1
  const R = 52, C = 2 * Math.PI * R
  let off = 0, out = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#eef1f5" stroke-width="22"/>`
  for (const s of segs) {
    const len = (s.value / total) * C
    out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`
    off += len
  }
  out += svgText(cx, cy + 4, hoursToHM(total), { size: 16, weight: 700, fill: '#0d3b66', anchor: 'middle' })
  segs.forEach((s, i) => {
    const ly = cy - 30 + i * 22
    out += `<rect x="${cx + 80}" y="${ly - 9}" width="11" height="11" rx="2" fill="${s.color}"/>`
    out += svgText(cx + 98, ly, `${s.label}  ${hoursToHM(s.value)} (${Math.round((s.value / total) * 100)}%)`, { size: 12 })
  })
  return out
}
function vbarsSvg(x, y, w, h, items, { color, current }) {
  const max = Math.max(1, ...items.map((it) => it.value))
  const n = items.length, gap = 4, bw = (w - gap * (n - 1)) / n
  let out = ''
  items.forEach((it, i) => {
    const bx = x + i * (bw + gap)
    const bh = (it.value / max) * h
    out += `<rect x="${bx}" y="${y + h - bh}" width="${Math.max(1, bw)}" height="${bh}" rx="2" fill="${current && it.current ? '#0d3b66' : color}"/>`
    out += svgText(bx + bw / 2, y + h + 13, it.label, { size: 9, anchor: 'middle', fill: '#5b6470' })
  })
  return out
}

function buildExportSvg({ title, clientHours, perEmp, activity, perDay, monthly, empColor, nameOf, year, month0 }) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_W}" height="${EXPORT_H}" viewBox="0 0 ${EXPORT_W} ${EXPORT_H}">`
  s += `<rect width="${EXPORT_W}" height="${EXPORT_H}" fill="#f4f7fb"/>`
  s += `<rect x="0" y="0" width="${EXPORT_W}" height="56" fill="#0d3b66"/>`
  s += svgText(28, 36, title, { size: 20, weight: 700, fill: '#ffffff' })

  const colW = 560, rowH = 270, x1 = 24, x2 = 616, y1 = 80, y2 = 360, y3 = 640
  // Pannello 1: per cliente
  s += panel(x1, y1, colW, rowH, 'Ore lavorate per cliente')
  s += hbarsSvg(x1 + 16, y1 + 46, colW - 32, clientHours.slice(0, 8).map((c) => ({
    label: c.label, value: c.total, text: hoursToHM(c.total),
    segs: Object.entries(c.byEmp).sort((a, b) => b[1] - a[1]).map(([id, h]) => ({ value: h, color: empColor[id] || '#888' })),
  })), {})
  // Pannello 2: per dipendente
  s += panel(x2, y1, colW, rowH, 'Ore lavorate per dipendente')
  s += hbarsSvg(x2 + 16, y1 + 46, colW - 32, perEmp.slice(0, 8).map((e) => ({ label: e.name, value: e.work, text: hoursToHM(e.work), color: empColor[e.id] || '#0d3b66' })), {})
  // Pannello 3: media ore/giorno
  s += panel(x1, y2, colW, rowH, 'Media ore/giorno per dipendente')
  s += hbarsSvg(x1 + 16, y2 + 46, colW - 32, [...perEmp].sort((a, b) => b.avg - a.avg).slice(0, 8).map((e) => ({ label: e.name, value: e.avg, text: hoursToHM(e.avg), color: empColor[e.id] || '#0d3b66' })), {})
  // Pannello 4: donut
  s += panel(x2, y2, colW, rowH, 'Ripartizione del tempo')
  s += donutSvg(x2 + 90, y2 + 150, activity)
  // Pannello 5: per giorno
  s += panel(x1, y3, colW, rowH - 30, 'Ore lavorate per giorno')
  {
    const days = new Date(year, month0 + 1, 0).getDate()
    const items = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), value: perDay[i + 1] || 0 }))
    s += vbarsSvg(x1 + 16, y3 + 46, colW - 32, 150, items, { color: '#2e9e5b' })
  }
  // Pannello 6: confronto mensile
  s += panel(x2, y3, colW, rowH - 30, 'Confronto mensile (ultimi 6 mesi)')
  s += vbarsSvg(x2 + 24, y3 + 46, colW - 48, 150, monthly.map((m) => ({ label: m.label, value: m.hours, current: m.current })), { color: '#2e9e5b', current: true })

  s += '</svg>'
  return s
}
