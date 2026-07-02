import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeRapportino, buildRapportinoRecord, rapportinoLabel, groupByClient } from './rapportini.js'

test('summarizeRapportino: estrae ID, data e cliente (prima riga del luogo)', () => {
  const s = summarizeRapportino({
    id: '  MAN-2026-014 ',
    data_compilazione: '12-06-2026',
    cliente_luogo: 'Acme S.p.A. — Via Roma 1\nTorino',
    richiesto_da: 'Ufficio tecnico',
  })
  assert.equal(s.interventionId, 'MAN-2026-014')
  assert.equal(s.docDate, '12-06-2026')
  assert.equal(s.clientName, 'Acme S.p.A. — Via Roma 1')
})

test('summarizeRapportino: ripiega su fatturazione e poi su "richiesto da"', () => {
  assert.equal(
    summarizeRapportino({ cliente_fatturazione: '\n  Beta S.r.l.\nCorso Francia', richiesto_da: 'Mario' }).clientName,
    'Beta S.r.l.'
  )
  assert.equal(
    summarizeRapportino({ richiesto_da: '  Mario Rossi ' }).clientName,
    'Mario Rossi'
  )
  assert.equal(summarizeRapportino({}).clientName, '')
})

test('buildRapportinoRecord: nuovo record (senza id) porta autore e dati completi', () => {
  const rec = buildRapportinoRecord({
    fields: { id: 'A-1', descrizione: 'Sostituita pompa' },
    signatures: { resp: 'data:image/png;base64,xxx', ref: null },
    user: { id: 'emp-1', name: 'Giulia Rossi' },
  })
  assert.equal(rec.id, undefined) // nuovo inserimento
  assert.equal(rec.authorId, 'emp-1')
  assert.equal(rec.authorName, 'Giulia Rossi')
  assert.equal(rec.interventionId, 'A-1')
  assert.equal(rec.data.fields.descrizione, 'Sostituita pompa')
  assert.equal(rec.data.signatures.resp, 'data:image/png;base64,xxx')
  assert.equal(rec.data.signatures.ref, null)
  assert.equal(rec.status, 'archived') // default
})

test('buildRapportinoRecord: status esplicito (bozza) viene mantenuto', () => {
  const rec = buildRapportinoRecord({ fields: { id: 'B-1' }, user: { id: 'e', name: 'E' }, status: 'draft' })
  assert.equal(rec.status, 'draft')
})

test('buildRapportinoRecord: cliente selezionato → clientId e clientName dall\'anagrafica', () => {
  const rec = buildRapportinoRecord({
    fields: { id: 'A-9', cliente_luogo: 'testo diverso' },
    user: { id: 'e', name: 'E' },
    client: { id: 'cli-7', name: 'Acme S.p.A.' },
  })
  assert.equal(rec.clientId, 'cli-7')
  assert.equal(rec.clientName, 'Acme S.p.A.') // vince l'anagrafica sul testo
})

test('groupByClient: raggruppa per clientId, "Senza cliente" in fondo', () => {
  const groups = groupByClient([
    { id: 'r1', clientId: 'c1', clientName: 'Beta' },
    { id: 'r2', clientId: 'c1', clientName: 'Beta' },
    { id: 'r3', clientId: null, clientName: '' },
    { id: 'r4', clientId: 'c2', clientName: 'Acme' },
  ])
  assert.equal(groups.length, 3)
  assert.equal(groups[0].label, 'Acme')            // ordine alfabetico
  assert.equal(groups[1].label, 'Beta')
  assert.equal(groups[1].items.length, 2)          // due rapportini per Beta
  assert.equal(groups[2].label, 'Senza cliente')   // in fondo
})

test('buildRapportinoRecord: con existing → aggiornamento (mantiene id)', () => {
  const rec = buildRapportinoRecord({
    fields: { id: 'A-2' },
    user: { id: 'emp-2', name: 'Antonio' },
    existing: { id: 'rap-123' },
  })
  assert.equal(rec.id, 'rap-123')
})

test('rapportinoLabel: usa ID, poi cliente, poi fallback', () => {
  assert.equal(rapportinoLabel({ interventionId: 'MAN-9', clientName: 'Acme' }), 'MAN-9')
  assert.equal(rapportinoLabel({ interventionId: '  ', clientName: 'Acme' }), 'Acme')
  assert.equal(rapportinoLabel({ interventionId: '', clientName: '' }), 'Rapportino senza ID')
})
