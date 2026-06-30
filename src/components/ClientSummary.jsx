import { useEffect, useMemo, useState } from 'react'
import { getClockingsInRange, getUserMap } from '../data/api.js'
import { puo } from '../permissions.js'
import {
  buildClientSummary,
  clientSummaryToCsv,
  hoursToHM,
  hoursDecimal,
  monthLabel,
  downloadTextFile,
} from '../timesheet.js'

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function parseMonth(value) {
  const [y, m] = value.split('-').map(Number)
  return { year: y, month0: m - 1 }
}

// Riepilogo delle presenze RAGGRUPPATE PER CLIENTE, per il mese scelto: ore di
// lavoro, numero di interventi, giorni e dipendenti coinvolti. Ordinabile.
export default function ClientSummary({ user, permConfig = null, clients = [] }) {
  const seeAll = puo(user, 'dati.tutti', permConfig)
  const canExport = puo(user, 'timbrature.export', permConfig)
  const [month, setMonth] = useState(currentMonthValue)
  const [clockings, setClockings] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState({ by: 'hours', dir: 'desc' })

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
  const inScope = (empId) => seeAll || (userMap[empId]?.managerIds || []).includes(user.id)
  const resolveLabel = (c) => c.clientName || clientsById[c.clientId]?.name || ''

  const summary = useMemo(() => {
    const scoped = clockings.filter((c) => inScope(c.employeeId))
    const rows = buildClientSummary(scoped, resolveLabel)
    const dir = sort.dir === 'asc' ? 1 : -1
    const cmp = {
      label: (a, b) => a.label.localeCompare(b.label) * dir,
      hours: (a, b) => (a.hours - b.hours) * dir,
      sessions: (a, b) => (a.sessions - b.sessions) * dir,
      days: (a, b) => (a.days - b.days) * dir,
    }[sort.by]
    return rows.slice().sort(cmp)
  }, [clockings, userMap, clientsById, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalHours = useMemo(() => summary.reduce((s, r) => s + r.hours, 0), [summary])

  function toggleSort(by) {
    setSort((s) => (s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: by === 'label' ? 'asc' : 'desc' }))
  }
  const arrow = (by) => (sort.by === by ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')

  function download() {
    const csv = clientSummaryToCsv(summary, { monthLabel: monthLabel(year, month0) }, nameOf)
    downloadTextFile(`clienti_${month}.csv`, csv)
  }

  return (
    <div className="board">
      <div className="ts-toolbar">
        <label className="ts-field">
          <span>Mese</span>
          <input type="month" value={month} max={currentMonthValue()} onChange={(e) => setMonth(e.target.value)} />
        </label>
        {canExport && (
          <div className="ts-actions">
            <button className="btn-ghost" onClick={download} disabled={summary.length === 0}>⬇ Scarica CSV</button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : summary.length === 0 ? (
        <div className="empty"><p>Nessuna timbratura di lavoro con cliente in questo mese.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('label')}>Cliente{arrow('label')}</th>
                <th className="num sortable" onClick={() => toggleSort('hours')}>Ore lavorate{arrow('hours')}</th>
                <th className="num sortable" onClick={() => toggleSort('sessions')}>Interventi{arrow('sessions')}</th>
                <th className="num sortable" onClick={() => toggleSort('days')}>Giorni{arrow('days')}</th>
                <th>Dipendenti</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.key}>
                  <td data-label="Cliente"><strong>{r.label}</strong></td>
                  <td data-label="Ore lavorate" className="num" title={`${hoursDecimal(r.hours)} ore`}>{hoursToHM(r.hours)}</td>
                  <td data-label="Interventi" className="num">{r.sessions}</td>
                  <td data-label="Giorni" className="num">{r.days}</td>
                  <td data-label="Dipendenti">{r.employees.map(nameOf).join(', ')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ts-total-row">
                <td><strong>Totale</strong></td>
                <td className="num"><strong>{hoursToHM(totalHours)}</strong></td>
                <td></td><td></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
