// ---------------------------------------------------------------------------
// Livello "resiliente" per le TIMBRATURE — buffer di sicurezza sul dispositivo.
//
// Si attiva solo in modalità Supabase (database centrale). Aggiunge, sopra le
// normali chiamate al database, due reti di sicurezza contro i problemi di
// connessione:
//
//   1) MIRROR locale degli ultimi 7 giorni (cache di lettura): dopo ogni
//      lettura/scrittura riuscita le timbrature recenti restano salvate sul
//      dispositivo. Se il database non è raggiungibile, l'app continua a
//      mostrare lo storico recente e a conoscere lo stato corrente (quindi
//      quali pulsanti proporre).
//
//   2) OUTBOX (coda di scrittura offline): se una timbratura non raggiunge il
//      database viene salvata in una coda locale e CONFERMATA subito al
//      dipendente; l'invio viene poi ritentato automaticamente al ritorno
//      della connessione. Nessuna timbratura viene persa.
//
// La logica "pura" (unione/ordinamento/scadenza) è esportata e testata a
// parte; la persistenza usa localStorage, ma è iniettabile per i test.
// ---------------------------------------------------------------------------

const MIRROR_KEY = 'clock_mirror_v1'
const OUTBOX_KEY = 'clock_outbox_v1'
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// --- Logica pura (senza dipendenze dal browser) ----------------------------

// Deduplica per id (tiene la PRIMA occorrenza) e ordina dal più recente.
export function dedupeSortDesc(list) {
  const map = new Map()
  for (const c of list) if (c && c.id && !map.has(c.id)) map.set(c.id, c)
  return [...map.values()].sort((a, b) => String(b.punchedAt).localeCompare(String(a.punchedAt)))
}

// Scarta le timbrature più vecchie della finestra (default 7 giorni).
export function pruneOld(list, nowMs, windowMs = WEEK_MS) {
  const cutoff = nowMs - windowMs
  return list.filter((c) => {
    const t = Date.parse(c && c.punchedAt)
    return !Number.isFinite(t) || t >= cutoff
  })
}

// Unisce i dati dal database con le timbrature ancora in coda (non sincronizzate)
// per quel dipendente, marcandole come `pending`.
export function mergeRemoteWithPending(remoteList, outbox, employeeId) {
  const ids = new Set(remoteList.map((c) => c.id))
  const pend = outbox
    .filter((i) => i.employeeId === employeeId && !ids.has(i.id))
    .map((i) => ({ ...i, pending: true }))
  return dedupeSortDesc([...pend, ...remoteList])
}

// --- Persistenza di default (localStorage) ---------------------------------

function defaultStorage() {
  return {
    read(key) {
      try {
        return JSON.parse(localStorage.getItem(key)) || []
      } catch {
        return []
      }
    },
    write(key, arr) {
      try {
        localStorage.setItem(key, JSON.stringify(arr))
      } catch {
        /* spazio esaurito o storage non disponibile: si ignora */
      }
    },
  }
}

function defaultGenId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `clk-${crypto.randomUUID()}`
  } catch {
    /* ignore */
  }
  return `clk-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

// --- Fabbrica del livello resiliente ---------------------------------------

export function makeResilientClockings(remote, options = {}) {
  const storage = options.storage || defaultStorage()
  const now = options.now || (() => Date.now())
  const genId = options.genId || defaultGenId

  const getMirror = () => storage.read(MIRROR_KEY)
  const saveMirror = (list) =>
    storage.write(MIRROR_KEY, pruneOld(dedupeSortDesc(list), now()).slice(0, 500))
  const mergeMirror = (fresh) => saveMirror([...(fresh || []), ...getMirror()]) // fresh vince

  // Segnala all'interfaccia che il numero di timbrature in attesa è cambiato,
  // così l'avviso nell'header si aggiorna subito (oltre al polling periodico).
  const notifyPending = () => {
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('clock-pending-changed'))
    } catch {
      /* ambiente senza window (test): si ignora */
    }
  }

  const getOutbox = () => storage.read(OUTBOX_KEY)
  const enqueue = (item) => {
    storage.write(OUTBOX_KEY, [...getOutbox(), item])
    notifyPending()
  }
  const dequeue = (id) => {
    storage.write(OUTBOX_KEY, getOutbox().filter((i) => i.id !== id))
    notifyPending()
  }

  const localView = (employeeId) => {
    const pend = getOutbox().filter((i) => i.employeeId === employeeId).map((i) => ({ ...i, pending: true }))
    const mir = getMirror().filter((c) => c.employeeId === employeeId)
    return dedupeSortDesc([...pend, ...mir])
  }

  // Offline conclamato: evita di attendere il timeout di rete e usa subito il
  // buffer locale. (navigator.onLine non è infallibile, ma quando è false la
  // rete è certamente assente.)
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

  let flushing = false
  async function flushOutbox() {
    if (flushing) return
    const pending = getOutbox()
    if (!pending.length) return
    flushing = true
    try {
      for (const item of pending) {
        try {
          const saved = await remote.createClocking({ ...item, offline: true })
          dequeue(item.id)
          mergeMirror([saved])
        } catch {
          break // ancora offline: si riproverà al prossimo evento "online"
        }
      }
    } finally {
      flushing = false
    }
  }

  async function createClocking(payload) {
    const ts = new Date(now()).toISOString()
    const item = {
      id: genId(),
      employeeId: payload.employeeId,
      kind: payload.kind,
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
      accuracy: payload.accuracy ?? null,
      clientId: payload.clientId ?? null,
      clientName: payload.clientName ?? null,
      punchedAt: ts, // ora del TOCCO, non della sincronizzazione
      deviceTime: ts,
    }
    if (!isOffline()) {
      try {
        const saved = await remote.createClocking({ ...item, offline: false })
        mergeMirror([saved])
        flushOutbox()
        return saved
      } catch {
        /* invio fallito: si bufferizza qui sotto */
      }
    }
    enqueue(item)
    mergeMirror([{ ...item, offline: true }])
    return { ...item, offline: true, pending: true }
  }

  async function getLastClocking(employeeId) {
    if (!isOffline()) {
      try {
        const r = await remote.getLastClocking(employeeId)
        if (r) mergeMirror([r])
        flushOutbox()
        return mergeRemoteWithPending(r ? [r] : [], getOutbox(), employeeId)[0] || null
      } catch {
        /* cade sul buffer locale */
      }
    }
    return localView(employeeId)[0] || null
  }

  async function getMyClockings(employeeId, limit = 50) {
    if (!isOffline()) {
      try {
        const r = await remote.getMyClockings(employeeId, limit)
        mergeMirror(r)
        flushOutbox()
        return mergeRemoteWithPending(r, getOutbox(), employeeId).slice(0, limit)
      } catch {
        /* cade sul buffer locale */
      }
    }
    return localView(employeeId).slice(0, limit)
  }

  async function getRecentClockings(limit = 300) {
    if (!isOffline()) {
      try {
        const r = await remote.getRecentClockings(limit)
        mergeMirror(r)
        flushOutbox()
        return r
      } catch {
        /* cade sul mirror locale */
      }
    }
    return dedupeSortDesc(getMirror()).slice(0, limit)
  }

  async function getClockingsInRange(fromISO, toISO) {
    if (!isOffline()) {
      try {
        const r = await remote.getClockingsInRange(fromISO, toISO)
        mergeMirror(r)
        return r
      } catch {
        /* cade sul mirror locale */
      }
    }
    return getMirror()
      .filter((c) => c.punchedAt >= fromISO && c.punchedAt < toISO)
      .sort((a, b) => String(a.punchedAt).localeCompare(String(b.punchedAt)))
  }

  // Quante timbrature sono in attesa di invio (per l'interfaccia).
  const pendingCount = () => getOutbox().length

  // Ritenta l'invio al ritorno della connessione e all'avvio.
  if (options.autoFlush !== false && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      flushOutbox()
    })
    flushOutbox()
  }

  return {
    getLastClocking,
    getMyClockings,
    getRecentClockings,
    getClockingsInRange,
    createClocking,
    subscribeToClockings: remote.subscribeToClockings,
    flushOutbox,
    pendingCount,
  }
}
