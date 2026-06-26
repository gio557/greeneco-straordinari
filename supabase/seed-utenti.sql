-- ---------------------------------------------------------------------------
-- Seed utenti — GreenEco Operations
-- ---------------------------------------------------------------------------
-- Crea (o aggiorna) gli utenti richiesti, GIÀ assegnati alle rispettive
-- categorie. Nel modello, il campo `department` del profilo È la categoria
-- ("reparto") usata dal sistema dei permessi.
--
-- Eseguire nel SQL Editor di Supabase. È IDEMPOTENTE: si può rieseguire senza
-- creare doppioni (usa ON CONFLICT). ⚠️ Rieseguendolo, le password tornano a
-- "pippo": non rilanciarlo dopo che gli utenti l'avranno cambiata.
--
-- Password iniziale comune: «pippo» (cifrata bcrypt). Da far cambiare al primo
-- accesso, dalla Gestione utenti.
--
-- Note sui ruoli (il ruolo è solo struttura/scope; i permessi li danno le
-- categorie):
--   • Operativo / Commerciale / Ufficio Tecnico → ruolo tecnico `employee`.
--   • CEO & C → ruolo tecnico `admin`, così possono usare le funzioni di
--     gestione (utenti, categorie, backup) che a livello DB richiedono `admin`;
--     la loro CATEGORIA resta «CEO & C».
--
-- «Elisa» (Ufficio paghe) NON viene toccata: esiste già.
-- ---------------------------------------------------------------------------

begin;

-- 1) Profili — `department` = categoria del sistema permessi --------------------
insert into public.profiles (id, name, role, department, email) values
  -- Operativo (10 dipendenti)
  ('op-01', 'Marco Ferraro',      'employee', 'Operativo',      'marco.ferraro@azienda.it'),
  ('op-02', 'Luca Greco',         'employee', 'Operativo',      'luca.greco@azienda.it'),
  ('op-03', 'Giuseppe Conti',     'employee', 'Operativo',      'giuseppe.conti@azienda.it'),
  ('op-04', 'Paolo De Luca',      'employee', 'Operativo',      'paolo.deluca@azienda.it'),
  ('op-05', 'Francesco Marino',   'employee', 'Operativo',      'francesco.marino@azienda.it'),
  ('op-06', 'Matteo Gallo',       'employee', 'Operativo',      'matteo.gallo@azienda.it'),
  ('op-07', 'Davide Costa',       'employee', 'Operativo',      'davide.costa@azienda.it'),
  ('op-08', 'Simone Rizzo',       'employee', 'Operativo',      'simone.rizzo@azienda.it'),
  ('op-09', 'Alessandro Bruno',   'employee', 'Operativo',      'alessandro.bruno@azienda.it'),
  ('op-10', 'Stefano Villa',      'employee', 'Operativo',      'stefano.villa@azienda.it'),
  -- Commerciale (2)
  ('comm-1', 'Andrea Salcio',     'employee', 'Commerciale',    'andrea.salcio@azienda.it'),
  ('comm-2', 'Julie Klicova',     'employee', 'Commerciale',    'julie.klicova@azienda.it'),
  -- Ufficio Tecnico (2)
  ('tec-1', 'Chiara Vinci',       'employee', 'Ufficio Tecnico', 'chiara.vinci@azienda.it'),
  ('tec-2', 'Edoardo Brambilla',  'employee', 'Ufficio Tecnico', 'edoardo.brambilla@azienda.it'),
  -- CEO & C (2) — ruolo tecnico admin, categoria «CEO & C»
  ('ceo-1', 'Daniele Priarone',   'admin',    'CEO & C',        'daniele.priarone@azienda.it'),
  ('ceo-2', 'Federica Picciani',  'admin',    'CEO & C',        'federica.picciani@azienda.it')
on conflict (id) do update
  set name       = excluded.name,
      role       = excluded.role,
      department = excluded.department,
      email      = excluded.email;

-- 2) Credenziali — password «pippo» cifrata bcrypt ----------------------------
-- (Se dovesse dare errore "function extensions.crypt does not exist", sostituire
--  "extensions.crypt"/"extensions.gen_salt" con "crypt"/"gen_salt".)
insert into public.user_credentials (user_id, password)
select id, extensions.crypt('pippo', extensions.gen_salt('bf'))
from public.profiles
where id in (
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08','op-09','op-10',
  'comm-1','comm-2','tec-1','tec-2','ceo-1','ceo-2'
)
on conflict (user_id) do update
  set password = excluded.password,
      updated_at = now();

commit;

-- 3) (Opzionale) Allinea la categoria dell'Ufficio paghe (es. «Elisa») ---------
-- Decommentare SOLO se il profilo paghe non ha ancora la categoria corretta:
-- update public.profiles set department = 'Ufficio paghe' where role = 'paghe';

-- 4) Verifica — elenco dei nuovi utenti per categoria --------------------------
select department as categoria, count(*) as utenti, string_agg(name, ', ' order by name) as nomi
from public.profiles
where id in (
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08','op-09','op-10',
  'comm-1','comm-2','tec-1','tec-2','ceo-1','ceo-2'
)
group by department
order by department;
