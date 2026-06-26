// Test del filtro privacy del Cassetto del Dipendente: un documento NON deve mai
// comparire per un dipendente diverso dal proprietario.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterDocuments } from './documents.js'

const docs = [
  { id: 'd1', employeeId: 'emp-1', kind: 'cedolino', docDate: '2026-05-31' },
  { id: 'd2', employeeId: 'emp-1', kind: 'disciplinare', docDate: '2026-04-10' },
  { id: 'd3', employeeId: 'emp-2', kind: 'cedolino', docDate: '2026-05-31' },
  { id: 'd4', employeeId: 'emp-2', kind: 'disciplinare', docDate: '2026-03-01' },
]

test('un dipendente vede SOLO i propri documenti', () => {
  const e1 = filterDocuments(docs, 'emp-1').map((d) => d.id)
  assert.deepEqual(e1.sort(), ['d1', 'd2'])
  const e2 = filterDocuments(docs, 'emp-2').map((d) => d.id)
  assert.deepEqual(e2.sort(), ['d3', 'd4'])
  // Nessuna sovrapposizione tra i due cassetti.
  assert.equal(e1.some((id) => e2.includes(id)), false)
})

test('filtro per tipo resta dentro il dipendente', () => {
  assert.deepEqual(filterDocuments(docs, 'emp-1', 'cedolino').map((d) => d.id), ['d1'])
  assert.deepEqual(filterDocuments(docs, 'emp-1', 'disciplinare').map((d) => d.id), ['d2'])
})

test('employeeId mancante → nessun documento (mai "tutti")', () => {
  assert.deepEqual(filterDocuments(docs, ''), [])
  assert.deepEqual(filterDocuments(docs, null), [])
  assert.deepEqual(filterDocuments(docs, undefined), [])
})

test('ordinamento per data del documento (più recente prima)', () => {
  const ordered = filterDocuments(docs, 'emp-2').map((d) => d.docDate)
  assert.deepEqual(ordered, ['2026-05-31', '2026-03-01'])
})
