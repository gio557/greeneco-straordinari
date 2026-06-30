import { useEffect, useState } from 'react'
import { getHandoverAt, createFine, uploadFineScan } from '../data/api.js'
import { formatDateTime } from '../utils.js'

// Form di registrazione di una multa. Usato in due punti:
//   • Automezzi → Sanzioni (dipendente proposto dal passaggio di consegna);
//   • Cassetto del dipendente (ufficio paghe) con `lockedEmployeeId`: il
//     dipendente è fisso e non viene proposto/modificato.
export default function FineForm({ vehicles, employees, userMap = {}, user, lockedEmployeeId = null, onClose, onSaved }) {
  const [vehicleId, setVehicleId] = useState('')
  const [infractionAt, setInfractionAt] = useState('')
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '')
  const [amount, setAmount] = useState('')
  const [place, setPlace] = useState('')
  const [type, setType] = useState('')
  const [verbale, setVerbale] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Attribuzione automatica dal passaggio di consegna (solo quando il
  // dipendente NON è già fissato dal contesto, es. dal cassetto).
  const [lookup, setLookup] = useState({ state: 'idle', handover: null })

  useEffect(() => {
    if (lockedEmployeeId) return // dipendente fisso: nessuna proposta automatica
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
  }, [vehicleId, infractionAt, lockedEmployeeId])

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
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!lockedEmployeeId}>
              <option value="">— seleziona —</option>
              {employees.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
            </select>
            {lockedEmployeeId && <small className="muted">Multa attribuita a <strong>{nameOf(lockedEmployeeId)}</strong> (cassetto del dipendente).</small>}
            {!lockedEmployeeId && lookup.state === 'loading' && <small className="muted">Verifico chi aveva il mezzo a quella data…</small>}
            {!lockedEmployeeId && lookup.state === 'done' && lookup.handover && (
              <small className="muted">
                Proposto dal passaggio di consegna: <strong>{nameOf(lookup.handover.employeeId)}</strong>
                {' '}(dal {formatDateTime(lookup.handover.takenAt)} {lookup.handover.returnedAt ? `al ${formatDateTime(lookup.handover.returnedAt)}` : '— mezzo ancora in uso'}).
              </small>
            )}
            {!lockedEmployeeId && lookup.state === 'done' && !lookup.handover && (
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
