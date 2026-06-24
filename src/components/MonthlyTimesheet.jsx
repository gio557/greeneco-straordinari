import { useEffect, useMemo, useState } from 'react'
import { getClockingsInRange, getUserMap } from '../data/api.js'
import {
  buildEmployeeTimesheet,
  timesheetToCsv,
  combinedTimesheetToCsv,
  downloadTextFile,
  hoursToHM,
  hoursDecimal,
  monthLabel,
  slugify,
} from '../timesheet.js'

const DEFAULT_THRESHOLD = 8

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseMonth(value) {
  const [y, m] = value.split('-').map(Number)
  return { year: y, month0: m - 1 }
}

// Riepilogo mensile delle presenze: una tabella per dipendente (giorno per
// giorno) con ore ordinarie e straordinarie, scaricabile in CSV.
export default function MonthlyTimesheet({ user }) {
  const isAdmin = user.role === 'admin'
  const [month, setMonth] = useState(currentMonthValue)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [selectedEmp, setSelectedEmp] = useState('')
  const [clockings, setClockings] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)

  const { year, month0 } = parseMonth(month)

  useEffect(() => {
    let alive = true
    setLoading(true)
    // Intervallo leggermente più ampio del mese (±1 giorno) per coprire i turni
    // a cavallo della mezzanotte e le differenze di fuso; il raggruppamento per
    // giorno avviene poi lato client.
    const from = new Date(year, month0, 1)
    from.setDate(from.getDate() - 1)
    const to = new Date(year, month0 + 1, 1)
    to.setDate(to.getDate() + 1)
    Promise.all([
      getClockingsInRange(from.toISOString(), to.toISOString()),
      getUserMap(),
    ]).then(([list, map]) => {
      if (!alive) return
      setClockings(list)
      setUserMap(map)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [year, month0])

  // Dipendenti visibili: l'admin vede tutti (escluso se stesso), il manager
  // solo il proprio team.
  const employees = useMemo(() => {
    return Object.values(userMap)
      .filter((u) => (isAdmin ? u.role !== 'admin' : u.managerId === user.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [userMap, isAdmin, user.id])

  // Allinea la selezione quando cambia l'elenco.
  useEffect(() => {
    if (employees.length === 0) {
      setSelectedEmp('')
    } else if (!employees.some((e) => e.id === selectedEmp)) {
      setSelectedEmp(employees[0].id)
    }
  }, [employees, selectedEmp])

  const clockingsByEmp = useMemo(() => {
    const m = {}
    for (const c of clockings) (m[c.employeeId] = m[c.employeeId] || []).push(c)
    return m
  }, [clockings])

  const timesheet = useMemo(() => {
    if (!selectedEmp) return null
    return buildEmployeeTimesheet(clockingsByEmp[selectedEmp] || [], year, month0, threshold)
  }, [clockingsByEmp, selectedEmp, year, month0, threshold])

  const selectedName = userMap[selectedEmp]?.name || selectedEmp
  const label = monthLabel(year, month0)

  function downloadOne() {
    if (!timesheet) return
    const csv = timesheetToCsv(timesheet, {
      employeeName: selectedName,
      monthLabel: label,
      thresholdHours: threshold,
    })
    downloadTextFile(`cartellino_${slugify(selectedName)}_${month}.csv`, csv)
  }

  function downloadAll() {
    const perEmployee = employees.map((e) => ({
      name: e.name || e.id,
      timesheet: buildEmployeeTimesheet(clockingsByEmp[e.id] || [], year, month0, threshold),
    }))
    const csv = combinedTimesheetToCsv(perEmployee, { monthLabel: label, thresholdHours: threshold })
    downloadTextFile(`cartellini_${month}.csv`, csv)
  }

  return (
    <div className="timesheet">
      <div className="ts-toolbar">
        <label className="ts-field">
          <span>Mese</span>
          <input
            type="month"
            value={month}
            max={currentMonthValue()}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>

        <label className="ts-field">
          <span>Ore ordinarie max / giorno</span>
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={threshold}
            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        <label className="ts-field ts-field-grow">
          <span>Dipendente</span>
          <select value={selectedEmp} onChange={(e) => setSelectedEmp(e.target.value)}>
            {employees.length === 0 && <option value="">— nessuno —</option>}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name || e.id}
              </option>
            ))}
          </select>
        </label>

        <div className="ts-actions">
          <button className="btn-ghost" onClick={downloadOne} disabled={!timesheet}>
            ⬇ Scarica CSV
          </button>
          <button className="btn-ghost" onClick={downloadAll} disabled={employees.length === 0}>
            ⬇ Scarica tutti
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : !timesheet ? (
        <div className="empty"><p>Nessun dipendente da mostrare.</p></div>
      ) : (
        <>
          <div className="stat-grid ts-summary">
            <Stat label="Ore lavorate" value={hoursToHM(timesheet.totals.worked)} />
            <Stat label="Ore ordinarie" value={hoursToHM(timesheet.totals.ordinary)} />
            <Stat label="Ore straordinarie" value={hoursToHM(timesheet.totals.overtime)} accent="approved" />
          </div>

          <p className="muted small ts-caption">
            <strong>{selectedName}</strong> · {label} · soglia {hoursDecimal(threshold)} ore/giorno.
            Le straordinarie sono il tempo effettivo, <strong>non arrotondato</strong>.
          </p>

          <div className="table-wrap">
            <table className="dash-table ts-table">
              <thead>
                <tr>
                  <th>Giorno</th>
                  <th>Entrata</th>
                  <th>Uscita</th>
                  <th className="num">Lavorate</th>
                  <th className="num">Ordinarie</th>
                  <th className="num">Straordinarie</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {timesheet.rows.map((r) => (
                  <tr key={r.date} className={r.isWeekend ? 'ts-weekend' : undefined}>
                    <td data-label="Giorno">
                      {r.weekday} {String(r.day).padStart(2, '0')}
                    </td>
                    <td data-label="Entrata">{r.firstIn || '—'}</td>
                    <td data-label="Uscita">{r.lastOut || '—'}</td>
                    <td data-label="Lavorate" className="num" title={`${hoursDecimal(r.workedHours)} ore`}>
                      {r.workedHours > 0 ? hoursToHM(r.workedHours) : '—'}
                    </td>
                    <td data-label="Ordinarie" className="num" title={`${hoursDecimal(r.ordinaryHours)} ore`}>
                      {r.ordinaryHours > 0 ? hoursToHM(r.ordinaryHours) : '—'}
                    </td>
                    <td
                      data-label="Straordinarie"
                      className={`num${r.overtimeHours > 0 ? ' ts-ot' : ''}`}
                      title={`${hoursDecimal(r.overtimeHours)} ore`}
                    >
                      {r.overtimeHours > 0 ? hoursToHM(r.overtimeHours) : '—'}
                    </td>
                    <td data-label="Note" className="ts-notes">
                      {r.notes.length > 0 ? r.notes.join(' · ') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ts-total-row">
                  <td data-label="Giorno"><strong>Totali</strong></td>
                  <td></td>
                  <td></td>
                  <td className="num"><strong>{hoursToHM(timesheet.totals.worked)}</strong></td>
                  <td className="num"><strong>{hoursToHM(timesheet.totals.ordinary)}</strong></td>
                  <td className="num"><strong>{hoursToHM(timesheet.totals.overtime)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat-card${accent ? ` stat-${accent}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
