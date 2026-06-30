import { useEffect, useState } from 'react'
import { getLastClocking, getMyClockings, createClocking, subscribeToClockings, listClients } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { puo } from '../permissions.js'
import { nearestClients } from '../geo.js'
import { requestIpCheck } from '../data/ipCheck.js'
import { formatDateTime } from '../utils.js'
import { normalizeKind, ACTIVITIES } from '../timesheet.js'
import PrivacyNotice from './PrivacyNotice.jsx'
import ClientPicker from './ClientPicker.jsx'

const consentKey = (userId) => `timbra_consent_${userId}`

// Rileva la posizione SOLO ora (all'atto della timbratura). Risolve a null se
// non disponibile o negata, senza bloccare la timbratura.
//
// Due stadi: prima si chiede il GPS ad alta precisione (attesa breve); se non
// risponde in tempo, si ripiega su un fix approssimato (cella/WiFi) invece di
// restare senza posizione. La precisione (`accuracy`, raggio in metri) viene
// sempre registrata: un raggio ampio indica un fix grossolano (es. GPS spento).
function getPositionOnce(options) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      options
    )
  })
}

async function getPosition() {
  // 1) GPS preciso, attesa breve.
  const precise = await getPositionOnce({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
  if (precise) return precise
  // 2) Ripiego approssimato (cella/WiFi): meglio una posizione grossolana che nessuna.
  return getPositionOnce({ enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 })
}

// Stato corrente in base all'ultima timbratura.
function currentState(last) {
  if (!last) return 'off'
  const act = normalizeKind(last.kind)
  return act === 'end' ? 'off' : act // 'travel' | 'work' | 'break' | 'off'
}

// Azioni disponibili per ciascuno stato (in ordine di rilevanza).
const ACTIONS = {
  off: [
    { kind: 'travel', label: '🚗 Inizio viaggio', cls: 'travel' },
    { kind: 'work', label: '🔧 Inizio lavoro', cls: 'work' },
  ],
  travel: [
    { kind: 'work', label: '🔧 Inizio lavoro', cls: 'work' },
    { kind: 'end', label: '🏁 Fine giornata', cls: 'end' },
  ],
  work: [
    { kind: 'break', label: '⏸ Inizio pausa', cls: 'break' },
    { kind: 'travel', label: '🚗 Inizio viaggio', cls: 'travel' },
    { kind: 'end', label: '🏁 Fine giornata', cls: 'end' },
  ],
  break: [
    { kind: 'work', label: '🔧 Riprendi lavoro', cls: 'work' },
    { kind: 'end', label: '🏁 Fine giornata', cls: 'end' },
  ],
}

const STATE_LABEL = {
  off: 'Fuori servizio',
  travel: 'In viaggio',
  work: 'Al lavoro',
  break: 'In pausa',
}

// Suggerimento contestuale per chiarire il flusso (in particolare il ritorno).
const STATE_HINT = {
  off: 'Inizia la giornata: «Inizio viaggio» se devi raggiungere il cliente, oppure «Inizio lavoro» se sei già sul posto.',
  travel: 'Quando arrivi dal cliente premi «Inizio lavoro». Al rientro, «Fine giornata» chiude anche il viaggio di ritorno in corso (un solo tocco).',
  work: 'Per il rientro premi «Inizio viaggio»; se vai da un altro cliente, premi di nuovo «Inizio lavoro» all’arrivo.',
  break: 'Al termine della pausa premi «Riprendi lavoro». Il tempo di pausa non è conteggiato.',
}

const ACTIVITY_ICON = { travel: '🚗', work: '🔧', break: '⏸', end: '🏁' }

export default function Timbrature({ user, permConfig = null }) {
  const canPunch = puo(user, 'timbrature.timbra', permConfig)
  const [last, setLast] = useState(null)
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('') // '' | 'locating'
  const [error, setError] = useState('')
  const [hasConsent, setHasConsent] = useState(() => {
    try { return Boolean(localStorage.getItem(consentKey(user.id))) } catch { return false }
  })
  const [showNotice, setShowNotice] = useState(false)
  const [clients, setClients] = useState([])
  const [picker, setPicker] = useState(null) // { pos, candidates } durante l'inizio lavoro

  // Anagrafica clienti (per il riconoscimento via GPS e il menu a tendina).
  useEffect(() => {
    let alive = true
    listClients().then((c) => alive && setClients(c)).catch(() => {})
    return () => { alive = false }
  }, [])

  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]))
  const clientLabel = (c) => c.clientName || clientsById[c.clientId]?.name || (c.clientId ? 'cliente' : '')

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [l, list] = await Promise.all([getLastClocking(user.id), getMyClockings(user.id, 30)])
    setLast(l)
    setMine(list)
    setLoading(false)
  }

  useLiveData(refresh, [user.id], subscribeToClockings)

  function acceptConsent() {
    try { localStorage.setItem(consentKey(user.id), new Date().toISOString()) } catch { /* no-op */ }
    setHasConsent(true)
  }

  const state = currentState(last)
  const actions = ACTIONS[state]
  const pendingCount = mine.filter((c) => c.pending).length

  // Registra effettivamente la timbratura (eventualmente con il cliente scelto).
  async function doPunch(kind, pos, clientPayload = {}) {
    setBusy(true)
    setError('')
    try {
      const saved = await createClocking({ employeeId: user.id, kind, ...(pos || {}), ...clientPayload })
      // Cross-check GPS↔IP (best-effort) solo per timbrature online con posizione.
      if (saved && !saved.pending && saved.lat != null) requestIpCheck(saved)
      await refresh()
    } catch (err) {
      setError(err.message || 'Timbratura non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  async function punch(kind) {
    setBusy(true)
    setError('')
    setPhase('locating')
    let pos = null
    try {
      pos = await getPosition()
    } catch { /* posizione non disponibile: si procede senza */ }
    setPhase('')
    // All'inizio lavoro, se ci sono clienti in anagrafica, proponi la scelta
    // (riconoscendo dalla posizione i più vicini). Il cliente è facoltativo.
    if (kind === 'work' && clients.length > 0) {
      setBusy(false)
      setPicker({ pos, candidates: nearestClients(clients, pos?.lat, pos?.lng) })
      return
    }
    await doPunch(kind, pos)
  }

  // Gate consenso: prima della prima timbratura serve l'informativa.
  if (!hasConsent) {
    return <PrivacyNotice onAccept={acceptConsent} />
  }

  if (showNotice) {
    return <PrivacyNotice readOnly onClose={() => setShowNotice(false)} />
  }

  return (
    <main className="content">
      <h2 className="section-title">Timbratura presenze</h2>

      <div className={`clock-status ${state}`}>
        <span className="clock-dot" />
        Sei <strong>{STATE_LABEL[state]}</strong>
        {state !== 'off' && last && <span className="clock-since"> · dalle {formatDateTime(last.punchedAt)}</span>}
      </div>

      {error && <p className="error">{error}</p>}

      {canPunch ? (
        <>
          <div className="clock-actions">
            {actions.map((a) => (
              <button
                key={a.kind}
                className={`btn-primary btn-block big-confirm clock-btn ${a.cls}`}
                disabled={busy}
                onClick={() => punch(a.kind)}
              >
                {phase === 'locating' ? '📍 Rilevo la posizione…' : busy ? 'Registrazione…' : a.label}
              </button>
            ))}
          </div>

          <p className="muted small center clock-hint">{STATE_HINT[state]}</p>
        </>
      ) : (
        <p className="muted small center clock-hint">
          La timbratura non è abilitata per la tua categoria. Puoi consultare lo storico qui sotto.
        </p>
      )}

      {pendingCount > 0 && (
        <p className="clock-pending-banner">
          ⏳ {pendingCount === 1 ? '1 timbratura salvata' : `${pendingCount} timbrature salvate`} sul dispositivo:
          {pendingCount === 1 ? ' verrà inviata' : ' verranno inviate'} automaticamente appena torna la connessione.
        </p>
      )}

      <p className="muted center small" style={{ marginTop: 10 }}>
        📍 La posizione è rilevata solo ora, all'atto della timbratura.
        {' '}<button className="link-btn" onClick={() => setShowNotice(true)}>Informativa privacy</button>
      </p>

      <h3 className="mini-title">Le mie timbrature</h3>
      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : mine.length === 0 ? (
        <p className="muted small">Nessuna timbratura registrata.</p>
      ) : (
        <div className="list">
          {mine.map((c) => {
            const act = normalizeKind(c.kind)
            return (
              <div key={c.id} className="card clock-row">
                <span className={`badge clock-badge ${act}`}>
                  {ACTIVITY_ICON[act]} {ACTIVITIES[act]?.label ?? act}
                </span>
                <span className="clock-row-time">
                  {formatDateTime(c.punchedAt)}
                  {clientLabel(c) && <span className="clock-client">🏢 {clientLabel(c)}</span>}
                </span>
                {c.pending ? (
                  <span className="clock-pending">⏳ da inviare</span>
                ) : c.lat != null ? (
                  <a className="clock-map" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                ) : (
                  <span className="muted small">senza posizione</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {picker && (
        <ClientPicker
          candidates={picker.candidates}
          clients={clients}
          onCancel={() => setPicker(null)}
          onConfirm={(payload) => {
            const pos = picker.pos
            setPicker(null)
            doPunch('work', pos, payload)
          }}
        />
      )}
    </main>
  )
}
