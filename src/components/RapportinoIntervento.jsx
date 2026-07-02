import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import {
  saveRapportino, getAllRapportini, deleteRapportino, subscribeToRapportini,
  listClients, upsertClient,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { puo } from '../permissions.js'
import { buildRapportinoRecord, rapportinoLabel, groupByClient } from '../rapportini.js'

// ---------------------------------------------------------------------------
// Rapportino d'intervento GreenEco — riproduzione fedele del modulo cartaceo,
// compilabile dall'operatore, ARCHIVIABILE (elenco + consultazione) e
// trasformabile in un PDF pronto da inviare al cliente. Le due firme
// (Responsabile e Referente) si tracciano col dito (touch), con la penna o col
// mouse. Vedi il facsimile in src/index.css (sezione "Rapportini d'intervento").
// ---------------------------------------------------------------------------

const INK = '#12356e' // colore inchiostro firma (come da design)
const PEN_WIDTH = 2.6 // spessore penna

// Data odierna in formato gg-mm-aaaa (come sul modulo cartaceo).
function oggiLabel() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

// Riquadro firma. Nel modulo mostra la firma in piccolo (sola visualizzazione);
// TOCCANDOLO si apre a tutto schermo un'area di firma grande ("esplosione") per
// firmare comodi. Sotto il campo grande c'è "Conferma": riporta la firma
// (ritagliata e ridimensionata) nel riquadro originale. `initial` (data URL)
// mostra una firma già archiviata in consultazione.
const SignaturePad = forwardRef(function SignaturePad({ height = 96, initial = null, label = 'Firma', onChange }, ref) {
  const smallRef = useRef(null)
  const bigRef = useRef(null)
  const drawnRef = useRef(false)
  const bboxRef = useRef(null)      // riquadro dei tratti nel canvas grande (px CSS)
  const bigMetaRef = useRef(null)   // { ratio } del canvas grande
  const [expanded, setExpanded] = useState(false)

  useImperativeHandle(ref, () => ({
    clear() {
      const c = smallRef.current
      if (!c) return
      const ctx = c.getContext('2d')
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore()
      drawnRef.current = false
    },
    toDataURL() {
      const c = smallRef.current
      if (!c || !drawnRef.current) return null
      try { return c.toDataURL('image/png') } catch { return null }
    },
  }))

  // Dimensiona il riquadro piccolo e, in consultazione, vi disegna la firma
  // archiviata (adattata mantenendo le proporzioni).
  useEffect(() => {
    const canvas = smallRef.current
    if (!canvas) return
    let raf = 0
    function init() {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) { raf = requestAnimationFrame(init); return }
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      if (initial) {
        const img = new Image()
        img.onload = () => {
          const dW = canvas.width, dH = canvas.height
          const s = Math.min(dW / img.width, dH / img.height)
          const dw = img.width * s, dh = img.height * s
          canvas.getContext('2d').drawImage(img, (dW - dw) / 2, (dH - dh) / 2, dw, dh)
          drawnRef.current = true
        }
        img.src = initial
      }
    }
    init()
    return () => cancelAnimationFrame(raf)
  }, [initial])

  // Canvas grande (overlay): disegno a mano libera + traccia del riquadro dei tratti.
  useEffect(() => {
    if (!expanded) return
    const canvas = bigRef.current
    if (!canvas) return
    let raf = 0
    let cleanup = () => {}
    function init() {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) { raf = requestAnimationFrame(init); return }
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 4
      const cssW = rect.width
      bboxRef.current = null
      bigMetaRef.current = { ratio }
      let drawing = false, last = null
      const pt = (e) => {
        const r = canvas.getBoundingClientRect()
        const s = cssW / r.width
        return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s }
      }
      const grow = (p) => {
        const b = bboxRef.current
        if (!b) bboxRef.current = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
        else { b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y); b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y) }
      }
      const down = (e) => {
        e.preventDefault(); drawing = true; last = pt(e); grow(last)
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
      }
      const move = (e) => {
        if (!drawing) return
        e.preventDefault()
        const p = pt(e)
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke()
        grow(p); last = p
      }
      const up = () => { drawing = false }
      canvas.addEventListener('pointerdown', down)
      canvas.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      cleanup = () => {
        canvas.removeEventListener('pointerdown', down)
        canvas.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
    }
    init()
    return () => { cancelAnimationFrame(raf); cleanup() }
  }, [expanded])

  function clearBig() {
    const c = bigRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore()
    bboxRef.current = null
  }

  // "Conferma": ritaglia la firma disegnata in grande e la riporta nel riquadro
  // piccolo mantenendo le proporzioni (centrata). Se non è stato disegnato nulla,
  // il riquadro piccolo resta com'era.
  function confirm() {
    const big = bigRef.current, small = smallRef.current, b = bboxRef.current, meta = bigMetaRef.current
    if (big && small && b && meta) {
      const pad = 10
      const sx = Math.max(0, (b.minX - pad)) * meta.ratio
      const sy = Math.max(0, (b.minY - pad)) * meta.ratio
      const sw = (b.maxX - b.minX + pad * 2) * meta.ratio
      const sh = (b.maxY - b.minY + pad * 2) * meta.ratio
      const dW = small.width, dH = small.height
      const scale = Math.min(dW / sw, dH / sh)
      const dw = sw * scale, dh = sh * scale
      const dx = (dW - dw) / 2, dy = (dH - dh) / 2
      const sctx = small.getContext('2d')
      sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, dW, dH)
      sctx.drawImage(big, sx, sy, sw, sh, dx, dy, dw, dh)
      sctx.restore()
      drawnRef.current = true
      onChange?.()
    }
    setExpanded(false)
  }

  return (
    <>
      <canvas
        ref={smallRef}
        className="rap-sig"
        style={{ height: `${height}px`, cursor: 'pointer' }}
        title="Tocca per firmare in grande"
        onClick={() => setExpanded(true)}
      />
      {expanded && (
        <div className="sig-overlay no-print" onClick={() => setExpanded(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sig-modal-head">{label} — firma qui</div>
            <canvas ref={bigRef} className="sig-big" />
            <div className="sig-modal-actions">
              <button type="button" className="btn-ghost" onClick={clearBig}>Cancella</button>
              <button type="button" className="btn-ghost" onClick={() => setExpanded(false)}>Annulla</button>
              <button type="button" className="btn-primary" onClick={confirm}>Conferma</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})

// Campo "Cliente" con selezione dall'anagrafica: al focus mostra i clienti già
// in archivio (con ricerca mentre si scrive); selezionandone uno il campo si
// compila con ragione sociale + indirizzo. Se il cliente non c'è, si può
// scriverlo a mano (resta testo libero nel rapportino) oppure aggiungerlo
// all'anagrafica per riutilizzarlo. La textarea mantiene il `name`, così
// serializzazione, PDF e consultazione continuano a funzionare come prima.
function ClientField({ name, style, placeholder, onChange }) {
  const taRef = useRef(null)
  const [clients, setClients] = useState([])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ name: '', address: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    listClients().then((c) => { if (alive) setClients(c) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = clients.filter((c) => c.active !== false)
    const list = s
      ? base.filter((c) => `${c.name} ${c.address || ''}`.toLowerCase().includes(s))
      : base
    // Mostra TUTTI i clienti (la lista è scorrevole); il tetto alto è solo una
    // salvaguardia per anagrafiche enormi.
    return list.slice(0, 300)
  }, [clients, q])

  function fill(c) {
    const text = c.address ? `${c.name}\n${c.address}` : c.name
    if (taRef.current) taRef.current.value = text
    setOpen(false)
    setAdding(false)
    onChange?.(c) // notifica il cliente selezionato (per il legame all'anagrafica)
  }

  async function addNew(e) {
    e.preventDefault()
    const nm = nc.name.trim()
    if (!nm || busy) return
    setBusy(true)
    try {
      const saved = await upsertClient({ name: nm, address: nc.address.trim() })
      setClients((prev) => [...prev.filter((x) => x.id !== saved.id), saved])
      fill(saved)
      setNc({ name: '', address: '' })
    } catch { /* ignora: in caso di errore resta il testo libero */ } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rap-client"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setAdding(false) } }}
    >
      <textarea
        ref={taRef}
        className="rap-ta"
        name={name}
        style={style}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onInput={(e) => { setQ(e.target.value); setOpen(true) }}
      />
      {open && (
        <div className="rap-client-menu no-print">
          {matches.length > 0 ? (
            <ul className="rap-client-list">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" className="rap-client-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => fill(c)}>
                    <span className="rap-client-name">{c.name}</span>
                    {c.address && <span className="muted small">{c.address}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rap-client-none muted small">Nessun cliente in anagrafica con questo testo.</div>
          )}
          {!adding ? (
            <button
              type="button"
              className="rap-client-add"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setAdding(true); setNc({ name: q.trim(), address: '' }) }}
            >
              ＋ Aggiungi nuovo cliente all'anagrafica
            </button>
          ) : (
            <form className="rap-client-form" onSubmit={addNew}>
              <input placeholder="Ragione sociale" value={nc.name} onChange={(e) => setNc((v) => ({ ...v, name: e.target.value }))} />
              <input placeholder="Indirizzo (facoltativo)" value={nc.address} onChange={(e) => setNc((v) => ({ ...v, address: e.target.value }))} />
              <div className="rap-client-form-actions">
                <button type="submit" className="btn-primary btn-sm" disabled={busy || !nc.name.trim()}>{busy ? 'Salvataggio…' : 'Aggiungi'}</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Annulla</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// Una riga della tabella orari: 15 celle compilabili (Data, viaggio, lavorazione,
// ore effettive, km). Ogni cella ha un `name` stabile per l'archiviazione.
function TimeRow({ row }) {
  return (
    <tr>
      {Array.from({ length: 15 }, (_, col) => (
        <td key={col}>
          <input className="rap-time" name={`t_${row}_${col}`} />
        </td>
      ))}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// MODULO compilabile (nuovo o in consultazione). Uncontrolled: i valori si
// leggono/scrivono dal DOM tramite `name`, così il modulo resta leggero.
// ---------------------------------------------------------------------------
function RapportinoForm({ user, initial = null, existingId = null, initialStatus = null, initialClient = null, onBack, onArchived, registerNavGuard }) {
  const sheetRef = useRef(null)
  const sigRespRef = useRef(null)
  const sigRefRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState('')
  const [recId, setRecId] = useState(existingId)
  const [status, setStatus] = useState(initialStatus)  // 'archived' | 'draft' | null (nuovo)
  const [clientSel, setClientSel] = useState(initialClient?.id ? { id: initialClient.id, name: initialClient.name } : null) // cliente scelto dall'anagrafica
  const [dirty, setDirty] = useState(false)            // modifiche non salvate
  const [tick, setTick] = useState(0)                  // ogni modifica: riarma l'autosave
  const [autoMsg, setAutoMsg] = useState('')           // indicatore salvataggio automatico
  const [leavePrompt, setLeavePrompt] = useState(null) // { proceed } quando si sta uscendo

  // Segnala una modifica: marca "sporco" e riarma il debounce dell'autosave.
  function markDirty() { setDirty(true); setTick((t) => t + 1) }

  // Consultazione: ripopola i campi (uncontrolled) dal record archiviato.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet || !initial) return
    const f = initial.fields || {}
    sheet.querySelectorAll('input[name], textarea[name]').forEach((el) => {
      if (el.name in f) el.value = f[el.name] ?? ''
    })
  }, [initial])

  function collectFields() {
    const sheet = sheetRef.current
    const fields = {}
    if (sheet) sheet.querySelectorAll('input[name], textarea[name]').forEach((el) => { fields[el.name] = el.value })
    return fields
  }

  function signatures() {
    return {
      resp: sigRespRef.current?.toDataURL?.() || null,
      ref: sigRefRef.current?.toDataURL?.() || null,
    }
  }

  // C'è qualcosa di sostanziale da salvare? (esclude i default di modulo vuoto:
  // data odierna e nome autore precompilati) — evita bozze "vuote".
  function hasContent() {
    const f = collectFields()
    const anyField = Object.entries(f).some(([k, v]) => k !== 'data_compilazione' && k !== 'autore' && String(v || '').trim() !== '')
    return anyField || !!signatures().resp || !!signatures().ref
  }

  // Persistenza vera e propria (usata sia dal salvataggio manuale sia dall'autosave).
  async function persist(nextStatus) {
    const record = buildRapportinoRecord({ fields: collectFields(), signatures: signatures(), user, existing: recId ? { id: recId } : null, status: nextStatus, client: clientSel })
    const saved = await saveRapportino(record)
    setRecId(saved.id)
    setStatus(nextStatus)
    setDirty(false)
    onArchived?.(saved)
    return saved
  }

  // Salvataggio manuale: 'archived' (archivio, visibile a tutti) o 'draft' (bozza).
  async function salva(nextStatus) {
    if (archiving) return null
    setArchiveMsg('')
    setArchiving(true)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    try {
      const saved = await persist(nextStatus)
      setAutoMsg('')
      setArchiveMsg(nextStatus === 'draft' ? '✓ Bozza salvata.' : (recId ? '✓ Rapportino aggiornato in archivio.' : '✓ Rapportino archiviato.'))
      return saved
    } catch (err) {
      console.error('[rapportino] salvataggio fallito:', err)
      setArchiveMsg('Salvataggio non riuscito. Riprova.')
      throw err
    } finally {
      setArchiving(false)
    }
  }

  // AUTOSAVE: dopo una breve pausa dall'ultima modifica, salva automaticamente
  // come bozza (o mantiene lo stato attuale se il rapportino è già in archivio,
  // così l'autosave non lo "retrocede" a bozza). Silenzioso, con indicatore.
  useEffect(() => {
    if (!dirty) return undefined
    const t = setTimeout(async () => {
      if (archiving || !hasContent()) return
      const eff = status || 'draft'
      try {
        setAutoMsg('Salvataggio automatico…')
        await persist(eff)
        const hh = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        setAutoMsg(`Salvato automaticamente ${eff === 'draft' ? 'in bozze' : 'in archivio'} · ${hh}`)
      } catch {
        setAutoMsg('Salvataggio automatico non riuscito — salva a mano')
      }
    }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, dirty])

  // Uscita "protetta": se ci sono modifiche non salvate, chiede prima cosa fare.
  function attemptLeave(proceed) {
    if (dirty) setLeavePrompt({ proceed })
    else proceed()
  }

  async function leaveWith(status) {
    const p = leavePrompt?.proceed
    try { await salva(status) } catch { return } // se il salvataggio fallisce resta nel modulo
    setLeavePrompt(null)
    p?.()
  }
  function leaveDiscard() {
    const p = leavePrompt?.proceed
    setDirty(false); setLeavePrompt(null)
    p?.()
  }

  // Registra la "guardia" per le uscite gestite dall'app (back dell'header,
  // logout): attiva solo quando ci sono modifiche non salvate.
  useEffect(() => {
    if (!registerNavGuard) return undefined
    registerNavGuard(dirty ? attemptLeave : null)
    return () => registerNavGuard(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  // Chiusura/refresh del browser: avviso nativo se ci sono modifiche non salvate.
  useEffect(() => {
    if (!dirty) return undefined
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  async function salvaPdf() {
    const sheet = sheetRef.current
    if (!sheet || saving) return
    setError('')
    setSaving(true)
    // Toglie il focus da un eventuale campo (evita lo sfondo giallo nel PDF).
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()

    try {
      // Le librerie PDF (pesanti) si caricano solo al primo salvataggio, così
      // l'avvio della PWA resta leggero.
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ])

      // Rende ad alta risoluzione: puntiamo a un output di circa 1640px di
      // larghezza indipendentemente dalla dimensione a schermo.
      const scale = Math.min(3, Math.max(2, 1640 / sheet.offsetWidth))
      const canvas = await html2canvas(sheet, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        // Nel clone per la cattura nascondiamo i pulsanti "Cancella".
        onclone: (doc) => {
          doc.querySelectorAll('.rapportino .no-print').forEach((el) => {
            el.style.display = 'none'
          })
        },
      })

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 6
      const availW = pageW - margin * 2
      const availH = pageH - margin * 2
      const aspect = canvas.height / canvas.width
      let w = availW
      let h = w * aspect
      if (h > availH) {
        h = availH
        w = h / aspect
      }
      const x = (pageW - w) / 2
      // JPEG (sfondo bianco pieno): il PDF resta leggero, adatto all'invio via
      // e-mail. Le firme sono tratti scuri su bianco, quindi la qualità è ottima.
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, margin, w, h)

      const idRaw = (sheet.querySelector('[data-field="id"]')?.value || 'intervento').trim()
      const idSafe = (idRaw || 'intervento').replace(/[^\w\-]+/g, '_').slice(0, 40)
      pdf.save(`Rapportino_${idSafe}_${oggiLabel()}.pdf`)
    } catch (err) {
      console.error('[rapportino] generazione PDF fallita:', err)
      setError('Non è stato possibile generare il PDF. Riprova.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="content rapportino">
      <div className="rap-toolbar no-print">
        <button className="back-link" onClick={() => attemptLeave(onBack)}>‹ Archivio rapportini</button>
        <span className="rap-toolbar-title">
          {recId ? 'Rapportino d\'intervento · consultazione' : 'Rapportino d\'intervento · nuovo'}
        </span>
        <div className="rap-toolbar-actions">
          <button className="btn-ghost" onClick={() => salva('draft')} disabled={archiving}>Salva in bozze</button>
          <button className="btn-ghost" onClick={() => salva('archived')} disabled={archiving}>
            {archiving ? 'Salvataggio…' : (recId ? 'Aggiorna archivio' : 'Salva in archivio')}
          </button>
          <button className="btn-primary" onClick={salvaPdf} disabled={saving}>
            {saving ? 'Generazione…' : 'Salva PDF'}
          </button>
        </div>
      </div>

      {leavePrompt && (
        <div className="modal-overlay no-print" onClick={() => setLeavePrompt(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="mini-title">Salvare il rapportino?</h3>
            <p className="muted small">Ci sono modifiche non salvate. Cosa vuoi fare prima di uscire?</p>
            <div className="form-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn-primary" disabled={archiving} onClick={() => leaveWith('archived')}>Salva in archivio</button>
              <button className="btn-ghost" disabled={archiving} onClick={() => leaveWith('draft')}>Salva in bozze</button>
              <button className="btn-ghost danger" disabled={archiving} onClick={leaveDiscard}>Esci senza salvare</button>
              <button className="btn-ghost" disabled={archiving} onClick={() => setLeavePrompt(null)}>Annulla</button>
            </div>
          </div>
        </div>
      )}
      {autoMsg && <p className="muted small rap-toolbar" style={{ marginTop: 0 }}>{autoMsg}</p>}
      {archiveMsg && <p className="muted small rap-toolbar" style={{ marginTop: 0 }}>{archiveMsg}</p>}
      {error && <p className="error rap-toolbar" style={{ marginTop: 0 }}>{error}</p>}

      <div className="rap-desk">
        <div className="rap-scroll">
          <div className="rap-sheet" ref={sheetRef} onInput={() => markDirty()}>

            {/* ===== INTESTAZIONE ===== */}
            <table>
              <tbody>
                <tr>
                  <td className="rap-logocell">
                    <img className="rap-logo" src="./greeneco-logo.png" alt="greeneco WASTEWATER" />
                  </td>
                  <td className="rap-headtitle-cell">
                    <div className="rap-headtitle">
                      TRATTAMENTO<br />e DEPURAZIONE<br />delle ACQUE REFLUE<br />CIVILI e INDUSTRIALI
                    </div>
                  </td>
                  <td className="rap-idcell" rowSpan={2}>
                    <div className="rap-idbox">
                      <div className="rap-lbl rap-lbl-t">ID intervento di manutenzione</div>
                      <input className="rap-hf" data-field="id" name="id" />
                    </div>
                    <div className="rap-idbox rap-idbox-bt">
                      <div className="rap-lbl rap-lbl-t">Data di compilazione</div>
                      <input className="rap-hf" name="data_compilazione" defaultValue={oggiLabel()} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="rap-contacts">
                    <div><b>SEDE OPERATIVA</b> Via Pastore, 5 Ovada (AL) &nbsp;&nbsp; <b>SEDE LEGALE</b> Corso Vinzaglio, 2 Torino (TO)</div>
                    <div>+ 39 0143 822882</div>
                    <div>info@greeneco-wastewater.com &nbsp;&nbsp; www.greeneco-wastewater.com</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ===== CLIENTE ===== */}
            <table>
              <tbody>
                <tr>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl">Richiesto da</div>
                    <input className="rap-in" name="richiesto_da" />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl">Conferito con</div>
                    <input className="rap-in" name="conferito_con" />
                  </td>
                  <td style={{ width: '34%' }} rowSpan={2}>
                    <div className="rap-lbl">Cliente (Indirizzo e Fatturazione)</div>
                    <ClientField name="cliente_fatturazione" style={{ height: '120px' }} onChange={(c) => { markDirty(); if (c?.id) setClientSel({ id: c.id, name: c.name }) }} />
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    <div className="rap-lbl">Cliente (Luogo della prestazione)</div>
                    <ClientField name="cliente_luogo" style={{ height: '88px', fontSize: '15px' }} onChange={(c) => { markDirty(); if (c?.id) setClientSel({ id: c.id, name: c.name }) }} />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ===== ORARI / ORE / KM ===== */}
            <table>
              <tbody>
                <tr>
                  <td rowSpan={3} className="rap-th rap-data">Data</td>
                  <td colSpan={4} className="rap-th">Orari in Viaggio</td>
                  <td colSpan={4} className="rap-th">Orari di Lavorazione</td>
                  <td colSpan={4} className="rap-th">Ore effettive</td>
                  <td colSpan={2} className="rap-th">Km percorsi</td>
                </tr>
                <tr>
                  <td colSpan={2} className="rap-th2">Mattina</td>
                  <td colSpan={2} className="rap-th2">Sera</td>
                  <td colSpan={2} className="rap-th2">Mattina</td>
                  <td colSpan={2} className="rap-th2">Sera</td>
                  <td rowSpan={2} className="rap-th3">In Viaggio</td>
                  <td rowSpan={2} className="rap-th3">Lavorato</td>
                  <td rowSpan={2} className="rap-th3">Straordinario</td>
                  <td rowSpan={2} className="rap-th3">Festivito</td>
                  <td rowSpan={2} className="rap-th3">Mattinata</td>
                  <td rowSpan={2} className="rap-th3">Sera</td>
                </tr>
                <tr>
                  <td className="rap-th4">Inizio</td>
                  <td className="rap-th4">Fine</td>
                  <td className="rap-th4">Inizio</td>
                  <td className="rap-th4">Fine</td>
                  <td className="rap-th4">Inizio</td>
                  <td className="rap-th4">Fine</td>
                  <td className="rap-th4">Inizio</td>
                  <td className="rap-th4">Fine</td>
                </tr>
                {Array.from({ length: 5 }, (_, i) => <TimeRow key={i} row={i} />)}
              </tbody>
            </table>

            {/* ===== DESCRIZIONE + COLONNE LATERALI ===== */}
            <table>
              <tbody>
                <tr>
                  <td style={{ width: '52%' }}>
                    <div className="rap-lbl rap-lbl-t">Descrizione Intervento</div>
                    <textarea className="rap-lined rap-lined-lg" name="descrizione" style={{ height: '360px' }} />
                  </td>
                  <td style={{ width: '16%' }}>
                    <div className="rap-lbl rap-lbl-t">Tipo di Manutenzione</div>
                    <textarea className="rap-lined rap-lined-sm" name="tipo_manutenzione" style={{ height: '360px' }} />
                  </td>
                  <td style={{ width: '16%' }}>
                    <div className="rap-lbl rap-lbl-t">Sezione di Impianto</div>
                    <textarea className="rap-lined rap-lined-sm" name="sezione_impianto" style={{ height: '360px' }} />
                  </td>
                  <td style={{ width: '16%' }}>
                    <div className="rap-lbl rap-lbl-t">Materiale/Bene</div>
                    <textarea className="rap-lined rap-lined-sm" name="materiale_bene" style={{ height: '360px' }} />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ===== ESITO / MANUTENTORI / AUTORE + FIRMA RESPONSABILE ===== */}
            <table>
              <tbody>
                <tr>
                  <td style={{ width: '34%' }} rowSpan={2}>
                    <div className="rap-lbl rap-lbl-t">Esito dell'intervento di manutenzione</div>
                    <textarea className="rap-lined2" name="esito" style={{ height: '132px' }} />
                  </td>
                  <td style={{ width: '33%' }} rowSpan={2}>
                    <div className="rap-lbl rap-lbl-t">Manutentori presenti</div>
                    <textarea className="rap-lined2" name="manutentori_presenti" style={{ height: '132px' }} />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl rap-lbl-t">Autore Descrizione Intervento</div>
                    <input className="rap-in" name="autore" style={{ height: '34px', fontSize: '14px' }} defaultValue={user?.name || ''} />
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="rap-sig-head">
                      <span className="rap-sig-lbl">Firma del Responsabile</span>
                      <button className="rap-clear no-print" onClick={() => { sigRespRef.current?.clear(); markDirty() }}>Cancella</button>
                    </div>
                    <SignaturePad ref={sigRespRef} height={96} initial={initial?.signatures?.resp || null} label="Firma del Responsabile" onChange={() => markDirty()} />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ===== CLIENTE: REFERENTE / FIRMA / NOTE ===== */}
            <table>
              <tbody>
                <tr>
                  <td colSpan={3} className="rap-band">CLIENTE</td>
                </tr>
                <tr>
                  <td style={{ width: '34%' }}>
                    <div className="rap-lbl rap-lbl-t">Referente</div>
                    <textarea className="rap-ta" name="referente" style={{ height: '88px' }} />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-sig-head">
                      <span className="rap-sig-lbl">Firma del Referente</span>
                      <button className="rap-clear no-print" onClick={() => { sigRefRef.current?.clear(); markDirty() }}>Cancella</button>
                    </div>
                    <SignaturePad ref={sigRefRef} height={88} initial={initial?.signatures?.ref || null} label="Firma del Referente" onChange={() => markDirty()} />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl rap-lbl-t">Note</div>
                    <textarea className="rap-ta" name="note" style={{ height: '88px' }} />
                  </td>
                </tr>
              </tbody>
            </table>

          </div>
        </div>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// ARCHIVIO: elenco dei rapportini + apertura in consultazione o nuovo modulo.
// Visibilità: TUTTI i rapportini sono accessibili a chiunque entri nell'area,
// a prescindere dalla categoria. L'eliminazione resta però riservata all'autore
// e a chi ha la visibilità estesa (dati.tutti), per evitare cancellazioni
// accidentali del lavoro altrui.
// ---------------------------------------------------------------------------
export default function RapportinoIntervento({ user, permConfig = null, registerNavGuard, openRecord = null, onConsumedOpen }) {
  const canDeleteAny = puo(user, 'dati.tutti', permConfig)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState({ mode: 'list' }) // 'list' | 'new' | { mode:'view', record }
  const [openClient, setOpenClient] = useState(null)  // cliente espanso nell'archivio

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    setItems(await getAllRapportini())
    setLoading(false)
  }
  useLiveData(refresh, [user.id], subscribeToRapportini)

  // Apertura "profonda" da un'altra area (es. Anagrafica clienti → un rapportino).
  useEffect(() => {
    if (openRecord) {
      setView({ mode: 'view', record: openRecord })
      onConsumedOpen?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecord])

  async function remove(rec) {
    const what = rec.status === 'draft' ? 'questa bozza' : 'questo rapportino dall\'archivio'
    if (!window.confirm(`Eliminare ${what}?`)) return
    await deleteRapportino(rec.id)
    await refresh()
  }

  if (view.mode === 'new') {
    return (
      <RapportinoForm
        user={user}
        registerNavGuard={registerNavGuard}
        onBack={() => { setView({ mode: 'list' }); refresh() }}
        onArchived={() => refresh()}
      />
    )
  }
  if (view.mode === 'view') {
    return (
      <RapportinoForm
        user={user}
        registerNavGuard={registerNavGuard}
        initial={view.record?.data || null}
        existingId={view.record?.id || null}
        initialStatus={view.record?.status || null}
        initialClient={{ id: view.record?.clientId, name: view.record?.clientName }}
        onBack={() => { setView({ mode: 'list' }); refresh() }}
        onArchived={() => refresh()}
      />
    )
  }

  // Bozze: solo le proprie (WIP privato). Archivio: tutti gli archiviati,
  // raggruppati per cliente (struttura annidata come le timbrature).
  const drafts = items.filter((r) => r.status === 'draft' && r.authorId === user.id)
  const archived = items.filter((r) => r.status !== 'draft')
  const groups = groupByClient(archived)

  const renderItem = (r) => (
    <div key={r.id} className="card fine-card">
      <button className="rap-item" onClick={() => setView({ mode: 'view', record: r })}>
        <span className="rap-item-main">
          <span className="request-employee">
            {rapportinoLabel(r)}{r.status === 'draft' ? ' · bozza' : ''}
          </span>
          <span className="muted small">{r.docDate || '—'}{r.authorName ? ` · ${r.authorName}` : ''}</span>
        </span>
        <span className="area-arrow" aria-hidden>›</span>
      </button>
      {(canDeleteAny || r.authorId === user.id) && (
        <div className="decision-actions">
          <button className="btn-ghost btn-sm danger" onClick={() => remove(r)}>Elimina</button>
        </div>
      )}
    </div>
  )

  return (
    <main className="content">
      <div className="page-head">
        <h2 className="section-title">Rapportini d'intervento</h2>
        <button className="btn-primary btn-sm" onClick={() => setView({ mode: 'new' })}>+ Nuovo rapportino</button>
      </div>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : (
        <>
          {drafts.length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <h3 className="mini-title">Le tue bozze</h3>
              <p className="muted small">Rapportini non ancora archiviati. Li vedi solo tu.</p>
              <div className="list">{drafts.map(renderItem)}</div>
            </section>
          )}
          <section>
            <h3 className="mini-title">Archivio per cliente</h3>
            {groups.length === 0 ? (
              <p className="muted small">Nessun rapportino archiviato. Premi “+ Nuovo rapportino” per compilarne uno.</p>
            ) : (
              <>
                <p className="muted small">Tocca un cliente per vedere i suoi rapportini.</p>
                <div className="list">
                  {groups.map((g) => {
                    const open = openClient === g.key
                    return (
                      <div key={g.key || '(nessuno)'} className="card rap-cligroup">
                        <button className="rap-item" onClick={() => setOpenClient(open ? null : g.key)}>
                          <span className="ts-caret" aria-hidden>{open ? '▾' : '▸'}</span>
                          <span className="rap-item-main">
                            <span className="request-employee">{g.label}</span>
                            <span className="muted small">{g.items.length} rapportin{g.items.length === 1 ? 'o' : 'i'}</span>
                          </span>
                        </button>
                        {open && (
                          <div className="rap-subitems">
                            {g.items.map(renderItem)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}
