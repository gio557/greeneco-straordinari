import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultPermConfig, puo, categoryOf, mergeWithDefaults, PERMISSIONS } from './permissions.js'

const cfg = defaultPermConfig()

test('amministratore può tutto (anche se la config cambiasse)', () => {
  const u = { id: 'a', role: 'admin', department: 'Amministratore' }
  assert.equal(puo(u, 'area.permessi', cfg), true)
  assert.equal(puo(u, 'profili.delete', cfg), true)
})

test('operativo: vede le proprie aree ma non gestione/permessi/board', () => {
  const u = { id: 'e', role: 'employee', department: 'Operativo' }
  assert.equal(puo(u, 'area.timbrature', cfg), true)
  assert.equal(puo(u, 'area.cassetto', cfg), true)
  assert.equal(puo(u, 'timbrature.board', cfg), false)
  assert.equal(puo(u, 'area.utenti', cfg), false)
  assert.equal(puo(u, 'area.permessi', cfg), false)
})

test('responsabile decide gli straordinari ma non gestisce utenti', () => {
  const u = { id: 'm', role: 'manager', department: 'Responsabile' }
  assert.equal(puo(u, 'straordinari.decide', cfg), true)
  assert.equal(puo(u, 'timbrature.board', cfg), true)
  assert.equal(puo(u, 'area.utenti', cfg), false)
})

test('Fase 3: scope dati — il responsabile vede solo il team, CEO/admin tutto', () => {
  const resp = { id: 'm', role: 'manager', department: 'Responsabile' }
  const ceo = { id: 'c', role: 'manager', department: 'CEO & C' }
  const amm = { id: 'a', role: 'admin', department: 'Amministratore' }
  // Il responsabile NON ha "dati.tutti" → vede solo il proprio team.
  assert.equal(puo(resp, 'dati.tutti', cfg), false)
  // CEO & C e Amministratore vedono i dati di tutti i reparti.
  assert.equal(puo(ceo, 'dati.tutti', cfg), true)
  assert.equal(puo(amm, 'dati.tutti', cfg), true)
})

test('ufficio paghe gestisce i cassetti', () => {
  const u = { id: 'p', role: 'paghe', department: 'Ufficio paghe' }
  assert.equal(puo(u, 'cassetti.manage', cfg), true)
  assert.equal(puo(u, 'area.cassetto', cfg), true)
  assert.equal(puo(u, 'straordinari.decide', cfg), false)
})

test('utente non migrato (department non-categoria) ripiega sul ruolo', () => {
  const u = { id: 'x', role: 'manager', department: 'Produzione' }
  assert.equal(categoryOf(u, cfg), 'Responsabile')
  assert.equal(puo(u, 'straordinari.decide', cfg), true)
})

test('clienti.manage: di default per Amministratore/CEO/Responsabile/Commerciale, non Operativo', () => {
  const amm = { id: 'a', role: 'admin', department: 'Amministratore' }
  const resp = { id: 'm', role: 'manager', department: 'Responsabile' }
  const comm = { id: 'c', role: 'employee', department: 'Commerciale' }
  const op = { id: 'o', role: 'employee', department: 'Operativo' }
  assert.equal(puo(amm, 'clienti.manage', cfg), true)
  assert.equal(puo(resp, 'clienti.manage', cfg), true)
  assert.equal(puo(comm, 'clienti.manage', cfg), true)
  assert.equal(puo(op, 'clienti.manage', cfg), false)
})

test('mergeWithDefaults: riempie i flag mancanti senza alterare quelli espliciti', () => {
  // Config "vecchia": Commerciale senza il flag clienti.manage, e con un flag
  // esplicitamente disattivato che NON deve essere riacceso.
  const old = {
    categories: ['Commerciale'],
    perms: { Commerciale: { 'area.timbrature': false } },
  }
  const merged = mergeWithDefaults(old)
  // ogni permesso del catalogo è presente
  for (const p of PERMISSIONS) assert.ok(p.key in merged.perms.Commerciale)
  // il flag mancante prende il default della categoria (true per Commerciale)
  assert.equal(merged.perms.Commerciale['clienti.manage'], true)
  // il flag esplicitamente false resta false
  assert.equal(merged.perms.Commerciale['area.timbrature'], false)
})

test('config assente: non blocca (anti-lockout)', () => {
  const u = { id: 'e', role: 'employee', department: 'Operativo' }
  assert.equal(puo(u, 'area.utenti', null), true)
})

test('Fase 2: disattivare un flag blocca davvero l\'azione (categoria non-admin)', () => {
  // Categoria personalizzata con la sola timbratura attiva.
  const custom = {
    categories: [...cfg.categories, 'Solo Presenze'],
    perms: { ...cfg.perms, 'Solo Presenze': { 'area.timbrature': true, 'timbrature.timbra': true } },
  }
  const u = { id: 'k', role: 'employee', department: 'Solo Presenze' }
  assert.equal(puo(u, 'timbrature.timbra', custom), true)
  // Flag non presenti → false (creazione straordinari, presa in carico, multe…).
  assert.equal(puo(u, 'straordinari.create', custom), false)
  assert.equal(puo(u, 'automezzi.handover', custom), false)
  assert.equal(puo(u, 'multe.view_own', custom), false)
  // Spegnendo esplicitamente un flag, l'azione si blocca.
  const off = { ...custom, perms: { ...custom.perms, 'Solo Presenze': { ...custom.perms['Solo Presenze'], 'timbrature.timbra': false } } }
  assert.equal(puo(u, 'timbrature.timbra', off), false)
})
