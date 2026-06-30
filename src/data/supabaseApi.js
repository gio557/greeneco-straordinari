// ---------------------------------------------------------------------------
// Implementazione del livello dati su SUPABASE (database centrale condiviso).
//
// Usata automaticamente quando le chiavi di Supabase sono configurate
// (vedi ./api.js e ./supabaseClient.js). Tutti i dispositivi leggono e
// scrivono sullo stesso archivio, quindi i dati sono sempre aggiornati ovunque.
//
// Accesso (prototipo): login con id/email + password verificata lato database
// da funzioni sicure (vedi supabase/schema.sql). L'utente "admin" gestisce gli
// altri utenti. La sicurezza fine (RLS su auth.uid) arriverà con il login reale.
// ---------------------------------------------------------------------------

import { supabase } from './supabaseClient.js'
import { defaultPermConfig, mergeWithDefaults } from '../permissions.js'

const REQUESTS_TABLE = 'overtime_requests'
const PROFILES_TABLE = 'profiles'

// Converte una riga del database (snake_case) nell'oggetto usato dalla UI
// (camelCase), così i componenti non devono cambiare.
function rowToRequest(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    managerId: r.manager_id,
    date: r.work_date,
    hours: Number(r.hours),
    reason: r.reason,
    status: r.status,
    decisionNote: r.decision_note ?? '',
    decidedBy: r.decided_by,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}

function rowToUser(p) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    department: p.department,
    managerId: p.manager_id ?? undefined,
    managerIds: Array.isArray(p.manager_ids) ? p.manager_ids : [],
    email: p.email,
  }
}

export async function listUsers() {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('*')
    .order('role', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data.map(rowToUser)
}

// Login con identificativo (id o email) + password. La verifica avviene lato
// database (funzione sicura app_login): la password non transita mai nelle
// query come testo confrontabile né viene esposta al client.
export async function login(identifier, password) {
  const { data, error } = await supabase.rpc('app_login', {
    p_identifier: (identifier || '').trim(),
    p_password: password || '',
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Credenziali non valide')
  // La funzione restituisce già l'oggetto profilo in formato camelCase.
  return data
}

export async function getRequestsForEmployee(employeeId) {
  const { data, error } = await supabase
    .from(REQUESTS_TABLE)
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToRequest)
}

export async function getRequestsForManager(managerId) {
  // Un manager vede le richieste dei dipendenti che gestisce (molti-a-molti).
  const { data: emps, error: empErr } = await supabase
    .from(PROFILES_TABLE)
    .select('id')
    .contains('manager_ids', [managerId])
  if (empErr) throw new Error(empErr.message)
  const ids = (emps || []).map((e) => e.id)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from(REQUESTS_TABLE)
    .select('*')
    .in('employee_id', ids)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToRequest)
}

// Tutte le richieste dell'azienda (vista admin).
export async function getAllRequests() {
  const { data, error } = await supabase
    .from(REQUESTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToRequest)
}

export async function createRequest({ employeeId, date, hours, reason }) {
  // La richiesta è visibile a TUTTI i manager del dipendente (instradamento per
  // relazione, non per singolo manager): non si fissa qui un destinatario.
  const row = {
    id: `req-${Date.now()}`,
    employee_id: employeeId,
    manager_id: null,
    work_date: date,
    hours: Number(hours),
    reason: reason.trim(),
    status: 'pending',
    decision_note: '',
  }
  const { data, error } = await supabase
    .from(REQUESTS_TABLE)
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToRequest(data)
}

export async function decideRequest({ requestId, decision, note, managerId }) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Decisione non valida')
  }
  // Autorizzazione lato app: può decidere l'admin, oppure un manager che
  // gestisce il dipendente della richiesta (uno qualsiasi dei suoi manager).
  const { data: existing, error: getError } = await supabase
    .from(REQUESTS_TABLE)
    .select('employee_id')
    .eq('id', requestId)
    .maybeSingle()
  if (getError) throw new Error(getError.message)
  if (!existing) throw new Error('Richiesta non trovata')
  const { data: actor } = await supabase
    .from(PROFILES_TABLE)
    .select('role')
    .eq('id', managerId)
    .maybeSingle()
  let allowed = actor?.role === 'admin'
  if (!allowed) {
    const { data: emp } = await supabase
      .from(PROFILES_TABLE)
      .select('manager_ids')
      .eq('id', existing.employee_id)
      .maybeSingle()
    allowed = Array.isArray(emp?.manager_ids) && emp.manager_ids.includes(managerId)
  }
  if (!allowed) throw new Error('Non sei autorizzato a gestire questa richiesta')

  const { data, error } = await supabase
    .from(REQUESTS_TABLE)
    .update({
      status: decision,
      decision_note: (note || '').trim(),
      decided_by: managerId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToRequest(data)
}

export async function getUserMap() {
  const users = await listUsers()
  const map = {}
  for (const u of users) map[u.id] = u
  return map
}

// --- Amministrazione utenti (solo ruolo "admin") --------------------------
// L'autorizzazione è verificata lato database dalle funzioni admin_*.

export async function adminListUsers(adminId) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_admin_id: adminId,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function adminUpsertUser(adminId, user) {
  const { data, error } = await supabase.rpc('admin_upsert_user', {
    p_admin_id: adminId,
    p_id: (user.id || '').trim(),
    p_name: (user.name || '').trim(),
    p_role: user.role,
    p_department: user.department || '',
    p_manager_ids: Array.isArray(user.managerIds) ? user.managerIds : [],
    p_email: user.email || '',
    p_password: user.password || '',
  })
  if (error) throw new Error(error.message)
  return data
}

export async function adminDeleteUser(adminId, userId) {
  const { error } = await supabase.rpc('admin_delete_user', {
    p_admin_id: adminId,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message)
}

// Con il database centrale i dati sono condivisi: il reset dei dati demo non è
// disponibile (eviterebbe di cancellare per errore i dati di tutti).
export async function resetDemoData() {
  throw new Error('Reset non disponibile: i dati sono sul database centrale.')
}

// Aggiornamenti in TEMPO REALE: invoca onChange a ogni inserimento/modifica
// delle richieste, così le altre app (su altri telefoni) si aggiornano da sole.
// Ritorna una funzione di "annulla sottoscrizione" da chiamare alla pulizia.
export function subscribeToRequests(onChange) {
  const channel = supabase
    .channel('overtime_requests_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: REQUESTS_TABLE },
      onChange
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ===========================================================================
// AUTOMEZZI — presa in carico, segnalazioni, anagrafica mezzi, foto
// ===========================================================================

function rowToVehicle(v) {
  return {
    id: v.id,
    name: v.name,
    plate: v.plate ?? '',
    department: v.department ?? '',
    active: v.active,
  }
}

function rowToHandover(h) {
  return {
    id: h.id,
    vehicleId: h.vehicle_id,
    employeeId: h.employee_id,
    conditionOk: h.condition_ok,
    note: h.note ?? '',
    takenAt: h.taken_at,
    returnedAt: h.returned_at ?? null,
  }
}

function rowToIssue(i) {
  return {
    id: i.id,
    vehicleId: i.vehicle_id,
    handoverId: i.handover_id,
    description: i.description,
    photoUrl: i.photo_url,
    status: i.status,
    reportedBy: i.reported_by,
    reportedAt: i.reported_at,
    resolvedBy: i.resolved_by,
    resolvedAt: i.resolved_at,
  }
}

export async function listVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data.map(rowToVehicle)
}

export async function getVehicle(vehicleId) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToVehicle(data) : null
}

export async function getOpenIssues(vehicleId) {
  const { data, error } = await supabase
    .from('vehicle_issues')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'open')
    .order('reported_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToIssue)
}

// Carica una foto nel bucket pubblico e restituisce l'URL pubblico.
export async function uploadVehiclePhoto(file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `veh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
  return data.publicUrl
}

// Handover ancora aperto (mezzo in uso) per un mezzo, oppure null.
export async function getActiveHandover(vehicleId) {
  const { data, error } = await supabase
    .from('vehicle_handovers')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .is('returned_at', null)
    .order('taken_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return data && data[0] ? rowToHandover(data[0]) : null
}

// Tutti gli handover aperti (mezzi attualmente in uso).
export async function getOpenHandovers() {
  const { data, error } = await supabase
    .from('vehicle_handovers')
    .select('*')
    .is('returned_at', null)
  if (error) throw new Error(error.message)
  return data.map(rowToHandover)
}

// Riconsegna: chiude l'handover aperto del mezzo.
export async function returnVehicle(vehicleId) {
  const { error } = await supabase
    .from('vehicle_handovers')
    .update({ returned_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('returned_at', null)
  if (error) throw new Error(error.message)
}

// Registra una presa in carico. `issues` è l'elenco dei NUOVI danni segnalati
// (ognuno { description, photoUrl }). conditionOk = true se nessun danno nuovo.
export async function createHandover({ vehicleId, employeeId, note, issues }) {
  // Sicurezza: non si può prendere un mezzo già in uso.
  const active = await getActiveHandover(vehicleId)
  if (active) throw new Error('Mezzo già in uso: non disponibile.')

  const newIssues = issues || []
  const conditionOk = newIssues.length === 0
  const handoverId = `hov-${Date.now()}`

  const { data, error } = await supabase
    .from('vehicle_handovers')
    .insert({
      id: handoverId,
      vehicle_id: vehicleId,
      employee_id: employeeId,
      condition_ok: conditionOk,
      note: (note || '').trim(),
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  if (newIssues.length > 0) {
    const rows = newIssues.map((it, idx) => ({
      id: `iss-${Date.now()}-${idx}`,
      vehicle_id: vehicleId,
      handover_id: handoverId,
      description: it.description.trim(),
      photo_url: it.photoUrl || null,
      status: 'open',
      reported_by: employeeId,
    }))
    const { error: issErr } = await supabase.from('vehicle_issues').insert(rows)
    if (issErr) throw new Error(issErr.message)
  }

  return rowToHandover(data)
}

// Passaggio di consegna attivo per quel mezzo a una certa data (per attribuire
// una multa anche di mesi prima): query mirata sul singolo mezzo, senza limiti
// di profondità sullo storico complessivo.
export async function getHandoverAt(vehicleId, atISO) {
  const { data, error } = await supabase
    .from('vehicle_handovers')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .lte('taken_at', atISO)
    .order('taken_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  const t = Date.parse(atISO)
  const match = (data || [])
    .map(rowToHandover)
    .find((h) => !h.returnedAt || Date.parse(h.returnedAt) >= t)
  return match || null
}

export async function getRecentHandovers(limit = 200) {
  const { data, error } = await supabase
    .from('vehicle_handovers')
    .select('*')
    .order('taken_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data.map(rowToHandover)
}

export async function getAllIssues() {
  const { data, error } = await supabase
    .from('vehicle_issues')
    .select('*')
    .order('reported_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToIssue)
}

export async function resolveIssue(issueId, actorId) {
  const { error } = await supabase
    .from('vehicle_issues')
    .update({ status: 'resolved', resolved_by: actorId, resolved_at: new Date().toISOString() })
    .eq('id', issueId)
  if (error) throw new Error(error.message)
}

export async function adminListVehicles(adminId) {
  // L'elenco mezzi è pubblico; adminId è accettato per coerenza di firma.
  void adminId
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data.map(rowToVehicle)
}

export async function adminUpsertVehicle(adminId, vehicle) {
  const { data, error } = await supabase.rpc('admin_upsert_vehicle', {
    p_admin_id: adminId,
    p_id: (vehicle.id || '').trim(),
    p_name: (vehicle.name || '').trim(),
    p_plate: vehicle.plate || '',
    p_department: vehicle.department || '',
    p_active: vehicle.active !== false,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function adminDeleteVehicle(adminId, vehicleId) {
  const { error } = await supabase.rpc('admin_delete_vehicle', {
    p_admin_id: adminId,
    p_vehicle_id: vehicleId,
  })
  if (error) throw new Error(error.message)
}

// Realtime su prese in carico e segnalazioni dei mezzi.
export function subscribeToVehicleData(onChange) {
  const channel = supabase
    .channel('vehicle_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_handovers' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_issues' }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ===========================================================================
// MULTE / SANZIONI sui mezzi
// ===========================================================================

function rowToFine(f) {
  return {
    id: f.id,
    vehicleId: f.vehicle_id,
    employeeId: f.employee_id,
    infractionAt: f.infraction_at,
    amount: f.amount != null ? Number(f.amount) : null,
    place: f.place ?? '',
    type: f.type ?? '',
    verbale: f.verbale ?? '',
    note: f.note ?? '',
    attachmentUrl: f.attachment_url ?? null,
    status: f.status,
    acknowledgedAt: f.acknowledged_at,
    contestedAt: f.contested_at,
    contestNote: f.contest_note ?? '',
    recordedBy: f.recorded_by,
    recordedAt: f.recorded_at,
  }
}

export async function createFine({ vehicleId, employeeId, infractionAt, amount, place, type, verbale, note, attachmentUrl, recordedBy }) {
  const { data, error } = await supabase
    .from('vehicle_fines')
    .insert({
      id: `fine-${Date.now()}`,
      vehicle_id: vehicleId,
      employee_id: employeeId,
      infraction_at: infractionAt,
      amount: amount ?? null,
      place: place || null,
      type: type || null,
      verbale: verbale || null,
      note: (note || '').trim(),
      attachment_url: attachmentUrl || null,
      recorded_by: recordedBy || null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToFine(data)
}

export async function getFinesForEmployee(employeeId) {
  const { data, error } = await supabase
    .from('vehicle_fines')
    .select('*')
    .eq('employee_id', employeeId)
    .neq('status', 'cancelled')
    .order('infraction_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToFine)
}

export async function getAllFines() {
  const { data, error } = await supabase
    .from('vehicle_fines')
    .select('*')
    .order('infraction_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map(rowToFine)
}

export async function acknowledgeFine(fineId, employeeId) {
  const { error } = await supabase
    .from('vehicle_fines')
    .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
    .eq('id', fineId)
    .eq('employee_id', employeeId)
    .eq('status', 'registered')
  if (error) throw new Error(error.message)
}

export async function contestFine(fineId, employeeId, contestNote) {
  const { error } = await supabase
    .from('vehicle_fines')
    .update({ status: 'contested', contested_at: new Date().toISOString(), contest_note: (contestNote || '').trim() })
    .eq('id', fineId)
    .eq('employee_id', employeeId)
    .in('status', ['registered', 'acknowledged'])
  if (error) throw new Error(error.message)
}

export async function cancelFine(fineId) {
  const { error } = await supabase
    .from('vehicle_fines')
    .update({ status: 'cancelled' })
    .eq('id', fineId)
  if (error) throw new Error(error.message)
}

export function subscribeToFines(onChange) {
  const channel = supabase
    .channel('vehicle_fines_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_fines' }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// Carica la scansione del verbale nel bucket PRIVATO e restituisce il PATH
// dell'oggetto (non un URL pubblico): l'URL firmato si genera alla lettura.
export async function uploadFineScan(file) {
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase()
  const path = `fine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('fine-scans')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw new Error(error.message)
  return path
}

// Genera un URL firmato a scadenza per visualizzare la scansione. Gestisce anche
// eventuali valori storici (vecchi URL pubblici o data URL) restituendoli così.
export async function getFineScanUrl(value) {
  if (!value) return null
  if (/^(https?:|data:)/i.test(value)) return value
  const { data, error } = await supabase.storage.from('fine-scans').createSignedUrl(value, 3600)
  if (error) return null
  return data?.signedUrl || null
}

// ===========================================================================
// TIMBRATURE PRESENZE (prototipo)
// ===========================================================================

function rowToClocking(c) {
  return {
    id: c.id,
    employeeId: c.employee_id,
    kind: c.kind,
    punchedAt: c.punched_at,
    lat: c.lat,
    lng: c.lng,
    accuracy: c.accuracy,
    deviceTime: c.device_time,
    receivedAt: c.received_at,
    offline: c.offline,
    clockSkewSeconds: c.clock_skew_seconds,
    ipCountry: c.ip_country,
    ipDistanceKm: c.ip_distance_km,
    ipMismatch: c.ip_mismatch,
    clientId: c.client_id ?? null,
    clientName: c.client_name ?? null,
  }
}

export async function getLastClocking(employeeId) {
  const { data, error } = await supabase
    .from('time_clockings')
    .select('*')
    .eq('employee_id', employeeId)
    .order('punched_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return data && data[0] ? rowToClocking(data[0]) : null
}

export async function getMyClockings(employeeId, limit = 50) {
  const { data, error } = await supabase
    .from('time_clockings')
    .select('*')
    .eq('employee_id', employeeId)
    .order('punched_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data.map(rowToClocking)
}

export async function getRecentClockings(limit = 300) {
  const { data, error } = await supabase
    .from('time_clockings')
    .select('*')
    .order('punched_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data.map(rowToClocking)
}

// Tutte le timbrature in un intervallo [fromISO, toISO). Usata dal riepilogo
// mensile: si passa un intervallo leggermente più ampio del mese e si
// raggruppa per giorno lato client (fuso orario locale).
export async function getClockingsInRange(fromISO, toISO) {
  const { data, error } = await supabase
    .from('time_clockings')
    .select('*')
    .gte('punched_at', fromISO)
    .lt('punched_at', toISO)
    .order('punched_at', { ascending: true })
    .limit(10000)
  if (error) throw new Error(error.message)
  return data.map(rowToClocking)
}

// Costruisce la riga da inserire. `withFraud` include le colonne anti-frode
// (presenti solo dopo la migrazione dello schema). In entrambi i casi, per le
// timbrature ONLINE non si invia `punched_at`: lo imposta il server (default
// now() o trigger), così l'orologio del telefono non incide.
function buildClockingRow({ employeeId, kind, lat, lng, accuracy, id, punchedAt, deviceTime, offline, clientId, clientName }, withExtras) {
  const row = {
    id: id || `clk-${Date.now()}`,
    employee_id: employeeId,
    kind,
    lat: lat ?? null,
    lng: lng ?? null,
    accuracy: accuracy ?? null,
  }
  if (withExtras) {
    row.device_time = deviceTime ?? punchedAt ?? null
    row.offline = !!offline
    row.client_id = clientId ?? null
    row.client_name = clientName ?? null
  }
  if (offline && (punchedAt || deviceTime)) row.punched_at = punchedAt ?? deviceTime
  return row
}

// Riconosce l'errore "le colonne anti-frode non esistono ancora" (migrazione
// dello schema non ancora eseguita), per ripiegare su un inserimento legacy.
function isMissingFraudColumns(message) {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('device_time') ||
    m.includes('received_at') ||
    m.includes('clock_skew') ||
    m.includes('client_id') ||
    m.includes('client_name') ||
    (m.includes('offline') && m.includes('column')) ||
    m.includes('schema cache')
  )
}

export async function createClocking(payload) {
  // `id` arriva dal dispositivo: l'upsert rende il reinvio idempotente.
  let res = await supabase
    .from('time_clockings')
    .upsert(buildClockingRow(payload, true), { onConflict: 'id' })
    .select()
    .single()
  // Compatibilità: se lo schema anti-frode non è ancora stato applicato, ripiega
  // su un inserimento senza i nuovi campi (le timbrature continuano a funzionare).
  if (res.error && isMissingFraudColumns(res.error.message)) {
    res = await supabase
      .from('time_clockings')
      .upsert(buildClockingRow(payload, false), { onConflict: 'id' })
      .select()
      .single()
  }
  if (res.error) throw new Error(res.error.message)
  return rowToClocking(res.data)
}

export function subscribeToClockings(onChange) {
  const channel = supabase
    .channel('time_clockings_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_clockings' }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ===========================================================================
// ANAGRAFICA CLIENTI
// ===========================================================================

function rowToClient(c) {
  return { id: c.id, name: c.name, address: c.address ?? '', lat: c.lat ?? null, lng: c.lng ?? null, active: c.active !== false }
}

export async function listClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data.map(rowToClient)
}

export async function upsertClient(client) {
  const row = {
    id: client.id || `cli-${Date.now()}`,
    name: client.name,
    address: client.address ?? null,
    lat: client.lat ?? null,
    lng: client.lng ?? null,
    active: client.active !== false,
  }
  const { data, error } = await supabase
    .from('clients')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToClient(data)
}

export async function deleteClient(clientId) {
  const { error } = await supabase.from('clients').delete().eq('id', clientId)
  if (error) throw new Error(error.message)
}

export function subscribeToClients(onChange) {
  const channel = supabase
    .channel('clients_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ===========================================================================
// CASSETTO DEL DIPENDENTE: documenti personali (cedolini, sanzioni disciplinari)
// ===========================================================================

function rowToDocument(d) {
  return {
    id: d.id,
    employeeId: d.employee_id,
    kind: d.kind,
    title: d.title ?? '',
    docDate: d.doc_date,
    attachmentPath: d.attachment_path,
    needsAck: d.needs_ack,
    acknowledgedAt: d.acknowledged_at,
    uploadedBy: d.uploaded_by,
    createdAt: d.created_at,
  }
}

// Carica il file del documento nel bucket PRIVATO `employee-docs` e ritorna il
// PATH (l'URL firmato si genera alla lettura).
export async function uploadDocFile(file) {
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase()
  const path = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('employee-docs')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw new Error(error.message)
  return path
}

export async function getDocFileUrl(value) {
  if (!value) return null
  if (/^(https?:|data:)/i.test(value)) return value
  const { data, error } = await supabase.storage.from('employee-docs').createSignedUrl(value, 3600)
  if (error) return null
  return data?.signedUrl || null
}

export async function createEmployeeDocument({ employeeId, kind, title, docDate, attachmentPath, needsAck, uploadedBy }) {
  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      id: `doc-${Date.now()}`,
      employee_id: employeeId,
      kind,
      title: (title || '').trim() || null,
      doc_date: docDate || null,
      attachment_path: attachmentPath || null,
      needs_ack: !!needsAck,
      uploaded_by: uploadedBy || null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToDocument(data)
}

// Documenti di UN dipendente (filtro privacy: sempre per employee_id).
export async function getEmployeeDocuments(employeeId, kind) {
  if (!employeeId) return []
  let q = supabase.from('employee_documents').select('*').eq('employee_id', employeeId)
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q.order('doc_date', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  return data.map(rowToDocument)
}

export async function acknowledgeDocument(docId, employeeId) {
  const { error } = await supabase
    .from('employee_documents')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', docId)
    .eq('employee_id', employeeId)
    .is('acknowledged_at', null)
  if (error) throw new Error(error.message)
}

export async function deleteEmployeeDocument(docId) {
  const { error } = await supabase.from('employee_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
}

export function subscribeToDocuments(onChange) {
  const channel = supabase
    .channel('employee_documents_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_documents' }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ===========================================================================
// CATEGORIE & PERMESSI (configurazione)
// ===========================================================================

export async function getPermissionsConfig() {
  const { data, error } = await supabase
    .from('app_config').select('value').eq('key', 'permissions').maybeSingle()
  if (error) throw new Error(error.message)
  return mergeWithDefaults(data?.value || null)
}

export async function savePermissionsConfig(config) {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'permissions', value: config, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

// ===========================================================================
// BACKUP / ESPORTAZIONE DATI (admin)
// ===========================================================================

// Copia completa (sola lettura) di tutte le tabelle dati, per un export manuale
// di sicurezza. NON include le password (la tabella credenziali è protetta e
// inaccessibile dal client). I dati sono restituiti grezzi, come nel database.
const EXPORT_TABLES = [
  'profiles',
  'overtime_requests',
  'time_clockings',
  'vehicles',
  'vehicle_handovers',
  'vehicle_issues',
  'clients',
]

export async function exportAllData(adminId) {
  // Controllo applicativo: solo l'admin può esportare (sarà rafforzato da RLS
  // con il login reale).
  const { data: actor } = await supabase
    .from(PROFILES_TABLE)
    .select('role')
    .eq('id', adminId)
    .maybeSingle()
  if (!actor || actor.role !== 'admin') throw new Error('Non autorizzato')

  const out = {}
  for (const table of EXPORT_TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) throw new Error(`${table}: ${error.message}`)
    out[table] = data || []
  }
  return out
}
