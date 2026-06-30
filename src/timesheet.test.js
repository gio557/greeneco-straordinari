// Test automatici della logica del cartellino (modello "dichiara attività").
// Eseguiti in CI e con `npm test` (TZ Europe/Rome impostato dallo script).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmployeeTimesheet,
  normalizeKind,
  hoursToHM,
  hoursDecimal,
  timesheetToCsv,
  combinedTimesheetToCsv,
  buildClientSummary,
} from './timesheet.js'

const C = (iso, kind) => ({ employeeId: 'emp-1', kind, punchedAt: new Date(iso).toISOString() })
const day = (rows, d) => rows.find((x) => x.date === d)

test('clienti del giorno: nomi distinti dalle timbrature di lavoro', () => {
  const clk = [
    { ...C('2026-06-02T08:00:00+02:00', 'work'), clientLabel: 'Acme' },
    { ...C('2026-06-02T12:00:00+02:00', 'travel') }, // il viaggio non porta cliente
    { ...C('2026-06-02T13:00:00+02:00', 'work'), clientName: 'Beta' },
    { ...C('2026-06-02T16:00:00+02:00', 'work'), clientLabel: 'Acme' }, // duplicato → una volta
    { ...C('2026-06-02T18:00:00+02:00', 'end') },
  ]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  assert.deepEqual(day(rows, '2026-06-02').clients, ['Acme', 'Beta'])
  // un giorno senza lavoro non ha clienti
  assert.deepEqual(day(rows, '2026-06-10').clients, [])
})

test('buildClientSummary: ore di lavoro per cliente, ordinate per ore', () => {
  const W = (emp, iso, kind, extra = {}) => ({ employeeId: emp, kind, punchedAt: new Date(iso).toISOString(), ...extra })
  const clk = [
    // emp-1: 4h Acme + 2h Beta
    W('emp-1', '2026-06-02T08:00:00+02:00', 'work', { clientId: 'cli-1' }),
    W('emp-1', '2026-06-02T12:00:00+02:00', 'work', { clientId: 'cli-2' }),
    W('emp-1', '2026-06-02T14:00:00+02:00', 'end'),
    // emp-2: 3h Acme (testo libero con stesso id no → diverso)
    W('emp-2', '2026-06-03T09:00:00+02:00', 'work', { clientId: 'cli-1' }),
    W('emp-2', '2026-06-03T12:00:00+02:00', 'end'),
    // viaggio senza cliente: ignorato
    W('emp-2', '2026-06-03T08:00:00+02:00', 'travel'),
  ]
  const label = (c) => ({ 'cli-1': 'Acme', 'cli-2': 'Beta' }[c.clientId] || c.clientName)
  const sum = buildClientSummary(clk, label)
  assert.equal(sum[0].label, 'Acme') // 4+3 = 7h, primo
  assert.equal(hoursToHM(sum[0].hours), '7:00')
  assert.equal(sum[0].sessions, 2)
  assert.equal(sum[0].days, 2)
  assert.deepEqual(sum[0].employees.sort(), ['emp-1', 'emp-2'])
  const beta = sum.find((r) => r.label === 'Beta')
  assert.equal(hoursToHM(beta.hours), '2:00')
})

test('CSV: la colonna Cliente compare solo con includeClient', () => {
  const clk = [
    { ...C('2026-06-02T08:00:00+02:00', 'work'), clientLabel: 'Acme' },
    { ...C('2026-06-02T17:00:00+02:00', 'end') },
  ]
  const ts = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const meta = { employeeName: 'Tizio', monthLabel: 'giugno 2026', thresholdHours: 8 }
  const senza = timesheetToCsv(ts, meta)
  const con = timesheetToCsv(ts, { ...meta, includeClient: true })
  assert.ok(!senza.includes('Cliente'))
  assert.ok(con.includes('Cliente'))
  assert.ok(con.includes('Acme'))
})

test('viaggio-lavoro-viaggio: ore separate, nessuno straordinario', () => {
  const clk = [
    C('2026-06-02T08:00:00+02:00', 'travel'),
    C('2026-06-02T09:30:00+02:00', 'work'),
    C('2026-06-02T17:00:00+02:00', 'travel'),
    C('2026-06-02T18:30:00+02:00', 'end'),
  ]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const r = day(rows, '2026-06-02')
  assert.equal(hoursToHM(r.workHours), '7:30')
  assert.equal(hoursToHM(r.travelHours), '3:00')
  assert.equal(hoursToHM(r.overtimeHours), '0:00')
  assert.equal(hoursToHM(r.paidHours), '10:30')
  assert.equal(r.start, '08:00')
  assert.equal(r.end, '18:30')
})

test('lo straordinario si calcola SOLO sul lavoro, non sul viaggio', () => {
  const clk = [
    C('2026-06-03T08:00:00+02:00', 'travel'), // 1:00 viaggio
    C('2026-06-03T09:00:00+02:00', 'work'), // 10:00 lavoro
    C('2026-06-03T19:00:00+02:00', 'end'),
  ]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const r = day(rows, '2026-06-03')
  assert.equal(hoursToHM(r.workHours), '10:00')
  assert.equal(hoursToHM(r.overtimeHours), '2:00') // 10 - 8, solo lavoro
  assert.equal(hoursToHM(r.travelHours), '1:00')
  assert.equal(hoursToHM(r.paidHours), '11:00')
})

test('pausa pranzo: non conteggiata, lavoro spezzato sommato', () => {
  const clk = [
    C('2026-06-04T09:00:00+02:00', 'work'), // 4:00
    C('2026-06-04T13:00:00+02:00', 'break'), // 1:00 pausa
    C('2026-06-04T14:00:00+02:00', 'work'), // 4:00
    C('2026-06-04T18:00:00+02:00', 'end'),
  ]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const r = day(rows, '2026-06-04')
  assert.equal(hoursToHM(r.workHours), '8:00')
  assert.equal(hoursToHM(r.breakHours), '1:00')
  assert.equal(hoursToHM(r.overtimeHours), '0:00')
  assert.equal(hoursToHM(r.paidHours), '8:00') // pausa esclusa
})

test('più clienti nello stesso giorno: viaggi e lavori sommati per tipo', () => {
  const clk = [
    C('2026-06-05T08:00:00+02:00', 'travel'), // 1:00
    C('2026-06-05T09:00:00+02:00', 'work'), // 3:00
    C('2026-06-05T12:00:00+02:00', 'travel'), // 0:30
    C('2026-06-05T12:30:00+02:00', 'work'), // 3:30
    C('2026-06-05T16:00:00+02:00', 'travel'), // 1:00
    C('2026-06-05T17:00:00+02:00', 'end'),
  ]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const r = day(rows, '2026-06-05')
  assert.equal(hoursToHM(r.travelHours), '2:30')
  assert.equal(hoursToHM(r.workHours), '6:30')
})

test('compatibilità storica: in→lavoro, out→fine', () => {
  assert.equal(normalizeKind('in'), 'work')
  assert.equal(normalizeKind('out'), 'end')
  const clk = [C('2026-06-06T08:00:00+02:00', 'in'), C('2026-06-06T17:00:00+02:00', 'out')]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const r = day(rows, '2026-06-06')
  assert.equal(hoursToHM(r.workHours), '9:00')
  assert.equal(hoursToHM(r.overtimeHours), '1:00')
})

test('giornata non chiusa a cavallo della mezzanotte: nota di anomalia', () => {
  const clk = [C('2026-06-07T23:00:00+02:00', 'work'), C('2026-06-08T01:00:00+02:00', 'end')]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  assert.ok(day(rows, '2026-06-07').notes.includes('manca Fine giornata'))
  assert.equal(hoursToHM(day(rows, '2026-06-07').workHours), '1:00')
  assert.equal(hoursToHM(day(rows, '2026-06-08').workHours), '1:00')
})

test('attività ancora aperta: nota "in servizio", 0 ore', () => {
  const clk = [C('2026-06-10T09:00:00+02:00', 'work')]
  const { rows } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const r = day(rows, '2026-06-10')
  assert.equal(hoursToHM(r.workHours), '0:00')
  assert.ok(r.notes.includes('in servizio'))
})

test('totali mensili e numero righe', () => {
  const clk = [
    C('2026-06-02T08:00:00+02:00', 'travel'),
    C('2026-06-02T09:00:00+02:00', 'work'),
    C('2026-06-02T18:00:00+02:00', 'end'),
  ]
  const { rows, totals } = buildEmployeeTimesheet(clk, 2026, 5, 8)
  assert.equal(rows.length, 30)
  assert.equal(hoursToHM(totals.work), '9:00')
  assert.equal(hoursToHM(totals.overtime), '1:00')
  assert.equal(hoursToHM(totals.travel), '1:00')
  assert.equal(hoursToHM(totals.paid), '10:00')
})

test('formattazione: HH:MM e decimale con virgola', () => {
  assert.equal(hoursToHM(1.5), '1:30')
  assert.equal(hoursToHM(0), '0:00')
  assert.equal(hoursDecimal(1.5), '1,50')
  assert.equal(hoursDecimal(0), '0,00')
})

test('CSV singolo: nuove colonne e totali', () => {
  const clk = [
    C('2026-06-02T08:00:00+02:00', 'travel'),
    C('2026-06-02T09:00:00+02:00', 'work'),
    C('2026-06-02T18:00:00+02:00', 'end'),
  ]
  const ts = buildEmployeeTimesheet(clk, 2026, 5, 8)
  const csv = timesheetToCsv(ts, { employeeName: 'Giulia Rossi', monthLabel: 'Giugno 2026', thresholdHours: 8 })
  assert.ok(csv.includes('Ore viaggio'))
  assert.ok(csv.includes('di cui straordinarie'))
  assert.ok(csv.includes('Totale retribuito'))
  assert.ok(csv.includes('Giulia Rossi'))
  assert.ok(csv.includes('2026-06-02'))
})

test('CSV combinato: colonna dipendente e totale generale', () => {
  const clk = [C('2026-06-02T08:00:00+02:00', 'work'), C('2026-06-02T18:00:00+02:00', 'end')]
  const perEmployee = [
    { name: 'Giulia Rossi', timesheet: buildEmployeeTimesheet(clk, 2026, 5, 8) },
    { name: 'Antonio Russo', timesheet: buildEmployeeTimesheet([], 2026, 5, 8) },
  ]
  const csv = combinedTimesheetToCsv(perEmployee, { monthLabel: 'Giugno 2026', thresholdHours: 8 })
  assert.ok(csv.includes('Antonio Russo'))
  assert.ok(csv.includes('TOTALE GENERALE'))
})
