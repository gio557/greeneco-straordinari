import { useState } from 'react'

// Schermata di accesso: ID (o email) + password.
// `role` ('staff' | 'employee') è solo il percorso scelto nella schermata
// iniziale e personalizza intestazione e suggerimenti: il ruolo effettivo
// dell'utente è determinato dalle credenziali (verifica lato database).
export default function Login({ onLogin, onBack, role }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isStaff = role === 'staff'
  const subtitle = isStaff
    ? 'Accesso manager / amministratore'
    : 'Accesso dipendente'

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
        <button className="back-link" onClick={onBack}>‹ Indietro</button>
      )}
      <div className="login-brand">
        <img className="login-logo" src="./greeneco-logo.jpeg" alt="greeneco wastewater" />
        <h1>Operations</h1>
        <p>{subtitle}</p>
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
            placeholder={isStaff ? 'es. mgr-1' : 'es. emp-1'}
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
        {isStaff ? (
          <>Account demo — Admin: <code>admin</code> / <code>admin123</code> ·
          {' '}Manager: <code>mgr-1</code> / <code>demo123</code></>
        ) : (
          <>Account demo — <code>emp-1</code>, <code>emp-2</code>… / <code>demo123</code></>
        )}
      </p>
    </div>
  )
}
