import { AREAS } from './areas.jsx'
import { dataMode } from '../data/api.js'

// Icona "gestione utenti" (persone) per il pulsante admin.
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 13.6A5.5 5.5 0 0 1 20.5 19" />
    </svg>
  )
}

// Hub delle aree: dopo l'accesso, l'utente sceglie in quale macro-area entrare.
export default function Hub({ onSelect, user, onLogout, finesPending = 0, finesTotal = 0, onOpenFines }) {
  return (
    <div className="hub">
      {user && (
        <div className="hub-userbar">
          <span className="hub-user">
            {user.name}{user.department ? ` · ${user.department}` : ''}
          </span>
          <button className="btn-ghost btn-sm" onClick={onLogout}>Esci</button>
        </div>
      )}

      {finesPending > 0 && (
        <button className="hub-fine-banner" onClick={onOpenFines}>
          <span className="hub-fine-ico" aria-hidden>⚠️</span>
          <span>
            {finesPending === 1
              ? 'Ti è stata addebitata una sanzione'
              : `Ti sono state addebitate ${finesPending} sanzioni`}
            {' '}— tocca per prendere visione
          </span>
          <span className="area-arrow" aria-hidden>›</span>
        </button>
      )}
      {finesPending === 0 && finesTotal > 0 && (
        <button className="hub-fine-link" onClick={onOpenFines}>
          <span aria-hidden>📋</span>
          <span>Le mie sanzioni{finesTotal > 1 ? ` (${finesTotal})` : ''}</span>
          <span className="area-arrow" aria-hidden>›</span>
        </button>
      )}
      <div className="login-brand">
        <img className="login-logo" src="./greeneco-logo.jpeg" alt="greeneco wastewater" />
        <h1>Operations</h1>
        <p>Scegli un’area per iniziare</p>
      </div>

      <div className="hub-grid">
        {AREAS.map((area) => (
          <button
            key={area.id}
            className="area-card"
            style={{ '--accent': area.accent }}
            onClick={() => onSelect(area.id)}
          >
            <span className="area-icon">
              <area.Icon />
            </span>
            <span className="area-text">
              <span className="area-title">{area.title}</span>
              <span className="area-sub">{area.subtitle}</span>
            </span>
            {!area.ready && <span className="area-soon">In arrivo</span>}
            <span className="area-arrow" aria-hidden>›</span>
          </button>
        ))}
      </div>

      {user?.role === 'admin' && (
        <div className="admin-section">
          <span className="admin-label">Amministrazione</span>
          <button
            className="area-card admin-card"
            style={{ '--accent': '#0d3b66' }}
            onClick={() => onSelect('utenti')}
          >
            <span className="area-icon"><PeopleIcon /></span>
            <span className="area-text">
              <span className="area-title">Gestione utenti</span>
              <span className="area-sub">Crea e modifica utenti, ID e password</span>
            </span>
            <span className="area-arrow" aria-hidden>›</span>
          </button>
        </div>
      )}

      <p className={`data-mode data-mode-${dataMode}`}>
        <span className="data-dot" aria-hidden />
        {dataMode === 'supabase'
          ? 'Database centrale attivo · dati condivisi in tempo reale'
          : 'Modalità demo · dati salvati solo su questo dispositivo'}
      </p>
    </div>
  )
}
