// Tipi di documento del "Cassetto del Dipendente".
export const DOC_KINDS = {
  cedolino: { label: 'Cedolino', plural: 'Cedolini', needsAck: false },
  disciplinare: { label: 'Sanzione disciplinare', plural: 'Sanzioni Disciplinari', needsAck: true },
}

// FILTRO PRIVACY (centralizzato): restituisce SOLO i documenti del dipendente
// indicato e, se passato, del tipo indicato. Tutte le letture passano da qui:
// così un documento non può comparire nel cassetto di un'altra persona.
export function filterDocuments(documents, employeeId, kind) {
  if (!employeeId) return []
  return (documents || [])
    .filter((d) => d && d.employeeId === employeeId && (!kind || d.kind === kind))
    .sort((a, b) =>
      String(b.docDate || b.createdAt || '').localeCompare(String(a.docDate || a.createdAt || ''))
    )
}
