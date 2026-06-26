import { useMemo, useState } from 'react'
import {
  getAllRequests,
  getRequestsForManager,
  getUserMap,
  decideRequest,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { puo } from '../permissions.js'
import { formatDate, formatDateTime, formatHours } from '../utils.js'
import StatusBadge from './StatusBadge.jsx'

const STATUS_FILTERS = [
  { value: 'all', label: 'Tutte' },
  { value: 'pending', label: 'Da approvare' },
  { value: 'approved', label: 'Approvate' },
  { value: 'rejected', label: 'Rifiutate' },
]

// Vista richieste della dashboard: statistiche, filtri e tabella con azioni.
export default function RequestsBoard({ user, permConfig = null }) {
  const isAdmin = user.role === 'admin'
  const canDecide = puo(user, 'straordinari.decide', permConfig)
  const [requests, setRequests] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [reqs, map] = await Promise.all([
      isAdmin ? getAllRequests() : getRequestsForManager(user.id),
      getUserMap(),
    ])
    setRequests(reqs)
    setUserMap(map)
    setLoading(false)
  }

  // Aggiornamento in tempo reale + al rientro nell'app.
  useLiveData(refresh, [user.id])

  const stats = useMemo(() => {
    const s = { total: requests.length, pending: 0, approved: 0, rejected: 0, pendingHours: 0 }
    for (const r of requests) {
      s[r.status] = (s[r.status] || 0) + 1
      if (r.status === 'pending') s.pendingHours += Number(r.hours)
    }
    return s
  }, [requests])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      const name = (userMap[r.employeeId]?.name || '').toLowerCase()
      const dept = (userMap[r.employeeId]?.department || '').toLowerCase()
      return name.includes(q) || dept.includes(q) || (r.reason || '').toLowerCase().includes(q)
    })
  }, [requests, statusFilter, query, userMap])

  return (
    <div className="board">
      <div className="stat-grid">
        <StatCard label="Da approvare" value={stats.pending} accent="pending" />
        <StatCard label="Ore in attesa" value={formatHours(stats.pendingHours)} />
        <StatCard label="Approvate" value={stats.approved} accent="approved" />
        <StatCard label="Totale richieste" value={stats.total} />
      </div>

      <div className="dash-filters">
        <div className="seg">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={statusFilter === f.value ? 'seg-btn seg-btn-active' : 'seg-btn'}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input dash-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per dipendente, reparto o motivo…"
        />
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : visible.length === 0 ? (
        <div className="empty"><p>Nessuna richiesta con questi filtri.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Dipendente</th>
                <th>Reparto</th>
                <th>Data</th>
                <th className="num">Ore</th>
                <th>Motivo</th>
                <th>Stato</th>
                <th className="actions-col">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RequestRow
                  key={r.id}
                  request={r}
                  employee={userMap[r.employeeId]}
                  decider={userMap[r.decidedBy]}
                  actorId={user.id}
                  canDecide={canDecide}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

function RequestRow({ request, employee, decider, actorId, canDecide = true, onChanged }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function decide(decision) {
    setBusy(true)
    setError('')
    try {
      await decideRequest({ requestId: request.id, decision, note, managerId: actorId })
      setOpen(false)
      setNote('')
      await onChanged()
    } catch (err) {
      setError(err.message || 'Errore.')
    } finally {
      setBusy(false)
    }
  }

  const isPending = request.status === 'pending'

  return (
    <>
      <tr>
        <td data-label="Dipendente">{employee?.name ?? request.employeeId}</td>
        <td data-label="Reparto">{employee?.department ?? '—'}</td>
        <td data-label="Data">{formatDate(request.date)}</td>
        <td data-label="Ore" className="num">{formatHours(request.hours)}</td>
        <td data-label="Motivo" className="reason-cell">{request.reason}</td>
        <td data-label="Stato"><StatusBadge status={request.status} /></td>
        <td data-label="Azioni" className="actions-col">
          {isPending ? (
            canDecide ? (
              <button className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
                {open ? 'Chiudi' : 'Gestisci'}
              </button>
            ) : (
              <span className="muted small">in attesa</span>
            )
          ) : (
            <span className="muted small">
              {decider ? `da ${decider.name}` : 'decisa'}
            </span>
          )}
        </td>
      </tr>

      {!isPending && request.decisionNote && (
        <tr className="subrow">
          <td colSpan={7}>
            <span className="request-note"><strong>Nota:</strong> {request.decisionNote}</span>
            <span className="muted small"> · Decisa il {formatDateTime(request.decidedAt)}</span>
          </td>
        </tr>
      )}

      {isPending && open && (
        <tr className="subrow">
          <td colSpan={7}>
            <div className="decide-panel">
              <textarea
                className="decision-note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (facoltativa) per il dipendente…"
              />
              {error && <p className="error">{error}</p>}
              <div className="decision-actions">
                <button className="btn-reject" disabled={busy} onClick={() => decide('rejected')}>
                  Rifiuta
                </button>
                <button className="btn-approve" disabled={busy} onClick={() => decide('approved')}>
                  Approva
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
