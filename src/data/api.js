// ---------------------------------------------------------------------------
// Livello dati dell'applicazione — PUNTO UNICO di accesso ai dati.
//
// Tutta l'interfaccia (UI) usa SOLO le funzioni esportate qui sotto. Questo
// modulo sceglie automaticamente l'implementazione giusta:
//
//   • se le chiavi di Supabase sono configurate  → database centrale condiviso
//     (tutti i dispositivi vedono gli stessi dati, aggiornati in tempo reale);
//   • altrimenti                                  → dati demo locali (per provare
//     l'app prima di collegare il database).
//
// Le chiavi si impostano in un file `.env` (vedi `.env.example`) e, per la
// pubblicazione su GitHub Pages, come secret del repository (vedi README).
// ---------------------------------------------------------------------------

import { supabaseConfigured } from './supabaseClient.js'
import * as local from './localApi.js'
import * as remote from './supabaseApi.js'
import { makeResilientClockings } from './clockingBuffer.js'

const impl = supabaseConfigured ? remote : local

// In modalità Supabase le timbrature passano dal livello "resiliente" (mirror
// locale a 7 giorni + coda di scrittura offline). In modalità demo i dati sono
// già tutti locali, quindi si usa direttamente l'implementazione demo.
const clk = supabaseConfigured ? makeResilientClockings(remote) : local

// 'supabase' = database centrale condiviso · 'demo' = dati locali sul telefono.
export const dataMode = supabaseConfigured ? 'supabase' : 'demo'

export const listUsers = impl.listUsers
export const login = impl.login
export const getRequestsForEmployee = impl.getRequestsForEmployee
export const getRequestsForManager = impl.getRequestsForManager
export const getAllRequests = impl.getAllRequests
export const createRequest = impl.createRequest
export const decideRequest = impl.decideRequest
export const getUserMap = impl.getUserMap
export const adminListUsers = impl.adminListUsers
export const adminUpsertUser = impl.adminUpsertUser
export const adminDeleteUser = impl.adminDeleteUser
export const exportAllData = impl.exportAllData
export const resetDemoData = impl.resetDemoData
export const subscribeToRequests = impl.subscribeToRequests

// Automezzi
export const listVehicles = impl.listVehicles
export const getVehicle = impl.getVehicle
export const getOpenIssues = impl.getOpenIssues
export const uploadVehiclePhoto = impl.uploadVehiclePhoto
// Scansione del verbale: bucket privato + URL firmati (in Supabase) / data URL (demo).
export const uploadFineScan = impl.uploadFineScan
export const getFineScanUrl = impl.getFineScanUrl
export const createHandover = impl.createHandover
export const getActiveHandover = impl.getActiveHandover
export const getOpenHandovers = impl.getOpenHandovers
export const returnVehicle = impl.returnVehicle
export const getRecentHandovers = impl.getRecentHandovers
export const getHandoverAt = impl.getHandoverAt
export const getAllIssues = impl.getAllIssues
export const resolveIssue = impl.resolveIssue
export const adminListVehicles = impl.adminListVehicles
export const adminUpsertVehicle = impl.adminUpsertVehicle
export const adminDeleteVehicle = impl.adminDeleteVehicle
export const subscribeToVehicleData = impl.subscribeToVehicleData

// Multe / Sanzioni sui mezzi
export const createFine = impl.createFine
export const getFinesForEmployee = impl.getFinesForEmployee
export const getAllFines = impl.getAllFines
export const acknowledgeFine = impl.acknowledgeFine
export const contestFine = impl.contestFine
export const cancelFine = impl.cancelFine
export const subscribeToFines = impl.subscribeToFines

// Cassetto del Dipendente: documenti personali (cedolini, sanzioni disciplinari)
export const uploadDocFile = impl.uploadDocFile
export const getDocFileUrl = impl.getDocFileUrl
export const createEmployeeDocument = impl.createEmployeeDocument
export const getEmployeeDocuments = impl.getEmployeeDocuments
export const acknowledgeDocument = impl.acknowledgeDocument
export const deleteEmployeeDocument = impl.deleteEmployeeDocument
export const subscribeToDocuments = impl.subscribeToDocuments

// Timbrature presenze (con buffer di sicurezza in modalità Supabase)
export const getLastClocking = clk.getLastClocking
export const getMyClockings = clk.getMyClockings
export const getRecentClockings = clk.getRecentClockings
export const getClockingsInRange = clk.getClockingsInRange
export const createClocking = clk.createClocking
export const subscribeToClockings = clk.subscribeToClockings
// Numero di timbrature in attesa di invio (0 in modalità demo).
export const pendingClockings = clk.pendingCount || (() => 0)
