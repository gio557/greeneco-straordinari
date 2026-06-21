# Operations — App (PWA)

Applicazione per la gestione delle **richieste di ore straordinarie** da parte
dei dipendenti, con **approvazione/rifiuto** da parte dei manager abilitati.

È una **PWA** (Progressive Web App): un'unica app web installabile sul telefono
**sia Android sia iPhone**, senza passare dagli store. Si apre da browser e si
può aggiungere alla schermata Home come una normale app.

> **Stato attuale: pronta per il database centrale.**
> L'app è collegata a **Supabase**: appena imposti le chiavi del progetto
> (vedi sotto), i dati vivono su un archivio centrale e **tutti i telefoni
> vedono gli stessi dati, aggiornati in tempo reale**. Finché le chiavi non
> sono configurate, l'app funziona in **modalità demo** con dati locali di
> esempio (utile per provarla).

**Demo online:** <https://gio557.github.io/greeneco-operations/>

## Avvio in locale

```bash
npm install
npm run dev        # sviluppo, apri l'indirizzo mostrato nel terminale
npm run build      # crea la versione di produzione in dist/
npm run preview    # prova la versione di produzione (con service worker/PWA)
```

Per provarla sul telefono nella stessa rete Wi-Fi:
`npm run dev -- --host` e apri dal telefono l'indirizzo IP mostrato.

## Come si usa il prototipo

1. Accedi con **ID utente (o email) + password**. Account demo:
   - **Admin**: `admin` / `admin123`
   - **Manager/Dipendenti**: `mgr-1`, `emp-1`, … / `demo123`
2. **Dipendente** (es. `emp-1`): vede le proprie richieste e ne crea di nuove
   (data, ore, motivo).
3. **Manager** (es. `mgr-1`): **dashboard** con statistiche, filtri e tabella di
   tutte le richieste del proprio team; approva/rifiuta con nota.
4. **Admin** (`admin`): dashboard su **tutte** le richieste dell'azienda e
   scheda **Utenti** per creare/modificare/eliminare gli utenti e gestirne
   **ID e password**.

In modalità demo i dati restano sul dispositivo. Per ripartire da zero, dalla
console del browser: `localStorage.clear()` e ricarica.

## Struttura del progetto

```
greeneco-operations/
├─ index.html                 # pagina + manifest PWA
├─ public/
│  ├─ manifest.webmanifest    # configurazione installazione su telefono
│  ├─ sw.js                   # service worker (avvio offline)
│  └─ icon.svg                # icona app
└─ src/
   ├─ App.jsx                 # stato sessione + instradamento per ruolo
   ├─ data/
   │  ├─ api.js               # ⭐ UNICO punto di accesso ai dati (ora demo)
   │  ├─ seed.js              # dati di esempio
   │  └─ supabaseClient.js    # connessione al DB reale (pronta, non ancora usata)
   ├─ components/             # schermate e componenti UI
   └─ utils.js                # formattazioni in italiano
```

Tutta l'interfaccia legge/scrive **solo** tramite `src/data/api.js`. Per passare
al database reale basta reimplementare quelle funzioni con Supabase: i
componenti non cambiano.

## Collegare il database centrale (Supabase)

L'app è **già collegata** a Supabase tramite `src/data/api.js`, che sceglie da
solo l'archivio da usare:

- **chiavi configurate** → database centrale condiviso, con aggiornamenti in
  tempo reale (tutti i telefoni vedono gli stessi dati);
- **chiavi mancanti** → modalità demo locale (dati di esempio sul dispositivo).

### Passi per attivarlo (una volta sola)

1. **Crea il progetto.** Vai su <https://supabase.com>, accedi e crea un nuovo
   progetto gratuito (scegli una password per il database e una region vicina,
   es. *West EU*). Attendi che il progetto sia pronto (~2 minuti).

2. **Crea le tabelle.** Nel menu a sinistra apri **SQL Editor → New query**,
   incolla **tutto** il contenuto di [`supabase/schema.sql`](supabase/schema.sql)
   e premi **Run**. Crea tabelle, sicurezza, tempo reale e i dati demo iniziali.

3. **Copia le chiavi.** In **Project Settings → API** trovi:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

   La chiave *anon* è pensata per stare nel codice del browser: è pubblica e
   sicura, l'accesso ai dati è regolato dalle policy del database.

4. **In locale:** copia `.env.example` in `.env` e incolla le due chiavi, poi
   `npm run dev`.

5. **Per il sito pubblico (GitHub Pages):** aggiungi le chiavi come **Secrets**
   del repository — *Settings → Secrets and variables → Actions → New
   repository secret* — creando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
   Al successivo push su `main` il sito userà automaticamente il database.

> **Accesso (prototipo):** login con **ID/email + password**. Le password sono
> salvate **cifrate (bcrypt)** in una tabella separata e protetta
> (`user_credentials`), leggibile solo da funzioni sicure lato database
> (`SECURITY DEFINER`): non vengono mai esposte al browser. L'utente **admin**
> gestisce gli altri utenti dalla dashboard.
>
> ⚠️ **Nota:** per una versione realmente in produzione l'autenticazione andrà
> rifatta in modo **pienamente GDPR-compliant** (Supabase Auth, gestione
> consensi e dei dati personali, policy RLS per-utente).

## Pubblicazione

- **GitHub Pages (automatico):** questo repository include
  `.github/workflows/deploy.yml`. A ogni push sul branch `main` l'app viene
  compilata e pubblicata automaticamente su
  <https://gio557.github.io/greeneco-operations/> (Pages viene anche abilitato
  da solo al primo deploy). Non serve configurare nulla a mano.
- **Altri hosting statici:** in alternativa puoi pubblicare la cartella `dist/`
  (generata da `npm run build`) su Netlify, Vercel, ecc. Gli utenti aprono il
  link e *Aggiungi a Home* dal browser.
- **Negli store (opzionale):** la stessa PWA può essere impacchettata per Google
  Play (Android, tramite TWA/Bubblewrap) e per l'App Store (iOS, tramite un
  contenitore). Richiede i tuoi account sviluppatore.

## Prossimi passi possibili

- Notifiche push al manager quando arriva una richiesta.
- Login reale con email/password e ruoli su Supabase.
- Report mensili e riepilogo ore per dipendente/reparto.
- Limiti/regole aziendali (es. tetto ore settimanali) e turni.
