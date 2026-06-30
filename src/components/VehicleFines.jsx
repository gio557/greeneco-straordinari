import { useMemo, useState } from 'react'
import {
  listVehicles, getUserMap, getAllFines, cancelFine, subscribeToFines,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { puo } from '../permissions.js'
import { useFineAttachments } from '../data/useFineAttachments.js'
import { formatDateTime } from '../utils.js'
import { FINE_STATUS, formatEuro } from '../fines.js'
import FineAttachment from './FineAttachment.jsx'
import FineForm from './FineForm.jsx'

// Gestione sanzioni per manager/admin: registrazione (con attribuzione proposta
// dal passaggio di consegna attivo alla data dell'infrazione) ed elenco.
export default function VehicleFines({ user, permConfig = null }) {
  const seeAll = puo(user, 'dati.tutti', permConfig)
  const canManage = puo(user, 'multe.manage', permConfig)
  const canCancel = puo(user, 'multe.cancel', permConfig)
  const [vehicles, setVehicles] = useState([])
  const [userMap, setUserMap] = useState({})
  const [fines, setFines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [v, m, f] = await Promise.all([listVehicles(), getUserMap(), getAllFines()])
    setVehicles(v); setUserMap(m); setFines(f); setLoading(false)
  }

  useLiveData(refresh, [user.id], subscribeToFines)
  const attachUrls = useFineAttachments(fines)

  const inScope = (employeeId) => seeAll || (userMap[employeeId]?.managerIds || []).includes(user.id)
  const visible = useMemo(() => fines.filter((f) => inScope(f.employeeId)), [fines, userMap]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id) => userMap[id]?.name || id || '—'
  const vname = (id) => vehicles.find((v) => v.id === id)?.name || id || '—'
  const employees = useMemo(
    () =>
      Object.entries(userMap)
        .filter(([id, u]) => u.role === 'employee' && inScope(id))
        .map(([id, u]) => ({ id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [userMap] // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function annulla(f) {
    await cancelFine(f.id)
    await refresh()
  }

  return (
    <div className="fines">
      <div className="page-head">
        <h3 className="mini-title">Sanzioni</h3>
        {canManage && (
          <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Registra multa</button>
        )}
      </div>

      {showForm && canManage && (
        <FineForm
          vehicles={vehicles}
          employees={employees}
          userMap={userMap}
          user={user}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh() }}
        />
      )}

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : visible.length === 0 ? (
        <p className="muted small">Nessuna sanzione registrata.</p>
      ) : (
        <div className="list">
          {visible.map((f) => {
            const st = FINE_STATUS[f.status] || {}
            return (
              <div key={f.id} className="card fine-card">
                <div className="request-card-top">
                  <span className="request-employee">{name(f.employeeId)} · {vname(f.vehicleId)}</span>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </div>
                <div className="fine-amount">{formatEuro(f.amount)}</div>
                <div className="fine-meta">
                  <div>📅 {formatDateTime(f.infractionAt)}{f.type ? ` · ${f.type}` : ''}</div>
                  {f.place && <div>📍 {f.place}</div>}
                  {f.verbale && <div>N. verbale: {f.verbale}</div>}
                  {f.attachmentUrl && <FineAttachment value={f.attachmentUrl} url={attachUrls[f.id]} />}
                  {f.acknowledgedAt && <div className="muted small">Presa visione: {formatDateTime(f.acknowledgedAt)}</div>}
                  {f.status === 'contested' && <div className="request-note">Contestazione: {f.contestNote || '(senza nota)'}</div>}
                </div>
                {f.status !== 'cancelled' && canCancel && (
                  <div className="decision-actions">
                    <button className="btn-ghost btn-sm" onClick={() => annulla(f)}>Annulla multa</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

