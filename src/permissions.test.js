import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultPermConfig, puo, categoryOf } from './permissions.js'

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

test('config assente: non blocca (anti-lockout)', () => {
  const u = { id: 'e', role: 'employee', department: 'Operativo' }
  assert.equal(puo(u, 'area.utenti', null), true)
})
