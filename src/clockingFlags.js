// ---------------------------------------------------------------------------
// Controlli anti-frode (Livello 1) su una singola timbratura.
//
// Non "bloccano" nulla: producono SEGNALAZIONI da mostrare al manager, così le
// situazioni anomale sono evidenti e verificabili da una persona. La verità
// sull'orario è già garantita dal server (vedi trigger nello schema); qui si
// interpretano le tracce raccolte (posizione, scarto d'orologio, offline).
// ---------------------------------------------------------------------------

// Oltre questo scarto tra orologio del dispositivo e server, l'orario del
// telefono è considerato "sfasato" (possibile manomissione o device mal regolato).
export const SKEW_LIMIT_S = 300 // 5 minuti

// Ritardo di sincronizzazione oltre il quale una timbratura offline è "in ritardo".
export const OFFLINE_DELAY_LIMIT_S = 2 * 3600 // 2 ore

// Ritorna l'elenco dei controlli rilevanti per la timbratura.
// Ogni voce: { code, label, level } con level 'warn' (da verificare) o 'info'.
export function clockingChecks(c) {
  if (!c) return []
  const checks = []

  if (c.lat == null) {
    checks.push({ code: 'no-gps', label: 'senza posizione', level: 'warn' })
  }

  if (c.clockSkewSeconds != null && Math.abs(c.clockSkewSeconds) > SKEW_LIMIT_S) {
    const min = Math.round(c.clockSkewSeconds / 60)
    checks.push({ code: 'skew', label: `orologio ${min > 0 ? '+' : ''}${min} min`, level: 'warn' })
  }

  if (c.offline) {
    let label = 'offline'
    const delay = offlineDelaySeconds(c)
    if (delay != null && delay > OFFLINE_DELAY_LIMIT_S) {
      label = `offline · ritardo ${Math.round(delay / 3600)} h`
    }
    checks.push({ code: 'offline', label, level: 'info' })
  }

  return checks
}

// Secondi tra l'orario dichiarato (punched_at) e l'arrivo al server (received_at).
export function offlineDelaySeconds(c) {
  if (!c || !c.receivedAt || !c.punchedAt) return null
  const d = (Date.parse(c.receivedAt) - Date.parse(c.punchedAt)) / 1000
  return Number.isFinite(d) ? d : null
}

// Vero se la timbratura richiede una verifica (almeno un controllo 'warn').
export function isToVerify(c) {
  return clockingChecks(c).some((x) => x.level === 'warn')
}
