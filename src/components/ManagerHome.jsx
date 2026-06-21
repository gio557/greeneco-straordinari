import { useState } from 'react'
import {
  getRequestsForManager,
  decideRequest,
  getUserMap,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import RequestCard from './RequestCard.jsx'

// Schermata principale del manager: richieste del proprio team divise tra
// "Da approvare" e "Storico", con azioni di approvazione/rifiuto.
export default function ManagerHome({ user }) {
  const [requests, setRequests] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [reqs, map] = await Promise.all([
      getRequestsForManager(user.id),
      getUserMap(),
    ])
    setRequests(reqs)
    setUserMap(map)
    setLoading(false)
  }

  // Le nuove richieste dei dipendenti compaiono da sole (realtime), anche
  // tornando sull'app dopo averla lasciata in background.
  useLiveData(refresh, [user.id])

  const pending = requests.filter((r) => r.status === 'pending')
  const history = requests.filter((r) => r.status !== 'pending')
  const visible = tab === 'pending' ? pending : history

  return (
    <main className="content">
      <div className="tabs">
        <button
          className={tab === 'pending' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('pending')}
        >
          Da approvare {pending.length > 0 && <span className="tab-count">{pending.length}</span>}
        </button>
        <button
          className={tab === 'history' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('history')}
        >
          Storico
        </button>
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>
            {tab === 'pending'
              ? 'Nessuna richiesta da approvare. Tutto in ordine!'
              : 'Nessuna richiesta nello storico.'}
          </p>
        </div>
      ) : (
        <div className="list">
          {visible.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              showEmployee
              employeeName={userMap[r.employeeId]?.name ?? 'Dipendente'}
            >
              {r.status === 'pending' && (
                <DecisionPanel
                  request={r}
                  managerId={user.id}
                  onDecided={refresh}
                />
              )}
            </RequestCard>
          ))}
        </div>
      )}
    </main>
  )
}

function DecisionPanel({ request, managerId, onDecided }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function decide(decision) {
    setBusy(true)
    setError('')
    try {
      await decideRequest({ requestId: request.id, decision, note, managerId })
      onDecided()
    } catch (err) {
      setError(err.message || 'Errore.')
      setBusy(false)
    }
  }

  return (
    <div className="decision">
      <textarea
        className="decision-note"
        rows={2}
        value={note}
        maxLength={300}
        placeholder="Nota (facoltativa) per il dipendente…"
        onChange={(e) => setNote(e.target.value)}
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
  )
}
