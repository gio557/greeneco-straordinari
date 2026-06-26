-- ===========================================================================
-- Gestione Straordinari — Schema del database centrale (Supabase / PostgreSQL)
--
-- COME USARLO:
--   1. Crea un progetto gratuito su https://supabase.com
--   2. Apri "SQL Editor" → "New query"
--   3. Incolla TUTTO questo file e premi "Run"
--
-- Lo script è idempotente: puoi rieseguirlo senza errori (non duplica i dati).
-- Se aggiorni da una versione precedente, ri-eseguilo: aggiunge il ruolo
-- "admin", le credenziali con password e le funzioni di accesso/gestione.
--
-- ACCESSO (fase attuale — prototipo):
--   L'accesso avviene con ID/email + password. Le password sono salvate
--   CIFRATE (bcrypt) in una tabella separata `user_credentials`, NON leggibile
--   dal browser: la verifica avviene solo tramite funzioni sicure lato database
--   (SECURITY DEFINER). L'utente con ruolo "admin" gestisce gli altri utenti.
--
--   NOTA: per una futura versione "reale" l'autenticazione andrà rifatta in
--   modo pienamente GDPR-compliant (Supabase Auth, gestione consensi, ecc.).
-- ===========================================================================

-- pgcrypto fornisce crypt()/gen_salt() per le password cifrate (bcrypt).
create extension if not exists pgcrypto with schema extensions;

-- Includi lo schema "extensions" nel percorso di ricerca per usare crypt().
set search_path = public, extensions;

-- --- Tabelle ----------------------------------------------------------------

-- Profili utente (id testuali, come nel prototipo: 'mgr-1', 'emp-1', ...)
create table if not exists public.profiles (
  id          text primary key,
  name        text not null,
  role        text not null,
  department  text,
  manager_id  text references public.profiles (id),
  email       text,
  created_at  timestamptz not null default now()
);

-- Consenti il ruolo "admin" (aggiorna il vincolo anche su DB già esistenti).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('employee', 'manager', 'admin'));

-- Credenziali di accesso: password CIFRATA, in tabella separata e protetta.
create table if not exists public.user_credentials (
  user_id    text primary key references public.profiles (id) on delete cascade,
  password   text not null,
  updated_at timestamptz not null default now()
);

-- Richieste di straordinario
create table if not exists public.overtime_requests (
  id            text primary key,
  employee_id   text not null references public.profiles (id),
  manager_id    text references public.profiles (id),
  work_date     date not null,
  hours         numeric(4, 1) not null check (hours > 0),
  reason        text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  decision_note text default '',
  decided_by    text references public.profiles (id),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

-- Indici utili per le query dell'app
create index if not exists overtime_requests_employee_idx
  on public.overtime_requests (employee_id);
create index if not exists overtime_requests_manager_idx
  on public.overtime_requests (manager_id);

-- --- Sicurezza (Row Level Security) -----------------------------------------
-- I profili (SENZA password) sono leggibili; le richieste sono leggibili e
-- scrivibili con la chiave pubblica "anon". Le PASSWORD stanno in
-- user_credentials, che ha RLS attiva e NESSUNA policy: quindi è inaccessibile
-- dal browser e si può leggere/scrivere solo tramite le funzioni qui sotto.

alter table public.profiles enable row level security;
alter table public.user_credentials enable row level security;
alter table public.overtime_requests enable row level security;

drop policy if exists "profiles_select_anon" on public.profiles;
create policy "profiles_select_anon"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "requests_select_anon" on public.overtime_requests;
create policy "requests_select_anon"
  on public.overtime_requests for select
  to anon, authenticated
  using (true);

drop policy if exists "requests_insert_anon" on public.overtime_requests;
create policy "requests_insert_anon"
  on public.overtime_requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "requests_update_anon" on public.overtime_requests;
create policy "requests_update_anon"
  on public.overtime_requests for update
  to anon, authenticated
  using (true)
  with check (true);

-- --- Funzioni di accesso e amministrazione ----------------------------------
-- Tutte SECURITY DEFINER: girano con privilegi elevati, così possono leggere
-- le credenziali cifrate senza esporle al client.

-- Converte una riga "profiles" nell'oggetto usato dalla UI (camelCase).
create or replace function public.app_user_json(p public.profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'role', p.role,
    'department', p.department,
    'managerId', p.manager_id,
    'email', p.email
  );
$$;

-- Login: identifica per id o email e verifica la password cifrata.
-- Ritorna il profilo (senza password) se le credenziali sono corrette.
create or replace function public.app_login(p_identifier text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
  v_hash    text;
begin
  select pr.* into v_profile
  from public.profiles pr
  where pr.id = p_identifier
     or lower(pr.email) = lower(p_identifier)
  limit 1;

  if v_profile.id is null then
    return null;
  end if;

  select c.password into v_hash
  from public.user_credentials c
  where c.user_id = v_profile.id;

  if v_hash is null then
    return null; -- nessuna password impostata: accesso non consentito
  end if;

  if crypt(p_password, v_hash) = v_hash then
    return public.app_user_json(v_profile);
  end if;

  return null;
end;
$$;

-- Verifica che un id corrisponda a un utente con ruolo "admin".
create or replace function public.app_is_admin(p_admin_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_admin_id and role = 'admin'
  );
$$;

-- Elenco utenti per l'admin (senza password; con flag "hasPassword").
create or replace function public.admin_list_users(p_admin_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Non autorizzato';
  end if;

  select coalesce(
    jsonb_agg(
      public.app_user_json(pr) || jsonb_build_object('hasPassword', c.user_id is not null)
      order by
        case pr.role when 'admin' then 0 when 'manager' then 1 else 2 end,
        pr.name
    ),
    '[]'::jsonb
  )
  into v
  from public.profiles pr
  left join public.user_credentials c on c.user_id = pr.id;

  return v;
end;
$$;

-- Crea o aggiorna un utente; se p_password è valorizzata, (re)imposta la
-- password cifrata. Solo l'admin può eseguirla.
create or replace function public.admin_upsert_user(
  p_admin_id   text,
  p_id         text,
  p_name       text,
  p_role       text,
  p_department text,
  p_manager_id text,
  p_email      text,
  p_password   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Non autorizzato';
  end if;

  if coalesce(p_id, '') = '' or coalesce(p_name, '') = '' then
    raise exception 'ID e nome sono obbligatori';
  end if;

  if p_role not in ('employee', 'manager', 'admin') then
    raise exception 'Ruolo non valido';
  end if;

  insert into public.profiles (id, name, role, department, manager_id, email)
  values (
    p_id,
    p_name,
    p_role,
    nullif(p_department, ''),
    nullif(p_manager_id, ''),
    nullif(p_email, '')
  )
  on conflict (id) do update set
    name       = excluded.name,
    role       = excluded.role,
    department = excluded.department,
    manager_id = excluded.manager_id,
    email      = excluded.email
  returning * into v_profile;

  if coalesce(p_password, '') <> '' then
    insert into public.user_credentials (user_id, password, updated_at)
    values (p_id, crypt(p_password, gen_salt('bf')), now())
    on conflict (user_id) do update set
      password   = excluded.password,
      updated_at = now();
  end if;

  return public.app_user_json(v_profile);
end;
$$;

-- Elimina un utente (le sue credenziali vengono rimosse a cascata).
create or replace function public.admin_delete_user(p_admin_id text, p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Non autorizzato';
  end if;

  if p_admin_id = p_user_id then
    raise exception 'Non puoi eliminare il tuo stesso account';
  end if;

  if exists (
    select 1 from public.overtime_requests
    where employee_id = p_user_id
       or manager_id = p_user_id
       or decided_by = p_user_id
  ) then
    raise exception 'Impossibile eliminare: l''utente ha richieste collegate';
  end if;

  delete from public.profiles where id = p_user_id;
end;
$$;

-- Permessi di esecuzione per la chiave pubblica.
grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.admin_list_users(text) to anon, authenticated;
grant execute on function public.admin_upsert_user(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, text) to anon, authenticated;

-- --- Tempo reale ------------------------------------------------------------
-- Abilita le notifiche realtime sulle richieste (idempotente).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'overtime_requests'
  ) then
    alter publication supabase_realtime add table public.overtime_requests;
  end if;
end $$;

-- --- Dati demo iniziali -----------------------------------------------------
-- Gli stessi utenti del prototipo, più un account amministratore.
-- Sostituiscili pure con i veri dipendenti/manager (anche dalla dashboard).

insert into public.profiles (id, name, role, department, manager_id, email) values
  ('admin', 'Amministratore', 'admin',    'Direzione',  null,    'admin@azienda.it'),
  ('mgr-1', 'Laura Bianchi',  'manager',  'Produzione', null,    'laura.bianchi@azienda.it'),
  ('mgr-2', 'Marco Verdi',    'manager',  'Logistica',  null,    'marco.verdi@azienda.it'),
  ('emp-1', 'Giulia Rossi',   'employee', 'Produzione', 'mgr-1', 'giulia.rossi@azienda.it'),
  ('emp-2', 'Antonio Russo',  'employee', 'Produzione', 'mgr-1', 'antonio.russo@azienda.it'),
  ('emp-3', 'Sara Colombo',   'employee', 'Logistica',  'mgr-2', 'sara.colombo@azienda.it')
on conflict (id) do nothing;

-- Password demo (cifrate). on conflict do nothing: non sovrascrive password già
-- impostate, così le modifiche fatte dalla dashboard non vengono perse.
--   admin → admin123   ·   tutti gli altri → demo123
insert into public.user_credentials (user_id, password) values
  ('admin', crypt('admin123', gen_salt('bf'))),
  ('mgr-1', crypt('demo123',  gen_salt('bf'))),
  ('mgr-2', crypt('demo123',  gen_salt('bf'))),
  ('emp-1', crypt('demo123',  gen_salt('bf'))),
  ('emp-2', crypt('demo123',  gen_salt('bf'))),
  ('emp-3', crypt('demo123',  gen_salt('bf')))
on conflict (user_id) do nothing;

insert into public.overtime_requests
  (id, employee_id, manager_id, work_date, hours, reason, status, decision_note, decided_by, created_at, decided_at) values
  ('req-1001', 'emp-1', 'mgr-1', current_date + 1, 2,   'Completamento ordine urgente cliente Alfa', 'pending',  '',                                     null,    now() - interval '1 hour',  null),
  ('req-1002', 'emp-2', 'mgr-1', current_date + 2, 3,   'Manutenzione straordinaria linea 2',        'pending',  '',                                     null,    now() - interval '2 hour',  null),
  ('req-1003', 'emp-1', 'mgr-1', current_date - 3, 1.5, 'Inventario di fine mese',                   'approved', 'Approvato, ricordati di timbrare.',    'mgr-1', now() - interval '4 day',   now() - interval '3 day'),
  ('req-1004', 'emp-3', 'mgr-2', current_date - 1, 4,   'Carico camion serale non previsto',         'rejected', 'Coperto da turno notturno, non necessario.', 'mgr-2', now() - interval '2 day', now() - interval '1 day')
on conflict (id) do nothing;

-- ===========================================================================
-- AUTOMEZZI — presa in carico mezzi con QR e dichiarazione dello stato
-- ---------------------------------------------------------------------------
-- Ogni volta che un dipendente prende un mezzo registra una "presa in carico"
-- (handover) dichiarando se rileva o meno nuovi danni. I danni diventano
-- "segnalazioni" (issues) aperte, visibili a chi prende il mezzo dopo (così
-- non si ri-segnala lo stesso problema) e risolvibili da manager/admin.
-- ===========================================================================

create table if not exists public.vehicles (
  id          text primary key,
  name        text not null,
  plate       text,
  department  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.vehicle_handovers (
  id           text primary key,
  vehicle_id   text not null references public.vehicles (id) on delete cascade,
  employee_id  text not null references public.profiles (id),
  condition_ok boolean not null,           -- true = nessun danno nuovo dichiarato
  note         text default '',
  taken_at     timestamptz not null default now(),
  returned_at  timestamptz                  -- null = mezzo ancora in uso
);

-- Su DB già esistenti aggiunge la colonna di riconsegna.
alter table public.vehicle_handovers add column if not exists returned_at timestamptz;

create table if not exists public.vehicle_issues (
  id           text primary key,
  vehicle_id   text not null references public.vehicles (id) on delete cascade,
  handover_id  text references public.vehicle_handovers (id) on delete set null,
  description  text not null,
  photo_url    text,
  status       text not null default 'open' check (status in ('open', 'resolved')),
  reported_by  text references public.profiles (id),
  reported_at  timestamptz not null default now(),
  resolved_by  text references public.profiles (id),
  resolved_at  timestamptz
);

create index if not exists vehicle_handovers_vehicle_idx on public.vehicle_handovers (vehicle_id);
create index if not exists vehicle_issues_vehicle_idx on public.vehicle_issues (vehicle_id);

alter table public.vehicles enable row level security;
alter table public.vehicle_handovers enable row level security;
alter table public.vehicle_issues enable row level security;

-- Lettura mezzi: pubblica. Le modifiche al parco mezzi passano dalle funzioni
-- admin_* (solo admin). Prese in carico e segnalazioni: inserimento/lettura
-- con chiave anon (prototipo); l'aggiornamento serve per risolvere le segnalazioni.
drop policy if exists "vehicles_select_anon" on public.vehicles;
create policy "vehicles_select_anon" on public.vehicles for select to anon, authenticated using (true);

drop policy if exists "handovers_select_anon" on public.vehicle_handovers;
create policy "handovers_select_anon" on public.vehicle_handovers for select to anon, authenticated using (true);
drop policy if exists "handovers_insert_anon" on public.vehicle_handovers;
create policy "handovers_insert_anon" on public.vehicle_handovers for insert to anon, authenticated with check (true);

drop policy if exists "issues_select_anon" on public.vehicle_issues;
create policy "issues_select_anon" on public.vehicle_issues for select to anon, authenticated using (true);
drop policy if exists "issues_insert_anon" on public.vehicle_issues;
create policy "issues_insert_anon" on public.vehicle_issues for insert to anon, authenticated with check (true);
drop policy if exists "issues_update_anon" on public.vehicle_issues;
create policy "issues_update_anon" on public.vehicle_issues for update to anon, authenticated using (true) with check (true);

-- ===========================================================================
-- MULTE / SANZIONI sui mezzi, addebitate al dipendente responsabile.
-- L'attribuzione è proposta dal passaggio di consegna attivo alla data
-- dell'infrazione e confermata dal manager. Flusso stato:
--   registered  -> il dipendente non ha ancora preso visione
--   acknowledged-> presa visione registrata
--   contested   -> il dipendente contesta (con nota)
--   cancelled   -> annullata dal manager
-- L'app registra/notifica/raccoglie la presa visione: l'eventuale trattenuta
-- resta una decisione HR/paghe con i suoi presupposti di legge.
-- ===========================================================================
create table if not exists public.vehicle_fines (
  id              text primary key,
  vehicle_id      text not null references public.vehicles (id) on delete cascade,
  employee_id     text not null references public.profiles (id),
  infraction_at   timestamptz not null,
  amount          numeric(10,2),
  place           text,
  type            text,
  verbale         text,
  note            text default '',
  attachment_url  text,                       -- scansione del verbale (immagine/PDF)
  status          text not null default 'registered'
                    check (status in ('registered', 'acknowledged', 'contested', 'cancelled')),
  acknowledged_at timestamptz,
  contested_at    timestamptz,
  contest_note    text,
  recorded_by     text references public.profiles (id),
  recorded_at     timestamptz not null default now()
);

-- Su DB già esistenti: aggiunge la colonna allegato (idempotente).
alter table public.vehicle_fines add column if not exists attachment_url text;

create index if not exists vehicle_fines_employee_idx on public.vehicle_fines (employee_id);
create index if not exists vehicle_fines_vehicle_idx on public.vehicle_fines (vehicle_id);

alter table public.vehicle_fines enable row level security;
drop policy if exists "fines_select_anon" on public.vehicle_fines;
create policy "fines_select_anon" on public.vehicle_fines for select to anon, authenticated using (true);
drop policy if exists "fines_insert_anon" on public.vehicle_fines;
create policy "fines_insert_anon" on public.vehicle_fines for insert to anon, authenticated with check (true);
drop policy if exists "fines_update_anon" on public.vehicle_fines;
create policy "fines_update_anon" on public.vehicle_fines for update to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vehicle_fines') then
    alter publication supabase_realtime add table public.vehicle_fines;
  end if;
end $$;

-- Funzioni admin per l'anagrafica mezzi.
create or replace function public.admin_upsert_vehicle(
  p_admin_id   text,
  p_id         text,
  p_name       text,
  p_plate      text,
  p_department text,
  p_active     boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.vehicles;
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Non autorizzato';
  end if;
  if coalesce(p_id, '') = '' or coalesce(p_name, '') = '' then
    raise exception 'ID e nome del mezzo sono obbligatori';
  end if;

  insert into public.vehicles (id, name, plate, department, active)
  values (p_id, p_name, nullif(p_plate, ''), nullif(p_department, ''), coalesce(p_active, true))
  on conflict (id) do update set
    name       = excluded.name,
    plate      = excluded.plate,
    department = excluded.department,
    active     = excluded.active
  returning * into v;

  return jsonb_build_object(
    'id', v.id, 'name', v.name, 'plate', v.plate,
    'department', v.department, 'active', v.active
  );
end;
$$;

create or replace function public.admin_delete_vehicle(p_admin_id text, p_vehicle_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Non autorizzato';
  end if;
  delete from public.vehicles where id = p_vehicle_id;
end;
$$;

grant execute on function public.admin_upsert_vehicle(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_delete_vehicle(text, text) to anon, authenticated;

-- Realtime sulle prese in carico e sulle segnalazioni.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vehicle_handovers') then
    alter publication supabase_realtime add table public.vehicle_handovers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vehicle_issues') then
    alter publication supabase_realtime add table public.vehicle_issues;
  end if;
end $$;

-- Storage per le foto dei danni (bucket pubblico in lettura).
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

drop policy if exists "veh_photos_select" on storage.objects;
create policy "veh_photos_select" on storage.objects for select
  to anon, authenticated using (bucket_id = 'vehicle-photos');
drop policy if exists "veh_photos_insert" on storage.objects;
create policy "veh_photos_insert" on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'vehicle-photos');

-- Mezzi demo iniziali.
insert into public.vehicles (id, name, plate, department) values
  ('veh-1', 'Fiat Ducato',    'AB123CD', 'Logistica'),
  ('veh-2', 'Iveco Daily',    'EF456GH', 'Produzione'),
  ('veh-3', 'Renault Kangoo', 'IJ789KL', 'Manutenzione')
on conflict (id) do nothing;

-- ===========================================================================
-- TIMBRATURE PRESENZE  (PROTOTIPO DIMOSTRATIVO — non per dati reali)
-- ---------------------------------------------------------------------------
-- ATTENZIONE: gestisce dati personali (identità, orario, POSIZIONE GPS). Per un
-- uso reale serve: autenticazione sicura (Supabase Auth) + RLS per-utente,
-- informativa validata, base giuridica, valutazione DPIA e — in Italia — art. 4
-- Statuto dei Lavoratori. In questa fase è solo dimostrativo (chiave anon).
-- Privacy-by-design: la posizione è registrata SOLO all'atto della timbratura.
-- ===========================================================================

create table if not exists public.time_clockings (
  id          text primary key,
  employee_id text not null references public.profiles (id) on delete cascade,
  -- Tipo di attività che INIZIA con questa timbratura:
  --   travel = viaggio (pagato, mai straordinario)
  --   work   = lavoro (ordinario/straordinario)
  --   break  = pausa (non pagata, non conteggiata)
  --   end    = fine giornata (chiude l'ultimo segmento)
  -- 'in'/'out' sono mantenuti per compatibilità con i dati storici.
  kind        text not null check (kind in ('travel', 'work', 'break', 'end', 'in', 'out')),
  punched_at  timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  accuracy    double precision,
  -- Anti-frode (Livello 1): tracce per la verifica.
  --   device_time        = orario DICHIARATO dal dispositivo (manomettibile)
  --   received_at        = orario in cui il server ha registrato la riga (autoritativo)
  --   offline            = creata offline e sincronizzata in un secondo momento
  --   clock_skew_seconds = scarto device_time - server (secondi); grande = sospetto
  device_time        timestamptz,
  received_at        timestamptz not null default now(),
  offline            boolean not null default false,
  clock_skew_seconds integer,
  -- Cross-check posizione GPS ↔ IP (Livello 3): popolato dalla edge function
  -- `clocking-ip-check`, se attivata. Resta null se la funzione non è in uso.
  ip_country         text,
  ip_distance_km     integer,
  ip_mismatch        boolean,
  created_at  timestamptz not null default now()
);

create index if not exists time_clockings_employee_idx on public.time_clockings (employee_id);

-- Aggiorna il vincolo anche sulle installazioni esistenti (idempotente).
alter table public.time_clockings drop constraint if exists time_clockings_kind_check;
alter table public.time_clockings add constraint time_clockings_kind_check
  check (kind in ('travel', 'work', 'break', 'end', 'in', 'out'));

-- Colonne anti-frode anche sulle installazioni già esistenti (idempotente).
alter table public.time_clockings add column if not exists device_time        timestamptz;
alter table public.time_clockings add column if not exists received_at        timestamptz not null default now();
alter table public.time_clockings add column if not exists offline            boolean not null default false;
alter table public.time_clockings add column if not exists clock_skew_seconds integer;
alter table public.time_clockings add column if not exists ip_country         text;
alter table public.time_clockings add column if not exists ip_distance_km     integer;
alter table public.time_clockings add column if not exists ip_mismatch        boolean;

-- Integrità dell'orario: il SERVER è la fonte di verità.
--   • timbratura ONLINE  → punched_at = now() del server (l'orario inviato dal
--     dispositivo viene ignorato: così cambiare l'orologio del telefono non ha
--     effetto sulle timbrature fatte con rete).
--   • timbratura OFFLINE → si conserva l'orario dichiarato dal dispositivo
--     (unico disponibile), ma resta marcata `offline` e si registra lo scarto.
create or replace function public.time_clockings_stamp()
returns trigger
language plpgsql
as $$
begin
  new.received_at := now();
  if coalesce(new.offline, false) = false then
    new.punched_at := now();
  else
    new.punched_at := coalesce(new.punched_at, new.device_time, now());
  end if;
  if new.device_time is not null then
    new.clock_skew_seconds := round(extract(epoch from (new.device_time - new.received_at)));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_time_clockings_stamp on public.time_clockings;
create trigger trg_time_clockings_stamp
  before insert on public.time_clockings
  for each row execute function public.time_clockings_stamp();

alter table public.time_clockings enable row level security;

drop policy if exists "clockings_select_anon" on public.time_clockings;
create policy "clockings_select_anon" on public.time_clockings for select to anon, authenticated using (true);
drop policy if exists "clockings_insert_anon" on public.time_clockings;
create policy "clockings_insert_anon" on public.time_clockings for insert to anon, authenticated with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='time_clockings') then
    alter publication supabase_realtime add table public.time_clockings;
  end if;
end $$;
