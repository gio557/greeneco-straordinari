// Utility geografiche per il riconoscimento del cliente dalla posizione GPS.

// Distanza in metri tra due coordinate (formula dell'haversine).
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const vals = [lat1, lng1, lat2, lng2]
  if (vals.some((v) => v == null || Number.isNaN(Number(v)))) return Infinity
  const R = 6371000 // raggio medio terrestre in metri
  const toRad = (d) => (Number(d) * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Raggio entro cui un cliente è considerato "qui" durante la timbratura.
export const DEFAULT_MATCH_RADIUS_M = 250

// Clienti entro `radius` metri dalla posizione, ordinati per distanza crescente.
// Ogni elemento include `distanceM` (metri arrotondati). I clienti senza
// coordinate o non attivi vengono ignorati.
export function nearestClients(clients, lat, lng, radius = DEFAULT_MATCH_RADIUS_M) {
  if (lat == null || lng == null) return []
  return (clients || [])
    .filter((c) => c && c.lat != null && c.lng != null && c.active !== false)
    .map((c) => ({ ...c, distanceM: Math.round(distanceMeters(lat, lng, c.lat, c.lng)) }))
    .filter((c) => c.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM)
}

// Distanza leggibile per l'utente: "120 m" oppure "1,3 km".
export function formatDistance(m) {
  if (m == null || !Number.isFinite(m)) return ''
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}
