import { useState } from 'react'
import { getEmployeeDocuments, getDocFileUrl, acknowledgeDocument, subscribeToDocuments } from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { DOC_KINDS } from '../documents.js'
import FineAttachment from './FineAttachment.jsx'

function fmtDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return d
  }
}

// Elenco documenti di un tipo per il dipendente loggato (sola lettura). I
// disciplinari richiedono la presa visione. La lettura passa SEMPRE per il
// proprio user.id: nessun documento di altri può comparire qui.
export default function DocumentList({ user, kind }) {
  const [docs, setDocs] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const list = await getEmployeeDocuments(user.id, kind)
    setDocs(list)
    setLoading(false)
    const pairs = await Promise.all(
      list.filter((d) => d.attachmentPath).map(async (d) => {
        try { return [d.id, await getDocFileUrl(d.attachmentPath)] } catch { return [d.id, null] }
      })
    )
    setUrls(Object.fromEntries(pairs))
  }

  useLiveData(refresh, [user.id, kind], subscribeToDocuments)

  async function ack(d) {
    setBusy(d.id)
    try { await acknowledgeDocument(d.id, user.id); await refresh() } finally { setBusy('') }
  }

  const label = DOC_KINDS[kind]?.plural || 'Documenti'

  return (
    <div>
      <h3 className="mini-title">{label}</h3>
      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : docs.length === 0 ? (
        <div className="empty"><p>Nessun documento.</p></div>
      ) : (
        <div className="list">
          {docs.map((d) => (
            <div key={d.id} className="card fine-card">
              <div className="request-card-top">
                <span className="request-employee">{d.title || DOC_KINDS[d.kind]?.label || 'Documento'}</span>
                {d.docDate && <span className="muted small">{fmtDate(d.docDate)}</span>}
              </div>
              {d.attachmentPath && <FineAttachment value={d.attachmentPath} url={urls[d.id]} />}
              {d.needsAck && (
                d.acknowledgedAt ? (
                  <p className="muted small">Presa visione il {fmtDate(d.acknowledgedAt)}.</p>
                ) : (
                  <div className="decision-actions">
                    <button className="btn-approve" disabled={busy === d.id} onClick={() => ack(d)}>Presa visione</button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
