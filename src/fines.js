// Etichette di stato e formattazioni per le multe/sanzioni.

export const FINE_STATUS = {
  registered: { label: 'Da prendere visione', cls: 'badge-pending' },
  acknowledged: { label: 'Presa visione', cls: 'badge-approved' },
  contested: { label: 'Contestata', cls: 'badge-rejected' },
  cancelled: { label: 'Annullata', cls: 'badge-muted' },
}

export function formatEuro(n) {
  if (n == null || n === '') return '—'
  return '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Trova il dipendente che aveva il mezzo alla data dell'infrazione, in base allo
// storico dei passaggi di consegna (per l'attribuzione automatica della multa).
export function suggestDriver(handovers, vehicleId, infractionISO) {
  if (!vehicleId || !infractionISO) return ''
  const t = Date.parse(infractionISO)
  if (!Number.isFinite(t)) return ''
  const candidates = (handovers || [])
    .filter(
      (h) =>
        h.vehicleId === vehicleId &&
        Date.parse(h.takenAt) <= t &&
        (!h.returnedAt || Date.parse(h.returnedAt) >= t)
    )
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
  return candidates[0]?.employeeId || ''
}
