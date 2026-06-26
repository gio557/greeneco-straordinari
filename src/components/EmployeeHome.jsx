import { useState } from 'react'
import { getRequestsForEmployee } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { puo } from '../permissions.js'
import RequestCard from './RequestCard.jsx'
import NewRequest from './NewRequest.jsx'

// Schermata principale del dipendente: elenco delle proprie richieste
// e pulsante per crearne una nuova.
export default function EmployeeHome({ user, permConfig = null }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const canCreate = puo(user, 'straordinari.create', permConfig)

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    setRequests(await getRequestsForEmployee(user.id))
    setLoading(false)
  }

  // Se il manager decide su una richiesta, la lista si aggiorna da sola
  // (realtime), anche tornando sull'app dopo averla lasciata in background.
  useLiveData(refresh, [user.id])

  const pending = requests.filter((r) => r.status === 'pending').length

  if (showForm && canCreate) {
    return (
      <main className="content">
        <NewRequest
          user={user}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            refresh()
          }}
        />
      </main>
    )
  }

  return (
    <main className="content">
      <div className="page-head">
        <h2 className="section-title">Le mie richieste</h2>
        {pending > 0 && <span className="count-pill">{pending} in attesa</span>}
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : requests.length === 0 ? (
        <div className="empty">
          <p>Non hai ancora inviato richieste.</p>
          {canCreate && <p className="muted">Tocca il pulsante in basso per crearne una.</p>}
        </div>
      ) : (
        <div className="list">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}

      {canCreate && (
        <button className="fab" onClick={() => setShowForm(true)} aria-label="Nuova richiesta">
          + Nuova richiesta
        </button>
      )}
    </main>
  )
}
