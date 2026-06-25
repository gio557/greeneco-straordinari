// Test dei controlli anti-frode (Livello 1) su una timbratura.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockingChecks, isToVerify, offlineDelaySeconds, SKEW_LIMIT_S } from './clockingFlags.js'

const base = {
  id: 'c1',
  employeeId: 'emp-1',
  kind: 'work',
  punchedAt: '2026-06-25T08:00:00Z',
  receivedAt: '2026-06-25T08:00:00Z',
  lat: 45.07,
  lng: 7.68,
  offline: false,
  clockSkewSeconds: 0,
}

test('timbratura regolare: nessun controllo, non da verificare', () => {
  assert.deepEqual(clockingChecks(base), [])
  assert.equal(isToVerify(base), false)
})

test('senza posizione: warn → da verificare', () => {
  const c = { ...base, lat: null, lng: null }
  const codes = clockingChecks(c).map((x) => x.code)
  assert.deepEqual(codes, ['no-gps'])
  assert.equal(isToVerify(c), true)
})

test('orologio sfasato oltre la soglia: warn → da verificare', () => {
  const c = { ...base, clockSkewSeconds: SKEW_LIMIT_S + 60 }
  const skew = clockingChecks(c).find((x) => x.code === 'skew')
  assert.ok(skew)
  assert.equal(skew.level, 'warn')
  assert.equal(isToVerify(c), true)
})

test('scarto entro soglia: nessuna segnalazione', () => {
  const c = { ...base, clockSkewSeconds: 120 }
  assert.equal(clockingChecks(c).length, 0)
  assert.equal(isToVerify(c), false)
})

test('offline: info (non da verificare di per sé) con ritardo calcolato', () => {
  const c = {
    ...base,
    offline: true,
    punchedAt: '2026-06-25T08:00:00Z',
    receivedAt: '2026-06-25T14:00:00Z', // sincronizzata 6h dopo
  }
  const off = clockingChecks(c).find((x) => x.code === 'offline')
  assert.ok(off)
  assert.equal(off.level, 'info')
  assert.match(off.label, /ritardo 6 h/)
  assert.equal(isToVerify(c), false) // offline da solo non è "da verificare"
  assert.equal(offlineDelaySeconds(c), 6 * 3600)
})

test('combinazione: offline + senza posizione → da verificare', () => {
  const c = { ...base, offline: true, lat: null, lng: null }
  assert.equal(isToVerify(c), true)
  assert.equal(clockingChecks(c).length, 2)
})
