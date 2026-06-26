import { isImageAttachment } from '../fines.js'

// Mostra l'allegato della multa: anteprima se è un'immagine, comunque un link.
// `url` è l'URL firmato già risolto (può essere ancora in caricamento → null).
export default function FineAttachment({ value, url }) {
  if (!value) return null
  const img = isImageAttachment(value)
  return (
    <div className="fine-attach">
      {img && url && (
        <a href={url} target="_blank" rel="noreferrer">
          <img className="fine-scan-thumb" src={url} alt="Scansione del verbale" />
        </a>
      )}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">📎 {img ? 'Apri scansione' : 'Vedi scansione del verbale'}</a>
      ) : (
        <span className="muted small">📎 Allegato presente…</span>
      )}
    </div>
  )
}
