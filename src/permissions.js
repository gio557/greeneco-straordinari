// Sistema di permessi per CATEGORIA. Le categorie ("reparti") sono l'UNICA
// autorità su "cosa si vede e cosa si può fare": ogni categoria porta una serie
// di flag granulari e un livello centrale `puo()` decide ogni accesso e ogni
// azione di modifica. Il vecchio "ruolo" non governa più i permessi: resta solo
// come struttura organizzativa (relazione manager↔dipendente) e come ripiego
// anti-blocco per gli utenti non ancora associati a una categoria.

export const DEFAULT_CATEGORIES = [
  'Amministratore', 'CEO & C', 'Responsabile', 'Ufficio paghe',
  'Ufficio Tecnico', 'Operativo', 'Commerciale',
]

// Catalogo dei permessi (granulare), raggruppato per area.
export const PERMISSIONS = [
  { group: 'Presenze', key: 'area.timbrature', label: "Vedere l'area Presenze" },
  { group: 'Presenze', key: 'timbrature.timbra', label: 'Timbrare le proprie presenze' },
  { group: 'Presenze', key: 'timbrature.board', label: 'Vedere il tabellone di tutti' },
  { group: 'Presenze', key: 'timbrature.export', label: 'Esportare il CSV presenze' },
  { group: 'Straordinari', key: 'area.straordinari', label: "Vedere l'area Straordinari" },
  { group: 'Straordinari', key: 'straordinari.create', label: 'Creare richieste proprie' },
  { group: 'Straordinari', key: 'straordinari.board', label: 'Vedere le richieste del team' },
  { group: 'Straordinari', key: 'straordinari.decide', label: 'Approvare/respingere le richieste' },
  { group: 'Automezzi', key: 'area.automezzi', label: "Vedere l'area Automezzi" },
  { group: 'Automezzi', key: 'automezzi.handover', label: 'Prendere in carico i mezzi' },
  { group: 'Automezzi', key: 'automezzi.board', label: 'Vedere stato e storico mezzi' },
  { group: 'Automezzi', key: 'automezzi.anagrafica', label: "Gestire l'anagrafica mezzi" },
  { group: 'Multe', key: 'multe.view_own', label: 'Vedere le proprie multe' },
  { group: 'Multe', key: 'multe.manage', label: 'Registrare e gestire le multe' },
  { group: 'Multe', key: 'multe.cancel', label: 'Annullare le multe' },
  { group: 'Cassetto', key: 'area.cassetto', label: 'Avere il proprio Cassetto' },
  { group: 'Cassetto', key: 'cassetti.manage', label: 'Gestire i cassetti dei dipendenti' },
  { group: 'Profili', key: 'area.utenti', label: 'Vedere la gestione utenti' },
  { group: 'Profili', key: 'profili.create', label: 'Creare/modificare profili' },
  { group: 'Profili', key: 'profili.delete', label: 'Eliminare profili' },
  { group: 'Profili', key: 'profili.category', label: "Cambiare la categoria di un utente" },
  { group: 'Clienti', key: 'clienti.manage', label: "Gestire l'anagrafica clienti (inserire/modificare)" },
  { group: 'Visibilità dati', key: 'dati.tutti', label: 'Vedere i dati di tutti i reparti (non solo il proprio team)' },
  { group: 'Categorie & Permessi', key: 'area.permessi', label: 'Vedere Categorie & Permessi' },
  { group: 'Categorie & Permessi', key: 'permessi.edit', label: 'Modificare i flag / creare categorie' },
  { group: 'Backup', key: 'backup.export', label: 'Esportare il backup completo' },
]

const ALL_KEYS = PERMISSIONS.map((p) => p.key)
const EMPLOYEE_LIKE = [
  'area.timbrature', 'timbrature.timbra',
  'area.straordinari', 'straordinari.create',
  'area.automezzi', 'automezzi.handover',
  'area.cassetto', 'multe.view_own',
]

function permsFrom(keys) {
  const o = {}
  for (const k of ALL_KEYS) o[k] = keys === 'all' ? true : keys.includes(k)
  return o
}

// Configurazione di default: riproduce il comportamento attuale dei ruoli.
export function defaultPermConfig() {
  return {
    categories: [...DEFAULT_CATEGORIES],
    perms: {
      'Amministratore': permsFrom('all'),
      'CEO & C': permsFrom('all'),
      'Responsabile': permsFrom([
        'area.timbrature', 'timbrature.timbra', 'timbrature.board', 'timbrature.export',
        'area.straordinari', 'straordinari.create', 'straordinari.board', 'straordinari.decide',
        'area.automezzi', 'automezzi.handover', 'automezzi.board',
        'multe.view_own', 'multe.manage', 'multe.cancel',
        'clienti.manage',
      ]),
      'Ufficio paghe': permsFrom([...EMPLOYEE_LIKE, 'cassetti.manage']),
      'Ufficio Tecnico': permsFrom(EMPLOYEE_LIKE),
      'Operativo': permsFrom(EMPLOYEE_LIKE),
      'Commerciale': permsFrom([...EMPLOYEE_LIKE, 'clienti.manage']),
    },
  }
}

// Completa una configurazione salvata con i flag eventualmente mancanti (es.
// permessi introdotti dopo il salvataggio): i flag assenti prendono il valore
// di default della categoria (o false per le categorie personalizzate). I flag
// impostati esplicitamente — anche a false — restano invariati. Così l'aggiunta
// di un nuovo permesso non lo "spegne" silenziosamente per tutti.
export function mergeWithDefaults(config) {
  if (!config || !config.perms) return defaultPermConfig()
  const def = defaultPermConfig()
  const out = { categories: [...(config.categories || [])], perms: {} }
  for (const cat of out.categories) {
    const saved = config.perms[cat] || {}
    const defaults = def.perms[cat] || {}
    const merged = {}
    for (const p of PERMISSIONS) {
      merged[p.key] = (p.key in saved) ? saved[p.key] : (defaults[p.key] ?? false)
    }
    out.perms[cat] = merged
  }
  return out
}

// Categoria effettiva dell'utente: il suo "reparto" se è una categoria nota,
// altrimenti un ripiego in base al vecchio ruolo (per gli utenti non ancora
// migrati), così nessuno resta bloccato.
export function categoryOf(user, config) {
  if (!user) return null
  if (config?.perms && config.perms[user.department]) return user.department
  const byRole = { admin: 'Amministratore', manager: 'Responsabile', paghe: 'Ufficio paghe', employee: 'Operativo' }
  return byRole[user.role] || 'Operativo'
}

// Permesso? Anti-blocco: se manca la config non si blocca nulla; gli
// amministratori possono sempre tutto.
export function puo(user, perm, config) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (!config || !config.perms) return true
  const cat = categoryOf(user, config)
  if (cat === 'Amministratore') return true
  return !!config.perms[cat]?.[perm]
}
