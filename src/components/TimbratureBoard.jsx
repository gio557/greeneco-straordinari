import { useMemo, useState } from 'react'
import { getRecentClockings, getUserMap, subscribeToClockings } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { formatDateTime } from '../utils.js'
import { normalizeKind, ACTIVITIES } from '../timesheet.js'
import { clockingChecks, isToVerify } from '../clockingFlags.js'
import MonthlyTimesheet from './MonthlyTimesheet.jsx'

const STATE_LABEL = { travel: 'In viaggio', work: 'Al lavoro', break: 'In pausa' }

// Vista presenze per manager/admin. Il manager vede il proprio team, l'admin
// tutti. (Su impianto prototipo il filtro è applicativo; con auth reale + RLS
// diventerà un controllo d'accesso forte.)
export default function TimbratureBoard({ user }) {
  const isAdmin = user.role === 'admin'
  const [view, setView] = useState('live')
  const [clockings, setClockings] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [onlyToVerify, setOnlyToVerify] = useState(false)

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [list, map] = await Promise.all([getRecentClockings(400), getUserMap()])
    setClockings(list)
    setUserMap(map)
    setLoading(false)
  }

  useLiveData(refresh, [user.id], subscribeToClockings)

  const inScope = (employeeId) =>
    isAdmin || userMap[employeeId]?.managerId === user.id

  const visible = useMemo(() => clockings.filter((c) => inScope(c.employeeId)), [clockings, userMap])

  // Ultima timbratura per dipendente (la lista è ordinata dal più recente).
  const lastByEmp = useMemo(() => {
    const m = {}
    for (const c of visible) if (!m[c.employeeId]) m[c.employeeId] = c
    return m
  }, [visible])

  // "In servizio" = chi ha un'attività aperta (ultima timbratura diversa da Fine).
  const inService = useMemo(
    () => Object.values(lastByEmp).filter((c) => normalizeKind(c.kind) !== 'end'),
    [lastByEmp]
  )

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return visible.filter((c) => (c.punchedAt || '').slice(0, 10) === today).length
  }, [visible])

  // Timbrature che richiedono una verifica (senza posizione, orologio sfasato…).
  const toVerify = useMemo(() => visible.filter(isToVerify), [visible])
  const rows = onlyToVerify ? toVerify : visible

  const name = (id) => userMap[id]?.name ?? id ?? '—'

  return (
    <main className="content dashboard">
      <div className="dash-tabs">
        <button
          className={view === 'live' ? 'dash-tab dash-tab-active' : 'dash-tab'}
          onClick={() => setView('live')}
        >
          Tempo reale
        </button>
        <button
          className={view === 'month' ? 'dash-tab dash-tab-active' : 'dash-tab'}
          onClick={() => setView('month')}
        >
          Riepilogo mensile
        </button>
      </div>

      {view === 'month' ? (
        <MonthlyTimesheet user={user} />
      ) : (
      <div className="board">
        <div className="stat-grid">
          <StatCard label="In servizio ora" value={inService.length} accent={inService.length ? 'approved' : undefined} />
          <StatCard label="Timbrature oggi" value={todayCount} />
          <StatCard label="Da verificare" value={toVerify.length} accent={toVerify.length ? 'warn' : undefined} />
        </div>

        <h3 className="mini-title">In servizio adesso</h3>
        {inService.length === 0 ? (
          <p className="muted small">Nessuno risulta attualmente in servizio.</p>
        ) : (
          <div className="list">
            {inService.map((c) => {
              const act = normalizeKind(c.kind)
              return (
                <div key={c.employeeId} className="card clock-row">
                  <span className={`badge clock-badge ${act}`}>{STATE_LABEL[act] ?? act}</span>
                  <span className="clock-row-time"><strong>{name(c.employeeId)}</strong> · dalle {formatDateTime(c.punchedAt)}</span>
                  {c.lat != null && (
                    <a className="clock-map" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="dash-list-head">
          <h3 className="mini-title">Timbrature recenti</h3>
          <label className="verify-filter">
            <input
              type="checkbox"
              checked={onlyToVerify}
              onChange={(e) => setOnlyToVerify(e.target.checked)}
            />
            Solo da verificare
          </label>
        </div>
        {loading ? (
          <p className="muted center">Caricamento…</p>
        ) : rows.length === 0 ? (
          <div className="empty"><p>{onlyToVerify ? 'Nessuna timbratura da verificare.' : 'Nessuna timbratura.'}</p></div>
        ) : (
          <div className="table-wrap">
            <table className="dash-table">
              <thead>
                <tr><th>Dipendente</th><th>Attività</th><th>Quando</th><th>Posizione</th><th>Verifica</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((c) => {
                  const act = normalizeKind(c.kind)
                  const checks = clockingChecks(c)
                  return (
                  <tr key={c.id} className={isToVerify(c) ? 'row-verify' : undefined}>
                    <td data-label="Dipendente">{name(c.employeeId)}</td>
                    <td data-label="Attività">
                      <span className={`badge clock-badge ${act}`}>{ACTIVITIES[act]?.label ?? act}</span>
                    </td>
                    <td data-label="Quando">{formatDateTime(c.punchedAt)}</td>
                    <td data-label="Posizione">
                      {c.lat != null ? (
                        <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                      ) : '—'}
                    </td>
                    <td data-label="Verifica">
                      {checks.length === 0 ? (
                        <span className="muted">✓</span>
                      ) : (
                        checks.map((x) => (
                          <span key={x.code} className={`verify-chip verify-${x.level}`}>{x.label}</span>
                        ))
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </main>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`stat-card${accent ? ` stat-${accent}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
