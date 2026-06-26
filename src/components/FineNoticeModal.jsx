import { formatDateTime } from '../utils.js'
import { formatEuro } from '../fines.js'

// Avviso evidente all'accesso quando ci sono sanzioni non ancora prese in visione.
export default function FineNoticeModal({ fines, busy, onAcknowledgeAll, onOpenDetails, onClose }) {
  const one = fines.length === 1
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 className="mini-title">⚠️ {one ? 'Hai una sanzione da prendere visione' : `Hai ${fines.length} sanzioni da prendere visione`}</h3>
        <p className="muted small">
          {one ? 'Ti è stata addebitata una sanzione' : 'Ti sono state addebitate delle sanzioni'} relativa
          all'uso di un mezzo aziendale.
        </p>
        <div className="list">
          {fines.slice(0, 4).map((f) => (
            <div key={f.id} className="card fine-card">
              <div className="fine-amount">{formatEuro(f.amount)}</div>
              <div className="fine-meta">
                <div>📅 {formatDateTime(f.infractionAt)}{f.type ? ` · ${f.type}` : ''}</div>
                {f.place && <div>📍 {f.place}</div>}
              </div>
            </div>
          ))}
          {fines.length > 4 && <p className="muted small">…e altre {fines.length - 4}.</p>}
        </div>
        <div className="form-actions">
          <button className="btn-primary" onClick={onOpenDetails}>Vedi dettaglio e contesta</button>
          <button className="btn-ghost" disabled={busy} onClick={onAcknowledgeAll}>
            {busy ? 'Attendere…' : 'Ho preso visione'}
          </button>
        </div>
        <button className="link-btn" style={{ marginTop: 6 }} onClick={onClose}>Più tardi</button>
      </div>
    </div>
  )
}
