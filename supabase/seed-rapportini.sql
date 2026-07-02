-- ===========================================================================
-- Seed dimostrativo: 12 rapportini d'intervento su 4 clienti.
--
-- COME USARLO: apri Supabase → SQL Editor → New query, incolla tutto e Run.
-- È idempotente (id deterministici + ON CONFLICT DO NOTHING): puoi rieseguirlo
-- senza duplicare. Richiede che esista la tabella public.rapportini con la
-- colonna client_id (vedi supabase/schema.sql: rieseguilo prima se necessario).
--
-- I rapportini sono legati ai clienti tramite client_id, quindi compaiono
-- sia nell'Archivio "per cliente" sia nell'Anagrafica clienti (riga espandibile).
-- Per rimuovere i dati demo: in fondo c'è un blocco DELETE commentato.
-- ===========================================================================

-- --- Clienti di esempio -----------------------------------------------------
insert into public.clients (id, name, address, lat, lng, active) values
  ('cli-r-01', 'Idrogest S.r.l.',            'Via Marengo 12, Alessandria (AL)',     44.9133, 8.6151, true),
  ('cli-r-02', 'Comune di Ovada',            'Via Torino 69, Ovada (AL)',            44.6386, 8.6470, true),
  ('cli-r-03', 'Acquedotto Valli S.p.A.',    'Corso Italia 5, Novi Ligure (AL)',     44.7620, 8.7880, true),
  ('cli-r-04', 'Cartiera Ligure S.p.A.',     'Via del Porto 20, Genova (GE)',        44.4056, 8.9463, true)
on conflict (id) do nothing;

-- --- 12 rapportini d'intervento (archiviati) --------------------------------
insert into public.rapportini
  (id, author_id, author_name, intervention_id, client_id, client_name, doc_date, status, data)
values
  ('rap-seed-01', null, 'Marco Ferro',   'MAN-2026-001', 'cli-r-01', 'Idrogest S.r.l.',         '03-03-2026', 'archived',
   '{"fields":{"id":"MAN-2026-001","data_compilazione":"03-03-2026","richiesto_da":"Ufficio tecnico Idrogest","cliente_luogo":"Idrogest S.r.l. — Via Marengo 12, Alessandria","descrizione":"Sostituzione girante pompa di sollevamento e verifica tenute.","tipo_manutenzione":"Correttiva","sezione_impianto":"Sollevamento","materiale_bene":"Girante DN80","esito":"Impianto ripristinato e collaudato.","autore":"Marco Ferro"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-02', null, 'Marco Ferro',   'MAN-2026-002', 'cli-r-01', 'Idrogest S.r.l.',         '18-03-2026', 'archived',
   '{"fields":{"id":"MAN-2026-002","data_compilazione":"18-03-2026","richiesto_da":"Idrogest","cliente_luogo":"Idrogest S.r.l. — Via Marengo 12, Alessandria","descrizione":"Manutenzione programmata quadro elettrico e serraggi.","tipo_manutenzione":"Programmata","sezione_impianto":"Quadro elettrico","materiale_bene":"","esito":"Nessuna anomalia rilevata.","autore":"Marco Ferro"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-03', null, 'Sara Conti',    'MAN-2026-003', 'cli-r-01', 'Idrogest S.r.l.',         '07-04-2026', 'archived',
   '{"fields":{"id":"MAN-2026-003","data_compilazione":"07-04-2026","richiesto_da":"Idrogest","cliente_luogo":"Idrogest S.r.l. — Via Marengo 12, Alessandria","descrizione":"Taratura sonde di livello e prova allarmi.","tipo_manutenzione":"Programmata","sezione_impianto":"Strumentazione","materiale_bene":"Sonda livello","esito":"Tarature completate.","autore":"Sara Conti"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-04', null, 'Sara Conti',    'MAN-2026-004', 'cli-r-01', 'Idrogest S.r.l.',         '22-05-2026', 'archived',
   '{"fields":{"id":"MAN-2026-004","data_compilazione":"22-05-2026","richiesto_da":"Idrogest","cliente_luogo":"Idrogest S.r.l. — Via Marengo 12, Alessandria","descrizione":"Intervento urgente: intasamento linea di scarico.","tipo_manutenzione":"Correttiva","sezione_impianto":"Linea scarico","materiale_bene":"","esito":"Linea liberata, flusso ripristinato.","autore":"Sara Conti"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-05', null, 'Luca Bianchi',  'MAN-2026-005', 'cli-r-02', 'Comune di Ovada',         '11-02-2026', 'archived',
   '{"fields":{"id":"MAN-2026-005","data_compilazione":"11-02-2026","richiesto_da":"Ufficio LL.PP. Comune di Ovada","cliente_luogo":"Comune di Ovada — Via Torino 69, Ovada","descrizione":"Pulizia vasca di prima pioggia e ispezione.","tipo_manutenzione":"Programmata","sezione_impianto":"Vasca prima pioggia","materiale_bene":"","esito":"Vasca pulita, ispezione OK.","autore":"Luca Bianchi"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-06', null, 'Luca Bianchi',  'MAN-2026-006', 'cli-r-02', 'Comune di Ovada',         '29-03-2026', 'archived',
   '{"fields":{"id":"MAN-2026-006","data_compilazione":"29-03-2026","richiesto_da":"Comune di Ovada","cliente_luogo":"Comune di Ovada — Via Torino 69, Ovada","descrizione":"Sostituzione soffiante e cinghie.","tipo_manutenzione":"Correttiva","sezione_impianto":"Ossidazione","materiale_bene":"Soffiante 5,5 kW","esito":"Soffiante sostituita e avviata.","autore":"Luca Bianchi"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-07', null, 'Marco Ferro',   'MAN-2026-007', 'cli-r-02', 'Comune di Ovada',         '14-05-2026', 'archived',
   '{"fields":{"id":"MAN-2026-007","data_compilazione":"14-05-2026","richiesto_da":"Comune di Ovada","cliente_luogo":"Comune di Ovada — Via Torino 69, Ovada","descrizione":"Verifica portata e campionamento allo scarico.","tipo_manutenzione":"Controllo","sezione_impianto":"Scarico finale","materiale_bene":"","esito":"Parametri nei limiti.","autore":"Marco Ferro"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-08', null, 'Sara Conti',    'MAN-2026-008', 'cli-r-03', 'Acquedotto Valli S.p.A.', '20-02-2026', 'archived',
   '{"fields":{"id":"MAN-2026-008","data_compilazione":"20-02-2026","richiesto_da":"Acquedotto Valli","cliente_luogo":"Acquedotto Valli S.p.A. — Corso Italia 5, Novi Ligure","descrizione":"Sostituzione misuratore di portata magnetico.","tipo_manutenzione":"Correttiva","sezione_impianto":"Adduzione","materiale_bene":"Misuratore DN150","esito":"Misuratore sostituito e calibrato.","autore":"Sara Conti"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-09', null, 'Luca Bianchi',  'MAN-2026-009', 'cli-r-03', 'Acquedotto Valli S.p.A.', '09-04-2026', 'archived',
   '{"fields":{"id":"MAN-2026-009","data_compilazione":"09-04-2026","richiesto_da":"Acquedotto Valli","cliente_luogo":"Acquedotto Valli S.p.A. — Corso Italia 5, Novi Ligure","descrizione":"Manutenzione stazione di rilancio, ingrassaggio cuscinetti.","tipo_manutenzione":"Programmata","sezione_impianto":"Rilancio","materiale_bene":"","esito":"Eseguita, funzionamento regolare.","autore":"Luca Bianchi"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-10', null, 'Marco Ferro',   'MAN-2026-010', 'cli-r-03', 'Acquedotto Valli S.p.A.', '02-06-2026', 'archived',
   '{"fields":{"id":"MAN-2026-010","data_compilazione":"02-06-2026","richiesto_da":"Acquedotto Valli","cliente_luogo":"Acquedotto Valli S.p.A. — Corso Italia 5, Novi Ligure","descrizione":"Ricerca perdita su condotta e riparazione giunto.","tipo_manutenzione":"Correttiva","sezione_impianto":"Rete","materiale_bene":"Giunto DN200","esito":"Perdita riparata.","autore":"Marco Ferro"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-11', null, 'Sara Conti',    'MAN-2026-011', 'cli-r-04', 'Cartiera Ligure S.p.A.',  '16-04-2026', 'archived',
   '{"fields":{"id":"MAN-2026-011","data_compilazione":"16-04-2026","richiesto_da":"Manutenzione Cartiera Ligure","cliente_luogo":"Cartiera Ligure S.p.A. — Via del Porto 20, Genova","descrizione":"Pulizia flottatore e sostituzione lame raschiatore.","tipo_manutenzione":"Programmata","sezione_impianto":"Flottazione","materiale_bene":"Lame raschiatore","esito":"Intervento concluso.","autore":"Sara Conti"},"signatures":{"resp":null,"ref":null}}'::jsonb),
  ('rap-seed-12', null, 'Luca Bianchi',  'MAN-2026-012', 'cli-r-04', 'Cartiera Ligure S.p.A.',  '28-05-2026', 'archived',
   '{"fields":{"id":"MAN-2026-012","data_compilazione":"28-05-2026","richiesto_da":"Cartiera Ligure","cliente_luogo":"Cartiera Ligure S.p.A. — Via del Porto 20, Genova","descrizione":"Fermo impianto per revisione dosaggio polielettrolita.","tipo_manutenzione":"Correttiva","sezione_impianto":"Dosaggio reagenti","materiale_bene":"Pompa dosatrice","esito":"Dosaggio ripristinato, prova positiva.","autore":"Luca Bianchi"},"signatures":{"resp":null,"ref":null}}'::jsonb)
on conflict (id) do nothing;

-- --- Rimozione dei dati demo (opzionale) ------------------------------------
-- delete from public.rapportini where id like 'rap-seed-%';
-- delete from public.clients   where id like 'cli-r-0%';
