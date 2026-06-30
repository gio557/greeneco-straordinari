import { useState } from 'react'
import { formatDistance } from '../geo.js'

// Scelta del cliente in fase di "inizio lavoro". Mostra i clienti riconosciuti
// dalla posizione (i più vicini), un elenco completo come ripiego e un campo
// libero per un cliente nuovo. La scelta è FACOLTATIVA: «Salta» procede senza.
export default function ClientPicker({ candidates = [], clients = [], onConfirm, onCancel }) {
  // sel: { type:'client', id } | { type:'new', name } | null
  const [sel, setSel] = useState(candidates.length ? { type: 'client', id: candidates[0].id } : null)
  const [newName, setNewName] = useState('')
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]))
  const otherClients = clients.filter((c) => c.active !== false && !candidates.some((k) => k.id === c.id))

  function confirm() {
    if (sel?.type === 'client') {
      onConfirm({ clientId: sel.id, clientName: byId[sel.id]?.name || null })
    } else if (sel?.type === 'new' && newName.trim()) {
      onConfirm({ clientName: newName.trim() })
    } else {
      onConfirm({})
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="mini-title">Presso quale cliente inizi a lavorare?</h3>

        {candidates.length > 0 ? (
          <>
            <p className="muted small">Riconosciuti dalla tua posizione:</p>
            <div className="client-pick">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`client-opt${sel?.type === 'client' && sel.id === c.id ? ' selected' : ''}`}
                  onClick={() => setSel({ type: 'client', id: c.id })}
                >
                  <span className="client-opt-name">{c.name}</span>
                  <span className="client-opt-dist">{formatDistance(c.distanceM)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted small">Nessun cliente riconosciuto qui vicino: scegline uno o inseriscine uno nuovo.</p>
        )}

        {otherClients.length > 0 && (
          <label className="field" style={{ marginTop: 10 }}>
            <span className="field-label">{candidates.length ? 'Oppure scegli dall’elenco' : 'Scegli dall’elenco'}</span>
            <select
              className="input"
              value={sel?.type === 'client' && otherClients.some((c) => c.id === sel.id) ? sel.id : ''}
              onChange={(e) => e.target.value && setSel({ type: 'client', id: e.target.value })}
            >
              <option value="">— seleziona —</option>
              {otherClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <label className="field" style={{ marginTop: 10 }}>
          <span className="field-label">Oppure un cliente nuovo</span>
          <input
            className="input"
            value={newName}
            placeholder="Ragione sociale del cliente"
            onChange={(e) => { setNewName(e.target.value); setSel(e.target.value ? { type: 'new' } : null) }}
          />
        </label>

        <div className="decision-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn-ghost" onClick={onCancel}>Annulla</button>
          <button type="button" className="btn-ghost" onClick={() => onConfirm({})}>Salta</button>
          <button type="button" className="btn-primary" onClick={confirm}>Conferma e timbra</button>
        </div>
      </div>
    </div>
  )
}
