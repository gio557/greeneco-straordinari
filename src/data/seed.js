// Dati demo iniziali del prototipo.
// Nella versione finale queste informazioni vivranno sul database Supabase.

export const USERS = [
  {
    id: 'admin',
    name: 'Amministratore',
    role: 'admin',
    department: 'Amministratore',
    email: 'admin@azienda.it',
  },
  {
    id: 'mgr-1',
    name: 'Laura Bianchi',
    role: 'manager',
    department: 'Responsabile',
    email: 'laura.bianchi@azienda.it',
  },
  {
    id: 'mgr-2',
    name: 'Marco Verdi',
    role: 'manager',
    department: 'Responsabile',
    email: 'marco.verdi@azienda.it',
  },
  {
    id: 'paghe-1',
    name: 'Ufficio Paghe',
    role: 'paghe',
    department: 'Ufficio paghe',
    email: 'paghe@azienda.it',
  },
  {
    id: 'emp-1',
    name: 'Giulia Rossi',
    role: 'employee',
    department: 'Operativo',
    managerIds: ['mgr-1', 'mgr-2'],
    email: 'giulia.rossi@azienda.it',
  },
  {
    id: 'emp-2',
    name: 'Antonio Russo',
    role: 'employee',
    department: 'Operativo',
    managerIds: ['mgr-1'],
    email: 'antonio.russo@azienda.it',
  },
  {
    id: 'emp-3',
    name: 'Sara Colombo',
    role: 'employee',
    department: 'Operativo',
    managerIds: ['mgr-2'],
    email: 'sara.colombo@azienda.it',
  },
]

// Credenziali demo (modalità locale). In modalità Supabase le password sono
// cifrate sul database; qui, essendo dati solo locali, restano in chiaro.
//   admin → admin123   ·   tutti gli altri → demo123
export const CREDENTIALS = {
  admin: 'admin123',
  'mgr-1': 'demo123',
  'mgr-2': 'demo123',
  'paghe-1': 'demo123',
  'emp-1': 'demo123',
  'emp-2': 'demo123',
  'emp-3': 'demo123',
}

// Clienti demo per la sezione "Anagrafica clienti" e il riconoscimento in
// timbratura. Le coordinate sono indicative (zona Torino).
export const CLIENTS = [
  { id: 'cli-1', name: 'Acme S.p.A.', address: 'Via Roma 1, Torino', lat: 45.0686, lng: 7.6826, active: true },
  { id: 'cli-2', name: 'Beta Costruzioni S.r.l.', address: 'Corso Francia 100, Torino', lat: 45.0772, lng: 7.6440, active: true },
  { id: 'cli-3', name: 'Gamma Logistica', address: 'Strada del Drosso 50, Torino', lat: 45.0192, lng: 7.6000, active: true },
]

// Mezzi demo per la sezione "Presa in carico automezzi".
export const VEHICLES = [
  { id: 'veh-1', name: 'Fiat Ducato', plate: 'AB123CD', department: 'Logistica', active: true },
  { id: 'veh-2', name: 'Iveco Daily', plate: 'EF456GH', department: 'Produzione', active: true },
  { id: 'veh-3', name: 'Renault Kangoo', plate: 'IJ789KL', department: 'Manutenzione', active: true },
]

const today = new Date()
const iso = (offsetDays) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export const REQUESTS = [
  {
    id: 'req-1001',
    employeeId: 'emp-1',
    date: iso(1),
    hours: 2,
    reason: 'Completamento ordine urgente cliente Alfa',
    status: 'pending',
    managerId: 'mgr-1',
    decisionNote: '',
    decidedBy: null,
    createdAt: new Date(today.getTime() - 3600_000).toISOString(),
    decidedAt: null,
  },
  {
    id: 'req-1002',
    employeeId: 'emp-2',
    date: iso(2),
    hours: 3,
    reason: 'Manutenzione straordinaria linea 2',
    status: 'pending',
    managerId: 'mgr-1',
    decisionNote: '',
    decidedBy: null,
    createdAt: new Date(today.getTime() - 7200_000).toISOString(),
    decidedAt: null,
  },
  {
    id: 'req-1003',
    employeeId: 'emp-1',
    date: iso(-3),
    hours: 1.5,
    reason: 'Inventario di fine mese',
    status: 'approved',
    managerId: 'mgr-1',
    decisionNote: 'Approvato, ricordati di timbrare.',
    decidedBy: 'mgr-1',
    createdAt: new Date(today.getTime() - 4 * 86400_000).toISOString(),
    decidedAt: new Date(today.getTime() - 3 * 86400_000).toISOString(),
  },
  {
    id: 'req-1004',
    employeeId: 'emp-3',
    date: iso(-1),
    hours: 4,
    reason: 'Carico camion serale non previsto',
    status: 'rejected',
    managerId: 'mgr-2',
    decisionNote: 'Coperto da turno notturno, non necessario.',
    decidedBy: 'mgr-2',
    createdAt: new Date(today.getTime() - 2 * 86400_000).toISOString(),
    decidedAt: new Date(today.getTime() - 86400_000).toISOString(),
  },
]
