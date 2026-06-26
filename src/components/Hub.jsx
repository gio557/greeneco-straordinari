import { AREAS } from './areas.jsx'
import { dataMode } from '../data/api.js'
import { puo } from '../permissions.js'

// Mappa area → permesso di visibilità. Le aree "in arrivo" (placeholder) non
// hanno un permesso dedicato e restano visibili a tutti.
const AREA_PERM = {
  timbrature: 'area.timbrature',
  straordinari: 'area.straordinari',
  automezzi: 'area.automezzi',
}

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

function DrawerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10.5h17" /><path d="M10 13.8h4" />
    </svg>
  )
}
function DocsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3h6l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v4h4" /><path d="M9.5 12h5M9.5 15h3" />
    </svg>
  )
}
function ShieldKeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 2.6v5c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8v-5z" />
      <circle cx="10.4" cy="11" r="1.8" /><path d="M11.7 12.3l2.6 2.6M13.4 13.9l-1 1" />
    </svg>
  )
}

// Hub delle aree: dopo l'accesso, l'utente sceglie in quale macro-area entrare.
export default function Hub({ onSelect, user, onLogout, finesPending = 0, onOpenFines, permConfig = null }) {
  const can = (perm) => puo(user, perm, permConfig)
  const showAdminSection = can('area.utenti') || can('area.permessi')
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
      <div className="login-brand">
        <img className="login-logo" src="./greeneco-logo.jpeg" alt="greeneco wastewater" />
        <h1>Operations</h1>
        <p>Scegli un’area per iniziare</p>
      </div>

      <div className="hub-grid">
        {can('area.cassetto') && (
          <button className="area-card" style={{ '--accent': '#0d3b66' }} onClick={() => onSelect('cassetto')}>
            <span className="area-icon"><DrawerIcon /></span>
            <span className="area-text">
              <span className="area-title">Cassetto del dipendente</span>
              <span className="area-sub">Cedolini, multe e sanzioni disciplinari</span>
            </span>
            <span className="area-arrow" aria-hidden>›</span>
          </button>
        )}
        {can('cassetti.manage') && (
          <button className="area-card" style={{ '--accent': '#2e9e5b' }} onClick={() => onSelect('cassetti-paghe')}>
            <span className="area-icon"><DocsIcon /></span>
            <span className="area-text">
              <span className="area-title">Cassetti dei dipendenti</span>
              <span className="area-sub">Carica cedolini e sanzioni disciplinari (ufficio paghe)</span>
            </span>
            <span className="area-arrow" aria-hidden>›</span>
          </button>
        )}
        {AREAS.filter((area) => !AREA_PERM[area.id] || can(AREA_PERM[area.id])).map((area) => (
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

      {showAdminSection && (
        <div className="admin-section">
          <span className="admin-label">Amministrazione</span>
          {can('area.utenti') && (
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
          )}
          {can('area.permessi') && (
            <button
              className="area-card admin-card"
              style={{ '--accent': '#6b46c1' }}
              onClick={() => onSelect('permessi')}
            >
              <span className="area-icon"><ShieldKeyIcon /></span>
              <span className="area-text">
                <span className="area-title">Categorie &amp; Permessi</span>
                <span className="area-sub">Reparti e cosa ciascuno può vedere e modificare</span>
              </span>
              <span className="area-arrow" aria-hidden>›</span>
            </button>
          )}
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
