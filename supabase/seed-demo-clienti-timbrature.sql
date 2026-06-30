-- ---------------------------------------------------------------------------
-- Seed DEMO — Clienti + timbrature di esempio (solo reparto Operativo)
-- ---------------------------------------------------------------------------
-- Popola l'app con ~15 clienti e una serie di timbrature realistiche degli
-- ultimi giorni lavorativi per i 10 dipendenti del reparto OPERATIVO (op-01..10),
-- così da mostrare al CEO il cartellino, il riepilogo "Per cliente", ecc.
--
-- Eseguire nel SQL Editor di Supabase. È IDEMPOTENTE per giorno: rieseguendolo
-- lo stesso giorno non crea doppioni (ON CONFLICT DO NOTHING su id deterministici);
-- rieseguendolo un altro giorno aggiunge i nuovi giorni.
--
-- PREREQUISITI: aver già eseguito schema.sql e seed-utenti.sql (creano la tabella
-- clients, le colonne client_* sulle timbrature e i profili op-01..op-10).
--
-- Per RIMUOVERE i dati demo, vedi il blocco commentato in fondo.
-- ---------------------------------------------------------------------------

begin;

-- 1) Clienti demo (zona Piemonte/Liguria) -----------------------------------
insert into public.clients (id, name, address, lat, lng, active) values
  ('cli-d01', 'Cantina Sociale di Ovada',          'Via Novi 10, 15076 Ovada AL',                 44.6419, 8.6470, true),
  ('cli-d02', 'Acciaierie del Monferrato S.p.A.',  'Strada Statale 35, 15067 Novi Ligure AL',     44.7625, 8.7880, true),
  ('cli-d03', 'Idrotecnica Acqui S.r.l.',          'Corso Bagni 22, 15011 Acqui Terme AL',        44.6760, 8.4680, true),
  ('cli-d04', 'Logistica Serravalle S.p.A.',       'Via Novi 289, 15069 Serravalle Scrivia AL',   44.7220, 8.8570, true),
  ('cli-d05', 'Ceramiche Tortona S.r.l.',          'Via Emilia 145, 15057 Tortona AL',            44.8940, 8.8640, true),
  ('cli-d06', 'Porto Antico Servizi',              'Calata Cattaneo 15, 16128 Genova GE',         44.4090, 8.9260, true),
  ('cli-d07', 'Cantine Gavi 1870',                 'Via Mazzini 5, 15066 Gavi AL',                44.6890, 8.8050, true),
  ('cli-d08', 'Outlet Serravalle Gestioni',        'Via della Moda 1, 15069 Serravalle Scrivia AL', 44.7180, 8.8620, true),
  ('cli-d09', 'Riso & Co. Casale',                 'Via Roma 3, 15033 Casale Monferrato AL',      45.1350, 8.4520, true),
  ('cli-d10', 'Spumanti Asti S.p.A.',              'Corso Alfieri 100, 14100 Asti AT',            44.9000, 8.2060, true),
  ('cli-d11', 'Orafi Valenza S.r.l.',              'Viale Galimberti 20, 15048 Valenza AL',       45.0130, 8.6470, true),
  ('cli-d12', 'Scrivia Depurazione S.c.a r.l.',    'Via Genova 7, 15061 Arquata Scrivia AL',      44.6840, 8.8870, true),
  ('cli-d13', 'Agricola Capriata',                 'SP 185, 15010 Capriata d''Orba AL',           44.7350, 8.6840, true),
  ('cli-d14', 'Vivai Silvano',                     'Via Ovada 44, 15060 Silvano d''Orba AL',      44.6720, 8.6390, true),
  ('cli-d15', 'Cartiera Rossiglione',              'Via Roma 88, 16010 Rossiglione GE',           44.5680, 8.6680, true)
on conflict (id) do update
  set name = excluded.name, address = excluded.address, lat = excluded.lat, lng = excluded.lng, active = excluded.active;

-- 2) Timbrature di esempio (solo Operativo) ---------------------------------
-- Il trigger di "timbro server-authoritative" riscriverebbe gli orari a now():
-- lo disattiviamo per inserire orari STORICI realistici, poi lo riattiviamo.
-- (Tutto in transazione: se qualcosa va storto, il trigger resta attivo.)
alter table public.time_clockings disable trigger trg_time_clockings_stamp;

do $$
declare
  ops  text[] := array['op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08','op-09','op-10'];
  cls  text[] := array['cli-d01','cli-d02','cli-d03','cli-d04','cli-d05','cli-d06','cli-d07','cli-d08','cli-d09','cli-d10','cli-d11','cli-d12','cli-d13','cli-d14','cli-d15'];
  clat double precision[] := array[44.6419,44.7625,44.6760,44.7220,44.8940,44.4090,44.6890,44.7180,45.1350,44.9000,45.0130,44.6840,44.7350,44.6720,44.5680];
  clng double precision[] := array[8.6470,8.7880,8.4680,8.8570,8.8640,8.9260,8.8050,8.8620,8.4520,8.2060,8.6470,8.8870,8.6840,8.6390,8.6680];
  di int; ei int; the_date date; emp text; pref text;
  i1 int; i2 int; two boolean;
begin
  for di in 1..30 loop
    the_date := current_date - di;
    -- salta sabato (6) e domenica (0)
    if extract(dow from the_date) in (0, 6) then continue; end if;

    for ei in 1..array_length(ops, 1) loop
      emp := ops[ei];
      -- qualche assenza realistica (~1 giorno su 6)
      if (di * 7 + ei * 3) % 6 = 0 then continue; end if;

      i1 := ((di * 3 + ei) % 15) + 1;          -- cliente del mattino
      two := ((di + ei * 2) % 3 = 0);           -- ~1/3 dei giorni: due clienti
      i2 := ((di * 5 + ei + 4) % 15) + 1;       -- cliente del pomeriggio
      if i2 = i1 then i2 := (i2 % 15) + 1; end if;
      pref := 'clkd-' || to_char(the_date, 'YYYYMMDD') || '-' || emp;

      -- 08:00 inizio viaggio (verso il cliente del mattino)
      insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy)
      values (pref||'-1', emp, 'travel', (the_date + time '08:00') at time zone 'Europe/Rome', (the_date + time '08:00') at time zone 'Europe/Rome', (the_date + time '08:00') at time zone 'Europe/Rome', false, 0, clat[i1]+0.0004, clng[i1]+0.0004, 16)
      on conflict (id) do nothing;

      -- 08:30 inizio lavoro presso cliente 1
      insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy, client_id)
      values (pref||'-2', emp, 'work', (the_date + time '08:30') at time zone 'Europe/Rome', (the_date + time '08:30') at time zone 'Europe/Rome', (the_date + time '08:30') at time zone 'Europe/Rome', false, 0, clat[i1], clng[i1], 12, cls[i1])
      on conflict (id) do nothing;

      if two then
        -- 12:30 trasferimento al secondo cliente
        insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy)
        values (pref||'-3', emp, 'travel', (the_date + time '12:30') at time zone 'Europe/Rome', (the_date + time '12:30') at time zone 'Europe/Rome', (the_date + time '12:30') at time zone 'Europe/Rome', false, 0, clat[i1], clng[i1], 14)
        on conflict (id) do nothing;
        -- 13:00 lavoro presso cliente 2
        insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy, client_id)
        values (pref||'-4', emp, 'work', (the_date + time '13:00') at time zone 'Europe/Rome', (the_date + time '13:00') at time zone 'Europe/Rome', (the_date + time '13:00') at time zone 'Europe/Rome', false, 0, clat[i2], clng[i2], 12, cls[i2])
        on conflict (id) do nothing;
      else
        -- 12:30 pausa pranzo
        insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy)
        values (pref||'-3', emp, 'break', (the_date + time '12:30') at time zone 'Europe/Rome', (the_date + time '12:30') at time zone 'Europe/Rome', (the_date + time '12:30') at time zone 'Europe/Rome', false, 0, clat[i1], clng[i1], 12)
        on conflict (id) do nothing;
        -- 13:00 ripresa lavoro stesso cliente
        insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy, client_id)
        values (pref||'-4', emp, 'work', (the_date + time '13:00') at time zone 'Europe/Rome', (the_date + time '13:00') at time zone 'Europe/Rome', (the_date + time '13:00') at time zone 'Europe/Rome', false, 0, clat[i1], clng[i1], 12, cls[i1])
        on conflict (id) do nothing;
      end if;

      -- 17:00 viaggio di rientro
      insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy)
      values (pref||'-5', emp, 'travel', (the_date + time '17:00') at time zone 'Europe/Rome', (the_date + time '17:00') at time zone 'Europe/Rome', (the_date + time '17:00') at time zone 'Europe/Rome', false, 0, (case when two then clat[i2] else clat[i1] end), (case when two then clng[i2] else clng[i1] end), 15)
      on conflict (id) do nothing;

      -- 17:30 fine giornata
      insert into public.time_clockings (id, employee_id, kind, punched_at, received_at, device_time, offline, clock_skew_seconds, lat, lng, accuracy)
      values (pref||'-6', emp, 'end', (the_date + time '17:30') at time zone 'Europe/Rome', (the_date + time '17:30') at time zone 'Europe/Rome', (the_date + time '17:30') at time zone 'Europe/Rome', false, 0, (case when two then clat[i2] else clat[i1] end), (case when two then clng[i2] else clng[i1] end), 15)
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;

alter table public.time_clockings enable trigger trg_time_clockings_stamp;

commit;

-- 3) Verifica ---------------------------------------------------------------
select count(*) as timbrature_demo from public.time_clockings where id like 'clkd-%';
select count(*) as clienti_demo from public.clients where id like 'cli-d%';

-- ---------------------------------------------------------------------------
-- PER RIMUOVERE i dati demo (decommentare ed eseguire):
-- begin;
--   delete from public.time_clockings where id like 'clkd-%';
--   delete from public.clients where id like 'cli-d%';
-- commit;
-- ---------------------------------------------------------------------------
