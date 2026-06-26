// Etichette di stato e formattazioni per le multe/sanzioni.

export const FINE_STATUS = {
  registered: { label: 'Da prendere visione', cls: 'badge-pending' },
  acknowledged: { label: 'Presa visione', cls: 'badge-approved' },
  contested: { label: 'Contestata', cls: 'badge-rejected' },
  cancelled: { label: 'Annullata', cls: 'badge-muted' },
}

// Vero se l'allegato è un'immagine (per mostrarne l'anteprima). Riconosce data
// URL immagine e path/URL con estensione immagine.
export function isImageAttachment(value) {
  if (!value) return false
  if (/^data:image\//i.test(value)) return true
  const clean = String(value).split('?')[0].toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/.test(clean)
}

export function formatEuro(n) {
  if (n == null || n === '') return '—'
  return '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Passaggio di consegna che copriva il mezzo a una certa data (chi lo aveva in
// carico), in base allo storico. Ritorna l'handover o null.
export function findHandoverAt(handovers, vehicleId, atISO) {
  if (!vehicleId || !atISO) return null
  const t = Date.parse(atISO)
  if (!Number.isFinite(t)) return null
  return (
    (handovers || [])
      .filter(
        (h) =>
          h.vehicleId === vehicleId &&
          Date.parse(h.takenAt) <= t &&
          (!h.returnedAt || Date.parse(h.returnedAt) >= t)
      )
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0] || null
  )
}

// Dipendente che aveva il mezzo alla data dell'infrazione (per l'attribuzione
// automatica della multa).
export function suggestDriver(handovers, vehicleId, infractionISO) {
  return findHandoverAt(handovers, vehicleId, infractionISO)?.employeeId || ''
}
