// ---------------------------------------------------------------------------
// Implementazione DEMO del livello dati (fallback).
//
// Usata automaticamente quando le chiavi di Supabase non sono configurate
// (vedi ./api.js). I dati vivono nel localStorage del singolo dispositivo, NON
// sono condivisi tra telefoni diversi: serve solo per provare l'app prima di
// collegare il database centrale.
// ---------------------------------------------------------------------------

import { USERS, REQUESTS, CREDENTIALS, VEHICLES, CLIENTS } from './seed.js'
import { findHandoverAt } from '../fines.js'
import { filterDocuments } from '../documents.js'
import { defaultPermConfig, mergeWithDefaults } from '../permissions.js'

// Segnaposto dimostrativo per i documenti del cassetto (in demo è un data URL).
const DEMO_DOC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="380" height="500"><rect width="380" height="500" fill="#ffffff" stroke="#cccccc"/><rect width="380" height="48" fill="#0d3b66"/><text x="16" y="31" fill="#fff" font-family="sans-serif" font-size="16">GREENECO — Documento</text><text x="16" y="92" font-family="sans-serif" font-size="13">(documento dimostrativo)</text></svg>'
  )

const STORAGE_KEY = 'straordinari_state_v4'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // localStorage non disponibile o dati corrotti: si riparte dal seed.
  }
  const initial = {
    users: USERS,
    requests: REQUESTS,
    passwords: { ...CREDENTIALS },
    vehicles: VEHICLES,
    clients: CLIENTS,
    handovers: [],
    issues: [],
    clockings: [],
    // Una sanzione dimostrativa (non ancora presa in visione) per mostrare la
    // notifica al dipendente in modalità demo.
    fines: [
      {
        id: 'fine-demo-1',
        vehicleId: VEHICLES[0]?.id,
        employeeId: 'emp-1',
        infractionAt: '2026-06-20T10:15:00+02:00',
        amount: 42,
        place: 'Via Roma, Torino',
        type: 'Divieto di sosta',
        verbale: 'TO-2026-12345',
        note: '',
        status: 'registered',
        acknowledgedAt: null,
        contestedAt: null,
        contestNote: '',
        recordedBy: 'admin',
        recordedAt: '2026-06-24T09:00:00+02:00',
      },
    ],
    // Documenti dimostrativi del cassetto per emp-1.
    documents: [
      { id: 'doc-demo-1', employeeId: 'emp-1', kind: 'cedolino', title: 'Cedolino maggio 2026', docDate: '2026-05-31', attachmentPath: DEMO_DOC, needsAck: false, acknowledgedAt: null, uploadedBy: 'paghe-1', createdAt: '2026-06-02T09:00:00+02:00' },
      { id: 'doc-demo-2', employeeId: 'emp-1', kind: 'disciplinare', title: 'Richiamo verbale', docDate: '2026-04-10', attachmentPath: DEMO_DOC, needsAck: true, acknowledgedAt: null, uploadedBy: 'paghe-1', createdAt: '2026-04-11T09:00:00+02:00' },
    ],
    // Rapportino d'intervento dimostrativo (archivio) per emp-1.
    rapportini: [
      {
        id: 'rap-demo-1',
        authorId: 'emp-1',
        authorName: 'Giulia Rossi',
        interventionId: 'MAN-2026-014',
        clientName: 'Acme S.p.A. — Via Roma 1, Torino',
        docDate: '12-06-2026',
        status: 'archived',
        data: {
          fields: {
            id: 'MAN-2026-014',
            data_compilazione: '12-06-2026',
            richiesto_da: 'Ufficio tecnico Acme',
            cliente_luogo: 'Acme S.p.A. — Via Roma 1, Torino',
            descrizione: 'Sostituzione pompa di rilancio e verifica del quadro elettrico.',
            esito: 'Intervento concluso, impianto ripristinato e collaudato.',
            autore: 'Giulia Rossi',
          },
          signatures: { resp: null, ref: null },
        },
        createdAt: '2026-06-12T16:30:00+02:00',
        updatedAt: '2026-06-12T16:30:00+02:00',
      },
    ],
  }
  save(initial)
  return initial
}

// Rimuove il campo password (non deve mai arrivare alla UI).
function publicUser(u) {
  if (!u) return u
  // eslint-disable-next-line no-unused-vars
  const { password, ...rest } = u
  return rest
}

function assertAdmin(state, adminId) {
  const admin = state.users.find((u) => u.id === adminId)
  if (!admin || admin.role !== 'admin') throw new Error('Non autorizzato')
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // In modalità privata la scrittura può fallire: l'app resta usabile
    // per la sessione corrente.
  }
}

// Piccolo ritardo per simulare la latenza di rete e rendere realistico il demo.
const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms))

export async function listUsers() {
  await delay(120)
  return load().users
}

export async function login(identifier, password) {
  await delay()
  const state = load()
  const id = (identifier || '').trim().toLowerCase()
  const user = state.users.find(
    (u) => u.id.toLowerCase() === id || (u.email || '').toLowerCase() === id
  )
  if (!user) throw new Error('Credenziali non valide')
  const expected = state.passwords?.[user.id]
  if (!expected || expected !== (password || '')) {
    throw new Error('Credenziali non valide')
  }
  return publicUser(user)
}

export async function getRequestsForEmployee(employeeId) {
  await delay()
  return load()
    .requests.filter((r) => r.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getRequestsForManager(managerId) {
  await delay()
  const state = load()
  const managed = new Set(
    state.users.filter((u) => (u.managerIds || []).includes(managerId)).map((u) => u.id)
  )
  return state.requests
    .filter((r) => managed.has(r.employeeId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getAllRequests() {
  await delay()
  return load()
    .requests.slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createRequest({ employeeId, date, hours, reason }) {
  await delay()
  const state = load()
  // La richiesta è visibile a tutti i manager del dipendente: non si fissa qui
  // un destinatario.
  const request = {
    id: `req-${Date.now()}`,
    employeeId,
    date,
    hours: Number(hours),
    reason: reason.trim(),
    status: 'pending',
    managerId: null,
    decisionNote: '',
    decidedBy: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  }
  state.requests.push(request)
  save(state)
  return request
}

export async function decideRequest({ requestId, decision, note, managerId }) {
  await delay()
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Decisione non valida')
  }
  const state = load()
  const request = state.requests.find((r) => r.id === requestId)
  if (!request) throw new Error('Richiesta non trovata')
  const actor = state.users.find((u) => u.id === managerId)
  const employee = state.users.find((u) => u.id === request.employeeId)
  const manages = (employee?.managerIds || []).includes(managerId)
  if (actor?.role !== 'admin' && !manages) {
    throw new Error('Non sei autorizzato a gestire questa richiesta')
  }

  request.status = decision
  request.decisionNote = (note || '').trim()
  request.decidedBy = managerId
  request.decidedAt = new Date().toISOString()
  save(state)
  return request
}

// Utile per nominare dipendenti/manager nelle schermate.
export async function getUserMap() {
  await delay(60)
  const map = {}
  for (const u of load().users) map[u.id] = u
  return map
}

// --- Amministrazione utenti (solo ruolo "admin") --------------------------

export async function adminListUsers(adminId) {
  await delay(80)
  const state = load()
  assertAdmin(state, adminId)
  const order = { admin: 0, manager: 1, employee: 2 }
  return state.users
    .map((u) => ({ ...publicUser(u), hasPassword: Boolean(state.passwords?.[u.id]) }))
    .sort((a, b) => (order[a.role] - order[b.role]) || a.name.localeCompare(b.name))
}

export async function adminUpsertUser(adminId, user) {
  await delay()
  const state = load()
  assertAdmin(state, adminId)
  const id = (user.id || '').trim()
  const name = (user.name || '').trim()
  if (!id || !name) throw new Error('ID e nome sono obbligatori')
  if (!['employee', 'manager', 'admin'].includes(user.role)) {
    throw new Error('Ruolo non valido')
  }

  const managerIds = Array.isArray(user.managerIds) ? user.managerIds : []
  const next = {
    id,
    name,
    role: user.role,
    department: user.department || undefined,
    managerIds,
    managerId: managerIds[0] || undefined, // compatibilità
    email: user.email || undefined,
  }
  const idx = state.users.findIndex((u) => u.id === id)
  if (idx >= 0) state.users[idx] = next
  else state.users.push(next)

  if (user.password) {
    state.passwords = state.passwords || {}
    state.passwords[id] = user.password
  }
  save(state)
  return publicUser(next)
}

export async function adminDeleteUser(adminId, userId) {
  await delay()
  const state = load()
  assertAdmin(state, adminId)
  if (adminId === userId) throw new Error('Non puoi eliminare il tuo stesso account')
  const linked = state.requests.some(
    (r) => r.employeeId === userId || r.decidedBy === userId
  )
  if (linked) throw new Error('Impossibile eliminare: l\'utente ha richieste collegate')
  // Se è un manager, lo si toglie dagli abbinamenti dei dipendenti.
  state.users = state.users.map((u) =>
    (u.managerIds || []).includes(userId)
      ? { ...u, managerIds: u.managerIds.filter((m) => m !== userId), managerId: u.managerId === userId ? undefined : u.managerId }
      : u
  )
  state.users = state.users.filter((u) => u.id !== userId)
  if (state.passwords) delete state.passwords[userId]
  save(state)
}

// --- Cassetto del Dipendente: documenti personali --------------------------

export async function uploadDocFile(file) {
  return uploadVehiclePhoto(file) // in demo: data URL locale
}
export async function getDocFileUrl(value) {
  return value || null
}

export async function createEmployeeDocument({ employeeId, kind, title, docDate, attachmentPath, needsAck, uploadedBy }) {
  await delay()
  const state = load()
  state.documents = state.documents || []
  const doc = {
    id: `doc-${Date.now()}`,
    employeeId,
    kind,
    title: (title || '').trim() || '',
    docDate: docDate || null,
    attachmentPath: attachmentPath || null,
    needsAck: !!needsAck,
    acknowledgedAt: null,
    uploadedBy: uploadedBy || null,
    createdAt: new Date().toISOString(),
  }
  state.documents.push(doc)
  save(state)
  return doc
}

export async function getEmployeeDocuments(employeeId, kind) {
  await delay(80)
  return filterDocuments(load().documents || [], employeeId, kind)
}

export async function acknowledgeDocument(docId, employeeId) {
  await delay()
  const state = load()
  const d = (state.documents || []).find((x) => x.id === docId && x.employeeId === employeeId)
  if (d && !d.acknowledgedAt) {
    d.acknowledgedAt = new Date().toISOString()
    save(state)
  }
}

export async function deleteEmployeeDocument(docId) {
  await delay()
  const state = load()
  state.documents = (state.documents || []).filter((d) => d.id !== docId)
  save(state)
}

export function subscribeToDocuments() {
  return () => {}
}

// --- Rapportini d'intervento (archivio) ------------------------------------

// Salva (nuovo) o aggiorna (se `rec.id` esiste già) un rapportino nell'archivio.
export async function saveRapportino(rec) {
  await delay()
  const state = load()
  state.rapportini = state.rapportini || []
  const now = new Date().toISOString()
  const id = rec.id || `rap-${Date.now()}`
  const idx = state.rapportini.findIndex((r) => r.id === id)
  const next = {
    id,
    authorId: rec.authorId ?? null,
    authorName: rec.authorName ?? '',
    interventionId: rec.interventionId ?? '',
    clientId: rec.clientId ?? null,
    clientName: rec.clientName ?? '',
    docDate: rec.docDate ?? '',
    status: rec.status || 'archived',
    data: rec.data ?? {},
    createdAt: idx >= 0 ? state.rapportini[idx].createdAt : now,
    updatedAt: now,
  }
  if (idx >= 0) state.rapportini[idx] = next
  else state.rapportini.push(next)
  save(state)
  return next
}

// Elenco dei rapportini: se `authorId` è passato, solo quelli di quell'autore
// (archivio personale); altrimenti tutti (per chi ha la visibilità estesa).
export async function getRapportini(authorId = null) {
  await delay(80)
  const list = (load().rapportini || []).filter((r) => !authorId || r.authorId === authorId)
  return list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export async function getAllRapportini() {
  return getRapportini(null)
}

export async function deleteRapportino(id) {
  await delay()
  const state = load()
  state.rapportini = (state.rapportini || []).filter((r) => r.id !== id)
  save(state)
}

export function subscribeToRapportini() {
  return () => {}
}

// --- Categorie & Permessi (configurazione) ---------------------------------

export async function getPermissionsConfig() {
  await delay(60)
  return mergeWithDefaults(load().permConfig || null)
}

export async function savePermissionsConfig(config) {
  await delay()
  const state = load()
  state.permConfig = config
  save(state)
}

// Solo per il prototipo: riporta i dati demo allo stato iniziale.
export async function resetDemoData() {
  save({
    users: USERS,
    requests: REQUESTS,
    passwords: { ...CREDENTIALS },
    vehicles: VEHICLES,
    clients: CLIENTS,
    handovers: [],
    issues: [],
    clockings: [],
  })
}

// In modalità demo non esiste sincronizzazione tra dispositivi: la
// sottoscrizione "tempo reale" è un'operazione vuota che ritorna una funzione
// di pulizia, per mantenere la stessa firma della versione Supabase.
export function subscribeToRequests() {
  return () => {}
}

// --- Automezzi -------------------------------------------------------------

export async function listVehicles() {
  await delay(80)
  return load().vehicles.filter((v) => v.active !== false)
}

export async function getVehicle(vehicleId) {
  await delay(60)
  return load().vehicles.find((v) => v.id === vehicleId) || null
}

export async function getOpenIssues(vehicleId) {
  await delay(60)
  return load()
    .issues.filter((i) => i.vehicleId === vehicleId && i.status === 'open')
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
}

// In demo la "foto" viene tenuta come data URL locale.
export async function uploadVehiclePhoto(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Lettura foto non riuscita'))
    reader.readAsDataURL(file)
  })
}

export async function getActiveHandover(vehicleId) {
  await delay(60)
  return (
    load()
      .handovers.filter((h) => h.vehicleId === vehicleId && !h.returnedAt)
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0] || null
  )
}

export async function getOpenHandovers() {
  await delay(60)
  return load().handovers.filter((h) => !h.returnedAt)
}

export async function returnVehicle(vehicleId) {
  await delay()
  const state = load()
  const open = state.handovers
    .filter((h) => h.vehicleId === vehicleId && !h.returnedAt)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]
  if (open) open.returnedAt = new Date().toISOString()
  save(state)
}

export async function createHandover({ vehicleId, employeeId, note, issues }) {
  await delay()
  const state = load()
  const active = state.handovers.find((h) => h.vehicleId === vehicleId && !h.returnedAt)
  if (active) throw new Error('Mezzo già in uso: non disponibile.')
  const newIssues = issues || []
  const now = new Date().toISOString()
  const handover = {
    id: `hov-${Date.now()}`,
    vehicleId,
    employeeId,
    conditionOk: newIssues.length === 0,
    note: (note || '').trim(),
    takenAt: now,
    returnedAt: null,
  }
  state.handovers.push(handover)
  newIssues.forEach((it, idx) => {
    state.issues.push({
      id: `iss-${Date.now()}-${idx}`,
      vehicleId,
      handoverId: handover.id,
      description: it.description.trim(),
      photoUrl: it.photoUrl || null,
      status: 'open',
      reportedBy: employeeId,
      reportedAt: now,
      resolvedBy: null,
      resolvedAt: null,
    })
  })
  save(state)
  return handover
}

export async function getRecentHandovers(limit = 200) {
  await delay()
  return load()
    .handovers.slice()
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, limit)
}

// Passaggio di consegna attivo per quel mezzo a una certa data (per attribuire
// una multa anche di mesi prima): query mirata, senza limiti di profondità.
export async function getHandoverAt(vehicleId, atISO) {
  await delay(60)
  return findHandoverAt(load().handovers, vehicleId, atISO)
}

export async function getAllIssues() {
  await delay()
  return load()
    .issues.slice()
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
}

export async function resolveIssue(issueId, actorId) {
  await delay()
  const state = load()
  const issue = state.issues.find((i) => i.id === issueId)
  if (!issue) throw new Error('Segnalazione non trovata')
  issue.status = 'resolved'
  issue.resolvedBy = actorId
  issue.resolvedAt = new Date().toISOString()
  save(state)
}

export async function adminListVehicles(adminId) {
  await delay(80)
  const state = load()
  assertAdmin(state, adminId)
  return state.vehicles.slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function adminUpsertVehicle(adminId, vehicle) {
  await delay()
  const state = load()
  assertAdmin(state, adminId)
  const id = (vehicle.id || '').trim()
  const name = (vehicle.name || '').trim()
  if (!id || !name) throw new Error('ID e nome del mezzo sono obbligatori')
  const next = {
    id,
    name,
    plate: vehicle.plate || '',
    department: vehicle.department || '',
    active: vehicle.active !== false,
  }
  const idx = state.vehicles.findIndex((v) => v.id === id)
  if (idx >= 0) state.vehicles[idx] = next
  else state.vehicles.push(next)
  save(state)
  return next
}

export async function adminDeleteVehicle(adminId, vehicleId) {
  await delay()
  const state = load()
  assertAdmin(state, adminId)
  state.vehicles = state.vehicles.filter((v) => v.id !== vehicleId)
  save(state)
}

export function subscribeToVehicleData() {
  return () => {}
}

// --- Multe / Sanzioni ------------------------------------------------------

export async function createFine({ vehicleId, employeeId, infractionAt, amount, place, type, verbale, note, attachmentUrl, recordedBy }) {
  await delay()
  const state = load()
  state.fines = state.fines || []
  const fine = {
    id: `fine-${Date.now()}`,
    vehicleId,
    employeeId,
    infractionAt,
    amount: amount ?? null,
    place: place || '',
    type: type || '',
    verbale: verbale || '',
    note: (note || '').trim(),
    attachmentUrl: attachmentUrl || null,
    status: 'registered',
    acknowledgedAt: null,
    contestedAt: null,
    contestNote: '',
    recordedBy: recordedBy || null,
    recordedAt: new Date().toISOString(),
  }
  state.fines.push(fine)
  save(state)
  return fine
}

export async function getFinesForEmployee(employeeId) {
  await delay(80)
  return (load().fines || [])
    .filter((f) => f.employeeId === employeeId && f.status !== 'cancelled')
    .sort((a, b) => b.infractionAt.localeCompare(a.infractionAt))
}

export async function getAllFines() {
  await delay(80)
  return (load().fines || []).slice().sort((a, b) => b.infractionAt.localeCompare(a.infractionAt))
}

export async function acknowledgeFine(fineId, employeeId) {
  await delay()
  const state = load()
  const f = (state.fines || []).find((x) => x.id === fineId && x.employeeId === employeeId)
  if (f && f.status === 'registered') {
    f.status = 'acknowledged'
    f.acknowledgedAt = new Date().toISOString()
    save(state)
  }
}

export async function contestFine(fineId, employeeId, contestNote) {
  await delay()
  const state = load()
  const f = (state.fines || []).find((x) => x.id === fineId && x.employeeId === employeeId)
  if (f && (f.status === 'registered' || f.status === 'acknowledged')) {
    f.status = 'contested'
    f.contestedAt = new Date().toISOString()
    f.contestNote = (contestNote || '').trim()
    save(state)
  }
}

export async function cancelFine(fineId) {
  await delay()
  const state = load()
  const f = (state.fines || []).find((x) => x.id === fineId)
  if (f) {
    f.status = 'cancelled'
    save(state)
  }
}

export function subscribeToFines() {
  return () => {}
}

// In demo la scansione è tenuta come data URL locale (come le foto mezzi); non
// esiste un bucket, quindi l'URL di lettura è il valore stesso.
export async function uploadFineScan(file) {
  return uploadVehiclePhoto(file)
}

export async function getFineScanUrl(value) {
  return value || null
}

// --- Timbrature presenze ---------------------------------------------------

export async function getLastClocking(employeeId) {
  await delay(60)
  return (
    load()
      .clockings.filter((c) => c.employeeId === employeeId)
      .sort((a, b) => b.punchedAt.localeCompare(a.punchedAt))[0] || null
  )
}

export async function getMyClockings(employeeId, limit = 50) {
  await delay()
  return load()
    .clockings.filter((c) => c.employeeId === employeeId)
    .sort((a, b) => b.punchedAt.localeCompare(a.punchedAt))
    .slice(0, limit)
}

export async function getRecentClockings(limit = 300) {
  await delay()
  return load()
    .clockings.slice()
    .sort((a, b) => b.punchedAt.localeCompare(a.punchedAt))
    .slice(0, limit)
}

export async function getClockingsInRange(fromISO, toISO) {
  await delay()
  return load()
    .clockings.filter((c) => c.punchedAt >= fromISO && c.punchedAt < toISO)
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))
}

export async function createClocking({ employeeId, kind, lat, lng, accuracy, clientId, clientName }) {
  await delay()
  const state = load()
  const nowIso = new Date().toISOString()
  const clocking = {
    id: `clk-${Date.now()}`,
    employeeId,
    kind,
    punchedAt: nowIso,
    lat: lat ?? null,
    lng: lng ?? null,
    accuracy: accuracy ?? null,
    clientId: clientId ?? null,
    clientName: clientName ?? null,
    // Campi anti-frode: in demo tutto è locale e coerente (nessuna anomalia).
    deviceTime: nowIso,
    receivedAt: nowIso,
    offline: false,
    clockSkewSeconds: 0,
  }
  state.clockings = state.clockings || []
  state.clockings.push(clocking)
  save(state)
  return clocking
}

// Copia completa dei dati per l'export manuale (solo admin). Esclude le
// password. I nomi delle tabelle ricalcano quelli del database centrale, così
// il file di backup ha la stessa forma in entrambe le modalità.
export async function exportAllData(adminId) {
  await delay(120)
  const state = load()
  assertAdmin(state, adminId)
  return {
    profiles: (state.users || []).map(publicUser),
    overtime_requests: state.requests || [],
    time_clockings: state.clockings || [],
    vehicles: state.vehicles || [],
    vehicle_handovers: state.handovers || [],
    vehicle_issues: state.issues || [],
    clients: state.clients || [],
    rapportini: state.rapportini || [],
  }
}

export function subscribeToClockings() {
  return () => {}
}

// --- Anagrafica clienti -----------------------------------------------------

export async function listClients() {
  await delay(120)
  const state = load()
  return (state.clients || []).slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function upsertClient(client) {
  await delay()
  const state = load()
  state.clients = state.clients || []
  const next = {
    id: client.id || `cli-${Date.now()}`,
    name: client.name,
    address: client.address ?? '',
    lat: client.lat ?? null,
    lng: client.lng ?? null,
    active: client.active !== false,
  }
  const idx = state.clients.findIndex((c) => c.id === next.id)
  if (idx >= 0) state.clients[idx] = next
  else state.clients.push(next)
  save(state)
  return next
}

export async function deleteClient(clientId) {
  await delay()
  const state = load()
  state.clients = (state.clients || []).filter((c) => c.id !== clientId)
  save(state)
}

export function subscribeToClients() {
  return () => {}
}
