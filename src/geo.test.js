import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanceMeters, nearestClients, formatDistance } from './geo.js'

test('distanceMeters: ~0 per lo stesso punto', () => {
  assert.equal(Math.round(distanceMeters(45.07, 7.69, 45.07, 7.69)), 0)
})

test('distanceMeters: ~157 m per ~0.001° di latitudine', () => {
  const d = distanceMeters(45.0, 7.0, 45.001, 7.0)
  assert.ok(d > 100 && d < 130, `distanza inattesa: ${d}`) // ~111 m
})

test('distanceMeters: coordinate mancanti → Infinity', () => {
  assert.equal(distanceMeters(45, 7, null, 7), Infinity)
})

test('nearestClients: filtra per raggio e ordina per distanza', () => {
  const clients = [
    { id: 'a', name: 'Vicino', lat: 45.0005, lng: 7.0, active: true },   // ~55 m
    { id: 'b', name: 'Lontano', lat: 45.02, lng: 7.0, active: true },    // ~2 km
    { id: 'c', name: 'Medio', lat: 45.0015, lng: 7.0, active: true },    // ~167 m
    { id: 'd', name: 'Senza coord', lat: null, lng: null, active: true },
    { id: 'e', name: 'Inattivo', lat: 45.0005, lng: 7.0, active: false },
  ]
  const near = nearestClients(clients, 45.0, 7.0, 250)
  assert.deepEqual(near.map((c) => c.id), ['a', 'c'])
  assert.ok(near[0].distanceM <= near[1].distanceM)
})

test('nearestClients: senza posizione → vuoto', () => {
  assert.deepEqual(nearestClients([{ id: 'a', lat: 45, lng: 7 }], null, null), [])
})

test('formatDistance: metri e chilometri', () => {
  assert.equal(formatDistance(120), '120 m')
  assert.equal(formatDistance(1300), '1,3 km')
})
