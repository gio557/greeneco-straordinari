import { useState } from 'react'
import { getLastClocking, getMyClockings, createClocking, subscribeToClockings } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { formatDateTime } from '../utils.js'
import { normalizeKind, ACTIVITIES } from '../timesheet.js'
import PrivacyNotice from './PrivacyNotice.jsx'

const consentKey = (userId) => `timbra_consent_${userId}`

// Rileva la posizione SOLO ora (all'atto della timbratura). Risolve a null se
// non disponibile o negata, senza bloccare la timbratura.
function getPosition() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
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

const ACTIVITY_ICON = { travel: '🚗', work: '🔧', break: '⏸', end: '🏁' }

export default function Timbrature({ user }) {
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

  async function punch(kind) {
    setBusy(true)
    setError('')
    setPhase('locating')
    try {
      const pos = await getPosition()
      setPhase('')
      await createClocking({ employeeId: user.id, kind, ...(pos || {}) })
      await refresh()
    } catch (err) {
      setError(err.message || 'Timbratura non riuscita.')
    } finally {
      setPhase('')
      setBusy(false)
    }
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
                <span className="clock-row-time">{formatDateTime(c.punchedAt)}</span>
                {c.lat != null ? (
                  <a className="clock-map" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                ) : (
                  <span className="muted small">senza posizione</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
