import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import {
  saveRapportino, getAllRapportini, deleteRapportino, subscribeToRapportini,
} from '../data/api.js'
import { useLiveData } from '../data/useLiveData.js'
import { puo } from '../permissions.js'
import { buildRapportinoRecord, rapportinoLabel } from '../rapportini.js'

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

// Riquadro firma disegnabile: pointer events (touch/penna/mouse) + scala per la
// densità di pixel del dispositivo, così il tratto resta nitido anche in PDF.
// `initial` (data URL) ridisegna una firma già archiviata in consultazione.
const SignaturePad = forwardRef(function SignaturePad({ height = 96, initial = null }, ref) {
  const canvasRef = useRef(null)
  const drawnRef = useRef(false)

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvasRef.current
      if (!c) return
      const ctx = c.getContext('2d')
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.restore()
      drawnRef.current = false
    },
    // Data URL della firma, o null se il riquadro è vuoto (niente da archiviare).
    toDataURL() {
      const c = canvasRef.current
      if (!c || !drawnRef.current) return null
      try { return c.toDataURL('image/png') } catch { return null }
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cleanup = () => {}

    // Attende il layout: dentro una tabella la larghezza è nota solo dopo il
    // primo frame. Se non è ancora pronta, riprova al frame successivo.
    let raf = 0
    function init() {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) {
        raf = requestAnimationFrame(init)
        return
      }
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const cssWidth = rect.width
      const cssHeight = rect.height

      // Consultazione: ridisegna la firma archiviata (scalata al riquadro).
      if (initial) {
        const img = new Image()
        img.onload = () => { ctx.drawImage(img, 0, 0, cssWidth, cssHeight); drawnRef.current = true }
        img.src = initial
      }

      let drawing = false
      let last = null

      const pt = (e) => {
        const r = canvas.getBoundingClientRect()
        const s = cssWidth / r.width
        return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s }
      }
      const down = (e) => {
        e.preventDefault()
        drawing = true
        drawnRef.current = true
        last = pt(e)
        if (canvas.setPointerCapture) {
          try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
        }
      }
      const move = (e) => {
        if (!drawing) return
        e.preventDefault()
        const p = pt(e)
        ctx.strokeStyle = INK
        ctx.lineWidth = PEN_WIDTH
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        last = p
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
    return () => {
      cancelAnimationFrame(raf)
      cleanup()
    }
  }, [initial])

  return <canvas ref={canvasRef} className="rap-sig" style={{ height: `${height}px` }} />
})

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
function RapportinoForm({ user, initial = null, existingId = null, onBack, onArchived }) {
  const sheetRef = useRef(null)
  const sigRespRef = useRef(null)
  const sigRefRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState('')
  const [recId, setRecId] = useState(existingId)

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

  async function salvaArchivio() {
    if (archiving) return
    setArchiveMsg('')
    setArchiving(true)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    try {
      const fields = collectFields()
      const signatures = {
        resp: sigRespRef.current?.toDataURL?.() || null,
        ref: sigRefRef.current?.toDataURL?.() || null,
      }
      const record = buildRapportinoRecord({ fields, signatures, user, existing: recId ? { id: recId } : null })
      const saved = await saveRapportino(record)
      setRecId(saved.id) // così un successivo salvataggio aggiorna, non duplica
      setArchiveMsg(recId ? '✓ Rapportino aggiornato in archivio.' : '✓ Rapportino archiviato.')
      onArchived?.(saved)
    } catch (err) {
      console.error('[rapportino] archiviazione fallita:', err)
      setArchiveMsg('Archiviazione non riuscita. Riprova.')
    } finally {
      setArchiving(false)
    }
  }

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
        <button className="back-link" onClick={onBack}>‹ Archivio rapportini</button>
        <span className="rap-toolbar-title">
          {recId ? 'Rapportino d\'intervento · consultazione' : 'Rapportino d\'intervento · nuovo'}
        </span>
        <div className="rap-toolbar-actions">
          <button className="btn-ghost" onClick={salvaArchivio} disabled={archiving}>
            {archiving ? 'Archiviazione…' : (recId ? 'Aggiorna archivio' : 'Salva in archivio')}
          </button>
          <button className="btn-primary" onClick={salvaPdf} disabled={saving}>
            {saving ? 'Generazione…' : 'Salva PDF'}
          </button>
        </div>
      </div>
      {archiveMsg && <p className="muted small rap-toolbar" style={{ marginTop: 0 }}>{archiveMsg}</p>}
      {error && <p className="error rap-toolbar" style={{ marginTop: 0 }}>{error}</p>}

      <div className="rap-desk">
        <div className="rap-scroll">
          <div className="rap-sheet" ref={sheetRef}>

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
                    <textarea className="rap-ta" name="cliente_fatturazione" style={{ height: '120px' }} />
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    <div className="rap-lbl">Cliente (Luogo della prestazione)</div>
                    <textarea className="rap-ta" name="cliente_luogo" style={{ height: '88px', fontSize: '15px' }} />
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
                      <button className="rap-clear no-print" onClick={() => sigRespRef.current?.clear()}>Cancella</button>
                    </div>
                    <SignaturePad ref={sigRespRef} height={96} initial={initial?.signatures?.resp || null} />
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
                      <button className="rap-clear no-print" onClick={() => sigRefRef.current?.clear()}>Cancella</button>
                    </div>
                    <SignaturePad ref={sigRefRef} height={88} initial={initial?.signatures?.ref || null} />
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
export default function RapportinoIntervento({ user, permConfig = null }) {
  const canDeleteAny = puo(user, 'dati.tutti', permConfig)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState({ mode: 'list' }) // 'list' | 'new' | { mode:'view', record }

  async function refresh(showSpinner = false) {
    if (showSpinner) setLoading(true)
    setItems(await getAllRapportini())
    setLoading(false)
  }
  useLiveData(refresh, [user.id], subscribeToRapportini)

  async function remove(rec) {
    if (!window.confirm('Eliminare questo rapportino dall\'archivio?')) return
    await deleteRapportino(rec.id)
    await refresh()
  }

  if (view.mode === 'new') {
    return (
      <RapportinoForm
        user={user}
        onBack={() => { setView({ mode: 'list' }); refresh() }}
        onArchived={() => refresh()}
      />
    )
  }
  if (view.mode === 'view') {
    return (
      <RapportinoForm
        user={user}
        initial={view.record?.data || null}
        existingId={view.record?.id || null}
        onBack={() => { setView({ mode: 'list' }); refresh() }}
        onArchived={() => refresh()}
      />
    )
  }

  return (
    <main className="content">
      <div className="page-head">
        <h2 className="section-title">Rapportini d'intervento</h2>
        <button className="btn-primary btn-sm" onClick={() => setView({ mode: 'new' })}>+ Nuovo rapportino</button>
      </div>
      <p className="muted small">
        Archivio di tutti i rapportini. Tocca una voce per consultarla o esportarla in PDF.
      </p>

      {loading ? (
        <p className="muted center">Caricamento…</p>
      ) : items.length === 0 ? (
        <p className="muted small">Nessun rapportino archiviato. Premi “+ Nuovo rapportino” per compilarne uno.</p>
      ) : (
        <div className="list">
          {items.map((r) => (
            <div key={r.id} className="card fine-card">
              <button className="rap-item" onClick={() => setView({ mode: 'view', record: r })}>
                <span className="rap-item-main">
                  <span className="request-employee">{rapportinoLabel(r)}</span>
                  {r.clientName && <span className="muted small">{r.clientName}</span>}
                  <span className="muted small">
                    {r.docDate || '—'}{r.authorName ? ` · ${r.authorName}` : ''}
                  </span>
                </span>
                <span className="area-arrow" aria-hidden>›</span>
              </button>
              {(canDeleteAny || r.authorId === user.id) && (
                <div className="decision-actions">
                  <button className="btn-ghost btn-sm danger" onClick={() => remove(r)}>Elimina</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
