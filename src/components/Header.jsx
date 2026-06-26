import { initials } from '../utils.js'
import { usePendingClockings } from '../data/usePendingClockings.js'

const ROLE_LABELS = {
  admin: 'Amministratore',
  manager: 'Manager',
  employee: 'Dipendente',
  paghe: 'Ufficio paghe',
}

export default function Header({ user, onLogout, onBack, finesCount = 0 }) {
  const roleLabel = ROLE_LABELS[user.role] ?? 'Utente'
  const pending = usePendingClockings()
  return (
    <header className="app-header">
      <div className="app-brandbar">
        {onBack && (
          <button className="app-back" onClick={onBack} aria-label="Torna alle aree">‹</button>
        )}
        <img className="app-logo" src="./greeneco-logo.jpeg" alt="greeneco wastewater" />
      </div>
      <div className="app-userbar">
        <div className="app-header-user">
          <div className="avatar">{initials(user.name)}</div>
          <div>
            <div className="app-header-name">{user.name}</div>
            <div className="app-header-role">
              {roleLabel}{user.department ? ` · ${user.department}` : ''}
            </div>
          </div>
        </div>
        <button className="btn-ghost" onClick={onLogout} aria-label="Esci">
          Esci
        </button>
      </div>
      {finesCount > 0 && (
        <div className="header-fine" role="status">
          ⚠️ {finesCount === 1 ? '1 sanzione da prendere visione' : `${finesCount} sanzioni da prendere visione`}
        </div>
      )}
      {pending > 0 && (
        <div className="header-pending" role="status">
          ⏳ {pending === 1 ? '1 timbratura' : `${pending} timbrature`} su questo dispositivo in attesa di invio — verrà{pending === 1 ? '' : 'anno'} inviata{pending === 1 ? '' : 'e'} appena torna la rete
        </div>
      )}
    </header>
  )
}
