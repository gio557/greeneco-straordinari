import { useEffect, useState } from 'react'
import {
  getUserMap, getEmployeeDocuments, createEmployeeDocument, deleteEmployeeDocument,
  uploadDocFile, getDocFileUrl, subscribeToDocuments, listVehicles,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { DOC_KINDS } from '../documents.js'
import { initials } from '../utils.js'
import FineAttachment from './FineAttachment.jsx'
import FineForm from './FineForm.jsx'

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}

// Gestione documenti per l'ufficio paghe (e admin): si sceglie il dipendente,
// poi si caricano/gestiscono i suoi Cedolini e Sanzioni Disciplinari. Il
// destinatario è sempre in evidenza per evitare errori di attribuzione.
export default function PagheCassetti({ user }) {
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    setUserMap(await getUserMap())
    setLoading(false)
  }
  useLiveData(refresh, [user.id])

  const employees = Object.values(userMap)
    .filter((u) => u.role === 'employee')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  if (selected) {
    const emp = userMap[selected]
    return <EmployeeDrawer user={user} employeeId={selected} name={emp?.name || selected} onBack={() => setSelected(null)} />
  }

  return (
    <main className="content dashboard">
      <h2 className="section-title">Cassetti dei dipendenti</h2>
      <p className="muted small">Scegli un dipendente per gestire i suoi documenti (cedolini e sanzioni disciplinari).</p>
      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : employees.length === 0 ? (
        <p className="muted small">Nessun dipendente.</p>
      ) : (
        <div className="list">
          {employees.map((e) => (
            <button key={e.id} className="card emp-pick" onClick={() => setSelected(e.id)}>
              <span className="avatar avatar-sm">{initials(e.name)}</span>
              <span className="emp-pick-text">
                <span className="emp-pick-name">{e.name}</span>
                <span className="muted small">{e.department || '—'} · <code>{e.id}</code></span>
              </span>
              <span className="area-arrow" aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

function EmployeeDrawer({ user, employeeId, name, onBack }) {
  const [docs, setDocs] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [vehicles, setVehicles] = useState([])
  const [showFine, setShowFine] = useState(false)
  const [fineSaved, setFineSaved] = useState(false)

  useEffect(() => { listVehicles().then(setVehicles).catch(() => {}) }, [])

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const list = await getEmployeeDocuments(employeeId)
    setDocs(list)
    setLoading(false)
    const pairs = await Promise.all(
      list.filter((d) => d.attachmentPath).map(async (d) => {
        try { return [d.id, await getDocFileUrl(d.attachmentPath)] } catch { return [d.id, null] }
      })
    )
    setUrls(Object.fromEntries(pairs))
  }
  useLiveData(refresh, [employeeId], subscribeToDocuments)

  async function remove(d) {
    if (!window.confirm('Eliminare questo documento?')) return
    await deleteEmployeeDocument(d.id)
    await refresh()
  }

  return (
    <main className="content">
      <button className="back-link" onClick={onBack}>‹ Tutti i dipendenti</button>
      <div className="drawer-head">
        <span className="avatar avatar-sm">{initials(name)}</span>
        <h2 className="section-title" style={{ margin: 0 }}>Cassetto di {name}</h2>
      </div>

      {['cedolino', 'disciplinare'].map((kind) => {
        const list = docs.filter((d) => d.kind === kind)
        return (
          <section key={kind} className="drawer-section">
            <h3 className="mini-title">{DOC_KINDS[kind].plural}</h3>
            <AddDocForm employeeId={employeeId} kind={kind} user={user} name={name} onAdded={refresh} />
            {loading ? (
              <p className="muted center">Caricamento…</p>
            ) : list.length === 0 ? (
              <p className="muted small">Nessun documento.</p>
            ) : (
              <div className="list">
                {list.map((d) => (
                  <div key={d.id} className="card fine-card">
                    <div className="request-card-top">
                      <span className="request-employee">{d.title || DOC_KINDS[d.kind].label}</span>
                      {d.docDate && <span className="muted small">{fmtDate(d.docDate)}</span>}
                    </div>
                    {d.attachmentPath && <FineAttachment value={d.attachmentPath} url={urls[d.id]} />}
                    {d.needsAck && (
                      <p className="muted small">
                        {d.acknowledgedAt ? `Presa visione il ${fmtDate(d.acknowledgedAt)}` : 'In attesa di presa visione'}
                      </p>
                    )}
                    <div className="decision-actions">
                      <button className="btn-ghost btn-sm danger" onClick={() => remove(d)}>Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <section className="drawer-section">
        <h3 className="mini-title">Multe</h3>
        {fineSaved && (
          <p className="muted small">
            ✓ Multa registrata: è visibile a {name} nel suo Cassetto → Multe e nella scheda Automezzi → Sanzioni.
          </p>
        )}
        <button className="btn-primary btn-sm" onClick={() => { setFineSaved(false); setShowFine(true) }}>+ Registra multa</button>
        <p className="muted small">La multa sarà attribuita a <strong>{name}</strong> e gestita come tutte le altre (stessa notifica e presa visione).</p>
      </section>

      {showFine && (
        <FineForm
          vehicles={vehicles}
          employees={[{ id: employeeId, name }]}
          userMap={{ [employeeId]: { name } }}
          user={user}
          lockedEmployeeId={employeeId}
          onClose={() => setShowFine(false)}
          onSaved={() => { setShowFine(false); setFineSaved(true) }}
        />
      )}
    </main>
  )
}

function AddDocForm({ employeeId, kind, user, name, onAdded }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [docDate, setDocDate] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      let attachmentPath = null
      if (file) attachmentPath = await uploadDocFile(file)
      await createEmployeeDocument({
        employeeId,
        kind,
        title,
        docDate: docDate || null,
        attachmentPath,
        needsAck: DOC_KINDS[kind].needsAck,
        uploadedBy: user.id,
      })
      setTitle(''); setDocDate(''); setFile(null); setOpen(false)
      await onAdded()
    } catch (err) {
      setError(err.message || 'Caricamento non riuscito')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>+ Aggiungi {DOC_KINDS[kind].label.toLowerCase()}</button>
  }
  return (
    <form className="form drawer-form" onSubmit={submit}>
      <p className="muted small">Destinatario: <strong>{name}</strong></p>
      <label className="field"><span>Titolo</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'cedolino' ? 'es. Cedolino maggio 2026' : 'es. Richiamo verbale'} />
      </label>
      <label className="field"><span>Data documento</span>
        <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
      </label>
      <label className="field"><span>File (immagine o PDF)</span>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {file && <small className="muted">Selezionato: {file.name}</small>}
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Caricamento…' : 'Carica'}</button>
        <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Annulla</button>
      </div>
    </form>
  )
}
