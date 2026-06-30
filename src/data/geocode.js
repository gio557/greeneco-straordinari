// Ricerca indirizzi tramite Nominatim (OpenStreetMap) — nessuna chiave API.
//
// Uso rispettoso delle policy OSM: il chiamante (componente) applica un debounce
// e una lunghezza minima; qui aggiungiamo una piccola cache in memoria per non
// ripetere le stesse richieste. I dati sono © OpenStreetMap contributors.
//
// La chiamata avviene dal browser dell'utente (lato client): Nominatim espone
// CORS, quindi non serve alcun proxy o backend.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const cache = new Map()

// Cerca indirizzi/luoghi che corrispondono a `query`. Restituisce un array di
// { label, address, lat, lng, name }. In caso di errore di rete restituisce [].
export async function searchAddress(query, { limit = 6, signal } = {}) {
  const q = (query || '').trim()
  if (q.length < 3) return []
  if (cache.has(q)) return cache.get(q)

  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    namedetails: '1',
    'accept-language': 'it',
    limit: String(limit),
    q,
  })
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    const out = (Array.isArray(data) ? data : []).map((r) => ({
      label: r.display_name,
      address: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      name: r.namedetails?.name || null,
    }))
    cache.set(q, out)
    return out
  } catch {
    // Rete assente o richiesta annullata: nessun suggerimento.
    return []
  }
}
