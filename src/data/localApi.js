// ---------------------------------------------------------------------------
// Implementazione DEMO del livello dati (fallback).
//
// Usata automaticamente quando le chiavi di Supabase non sono configurate
// (vedi ./api.js). I dati vivono nel localStorage del singolo dispositivo, NON
// sono condivisi tra telefoni diversi: serve solo per provare l'app prima di
// collegare il database centrale.
// ---------------------------------------------------------------------------

import { USERS, REQUESTS } from './seed.js'

const STORAGE_KEY = 'straordinari_state_v1'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // localStorage non disponibile o dati corrotti: si riparte dal seed.
  }
  const initial = { users: USERS, requests: REQUESTS }
  save(initial)
  return initial
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

export async function login(userId) {
  await delay()
  const user = load().users.find((u) => u.id === userId)
  if (!user) throw new Error('Utente non trovato')
  return user
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
  if (request.managerId !== managerId) {
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

// Solo per il prototipo: riporta i dati demo allo stato iniziale.
export async function resetDemoData() {
  save({ users: USERS, requests: REQUESTS })
}

// In modalità demo non esiste sincronizzazione tra dispositivi: la
// sottoscrizione "tempo reale" è un'operazione vuota che ritorna una funzione
// di pulizia, per mantenere la stessa firma della versione Supabase.
export function subscribeToRequests() {
  return () => {}
}
