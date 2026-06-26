import { useEffect, useState } from 'react'
import { getFineScanUrl } from './api.js'

// Risolve gli URL (firmati, a scadenza) delle scansioni allegate alle multe.
// Ritorna una mappa { fineId: url }. Si ricalcola quando cambia l'elenco multe
// (gli URL firmati scadono, quindi è giusto rigenerarli).
export function useFineAttachments(fines) {
  const [urls, setUrls] = useState({})

  useEffect(() => {
    let cancelled = false
    const withAttachment = (fines || []).filter((f) => f.attachmentUrl)
    if (withAttachment.length === 0) {
      setUrls({})
      return
    }
    Promise.all(
      withAttachment.map(async (f) => {
        try {
          return [f.id, await getFineScanUrl(f.attachmentUrl)]
        } catch {
          return [f.id, null]
        }
      })
    ).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs))
    })
    return () => { cancelled = true }
  }, [fines])

  return urls
}
