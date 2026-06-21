import { AREAS } from './areas.jsx'
import { dataMode } from '../data/api.js'

// Hub delle aree: dopo l'accesso, l'utente sceglie in quale macro-area entrare.
export default function Hub({ onSelect, user, onLogout }) {
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

      <p className={`data-mode data-mode-${dataMode}`}>
        <span className="data-dot" aria-hidden />
        {dataMode === 'supabase'
          ? 'Database centrale attivo · dati condivisi in tempo reale'
          : 'Modalità demo · dati salvati solo su questo dispositivo'}
      </p>
    </div>
  )
}
