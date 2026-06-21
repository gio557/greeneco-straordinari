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

const impl = supabaseConfigured ? remote : local

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
export const resetDemoData = impl.resetDemoData
export const subscribeToRequests = impl.subscribeToRequests

// Automezzi
export const listVehicles = impl.listVehicles
export const getVehicle = impl.getVehicle
export const getOpenIssues = impl.getOpenIssues
export const uploadVehiclePhoto = impl.uploadVehiclePhoto
export const createHandover = impl.createHandover
export const getActiveHandover = impl.getActiveHandover
export const getOpenHandovers = impl.getOpenHandovers
export const returnVehicle = impl.returnVehicle
export const getRecentHandovers = impl.getRecentHandovers
export const getAllIssues = impl.getAllIssues
export const resolveIssue = impl.resolveIssue
export const adminListVehicles = impl.adminListVehicles
export const adminUpsertVehicle = impl.adminUpsertVehicle
export const adminDeleteVehicle = impl.adminDeleteVehicle
export const subscribeToVehicleData = impl.subscribeToVehicleData
