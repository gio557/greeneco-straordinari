import { useState } from 'react'

// Modale di conferma con password: chiede la password dell'utente abilitato e
// la verifica (tramite `onConfirm`) prima di applicare un'azione sensibile.
// `onConfirm(pwd)` deve lanciare un Error in caso di errore: il messaggio viene
// mostrato all'utente (es. «Password non corretta.»).
export default function PasswordConfirm({
  title = 'Conferma',
  summary,
  confirmLabel = 'Conferma',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!pwd) { setErr('Inserisci la password.'); return }
    setBusy(true)
    setErr('')
    try {
      await onConfirm(pwd)
    } catch (e2) {
      setErr(e2?.message || 'Operazione non riuscita.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="mini-title">{title}</h3>
        {summary && <p className="muted small">{summary}.</p>}
        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">La tua password</span>
            <input
              className="input"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="decision-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>Annulla</button>
            <button type="submit" className={danger ? 'btn-reject' : 'btn-primary'} disabled={busy}>
              {busy ? 'Verifica…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
