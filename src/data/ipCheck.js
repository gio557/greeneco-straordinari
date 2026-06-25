// Cross-check posizione GPS ↔ IP (Anti-frode Livello 3) — lato client.
//
// Chiede (best-effort) alla edge function `clocking-ip-check` di verificare la
// coerenza tra la posizione GPS dichiarata e la geolocalizzazione dell'IP.
// NON blocca e NON fa fallire la timbratura. È INERTE finché non viene abilitato
// con VITE_IP_CHECK_ENABLED=true (e la funzione non è stata deployata).

const ENABLED = import.meta.env.VITE_IP_CHECK_ENABLED === 'true'
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const FN_URL = SUPA_URL ? `${String(SUPA_URL).replace(/\/$/, '')}/functions/v1/clocking-ip-check` : null

export function requestIpCheck(clocking) {
  if (!ENABLED || !FN_URL || !clocking || !clocking.id || clocking.lat == null) return
  try {
    fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
      },
      body: JSON.stringify({ id: clocking.id, lat: clocking.lat, lng: clocking.lng }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* best-effort: si ignora qualsiasi errore */
  }
}
