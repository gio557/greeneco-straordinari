import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

// ---------------------------------------------------------------------------
// Rapportino d'intervento GreenEco — riproduzione fedele del modulo cartaceo,
// compilabile dall'operatore e trasformabile in un PDF pronto da inviare al
// cliente. Le due firme (Responsabile e Referente) si tracciano col dito
// (touch), con la penna o col mouse. Vedi il facsimile in src/index.css
// (sezione "Rapportini d'intervento").
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
const SignaturePad = forwardRef(function SignaturePad({ height = 96 }, ref) {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvasRef.current
      if (!c) return
      const ctx = c.getContext('2d')
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.restore()
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
  }, [])

  return <canvas ref={canvasRef} className="rap-sig" style={{ height: `${height}px` }} />
})

// Una riga della tabella orari: 15 celle compilabili (Data, viaggio, lavorazione,
// ore effettive, km).
function TimeRow() {
  return (
    <tr>
      {Array.from({ length: 15 }, (_, i) => (
        <td key={i}>
          <input className="rap-time" />
        </td>
      ))}
    </tr>
  )
}

export default function RapportinoIntervento({ user }) {
  const sheetRef = useRef(null)
  const sigRespRef = useRef(null)
  const sigRefRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        <span className="rap-toolbar-title">Rapportino d'intervento · modulo compilabile</span>
        <button className="btn-primary" onClick={salvaPdf} disabled={saving}>
          {saving ? 'Generazione…' : 'Salva PDF'}
        </button>
      </div>
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
                      <input className="rap-hf" data-field="id" />
                    </div>
                    <div className="rap-idbox rap-idbox-bt">
                      <div className="rap-lbl rap-lbl-t">Data di compilazione</div>
                      <input className="rap-hf" defaultValue={oggiLabel()} />
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
                    <input className="rap-in" />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl">Conferito con</div>
                    <input className="rap-in" />
                  </td>
                  <td style={{ width: '34%' }} rowSpan={2}>
                    <div className="rap-lbl">Cliente (Indirizzo e Fatturazione)</div>
                    <textarea className="rap-ta" style={{ height: '120px' }} />
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    <div className="rap-lbl">Cliente (Luogo della prestazione)</div>
                    <textarea className="rap-ta" style={{ height: '88px', fontSize: '15px' }} />
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
                {Array.from({ length: 5 }, (_, i) => <TimeRow key={i} />)}
              </tbody>
            </table>

            {/* ===== DESCRIZIONE + COLONNE LATERALI ===== */}
            <table>
              <tbody>
                <tr>
                  <td style={{ width: '52%' }}>
                    <div className="rap-lbl rap-lbl-t">Descrizione Intervento</div>
                    <textarea className="rap-lined rap-lined-lg" style={{ height: '360px' }} />
                  </td>
                  <td style={{ width: '16%' }}>
                    <div className="rap-lbl rap-lbl-t">Tipo di Manutenzione</div>
                    <textarea className="rap-lined rap-lined-sm" style={{ height: '360px' }} />
                  </td>
                  <td style={{ width: '16%' }}>
                    <div className="rap-lbl rap-lbl-t">Sezione di Impianto</div>
                    <textarea className="rap-lined rap-lined-sm" style={{ height: '360px' }} />
                  </td>
                  <td style={{ width: '16%' }}>
                    <div className="rap-lbl rap-lbl-t">Materiale/Bene</div>
                    <textarea className="rap-lined rap-lined-sm" style={{ height: '360px' }} />
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
                    <textarea className="rap-lined2" style={{ height: '132px' }} />
                  </td>
                  <td style={{ width: '33%' }} rowSpan={2}>
                    <div className="rap-lbl rap-lbl-t">Manutentori presenti</div>
                    <textarea className="rap-lined2" style={{ height: '132px' }} />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl rap-lbl-t">Autore Descrizione Intervento</div>
                    <input className="rap-in" style={{ height: '34px', fontSize: '14px' }} defaultValue={user?.name || ''} />
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="rap-sig-head">
                      <span className="rap-sig-lbl">Firma del Responsabile</span>
                      <button className="rap-clear no-print" onClick={() => sigRespRef.current?.clear()}>Cancella</button>
                    </div>
                    <SignaturePad ref={sigRespRef} height={96} />
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
                    <textarea className="rap-ta" style={{ height: '88px' }} />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-sig-head">
                      <span className="rap-sig-lbl">Firma del Referente</span>
                      <button className="rap-clear no-print" onClick={() => sigRefRef.current?.clear()}>Cancella</button>
                    </div>
                    <SignaturePad ref={sigRefRef} height={88} />
                  </td>
                  <td style={{ width: '33%' }}>
                    <div className="rap-lbl rap-lbl-t">Note</div>
                    <textarea className="rap-ta" style={{ height: '88px' }} />
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
