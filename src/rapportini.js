// Helper (puri, testabili) per l'archivio dei Rapportini d'intervento.
// La UI compila un modulo (campi liberi) e qui costruiamo il record da salvare
// nell'archivio e i dati sintetici che servono per l'elenco/consultazione.

// Prima riga non vuota di un testo (per ricavare un'etichetta breve dai campi
// multi-riga come "Cliente (Luogo della prestazione)").
function firstLine(text) {
  if (!text) return ''
  for (const line of String(text).split('\n')) {
    const t = line.trim()
    if (t) return t
  }
  return ''
}

// Dati sintetici ricavati dai campi del modulo, usati per l'elenco e la ricerca.
export function summarizeRapportino(fields = {}) {
  const interventionId = (fields.id || '').trim()
  const docDate = (fields.data_compilazione || '').trim()
  const clientName =
    firstLine(fields.cliente_luogo) ||
    firstLine(fields.cliente_fatturazione) ||
    (fields.richiesto_da || '').trim()
  return { interventionId, docDate, clientName }
}

// Costruisce il record da salvare/aggiornare nell'archivio. `existing` (se
// presente) porta l'id del rapportino già archiviato → aggiornamento anziché
// nuovo inserimento. I dati completi (campi + firme) restano in `data`, così il
// rapportino è auto-contenuto e ricomponibile in consultazione/PDF.
export function buildRapportinoRecord({ fields = {}, signatures = {}, user = null, existing = null, status = 'archived', client = null } = {}) {
  const s = summarizeRapportino(fields)
  return {
    id: existing?.id,
    authorId: user?.id ?? null,
    authorName: user?.name ?? '',
    interventionId: s.interventionId,
    // Legame all'anagrafica se un cliente è stato selezionato; altrimenti solo
    // il nome ricavato dal testo (clientId null).
    clientId: client?.id ?? null,
    clientName: client?.name ?? s.clientName,
    docDate: s.docDate,
    status,
    data: { fields, signatures },
  }
}

// Raggruppa i rapportini per cliente (per l'archivio "per cliente" e per
// l'anagrafica). Chiave: clientId se presente, altrimenti il nome normalizzato;
// i rapportini senza cliente finiscono nel gruppo speciale con key ''.
export function groupByClient(list = []) {
  const map = new Map()
  for (const r of list) {
    const key = r.clientId || (r.clientName || '').trim().toLowerCase()
    const label = (r.clientName || '').trim() || 'Senza cliente'
    if (!map.has(key)) map.set(key, { key, clientId: r.clientId || null, label, items: [] })
    map.get(key).items.push(r)
  }
  const groups = [...map.values()]
  // "Senza cliente" (key vuota) in fondo; gli altri per nome.
  groups.sort((a, b) => {
    if (a.key === '' && b.key !== '') return 1
    if (b.key === '' && a.key !== '') return -1
    return a.label.localeCompare(b.label)
  })
  return groups
}

// Etichetta breve per una voce dell'elenco (quando l'ID intervento manca).
export function rapportinoLabel(rec) {
  if (!rec) return 'Rapportino'
  return (rec.interventionId && rec.interventionId.trim())
    || (rec.clientName && rec.clientName.trim())
    || 'Rapportino senza ID'
}
