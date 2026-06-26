import { useEffect, useMemo, useState } from 'react'
import {
  listVehicles, getUserMap, getAllFines, getHandoverAt, createFine, cancelFine, subscribeToFines, uploadFineScan,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { useFineAttachments } from '../data/useFineAttachments.js'
import { formatDateTime } from '../utils.js'
import { FINE_STATUS, formatEuro } from '../fines.js'
import FineAttachment from './FineAttachment.jsx'

// Gestione sanzioni per manager/admin: registrazione (con attribuzione proposta
// dal passaggio di consegna attivo alla data dell'infrazione) ed elenco.
export default function VehicleFines({ user }) {
  const isAdmin = user.role === 'admin'
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

  const inScope = (employeeId) => isAdmin || userMap[employeeId]?.managerId === user.id
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
        <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Registra multa</button>
      </div>

      {showForm && (
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
                {f.status !== 'cancelled' && (
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

function FineForm({ vehicles, employees, userMap, user, onClose, onSaved }) {
  const [vehicleId, setVehicleId] = useState('')
  const [infractionAt, setInfractionAt] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState('')
  const [place, setPlace] = useState('')
  const [type, setType] = useState('')
  const [verbale, setVerbale] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Attribuzione: passaggio di consegna trovato per mezzo + data (query mirata).
  const [lookup, setLookup] = useState({ state: 'idle', handover: null })

  useEffect(() => {
    if (!vehicleId || !infractionAt) {
      setLookup({ state: 'idle', handover: null })
      return
    }
    let cancelled = false
    setLookup({ state: 'loading', handover: null })
    getHandoverAt(vehicleId, new Date(infractionAt).toISOString())
      .then((h) => {
        if (cancelled) return
        setLookup({ state: 'done', handover: h })
        if (h) setEmployeeId(h.employeeId)
      })
      .catch(() => { if (!cancelled) setLookup({ state: 'done', handover: null }) })
    return () => { cancelled = true }
  }, [vehicleId, infractionAt])

  const nameOf = (id) => userMap[id]?.name || id || '—'

  async function submit(e) {
    e.preventDefault()
    if (!vehicleId || !infractionAt || !employeeId) {
      setError('Mezzo, data infrazione e dipendente sono obbligatori.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let attachmentUrl = null
      if (file) {
        setUploading(true)
        try {
          attachmentUrl = await uploadFineScan(file)
        } finally {
          setUploading(false)
        }
      }
      await createFine({
        vehicleId,
        employeeId,
        infractionAt: new Date(infractionAt).toISOString(),
        amount: amount === '' ? null : parseFloat(String(amount).replace(',', '.')),
        place,
        type,
        verbale,
        note,
        attachmentUrl,
        recordedBy: user.id,
      })
      onSaved()
    } catch (err) {
      setError(err.message || 'Registrazione non riuscita')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="mini-title">Registra multa</h3>
        <form className="form" onSubmit={submit}>
          <label className="field"><span>Mezzo *</span>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">— seleziona —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ''}</option>)}
            </select>
          </label>
          <label className="field"><span>Data e ora infrazione *</span>
            <input type="datetime-local" value={infractionAt} onChange={(e) => setInfractionAt(e.target.value)} />
          </label>
          <label className="field"><span>Dipendente responsabile *</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— seleziona —</option>
              {employees.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
            </select>
            {lookup.state === 'loading' && <small className="muted">Verifico chi aveva il mezzo a quella data…</small>}
            {lookup.state === 'done' && lookup.handover && (
              <small className="muted">
                Proposto dal passaggio di consegna: <strong>{nameOf(lookup.handover.employeeId)}</strong>
                {' '}(dal {formatDateTime(lookup.handover.takenAt)} {lookup.handover.returnedAt ? `al ${formatDateTime(lookup.handover.returnedAt)}` : '— mezzo ancora in uso'}).
              </small>
            )}
            {lookup.state === 'done' && !lookup.handover && (
              <small className="muted">Nessun passaggio di consegna registrato per quella data: seleziona il dipendente manualmente.</small>
            )}
          </label>
          <label className="field"><span>Importo (€)</span>
            <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="es. 42,00" />
          </label>
          <label className="field"><span>Tipo infrazione</span>
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="es. Divieto di sosta" />
          </label>
          <label className="field"><span>Luogo</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="es. Via Roma, Torino" />
          </label>
          <label className="field"><span>Numero verbale</span>
            <input value={verbale} onChange={(e) => setVerbale(e.target.value)} />
          </label>
          <label className="field"><span>Note</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="field"><span>Scansione del verbale (immagine o PDF)</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file && <small className="muted">Selezionato: {file.name}</small>}
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" disabled={busy} type="submit">
              {uploading ? 'Caricamento allegato…' : busy ? 'Salvataggio…' : 'Registra'}
            </button>
            <button className="btn-ghost" type="button" onClick={onClose}>Annulla</button>
          </div>
        </form>
      </div>
    </div>
  )
}
