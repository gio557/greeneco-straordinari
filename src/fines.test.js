// Test dell'attribuzione automatica della multa dal passaggio di consegna.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestDriver } from './fines.js'

const H = (id, vehicleId, employeeId, takenAt, returnedAt = null) => ({
  id, vehicleId, employeeId, takenAt, returnedAt,
})

test('attribuisce al dipendente che aveva il mezzo alla data dell’infrazione', () => {
  const handovers = [
    H('h1', 'veh-1', 'emp-1', '2026-06-01T08:00:00Z', '2026-06-05T18:00:00Z'),
    H('h2', 'veh-1', 'emp-2', '2026-06-06T08:00:00Z', '2026-06-10T18:00:00Z'),
  ]
  assert.equal(suggestDriver(handovers, 'veh-1', '2026-06-03T10:00:00Z'), 'emp-1')
  assert.equal(suggestDriver(handovers, 'veh-1', '2026-06-08T10:00:00Z'), 'emp-2')
})

test('handover ancora aperto (returnedAt null) copre l’infrazione successiva', () => {
  const handovers = [H('h3', 'veh-2', 'emp-3', '2026-06-01T08:00:00Z', null)]
  assert.equal(suggestDriver(handovers, 'veh-2', '2026-06-20T10:00:00Z'), 'emp-3')
})

test('nessun passaggio di consegna corrispondente → stringa vuota', () => {
  const handovers = [H('h4', 'veh-3', 'emp-1', '2026-06-10T08:00:00Z', '2026-06-11T08:00:00Z')]
  assert.equal(suggestDriver(handovers, 'veh-3', '2026-06-01T10:00:00Z'), '') // prima del periodo
  assert.equal(suggestDriver(handovers, 'veh-9', '2026-06-10T10:00:00Z'), '') // altro mezzo
  assert.equal(suggestDriver([], 'veh-3', '2026-06-10T10:00:00Z'), '')
})

test('input incompleti → stringa vuota', () => {
  assert.equal(suggestDriver([], '', '2026-06-10T10:00:00Z'), '')
  assert.equal(suggestDriver([], 'veh-1', ''), '')
})
