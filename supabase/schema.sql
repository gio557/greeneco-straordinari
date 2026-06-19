-- ===========================================================================
-- Gestione Straordinari — Schema del database centrale (Supabase / PostgreSQL)
--
-- COME USARLO:
--   1. Crea un progetto gratuito su https://supabase.com
--   2. Apri "SQL Editor" → "New query"
--   3. Incolla TUTTO questo file e premi "Run"
--
-- Lo script è idempotente: puoi rieseguirlo senza errori (non duplica i dati).
--
-- NOTA SULL'ACCESSO (fase attuale):
--   L'app usa l'accesso "semplice" (scelta del profilo, senza login). Per questo
--   le policy qui sotto consentono lettura/scrittura tramite la chiave pubblica
--   "anon". In una fase successiva aggiungeremo il login con email/password
--   (Supabase Auth) e restringeremo le policy con auth.uid() — i suggerimenti
--   sono in fondo al file.
-- ===========================================================================

-- --- Tabelle ----------------------------------------------------------------

-- Profili utente (id testuali, come nel prototipo: 'mgr-1', 'emp-1', ...)
create table if not exists public.profiles (
  id          text primary key,
  name        text not null,
  role        text not null check (role in ('employee', 'manager')),
  department  text,
  manager_id  text references public.profiles (id),
  email       text,
  created_at  timestamptz not null default now()
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
-- Fase attuale (accesso semplice): policy permissive sulla chiave anon.

alter table public.profiles enable row level security;
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
-- Gli stessi utenti del prototipo, così l'app è subito utilizzabile.
-- Sostituiscili pure con i veri dipendenti/manager (anche dall'interfaccia
-- "Table Editor" di Supabase).

insert into public.profiles (id, name, role, department, manager_id, email) values
  ('mgr-1', 'Laura Bianchi', 'manager',  'Produzione', null,    'laura.bianchi@azienda.it'),
  ('mgr-2', 'Marco Verdi',   'manager',  'Logistica',  null,    'marco.verdi@azienda.it'),
  ('emp-1', 'Giulia Rossi',  'employee', 'Produzione', 'mgr-1', 'giulia.rossi@azienda.it'),
  ('emp-2', 'Antonio Russo', 'employee', 'Produzione', 'mgr-1', 'antonio.russo@azienda.it'),
  ('emp-3', 'Sara Colombo',  'employee', 'Logistica',  'mgr-2', 'sara.colombo@azienda.it')
on conflict (id) do nothing;

insert into public.overtime_requests
  (id, employee_id, manager_id, work_date, hours, reason, status, decision_note, decided_by, created_at, decided_at) values
  ('req-1001', 'emp-1', 'mgr-1', current_date + 1, 2,   'Completamento ordine urgente cliente Alfa', 'pending',  '',                                     null,    now() - interval '1 hour',  null),
  ('req-1002', 'emp-2', 'mgr-1', current_date + 2, 3,   'Manutenzione straordinaria linea 2',        'pending',  '',                                     null,    now() - interval '2 hour',  null),
  ('req-1003', 'emp-1', 'mgr-1', current_date - 3, 1.5, 'Inventario di fine mese',                   'approved', 'Approvato, ricordati di timbrare.',    'mgr-1', now() - interval '4 day',   now() - interval '3 day'),
  ('req-1004', 'emp-3', 'mgr-2', current_date - 1, 4,   'Carico camion serale non previsto',         'rejected', 'Coperto da turno notturno, non necessario.', 'mgr-2', now() - interval '2 day', now() - interval '1 day')
on conflict (id) do nothing;

-- ===========================================================================
-- FUTURO — login con email/password (Supabase Auth)
-- ---------------------------------------------------------------------------
-- Quando passeremo al login reale:
--   • i profili saranno collegati a auth.users (id uuid);
--   • si rimuoveranno le policy "*_anon" qui sopra e si useranno regole come:
--       create policy "il dipendente vede le proprie richieste"
--         on public.overtime_requests for select
--         using (employee_id = auth.uid()::text);
--       create policy "il manager vede le richieste del team"
--         on public.overtime_requests for select
--         using (manager_id = auth.uid()::text);
-- ===========================================================================
