// Informativa privacy per le timbrature con geolocalizzazione.
// ⚠️ BOZZA SEGNAPOSTO: testo di esempio, NON validato. Va rivisto e completato
// dal titolare del trattamento / DPO / legale prima di qualsiasi uso reale.
export default function PrivacyNotice({ onAccept, onClose, readOnly }) {
  return (
    <main className="content">
      <div className="privacy">
        <div className="privacy-flag">
          ⚠️ Bozza dimostrativa — testo da validare a cura del Titolare/DPO prima dell'uso reale.
        </div>

        <h2 className="section-title">Informativa sul trattamento dei dati (presenze)</h2>

        <p><strong>Titolare del trattamento:</strong> [ragione sociale, indirizzo, contatti] — <em>da compilare</em>.</p>

        <h3 className="mini-title">Finalità</h3>
        <p>Rilevazione delle presenze tramite timbratura di entrata e uscita e, ove previsto,
        verifica del luogo in cui avviene la timbratura.</p>

        <h3 className="mini-title">Dati trattati</h3>
        <ul className="privacy-list">
          <li>Identificativo del lavoratore (profilo) e ruolo;</li>
          <li>Data e ora della timbratura (entrata/uscita);</li>
          <li><strong>Posizione geografica (GPS)</strong> rilevata <strong>solo nell'istante della timbratura</strong> (nessun tracciamento continuo).</li>
        </ul>

        <h3 className="mini-title">Base giuridica</h3>
        <p>[Da definire: es. obbligo legale/contrattuale, legittimo interesse, ecc. — la
        geolocalizzazione dei lavoratori in Italia richiede valutazioni specifiche, art. 4
        Statuto dei Lavoratori e indicazioni del Garante].</p>

        <h3 className="mini-title">Conservazione</h3>
        <p>I dati sono conservati per il periodo necessario alle finalità indicate [definire la
        retention] e poi cancellati o anonimizzati.</p>

        <h3 className="mini-title">Diritti dell'interessato</h3>
        <p>Hai diritto di accesso, rettifica, cancellazione, limitazione e opposizione, e di
        proporre reclamo al Garante per la protezione dei dati personali. [Modalità di esercizio
        da indicare].</p>

        <p className="muted small">
          Privacy-by-design: la posizione viene richiesta al dispositivo unicamente quando premi
          il pulsante di timbratura; l'app non traccia gli spostamenti.
        </p>

        {readOnly ? (
          <button className="btn-primary btn-block" onClick={onClose}>Chiudi</button>
        ) : (
          <>
            <button className="btn-primary btn-block big-confirm" onClick={onAccept}>
              Ho letto l'informativa e acconsento
            </button>
            {onClose && (
              <button className="btn-ghost btn-block" onClick={onClose} style={{ marginTop: 10 }}>
                Indietro
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
