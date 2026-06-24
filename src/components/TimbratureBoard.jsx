import { useMemo, useState } from 'react'
import { getRecentClockings, getUserMap, subscribeToClockings } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { formatDateTime } from '../utils.js'
import MonthlyTimesheet from './MonthlyTimesheet.jsx'

// Vista presenze per manager/admin. Il manager vede il proprio team, l'admin
// tutti. (Su impianto prototipo il filtro è applicativo; con auth reale + RLS
// diventerà un controllo d'accesso forte.)
export default function TimbratureBoard({ user }) {
  const isAdmin = user.role === 'admin'
  const [view, setView] = useState('live')
  const [clockings, setClockings] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)

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

  const inService = useMemo(
    () => Object.values(lastByEmp).filter((c) => c.kind === 'in'),
    [lastByEmp]
  )

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return visible.filter((c) => (c.punchedAt || '').slice(0, 10) === today).length
  }, [visible])

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
        </div>

        <h3 className="mini-title">In servizio adesso</h3>
        {inService.length === 0 ? (
          <p className="muted small">Nessuno risulta attualmente in servizio.</p>
        ) : (
          <div className="list">
            {inService.map((c) => (
              <div key={c.employeeId} className="card clock-row">
                <span className="badge badge-approved">In servizio</span>
                <span className="clock-row-time"><strong>{name(c.employeeId)}</strong> · dalle {formatDateTime(c.punchedAt)}</span>
                {c.lat != null && (
                  <a className="clock-map" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                )}
              </div>
            ))}
          </div>
        )}

        <h3 className="mini-title">Timbrature recenti</h3>
        {loading ? (
          <p className="muted center">Caricamento…</p>
        ) : visible.length === 0 ? (
          <div className="empty"><p>Nessuna timbratura.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="dash-table">
              <thead>
                <tr><th>Dipendente</th><th>Tipo</th><th>Quando</th><th>Posizione</th></tr>
              </thead>
              <tbody>
                {visible.slice(0, 100).map((c) => (
                  <tr key={c.id}>
                    <td data-label="Dipendente">{name(c.employeeId)}</td>
                    <td data-label="Tipo">
                      <span className={`badge ${c.kind === 'in' ? 'badge-approved' : 'badge-rejected'}`}>
                        {c.kind === 'in' ? 'Entrata' : 'Uscita'}
                      </span>
                    </td>
                    <td data-label="Quando">{formatDateTime(c.punchedAt)}</td>
                    <td data-label="Posizione">
                      {c.lat != null ? (
                        <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
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
