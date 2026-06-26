import { useState } from 'react'
import { getFinesForEmployee, listVehicles, acknowledgeFine, contestFine, subscribeToFines } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { formatDateTime } from '../utils.js'
import { FINE_STATUS, formatEuro } from '../fines.js'

// Vista del dipendente: le proprie sanzioni, con presa visione e contestazione.
export default function EmployeeFines({ user, onChange }) {
  const [fines, setFines] = useState([])
  const [vehicles, setVehicles] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [contestId, setContestId] = useState(null)
  const [contestText, setContestText] = useState('')

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [list, vlist] = await Promise.all([getFinesForEmployee(user.id), listVehicles()])
    setFines(list)
    setVehicles(Object.fromEntries(vlist.map((v) => [v.id, v])))
    setLoading(false)
    onChange?.()
  }

  useLiveData(refresh, [user.id], subscribeToFines)

  const vname = (id) => vehicles[id]?.name || id || '—'

  async function ack(f) {
    setBusy(f.id)
    try {
      await acknowledgeFine(f.id, user.id)
      await refresh()
    } finally {
      setBusy('')
    }
  }

  async function submitContest(f) {
    setBusy(f.id)
    try {
      await contestFine(f.id, user.id, contestText)
      setContestId(null)
      setContestText('')
      await refresh()
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="content">
      <h2 className="section-title">Le mie sanzioni</h2>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : fines.length === 0 ? (
        <div className="empty"><p>Nessuna sanzione.</p></div>
      ) : (
        <div className="list">
          {fines.map((f) => {
            const st = FINE_STATUS[f.status] || {}
            return (
              <div key={f.id} className="card fine-card">
                <div className="request-card-top">
                  <span className="request-employee">{vname(f.vehicleId)}</span>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </div>
                <div className="fine-amount">{formatEuro(f.amount)}</div>
                <div className="fine-meta">
                  <div>📅 Infrazione: {formatDateTime(f.infractionAt)}</div>
                  {f.type && <div>📋 {f.type}</div>}
                  {f.place && <div>📍 {f.place}</div>}
                  {f.verbale && <div>N. verbale: {f.verbale}</div>}
                  {f.note && <div className="request-note">{f.note}</div>}
                </div>
                {f.status === 'contested' && (
                  <div className="request-note">La tua contestazione: {f.contestNote || '(senza nota)'}</div>
                )}
                {f.status === 'acknowledged' && f.acknowledgedAt && (
                  <p className="muted small">Presa visione il {formatDateTime(f.acknowledgedAt)}.</p>
                )}
                {f.status === 'registered' &&
                  (contestId === f.id ? (
                    <div className="decision">
                      <textarea
                        className="decision-note"
                        rows={3}
                        placeholder="Motivo della contestazione (es. non ero io alla guida)…"
                        value={contestText}
                        onChange={(e) => setContestText(e.target.value)}
                      />
                      <div className="decision-actions">
                        <button className="btn-reject" disabled={busy === f.id} onClick={() => submitContest(f)}>
                          Invia contestazione
                        </button>
                        <button className="btn-ghost" onClick={() => { setContestId(null); setContestText('') }}>
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="decision-actions">
                      <button className="btn-approve" disabled={busy === f.id} onClick={() => ack(f)}>
                        Presa visione
                      </button>
                      <button className="btn-ghost" onClick={() => setContestId(f.id)}>Contesta</button>
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 16 }}>
        La «presa visione» registra soltanto che hai letto la comunicazione. Un'eventuale trattenuta
        segue le regole di legge e del contratto, e non è automatica.
      </p>
    </main>
  )
}
