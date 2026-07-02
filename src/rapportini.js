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
export function buildRapportinoRecord({ fields = {}, signatures = {}, user = null, existing = null, status = 'archived' } = {}) {
  const s = summarizeRapportino(fields)
  return {
    id: existing?.id,
    authorId: user?.id ?? null,
    authorName: user?.name ?? '',
    interventionId: s.interventionId,
    clientName: s.clientName,
    docDate: s.docDate,
    status,
    data: { fields, signatures },
  }
}

// Etichetta breve per una voce dell'elenco (quando l'ID intervento manca).
export function rapportinoLabel(rec) {
  if (!rec) return 'Rapportino'
  return (rec.interventionId && rec.interventionId.trim())
    || (rec.clientName && rec.clientName.trim())
    || 'Rapportino senza ID'
}
