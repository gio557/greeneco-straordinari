import { useEffect, useState } from 'react'
import { listClients, upsertClient, deleteClient } from '../data/api.js'
import AddressAutocomplete from './AddressAutocomplete.jsx'

// Anagrafica clienti: elenco e maschera di inserimento/modifica. L'indirizzo si
// compila tramite i suggerimenti di OpenStreetMap, che forniscono anche le
// coordinate usate per riconoscere il cliente in fase di timbratura.
export default function ClientsAdmin() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | client

  async function load() {
    setLoading(true)
    setError('')
    try {
      setClients(await listClients())
    } catch (err) {
      setError(err.message || 'Errore nel caricamento dei clienti.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function remove(c) {
    if (!window.confirm(`Eliminare il cliente "${c.name}"?`)) return
    try {
      await deleteClient(c.id)
      await load()
    } catch (err) {
      window.alert(err.message || 'Eliminazione non riuscita.')
    }
  }

  if (editing) {
    return (
      <div className="board">
        <ClientForm
          client={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      </div>
    )
  }

  return (
    <div className="board">
      <div className="dash-filters">
        <h2 className="section-title">Anagrafica clienti</h2>
        <button className="btn-primary btn-sm" onClick={() => setEditing('new')}>+ Nuovo cliente</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : clients.length === 0 ? (
        <p className="muted small">Nessun cliente ancora. Aggiungine uno con «Nuovo cliente».</p>
      ) : (
        <div className="table-wrap">
          <table className="dash-table">
            <thead>
              <tr><th>Ragione sociale</th><th>Indirizzo</th><th>Posizione</th><th>Stato</th><th className="actions-col">Azioni</th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td data-label="Ragione sociale">{c.name}</td>
                  <td data-label="Indirizzo">{c.address || '—'}</td>
                  <td data-label="Posizione">
                    {c.lat != null && c.lng != null
                      ? <a href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                      : <span className="muted small">senza coordinate</span>}
                  </td>
                  <td data-label="Stato">
                    {c.active
                      ? <span className="badge badge-approved">attivo</span>
                      : <span className="badge badge-muted">disattivo</span>}
                  </td>
                  <td data-label="Azioni" className="actions-col">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(c)}>Modifica</button>
                    <button className="btn-ghost btn-sm danger" onClick={() => remove(c)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="login-hint">
        Suggerimenti indirizzi e coordinate forniti da OpenStreetMap. Le coordinate
        servono a riconoscere il cliente dalla posizione durante la timbratura.
      </p>
    </div>
  )
}

function ClientForm({ client, onCancel, onSaved }) {
  const isNew = !client
  const [name, setName] = useState(client?.name ?? '')
  const [address, setAddress] = useState(client?.address ?? '')
  const [coords, setCoords] = useState({ lat: client?.lat ?? null, lng: client?.lng ?? null })
  const [active, setActive] = useState(client?.active !== false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function onPick(r) {
    setAddress(r.address)
    setCoords({ lat: r.lat, lng: r.lng })
    if (!name.trim() && r.name) setName(r.name)
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Indica la ragione sociale.'); return }
    setBusy(true)
    setError('')
    try {
      await upsertClient({
        id: client?.id,
        name: name.trim(),
        address: address.trim(),
        lat: coords.lat,
        lng: coords.lng,
        active,
      })
      await onSaved()
    } catch (err) {
      setError(err.message || 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  return (
    <>
      <button className="back-link" onClick={onCancel}>‹ Torna all'elenco</button>
      <h2 className="section-title">{isNew ? 'Nuovo cliente' : `Modifica ${client.name}`}</h2>
      <form className="user-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Ragione sociale</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Indirizzo</span>
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            onSelect={onPick}
            placeholder="Digita la via o il nome del cliente…"
          />
          <span className="field-hint">
            {coords.lat != null
              ? `✓ Posizione acquisita (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
              : 'Seleziona un suggerimento per geolocalizzare il cliente (consigliato).'}
          </span>
        </label>
        <label className="check-item" style={{ maxWidth: 260 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="check-name">Cliente attivo</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="decision-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Annulla</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva'}</button>
        </div>
      </form>
    </>
  )
}
