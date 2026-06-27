import { useEffect, useMemo, useState } from 'react'
import { adminListUsers, adminUpsertUser, adminDeleteUser, exportAllData, getPermissionsConfig, login } from '../data/api.js'
import { downloadTextFile } from '../timesheet.js'
import { initials } from '../utils.js'
import { puo, categoryOf } from '../permissions.js'
import PasswordConfirm from './PasswordConfirm.jsx'

// Solo questi reparti possono ELIMINARE altri utenti.
const CAN_DELETE_CATEGORIES = ['Amministratore', 'CEO & C']

const ROLE_LABELS = { admin: 'Amministratore', manager: 'Manager', employee: 'Dipendente', paghe: 'Ufficio paghe' }
const SECTION = {
  managers: { role: 'manager', title: 'Gestione manager', singular: 'manager' },
  employees: { role: 'employee', title: 'Gestione dipendenti', singular: 'dipendente' },
  admins: { role: 'admin', title: 'Amministratori', singular: 'amministratore' },
  paghe: { role: 'paghe', title: 'Ufficio paghe', singular: 'utente ufficio paghe' },
}

const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}
function IcoManager() {
  return <svg {...svgProps}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
}
function IcoPeople() {
  return <svg {...svgProps}><circle cx="9" cy="9" r="3" /><path d="M3.2 19a5.8 5.8 0 0 1 11.6 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M17.6 13.5A5.8 5.8 0 0 1 20.8 19" /></svg>
}
function IcoShield() {
  return <svg {...svgProps}><path d="M12 3l7 2.6v5c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8v-5z" /><path d="M9.2 12l1.9 1.9L15 10" /></svg>
}
function IcoBriefcase() {
  return <svg {...svgProps}><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /><path d="M3.5 12h17" /></svg>
}

// Amministrazione utenti: tre ingressi (manager, dipendenti, amministratori).
// Il legame manager↔dipendente è molti-a-molti e si modifica da entrambi i lati.
export default function UsersAdmin({ admin }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [section, setSection] = useState(null) // null | 'managers' | 'employees' | 'admins'
  const [editing, setEditing] = useState(null) // null | 'new' | user
  const [exporting, setExporting] = useState(false)
  const [permConfig, setPermConfig] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null) // utente in attesa di eliminazione
  const categories = permConfig?.categories || []
  const canCreate = puo(admin, 'profili.create', permConfig)
  // L'eliminazione è riservata ad Amministratore e CEO & C (oltre al permesso).
  const canDelete = CAN_DELETE_CATEGORIES.includes(categoryOf(admin, permConfig))
  const canCategory = puo(admin, 'profili.category', permConfig)
  const canBackup = puo(admin, 'backup.export', permConfig)

  useEffect(() => {
    getPermissionsConfig().then(setPermConfig).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setUsers(await adminListUsers(admin.id))
    } catch (err) {
      setError(err.message || 'Errore nel caricamento utenti.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.id])

  const managers = useMemo(() => users.filter((u) => u.role === 'manager'), [users])
  const employees = useMemo(() => users.filter((u) => u.role === 'employee'), [users])
  const admins = useMemo(() => users.filter((u) => u.role === 'admin'), [users])
  const paghe = useMemo(() => users.filter((u) => u.role === 'paghe'), [users])
  const byRole = { managers, employees, admins, paghe }

  async function exportBackup() {
    setExporting(true)
    try {
      const data = await exportAllData(admin.id)
      const counts = Object.fromEntries(Object.entries(data).map(([t, rows]) => [t, rows.length]))
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      downloadTextFile(
        `backup_greeneco_${stamp}.json`,
        JSON.stringify({ app: 'greeneco-operations', exportedAt: new Date().toISOString(), exportedBy: admin.id, note: 'Copia di sicurezza. Password NON incluse.', counts, data }, null, 2),
        'application/json;charset=utf-8;'
      )
    } catch (err) {
      window.alert(err.message || 'Esportazione non riuscita.')
    } finally {
      setExporting(false)
    }
  }

  // Eliminazione confermata con la password (verificata riusando il login).
  async function confirmDelete(pwd) {
    try {
      await login(admin.id, pwd)
    } catch {
      throw new Error('Password non corretta.')
    }
    // Password ok: procede con l'eliminazione (può fallire per altri motivi).
    await adminDeleteUser(admin.id, confirmDel.id)
    setConfirmDel(null)
    await load()
  }

  // --- Form di creazione/modifica ---
  if (editing && section) {
    return (
      <div className="board">
        <UserForm
          admin={admin}
          role={SECTION[section].role}
          user={editing === 'new' ? null : editing}
          managers={managers}
          employees={employees}
          categories={categories}
          canCategory={canCategory}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      </div>
    )
  }

  // --- Elenco di una sezione ---
  if (section) {
    const list = byRole[section]
    return (
      <div className="board">
        <button className="back-link" onClick={() => setSection(null)}>‹ Torna alla gestione utenti</button>
        <div className="dash-filters">
          <h2 className="section-title">{SECTION[section].title}</h2>
          {canCreate && (
            <button className="btn-primary btn-sm" onClick={() => setEditing('new')}>+ Nuovo {SECTION[section].singular}</button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted center">Caricamento…</p>
        ) : list.length === 0 ? (
          <p className="muted small">Nessun {SECTION[section].singular} ancora.</p>
        ) : (
          <div className="table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Nome</th><th>ID</th><th>Reparto</th>
                  {section === 'employees' && <th>Manager</th>}
                  {section === 'managers' && <th>Dipendenti</th>}
                  <th>Password</th><th className="actions-col">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Nome">{u.name}</td>
                    <td data-label="ID"><code>{u.id}</code></td>
                    <td data-label="Reparto">{u.department ?? '—'}</td>
                    {section === 'employees' && (
                      <td data-label="Manager">{managerNames(u.managerIds, managers) || '—'}</td>
                    )}
                    {section === 'managers' && (
                      <td data-label="Dipendenti">{teamCount(u.id, employees)}</td>
                    )}
                    <td data-label="Password">
                      {u.hasPassword
                        ? <span className="badge badge-approved">impostata</span>
                        : <span className="badge badge-rejected">assente</span>}
                    </td>
                    <td data-label="Azioni" className="actions-col">
                      {canCreate && (
                        <button className="btn-ghost btn-sm" onClick={() => setEditing(u)}>Modifica</button>
                      )}
                      {canDelete && u.id !== admin.id && (
                        <button className="btn-ghost btn-sm danger" onClick={() => setConfirmDel(u)}>Elimina</button>
                      )}
                      {!canCreate && !canDelete && <span className="muted small">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {confirmDel && (
          <PasswordConfirm
            title="Conferma eliminazione"
            summary={`Eliminare l'utente «${confirmDel.name}» (${confirmDel.id})`}
            confirmLabel="Elimina"
            danger
            onConfirm={confirmDelete}
            onCancel={() => setConfirmDel(null)}
          />
        )}
      </div>
    )
  }

  // --- Landing: i tre ingressi ---
  return (
    <div className="board">
      <h2 className="section-title">Gestione utenti</h2>
      {error && <p className="error">{error}</p>}
      <div className="admin-tiles">
        <button className="admin-tile" style={{ '--accent': '#0d3b66' }} onClick={() => setSection('managers')}>
          <span className="admin-tile-ico"><IcoManager /></span>
          <span className="admin-tile-text">
            <span className="admin-tile-title">Gestione manager</span>
            <span className="admin-tile-sub">Crea i manager e assegna i dipendenti del loro team</span>
          </span>
          <span className="admin-tile-count">{managers.length}</span>
          <span className="admin-tile-arrow" aria-hidden>›</span>
        </button>
        <button className="admin-tile" style={{ '--accent': '#2e9e5b' }} onClick={() => setSection('employees')}>
          <span className="admin-tile-ico"><IcoPeople /></span>
          <span className="admin-tile-text">
            <span className="admin-tile-title">Gestione dipendenti</span>
            <span className="admin-tile-sub">Crea i dipendenti e abbinali a uno o più manager</span>
          </span>
          <span className="admin-tile-count">{employees.length}</span>
          <span className="admin-tile-arrow" aria-hidden>›</span>
        </button>
      </div>
      <div className="admin-tiles">
        <button className="admin-tile admin-tile-sm" style={{ '--accent': '#b7791f' }} onClick={() => setSection('admins')}>
          <span className="admin-tile-ico"><IcoShield /></span>
          <span className="admin-tile-text">
            <span className="admin-tile-title">Amministratori</span>
            <span className="admin-tile-sub">Gestisci gli account amministratore</span>
          </span>
          <span className="admin-tile-count">{admins.length}</span>
          <span className="admin-tile-arrow" aria-hidden>›</span>
        </button>
        <button className="admin-tile admin-tile-sm" style={{ '--accent': '#1f7a8c' }} onClick={() => setSection('paghe')}>
          <span className="admin-tile-ico"><IcoBriefcase /></span>
          <span className="admin-tile-text">
            <span className="admin-tile-title">Ufficio paghe</span>
            <span className="admin-tile-sub">Account che gestiscono i cassetti dei dipendenti</span>
          </span>
          <span className="admin-tile-count">{paghe.length}</span>
          <span className="admin-tile-arrow" aria-hidden>›</span>
        </button>
      </div>

      <p className="login-hint">
        L'ID identifica l'utente per l'accesso e non è modificabile dopo la creazione.
        La password è salvata cifrata; lasciala vuota in modifica per non cambiarla.
      </p>

      {canBackup && (
        <div className="backup-box">
          <h3 className="mini-title">Backup dati</h3>
          <p className="muted small">Scarica una copia di sicurezza di tutti i dati in un file JSON (password escluse).</p>
          <button className="btn-ghost" onClick={exportBackup} disabled={exporting}>
            {exporting ? 'Esportazione…' : '⬇ Esporta backup completo (JSON)'}
          </button>
        </div>
      )}
    </div>
  )
}

function managerNames(ids, managers) {
  return (ids || [])
    .map((id) => managers.find((m) => m.id === id)?.name || id)
    .join(', ')
}
function teamCount(managerId, employees) {
  const n = employees.filter((e) => (e.managerIds || []).includes(managerId)).length
  return n === 0 ? '—' : `${n}`
}

function UserForm({ admin, role, user, managers, employees, categories = [], canCategory = true, onCancel, onSaved }) {
  const isNew = !user
  const [form, setForm] = useState({
    id: user?.id ?? '',
    name: user?.name ?? '',
    department: user?.department ?? '',
    email: user?.email ?? '',
    password: '',
  })
  // Per i dipendenti: manager abbinati. Per i manager: dipendenti del team.
  const [managerIds, setManagerIds] = useState(() => new Set(user?.managerIds || []))
  const [teamIds, setTeamIds] = useState(
    () => new Set((employees || []).filter((e) => (e.managerIds || []).includes(user?.id)).map((e) => e.id))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const toggle = (setFn) => (id) => setFn((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  async function submit(e) {
    e.preventDefault()
    if (isNew && !form.password) {
      setError('Imposta una password per il nuovo utente.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const id = form.id.trim()
      await adminUpsertUser(admin.id, {
        id,
        name: form.name,
        role,
        department: form.department,
        email: form.email,
        password: form.password,
        managerIds: role === 'employee' ? [...managerIds] : [],
      })
      // Lato manager: applica le modifiche al team aggiornando i dipendenti.
      if (role === 'manager') {
        for (const emp of employees) {
          const had = (emp.managerIds || []).includes(id)
          const has = teamIds.has(emp.id)
          if (had !== has) {
            const nextIds = has
              ? [...new Set([...(emp.managerIds || []), id])]
              : (emp.managerIds || []).filter((m) => m !== id)
            await adminUpsertUser(admin.id, { ...emp, managerIds: nextIds, password: '' })
          }
        }
      }
      await onSaved()
    } catch (err) {
      setError(err.message || 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  return (
    <>
      <button className="back-link" onClick={onCancel}>‹ Torna all'elenco</button>
      <h2 className="section-title">
        {isNew ? `Nuovo ${ROLE_LABELS[role].toLowerCase()}` : `Modifica ${user.name}`}
      </h2>

      <form className="user-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">ID utente</span>
          <input className="input" value={form.id} onChange={(e) => set('id', e.target.value)}
            placeholder={role === 'manager' ? 'es. mgr-3' : role === 'admin' ? 'es. admin-2' : 'es. emp-7'}
            autoCapitalize="none" disabled={!isNew} required />
        </label>
        <label className="field">
          <span className="field-label">Nome e cognome</span>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Reparto / categoria</span>
          <select className="input" value={form.department} onChange={(e) => set('department', e.target.value)} disabled={!canCategory}>
            <option value="">— Nessuno —</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            {form.department && !categories.includes(form.department) && (
              <option value={form.department}>{form.department} (non più in elenco)</option>
            )}
          </select>
          <span className="field-hint">
            {canCategory
              ? "Determina cosa l'utente può vedere e fare (Categorie & Permessi)."
              : 'Non hai il permesso di cambiare la categoria di un utente.'}
          </span>
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoCapitalize="none" />
        </label>

        {role === 'employee' && (
          <div className="field">
            <span className="field-label">Manager abbinati (uno o più)</span>
            {managers.length === 0 ? (
              <p className="muted small">Nessun manager disponibile: creane prima uno.</p>
            ) : (
              <div className="check-list">
                {managers.map((m) => (
                  <label key={m.id} className={`check-item${managerIds.has(m.id) ? ' checked' : ''}`}>
                    <input type="checkbox" checked={managerIds.has(m.id)} onChange={() => toggle(setManagerIds)(m.id)} />
                    <span className="avatar avatar-sm">{initials(m.name)}</span>
                    <span className="check-name">{m.name}<code>{m.id}</code></span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {role === 'manager' && (
          <div className="field">
            <span className="field-label">Dipendenti del team</span>
            {employees.length === 0 ? (
              <p className="muted small">Nessun dipendente ancora: potrai assegnarli dopo averli creati.</p>
            ) : (
              <div className="check-list">
                {employees.map((emp) => (
                  <label key={emp.id} className={`check-item${teamIds.has(emp.id) ? ' checked' : ''}`}>
                    <input type="checkbox" checked={teamIds.has(emp.id)} onChange={() => toggle(setTeamIds)(emp.id)} />
                    <span className="avatar avatar-sm">{initials(emp.name)}</span>
                    <span className="check-name">{emp.name}<code>{emp.id}</code></span>
                  </label>
                ))}
              </div>
            )}
            {isNew && <p className="muted small">Suggerimento: salva prima il manager, poi assegna il team.</p>}
          </div>
        )}

        <label className="field">
          <span className="field-label">Password {isNew ? '' : '(lascia vuoto per non cambiarla)'}</span>
          <input className="input" type="text" value={form.password} onChange={(e) => set('password', e.target.value)}
            autoComplete="new-password" placeholder={isNew ? 'Password di accesso' : '••••••'} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="decision-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Annulla</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva'}</button>
        </div>
      </form>
    </>
  )
}
