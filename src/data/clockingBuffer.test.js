// Test del livello "resiliente" delle timbrature (mirror locale + outbox).
// Eseguiti in CI e con `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dedupeSortDesc,
  pruneOld,
  mergeRemoteWithPending,
  makeResilientClockings,
  WEEK_MS,
} from './clockingBuffer.js'

// --- Logica pura -----------------------------------------------------------

test('dedupeSortDesc: rimuove i duplicati per id e ordina dal più recente', () => {
  const out = dedupeSortDesc([
    { id: 'a', punchedAt: '2026-06-01T08:00:00Z' },
    { id: 'b', punchedAt: '2026-06-03T08:00:00Z' },
    { id: 'a', punchedAt: '2026-06-01T08:00:00Z' },
  ])
  assert.deepEqual(out.map((c) => c.id), ['b', 'a'])
})

test('pruneOld: scarta le timbrature oltre la finestra di 7 giorni', () => {
  const now = Date.parse('2026-06-25T12:00:00Z')
  const list = [
    { id: 'recente', punchedAt: new Date(now - 2 * 24 * 3600 * 1000).toISOString() },
    { id: 'vecchia', punchedAt: new Date(now - 10 * 24 * 3600 * 1000).toISOString() },
  ]
  const kept = pruneOld(list, now, WEEK_MS).map((c) => c.id)
  assert.deepEqual(kept, ['recente'])
})

test('mergeRemoteWithPending: aggiunge solo le pending non già presenti nel database', () => {
  const remoteList = [{ id: 'r1', employeeId: 'emp-1', punchedAt: '2026-06-25T09:00:00Z' }]
  const outbox = [
    { id: 'r1', employeeId: 'emp-1', punchedAt: '2026-06-25T09:00:00Z' }, // già nel db
    { id: 'p1', employeeId: 'emp-1', punchedAt: '2026-06-25T10:00:00Z' }, // davvero in attesa
    { id: 'x1', employeeId: 'emp-2', punchedAt: '2026-06-25T10:00:00Z' }, // altro dipendente
  ]
  const out = mergeRemoteWithPending(remoteList, outbox, 'emp-1')
  assert.deepEqual(out.map((c) => c.id), ['p1', 'r1'])
  assert.equal(out.find((c) => c.id === 'p1').pending, true)
})

// --- Supporti per i test del flusso ----------------------------------------

function memStorage() {
  const m = new Map()
  return {
    read: (k) => JSON.parse(m.get(k) || '[]'),
    write: (k, arr) => m.set(k, JSON.stringify(arr)),
  }
}

function mockRemote() {
  const db = []
  const state = { online: true }
  const norm = (i) => ({
    id: i.id,
    employeeId: i.employeeId,
    kind: i.kind,
    punchedAt: i.punchedAt,
    lat: i.lat ?? null,
    lng: i.lng ?? null,
    accuracy: i.accuracy ?? null,
  })
  const byDateDesc = (a, b) => String(b.punchedAt).localeCompare(String(a.punchedAt))
  return {
    db,
    state,
    async createClocking(item) {
      if (!state.online) throw new Error('offline')
      const existing = db.find((c) => c.id === item.id)
      if (existing) return { ...existing } // upsert idempotente
      const row = norm(item)
      db.push(row)
      return { ...row }
    },
    async getLastClocking(empId) {
      if (!state.online) throw new Error('offline')
      return db.filter((c) => c.employeeId === empId).sort(byDateDesc)[0] || null
    },
    async getMyClockings(empId, limit = 50) {
      if (!state.online) throw new Error('offline')
      return db.filter((c) => c.employeeId === empId).sort(byDateDesc).slice(0, limit)
    },
    async getRecentClockings(limit = 300) {
      if (!state.online) throw new Error('offline')
      return [...db].sort(byDateDesc).slice(0, limit)
    },
    async getClockingsInRange(f, t) {
      if (!state.online) throw new Error('offline')
      return db.filter((c) => c.punchedAt >= f && c.punchedAt < t)
    },
    subscribeToClockings: () => () => {},
  }
}

function makeBuf(remote) {
  let n = 0
  let clock = Date.parse('2026-06-25T08:00:00Z')
  const buf = makeResilientClockings(remote, {
    storage: memStorage(),
    autoFlush: false,
    genId: () => `id-${++n}`,
    now: () => clock,
  })
  buf._advance = (ms) => {
    clock += ms
  }
  return buf
}

// --- Flusso online / offline -----------------------------------------------

test('online: la timbratura va nel database e non resta in coda', async () => {
  const remote = mockRemote()
  const buf = makeBuf(remote)
  const r = await buf.createClocking({ employeeId: 'emp-1', kind: 'work' })
  assert.equal(r.pending, undefined)
  assert.equal(remote.db.length, 1)
  assert.equal(buf.pendingCount(), 0)
})

test('offline: la timbratura viene bufferizzata, confermata e visibile come pending', async () => {
  const remote = mockRemote()
  const buf = makeBuf(remote)
  remote.state.online = false

  const r = await buf.createClocking({ employeeId: 'emp-1', kind: 'travel' })
  assert.equal(r.pending, true)
  assert.equal(remote.db.length, 0) // nulla nel database
  assert.equal(buf.pendingCount(), 1)

  // Offline lo stato corrente si ricava comunque dal buffer locale.
  const last = await buf.getLastClocking('emp-1')
  assert.equal(last.kind, 'travel')
  assert.equal(last.pending, true)
})

test('ritorno online: flushOutbox invia le pending e svuota la coda (senza duplicati)', async () => {
  const remote = mockRemote()
  const buf = makeBuf(remote)

  remote.state.online = false
  await buf.createClocking({ employeeId: 'emp-1', kind: 'travel' })
  buf._advance(60_000)
  await buf.createClocking({ employeeId: 'emp-1', kind: 'work' })
  assert.equal(buf.pendingCount(), 2)

  remote.state.online = true
  await buf.flushOutbox()
  assert.equal(buf.pendingCount(), 0)
  assert.equal(remote.db.length, 2)

  // Un secondo flush non invia nulla e non duplica.
  await buf.flushOutbox()
  assert.equal(remote.db.length, 2)
})

test('lettura online: unisce le pending non ancora sincronizzate', async () => {
  const remote = mockRemote()
  const buf = makeBuf(remote)

  // Una timbratura "vecchia" già a database.
  await buf.createClocking({ employeeId: 'emp-1', kind: 'work' })

  // Una timbratura creata offline e non ancora inviata.
  remote.state.online = false
  buf._advance(3600_000)
  await buf.createClocking({ employeeId: 'emp-1', kind: 'travel' })

  // Torna la connessione per la lettura, ma la pending è ancora in coda.
  remote.state.online = true
  const list = await buf.getMyClockings('emp-1', 50)
  // getMyClockings online tenta anche un flush: la pending viene inviata...
  assert.equal(list.length, 2)
  assert.ok(list.some((c) => c.kind === 'travel'))
  assert.ok(list.some((c) => c.kind === 'work'))
})

test('cartellino offline: getClockingsInRange ricade sul mirror locale', async () => {
  const remote = mockRemote()
  const buf = makeBuf(remote)
  await buf.createClocking({ employeeId: 'emp-1', kind: 'work' }) // entra nel mirror

  remote.state.online = false
  const rows = await buf.getClockingsInRange('2026-06-25T00:00:00Z', '2026-06-26T00:00:00Z')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'work')
})
