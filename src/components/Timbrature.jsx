import { useState } from 'react'
import { getLastClocking, getMyClockings, createClocking, subscribeToClockings } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { formatDateTime } from '../utils.js'
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

  const isIn = last?.kind === 'in'
  const nextKind = isIn ? 'out' : 'in'

  async function punch() {
    setBusy(true)
    setError('')
    setPhase('locating')
    try {
      const pos = await getPosition()
      setPhase('')
      await createClocking({ employeeId: user.id, kind: nextKind, ...(pos || {}) })
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

      <div className={`clock-status ${isIn ? 'in' : 'out'}`}>
        <span className="clock-dot" />
        {isIn ? 'Sei IN SERVIZIO' : 'Sei FUORI SERVIZIO'}
        {last && <span className="clock-since"> · dalle {formatDateTime(last.punchedAt)}</span>}
      </div>

      {error && <p className="error">{error}</p>}

      <button
        className={`btn-primary btn-block big-confirm clock-btn ${nextKind}`}
        disabled={busy}
        onClick={punch}
      >
        {phase === 'locating'
          ? '📍 Rilevo la posizione…'
          : busy
          ? 'Registrazione…'
          : nextKind === 'in'
          ? '▶ Timbra ENTRATA'
          : '■ Timbra USCITA'}
      </button>

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
          {mine.map((c) => (
            <div key={c.id} className="card clock-row">
              <span className={`badge ${c.kind === 'in' ? 'badge-approved' : 'badge-rejected'}`}>
                {c.kind === 'in' ? 'Entrata' : 'Uscita'}
              </span>
              <span className="clock-row-time">{formatDateTime(c.punchedAt)}</span>
              {c.lat != null ? (
                <a className="clock-map" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
              ) : (
                <span className="muted small">senza posizione</span>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
