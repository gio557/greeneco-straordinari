# clocking-ip-check — Cross-check GPS ↔ IP (Anti-frode Livello 3)

Verifica (approssimata) la coerenza tra la posizione GPS dichiarata da una
timbratura e la geolocalizzazione dell'indirizzo IP del dispositivo. È l'unico
segnale di posizione che **non dipende dal permesso del dipendente**, ma è
**coarse** (precisione a livello di città/paese) e ha **implicazioni privacy**.

> ⚠️ Controllo a distanza sui lavoratori: attivare **solo** dopo valutazione col
> Consulente del lavoro (art. 4 L. 300/1970 + basi GDPR e informativa).

## Stato
Predisposto ma **disattivato di default**: l'app non chiama la funzione finché
`VITE_IP_CHECK_ENABLED` non è `true`. Le colonne `ip_country`, `ip_distance_km`,
`ip_mismatch` su `time_clockings` restano `null`.

## Come si attiva
1. Esegui lo schema aggiornato (`supabase/schema.sql`) — crea le colonne IP.
2. Deploya la funzione:
   ```bash
   supabase functions deploy clocking-ip-check
   ```
   Usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` forniti dal runtime per
   aggiornare la riga della timbratura.
3. Nel build dell'app imposta `VITE_IP_CHECK_ENABLED=true` (variabile/segreto di
   ambiente) e ripubblica.

## Come funziona
- L'app, dopo una timbratura **online con posizione**, chiama la funzione con
  `{ id, lat, lng }` (best-effort, non blocca la timbratura).
- La funzione ricava l'IP dall'header `x-forwarded-for`, lo geolocalizza via
  `ipapi.co`, calcola la distanza dalla posizione GPS e, se supera la soglia
  (`MISMATCH_KM`, default 150 km), marca `ip_mismatch = true`.
- La board del manager mostra la segnalazione **"GPS≠IP (~N km)"** tra i
  controlli "da verificare".

## Limiti
- Geolocalizzazione IP coarse: utile per scarti **grossolani** (GPS in una città,
  IP in un'altra / VPN), non per piccole distanze.
- Una VPN nella stessa area, o IP mobile assegnato lontano, può generare falsi
  positivi → resta una **segnalazione** da verificare, non un blocco.
