import { useEffect, useState } from 'react'
import {
  getVehicle,
  getOpenIssues,
  getActiveHandover,
  getOpenHandovers,
  returnVehicle,
  listVehicles,
  getUserMap,
  uploadVehiclePhoto,
  createHandover,
} from '../data/api.js'
import { formatDateTime } from '../utils.js'
import QrScanner, { qrScanSupported } from './QrScanner.jsx'

// Flusso di presa in carico / riconsegna di un mezzo da parte del dipendente.
// `vehicleId` (opzionale) arriva dal QR/deep-link e salta la selezione.
export default function VehicleHandover({ user, vehicleId, onBack }) {
  const [vehicle, setVehicle] = useState(null)
  const [openIssues, setOpenIssues] = useState([])
  const [status, setStatus] = useState(null) // handover aperto o null (disponibile)
  const [loading, setLoading] = useState(Boolean(vehicleId))
  const [error, setError] = useState('')

  const [scanning, setScanning] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [openByVehicle, setOpenByVehicle] = useState({})
  const [userMap, setUserMap] = useState({})

  const [newIssues, setNewIssues] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)

  const nameOf = (id) => userMap[id]?.name ?? id ?? '—'

  async function selectVehicle(id) {
    setLoading(true)
    setError('')
    setScanning(false)
    try {
      const [v, issues, active, map] = await Promise.all([
        getVehicle(id),
        getOpenIssues(id),
        getActiveHandover(id),
        getUserMap(),
      ])
      if (!v) {
        setError(`Mezzo "${id}" non trovato.`)
        setVehicle(null)
      } else {
        setVehicle(v)
        setOpenIssues(issues)
        setStatus(active)
        setUserMap(map)
      }
    } catch (err) {
      setError(err.message || 'Errore nel caricamento del mezzo.')
    } finally {
      setLoading(false)
    }
  }

  async function loadList() {
    const [vs, open, map] = await Promise.all([listVehicles(), getOpenHandovers(), getUserMap()])
    const by = {}
    for (const h of open) by[h.vehicleId] = h
    setVehicles(vs)
    setOpenByVehicle(by)
    setUserMap(map)
  }

  useEffect(() => {
    if (vehicleId) selectVehicle(vehicleId)
    else loadList().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId])

  function addIssue() {
    setNewIssues((s) => [...s, { description: '', file: null, preview: null }])
  }
  function updateIssue(idx, patch) {
    setNewIssues((s) => s.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function removeIssue(idx) {
    setNewIssues((s) => s.filter((_, i) => i !== idx))
  }

  async function submit() {
    setError('')
    for (const it of newIssues) {
      if (!it.description.trim()) {
        setError('Descrivi ogni danno segnalato (o rimuovi la segnalazione vuota).')
        return
      }
    }
    setSubmitting(true)
    try {
      const issues = []
      for (const it of newIssues) {
        let photoUrl = null
        if (it.file) photoUrl = await uploadVehiclePhoto(it.file)
        issues.push({ description: it.description, photoUrl })
      }
      await createHandover({ vehicleId: vehicle.id, employeeId: user.id, issues })
      setDone({ type: 'taken', ok: issues.length === 0, count: issues.length })
    } catch (err) {
      setError(err.message || 'Registrazione non riuscita.')
    } finally {
      setSubmitting(false)
    }
  }

  async function doReturn() {
    setSubmitting(true)
    setError('')
    try {
      await returnVehicle(vehicle.id)
      setDone({ type: 'returned' })
    } catch (err) {
      setError(err.message || 'Riconsegna non riuscita.')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Conferma finale ---
  if (done) {
    return (
      <main className="content">
        <div className="soon-card">
          <span className={`handover-result ${done.type === 'returned' ? 'ok' : done.ok ? 'ok' : 'warn'}`}>
            {done.type === 'returned' ? '↩' : done.ok ? '✓' : '!'}
          </span>
          <h2 className="soon-title">
            {done.type === 'returned' ? 'Mezzo riconsegnato' : 'Presa in carico registrata'}
          </h2>
          <p className="soon-sub">{vehicle.name}{vehicle.plate ? ` · ${vehicle.plate}` : ''}</p>
          <p className="muted center soon-text">
            {done.type === 'returned'
              ? 'Il mezzo è ora disponibile per gli altri.'
              : done.ok
              ? 'Hai dichiarato nessun nuovo danno. Buon lavoro!'
              : `Hai inviato ${done.count} segnalazione/i. Grazie, è stato registrato.`}
          </p>
          <button className="btn-primary btn-block" onClick={onBack}>Fine</button>
        </div>
      </main>
    )
  }

  // --- Selezione del mezzo ---
  if (!vehicle) {
    return (
      <main className="content">
        <h2 className="section-title">Presa in carico mezzo</h2>

        {scanning ? (
          <QrScanner onDetected={selectVehicle} onClose={() => setScanning(false)} />
        ) : (
          <>
            {qrScanSupported && (
              <button className="btn-primary btn-block" onClick={() => setScanning(true)}>
                📷 Scansiona il QR del mezzo
              </button>
            )}
            <p className="muted center small" style={{ margin: '14px 0' }}>
              {qrScanSupported
                ? 'Oppure inquadra il QR con la fotocamera del telefono, o seleziona il mezzo:'
                : 'Inquadra il QR con la fotocamera del telefono, oppure seleziona il mezzo:'}
            </p>

            {loading ? (
              <p className="muted center">Caricamento…</p>
            ) : (
              <div className="list">
                {vehicles.map((v) => {
                  const busy = openByVehicle[v.id]
                  return (
                    <button
                      key={v.id}
                      className={`vehicle-pick ${busy ? 'in-use' : 'available'}`}
                      onClick={() => selectVehicle(v.id)}
                    >
                      <span className="vehicle-pick-name">{v.name}</span>
                      <span className="vehicle-pick-sub">
                        {v.plate || '—'}{v.department ? ` · ${v.department}` : ''}
                      </span>
                      <span className={`avail-pill ${busy ? 'busy' : 'free'}`}>
                        {busy ? `In uso · ${nameOf(busy.employeeId)}` : 'Disponibile'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </>
        )}
      </main>
    )
  }

  const mine = status && status.employeeId === user.id
  const busyByOther = status && !mine

  // --- Mezzo selezionato ---
  return (
    <main className="content">
      <button className="back-link" onClick={() => { setVehicle(null); setStatus(null); setNewIssues([]); setError(''); loadList().catch(() => {}) }}>
        ‹ Cambia mezzo
      </button>

      <div className="vehicle-head">
        <h2 className="section-title" style={{ margin: 0 }}>{vehicle.name}</h2>
        <span className="vehicle-plate">{vehicle.plate || '—'}</span>
      </div>
      <p className={`avail-banner ${status ? 'busy' : 'free'}`}>
        {status
          ? `In uso da ${nameOf(status.employeeId)} · dal ${formatDateTime(status.takenAt)}`
          : 'Disponibile'}
      </p>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : busyByOther ? (
        // Occupato da un collega: non disponibile.
        <div className="card preexist">
          <p>Questo mezzo è attualmente <strong>in uso da {nameOf(status.employeeId)}</strong> e non è disponibile per la presa in carico.</p>
          <p className="muted small">Riprova quando sarà stato riconsegnato.</p>
          <button className="btn-ghost btn-block" onClick={onBack} style={{ marginTop: 10 }}>Torna indietro</button>
        </div>
      ) : mine ? (
        // L'ho preso io: posso riconsegnarlo.
        <div className="declare">
          <div className="card preexist">
            <p>Hai questo mezzo <strong>in carico</strong> dal {formatDateTime(status.takenAt)}.</p>
            <p className="muted small">Quando hai finito, riconsegnalo per renderlo di nuovo disponibile.</p>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary btn-block big-confirm" disabled={submitting} onClick={doReturn}>
            {submitting ? 'Riconsegna…' : '↩ Riconsegna il mezzo'}
          </button>
        </div>
      ) : (
        // Disponibile: presa in carico con dichiarazione.
        <>
          <section className="card preexist">
            <h3 className="mini-title">Segnalazioni già presenti</h3>
            {openIssues.length === 0 ? (
              <p className="muted small">Nessun problema segnalato in precedenza su questo mezzo.</p>
            ) : (
              <>
                <p className="muted small">Questi problemi risultano già segnalati (non ti vengono attribuiti):</p>
                <ul className="issue-list">
                  {openIssues.map((i) => (
                    <li key={i.id}>
                      {i.description}
                      {i.photoUrl && (
                        <a className="issue-photo-link" href={i.photoUrl} target="_blank" rel="noreferrer">foto</a>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="declare">
            <h3 className="mini-title">Rilevi nuovi danni o anomalie?</h3>

            {newIssues.map((it, idx) => (
              <div key={idx} className="issue-editor">
                <textarea
                  className="decision-note"
                  rows={2}
                  maxLength={300}
                  placeholder="Descrivi il danno/anomalia rilevato…"
                  value={it.description}
                  onChange={(e) => updateIssue(idx, { description: e.target.value })}
                />
                <div className="issue-editor-row">
                  <label className="btn-ghost btn-sm photo-btn">
                    {it.preview ? 'Cambia foto' : '📷 Aggiungi foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) updateIssue(idx, { file, preview: URL.createObjectURL(file) })
                      }}
                    />
                  </label>
                  <button className="btn-ghost btn-sm danger" onClick={() => removeIssue(idx)}>Rimuovi</button>
                </div>
                {it.preview && <img className="issue-preview" src={it.preview} alt="anteprima" />}
              </div>
            ))}

            <button className="btn-ghost btn-block" onClick={addIssue}>+ Segnala un danno/anomalia</button>

            {error && <p className="error">{error}</p>}

            <button
              className={`btn-primary btn-block big-confirm ${newIssues.length ? 'with-issues' : ''}`}
              disabled={submitting}
              onClick={submit}
            >
              {submitting
                ? 'Registrazione…'
                : newIssues.length === 0
                ? '✓ Confermo: nessun nuovo danno — Prendi in carico'
                : `Prendi in carico e invia ${newIssues.length} segnalazione/i`}
            </button>
            <p className="muted center small" style={{ marginTop: 10 }}>
              Presa in carico da <strong>{user.name}</strong> · {formatDateTime(new Date().toISOString())}
            </p>
          </section>
        </>
      )}
    </main>
  )
}
