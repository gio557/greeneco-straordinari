import { useEffect, useMemo, useState } from 'react'
import { getClockingsInRange, getUserMap } from '../data/api.js'
import { puo } from '../permissions.js'
import { buildEmployeeTimesheet, buildClientEmployeeHours, hoursToHM, monthLabel } from '../timesheet.js'

const PALETTE = [
  '#0d3b66', '#2e9e5b', '#ee964b', '#1f7a8c', '#b7791f', '#6b46c1',
  '#d64545', '#0a7d6b', '#9b287b', '#3d5a80', '#c1666b', '#5b8c5a',
]

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function parseMonth(v) { const [y, m] = v.split('-').map(Number); return { year: y, month0: m - 1 } }

// Cruscotto grafico delle presenze, per il mese scelto. Grafici disegnati con
// SVG/CSS inline (nessuna libreria esterna).
export default function TimbratureCharts({ user, permConfig = null, clients = [] }) {
  const seeAll = puo(user, 'dati.tutti', permConfig)
  const [month, setMonth] = useState(currentMonthValue)
  const [clockings, setClockings] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const { year, month0 } = parseMonth(month)
  const clientsById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

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

  const nameOf = (id) => userMap[id]?.name || id
  const inScope = (id) => seeAll || (userMap[id]?.managerIds || []).includes(user.id)
  const resolveLabel = (c) => c.clientName || clientsById[c.clientId]?.name || ''

  const scoped = useMemo(() => clockings.filter((c) => inScope(c.employeeId)), [clockings, userMap]) // eslint-disable-line react-hooks/exhaustive-deps
  const clientHours = useMemo(() => buildClientEmployeeHours(scoped, resolveLabel), [scoped, clientsById]) // eslint-disable-line react-hooks/exhaustive-deps

  const { perEmp, perDay, activity } = useMemo(() => {
    const byEmp = {}
    for (const c of scoped) (byEmp[c.employeeId] = byEmp[c.employeeId] || []).push(c)
    const perEmp = []
    const perDay = {}
    const activity = { work: 0, travel: 0, break: 0 }
    for (const id in byEmp) {
      const ts = buildEmployeeTimesheet(byEmp[id], year, month0, 8)
      if (ts.totals.work + ts.totals.travel + ts.totals.break > 0) {
        perEmp.push({ id, name: nameOf(id), work: ts.totals.work })
      }
      activity.work += ts.totals.work
      activity.travel += ts.totals.travel
      activity.break += ts.totals.break
      for (const r of ts.rows) if (r.workHours > 0) perDay[r.day] = (perDay[r.day] || 0) + r.workHours
    }
    perEmp.sort((a, b) => b.work - a.work)
    return { perEmp, perDay, activity }
  }, [scoped, userMap, year, month0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Colore stabile per dipendente (ordine alfabetico).
  const empColor = useMemo(() => {
    const ids = new Set(perEmp.map((e) => e.id))
    for (const c of clientHours) for (const id in c.byEmp) ids.add(id)
    const sorted = [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    return Object.fromEntries(sorted.map((id, i) => [id, PALETTE[i % PALETTE.length]]))
  }, [perEmp, clientHours, userMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = activity.work + activity.travel + activity.break > 0

  return (
    <div className="board charts">
      <div className="ts-toolbar">
        <label className="ts-field">
          <span>Mese</span>
          <input type="month" value={month} max={currentMonthValue()} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : !hasData ? (
        <div className="empty"><p>Nessun dato di presenza per {monthLabel(year, month0)}.</p></div>
      ) : (
        <>
          {/* Legenda dipendenti, condivisa dai grafici a barre. */}
          <div className="chart-legend">
            {Object.keys(empColor).map((id) => (
              <span key={id} className="legend-item">
                <span className="legend-dot" style={{ background: empColor[id] }} />{nameOf(id)}
              </span>
            ))}
          </div>

          <div className="charts-grid">
            <ChartCard title="Ore lavorate per cliente" sub="suddivise per dipendente">
              <StackedClients data={clientHours} empColor={empColor} nameOf={nameOf} />
            </ChartCard>

            <ChartCard title="Ore lavorate per dipendente">
              <EmployeeBars data={perEmp} empColor={empColor} />
            </ChartCard>

            <ChartCard title="Ripartizione del tempo" sub="lavoro · viaggio · pausa">
              <ActivityDonut activity={activity} />
            </ChartCard>

            <ChartCard title="Ore lavorate per giorno" sub={monthLabel(year, month0)}>
              <DailyBars perDay={perDay} year={year} month0={month0} />
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

// Barre orizzontali impilate: una per cliente, segmenti per dipendente.
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
                  <span
                    key={id}
                    className="hbar-seg"
                    style={{ width: `${(h / c.total) * 100}%`, background: empColor[id] || '#888' }}
                    title={`${nameOf(id)}: ${hoursToHM(h)}`}
                  />
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

function EmployeeBars({ data, empColor }) {
  const max = Math.max(1, ...data.map((e) => e.work))
  return (
    <div className="hbars">
      {data.map((e) => (
        <div className="hbar-row" key={e.id}>
          <span className="hbar-label" title={e.name}>{e.name}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(e.work / max) * 100}%`, background: empColor[e.id] || 'var(--navy)' }} />
          </span>
          <span className="hbar-value">{hoursToHM(e.work)}</span>
        </div>
      ))}
    </div>
  )
}

function ActivityDonut({ activity }) {
  const segs = [
    { label: 'Lavoro', value: activity.work, color: '#2e9e5b' },
    { label: 'Viaggio', value: activity.travel, color: '#ee964b' },
    { label: 'Pausa', value: activity.break, color: '#9aa6b2' },
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
          const el = (
            <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="22"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />
          )
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
  const arr = Array.from({ length: days }, (_, i) => i + 1)
  return (
    <div className="vbars">
      {arr.map((d) => {
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
