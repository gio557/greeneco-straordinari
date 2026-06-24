// ---------------------------------------------------------------------------
// Implementazione DEMO del livello dati (fallback).
//
// Usata automaticamente quando le chiavi di Supabase non sono configurate
// (vedi ./api.js). I dati vivono nel localStorage del singolo dispositivo, NON
// sono condivisi tra telefoni diversi: serve solo per provare l'app prima di
// collegare il database centrale.
// ---------------------------------------------------------------------------

import { USERS, REQUESTS, CREDENTIALS, VEHICLES } from './seed.js'

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
    handovers: [],
    issues: [],
    clockings: [],
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
  return load()
    .requests.filter((r) => r.managerId === managerId)
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
  const employee = state.users.find((u) => u.id === employeeId)
  if (!employee) throw new Error('Dipendente non trovato')

  const request = {
    id: `req-${Date.now()}`,
    employeeId,
    date,
    hours: Number(hours),
    reason: reason.trim(),
    status: 'pending',
    managerId: employee.managerId,
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
  if (request.managerId !== managerId && actor?.role !== 'admin') {
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

  const next = {
    id,
    name,
    role: user.role,
    department: user.department || undefined,
    managerId: user.managerId || undefined,
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
    (r) => r.employeeId === userId || r.managerId === userId || r.decidedBy === userId
  )
  if (linked) throw new Error('Impossibile eliminare: l\'utente ha richieste collegate')
  state.users = state.users.filter((u) => u.id !== userId)
  if (state.passwords) delete state.passwords[userId]
  save(state)
}

// Solo per il prototipo: riporta i dati demo allo stato iniziale.
export async function resetDemoData() {
  save({
    users: USERS,
    requests: REQUESTS,
    passwords: { ...CREDENTIALS },
    vehicles: VEHICLES,
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

export async function createClocking({ employeeId, kind, lat, lng, accuracy }) {
  await delay()
  const state = load()
  const clocking = {
    id: `clk-${Date.now()}`,
    employeeId,
    kind,
    punchedAt: new Date().toISOString(),
    lat: lat ?? null,
    lng: lng ?? null,
    accuracy: accuracy ?? null,
  }
  state.clockings = state.clockings || []
  state.clockings.push(clocking)
  save(state)
  return clocking
}

export function subscribeToClockings() {
  return () => {}
}
