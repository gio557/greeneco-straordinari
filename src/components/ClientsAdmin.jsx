import { Fragment, useEffect, useState } from 'react'
import { listClients, upsertClient, deleteClient, getAllRapportini } from '../data/api.js'
import { searchAddress } from '../data/geocode.js'
import { rapportinoLabel } from '../rapportini.js'
import AddressAutocomplete from './AddressAutocomplete.jsx'

// Anagrafica clienti: elenco e maschera di inserimento/modifica. L'indirizzo si
// compila tramite i suggerimenti di OpenStreetMap, che forniscono anche le
// coordinate usate per riconoscere il cliente in fase di timbratura.
export default function ClientsAdmin({ onOpenRapportino }) {
  const [clients, setClients] = useState([])
  const [rapByClient, setRapByClient] = useState({}) // clientId -> rapportini archiviati
  const [openClient, setOpenClient] = useState(null) // riga cliente espansa (rapportini)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | client

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [cl, raps] = await Promise.all([listClients(), getAllRapportini().catch(() => [])])
      setClients(cl)
      const map = {}
      for (const r of raps) {
        if (r.status === 'draft' || !r.clientId) continue // solo archiviati e legati a un cliente
        ;(map[r.clientId] = map[r.clientId] || []).push(r)
      }
      setRapByClient(map)
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
              <tr><th>Ragione sociale</th><th>Indirizzo</th><th>Posizione</th><th>Rapportini</th><th>Stato</th><th className="actions-col">Azioni</th></tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const raps = rapByClient[c.id] || []
                const open = openClient === c.id
                return (
                  <Fragment key={c.id}>
                    <tr className={raps.length ? 'ts-row-click' : ''}>
                      <td data-label="Ragione sociale">{c.name}</td>
                      <td data-label="Indirizzo">{c.address || '—'}</td>
                      <td data-label="Posizione">
                        {c.lat != null && c.lng != null
                          ? <a href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}`} target="_blank" rel="noreferrer">📍 mappa</a>
                          : <span className="muted small">senza coordinate</span>}
                      </td>
                      <td data-label="Rapportini">
                        {raps.length === 0
                          ? <span className="muted small">—</span>
                          : (
                            <button className="btn-ghost btn-sm" onClick={() => setOpenClient(open ? null : c.id)}>
                              <span className="ts-caret" aria-hidden>{open ? '▾' : '▸'}</span> {raps.length}
                            </button>
                          )}
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
                    {open && raps.length > 0 && (
                      <tr className="cli-raps-row">
                        <td colSpan={6}>
                          <div className="cli-raps">
                            {raps.map((r) => (
                              <button key={r.id} className="cli-rap-item" onClick={() => onOpenRapportino?.(r)}>
                                <span className="request-employee">{rapportinoLabel(r)}</span>
                                <span className="muted small">{r.docDate || '—'}{r.authorName ? ` · ${r.authorName}` : ''}</span>
                                <span className="area-arrow" aria-hidden>›</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
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
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')

  function onPick(r) {
    setAddress(r.address)
    setCoords({ lat: r.lat, lng: r.lng })
    if (!name.trim() && r.name) setName(r.name)
  }

  // Digitando a mano l'indirizzo le coordinate non sono più valide: si azzerano
  // così al salvataggio vengono ricavate automaticamente dal testo inserito.
  function onTypeAddress(v) {
    setAddress(v)
    setCoords({ lat: null, lng: null })
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Indica la ragione sociale.'); return }
    setBusy(true)
    setError('')
    try {
      let { lat, lng } = coords
      // Se mancano le coordinate ma c'è un indirizzo, prova a geolocalizzarlo.
      if ((lat == null || lng == null) && address.trim().length >= 3) {
        setPhase('Geolocalizzo l’indirizzo…')
        const res = await searchAddress(address.trim(), { limit: 1 })
        if (res[0]) { lat = res[0].lat; lng = res[0].lng }
        setPhase('')
      }
      await upsertClient({
        id: client?.id,
        name: name.trim(),
        address: address.trim(),
        lat,
        lng,
        active,
      })
      if (lat == null && address.trim()) {
        // Salvato comunque, ma avvisa che la posizione non è stata trovata.
        window.alert('Cliente salvato, ma non sono riuscito a trovare la posizione di questo indirizzo. Puoi correggerlo e riprovare, oppure selezionare un suggerimento.')
      }
      await onSaved()
    } catch (err) {
      setError(err.message || 'Salvataggio non riuscito.')
      setPhase('')
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
            onChange={onTypeAddress}
            onSelect={onPick}
            placeholder="Digita la via o il nome del cliente…"
          />
          <span className="field-hint">
            {coords.lat != null
              ? `✓ Posizione acquisita (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
              : 'Puoi selezionare un suggerimento, oppure scrivere l’indirizzo: la posizione verrà cercata al salvataggio.'}
          </span>
        </label>
        <label className="check-item" style={{ maxWidth: 260 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="check-name">Cliente attivo</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="decision-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Annulla</button>
          <button type="submit" className="btn-primary" disabled={busy}>{phase || (busy ? 'Salvataggio…' : 'Salva')}</button>
        </div>
      </form>
    </>
  )
}
