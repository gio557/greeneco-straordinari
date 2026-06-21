import { useState } from 'react'

// Schermata di accesso: ID (o email) + password.
// La verifica delle credenziali avviene lato database (vedi supabase/schema.sql).
export default function Login({ onLogin, onBack }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onLogin(identifier, password)
    } catch (err) {
      setError(err.message || 'Accesso non riuscito.')
      setBusy(false)
    }
  }

  return (
    <div className="login">
      {onBack && (
        <button className="back-link" onClick={onBack}>‹ Torna alle aree</button>
      )}
      <div className="login-brand">
        <img className="login-logo" src="./greeneco-logo.jpeg" alt="greeneco wastewater" />
        <h1>Operations</h1>
        <p>Richieste di ore straordinarie</p>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">ID utente o email</span>
          <input
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="es. emp-1"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Accesso…' : 'Accedi'}
        </button>
      </form>

      <p className="login-hint">
        Account demo — Admin: <code>admin</code> / <code>admin123</code> ·
        {' '}Altri utenti: <code>mgr-1</code>, <code>emp-1</code>… / <code>demo123</code>
      </p>
    </div>
  )
}
