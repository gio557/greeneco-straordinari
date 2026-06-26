import { useEffect, useMemo, useState } from 'react'
import { getPermissionsConfig, savePermissionsConfig, login } from '../data/api.js'
import { PERMISSIONS, puo } from '../permissions.js'

// Catalogo raggruppato per area, per disegnare la matrice dei flag.
const GROUPS = (() => {
  const order = []
  const map = new Map()
  for (const p of PERMISSIONS) {
    if (!map.has(p.group)) { map.set(p.group, []); order.push(p.group) }
    map.get(p.group).push(p)
  }
  return order.map((g) => ({ name: g, perms: map.get(g) }))
})()

// Pagina "Categorie & Permessi": l'utente abilitato vede l'elenco delle
// categorie ("reparti"), può crearne di nuove e, per ognuna, accendere o
// spegnere i singoli permessi. Ogni modifica va confermata con la password.
export default function PermessiPage({ user }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState(null) // categoria selezionata
  const [newName, setNewName] = useState('')
  // Azione in attesa di conferma password: {type:'toggle',cat,key,value} | {type:'create',name}
  const [pending, setPending] = useState(null)

  useEffect(() => {
    let alive = true
    getPermissionsConfig()
      .then((cfg) => {
        if (!alive) return
        setConfig(cfg)
        setActive((a) => a || cfg.categories[0] || null)
      })
      .catch((err) => alive && setError(err.message || 'Errore nel caricamento.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const canEdit = useMemo(() => puo(user, 'permessi.edit', config), [user, config])

  // Applica l'azione confermata (chiamata dalla modale password).
  async function applyPending(pwd) {
    // 1) verifica la password dell'utente abilitato riusando il login.
    await login(user.id, pwd)
    // 2) costruisci la nuova configurazione.
    const next = {
      categories: [...config.categories],
      perms: Object.fromEntries(Object.entries(config.perms).map(([k, v]) => [k, { ...v }])),
    }
    if (pending.type === 'toggle') {
      next.perms[pending.cat] = { ...(next.perms[pending.cat] || {}), [pending.key]: pending.value }
    } else if (pending.type === 'create') {
      const name = pending.name
      if (!next.categories.includes(name)) next.categories.push(name)
      next.perms[name] = next.perms[name] || {}
      for (const p of PERMISSIONS) if (!(p.key in next.perms[name])) next.perms[name][p.key] = false
    }
    // 3) salva e aggiorna lo stato locale.
    await savePermissionsConfig(next)
    setConfig(next)
    if (pending.type === 'create') { setActive(pending.name); setNewName('') }
    setPending(null)
  }

  if (loading) return <div className="board"><p className="muted center">Caricamento…</p></div>
  if (!config) return <div className="board"><p className="error">{error || 'Configurazione non disponibile.'}</p></div>

  const activePerms = config.perms[active] || {}
  const isAmm = active === 'Amministratore'

  return (
    <div className="board">
      <h2 className="section-title">Categorie &amp; Permessi</h2>
      <p className="muted small">
        Ogni utente appartiene a una categoria (il suo “reparto”). I flag qui sotto
        decidono cosa quella categoria può vedere e fare. {canEdit
          ? 'Ogni modifica va confermata con la tua password.'
          : 'Non hai i permessi per modificarli: sola lettura.'}
      </p>
      {error && <p className="error">{error}</p>}

      {/* Selettore categorie */}
      <div className="cat-tabs">
        {config.categories.map((c) => (
          <button
            key={c}
            className={`cat-tab${c === active ? ' active' : ''}`}
            onClick={() => setActive(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Crea nuova categoria */}
      {canEdit && (
        <form
          className="cat-create"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newName.trim()
            if (!name) return
            if (config.categories.includes(name)) { setError(`La categoria "${name}" esiste già.`); return }
            setError('')
            setPending({ type: 'create', name })
          }}
        >
          <input
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nuova categoria (es. Magazzino)"
          />
          <button type="submit" className="btn-ghost btn-sm">+ Crea categoria</button>
        </form>
      )}

      {/* Matrice dei permessi della categoria attiva */}
      {isAmm && (
        <p className="muted small perm-note">
          La categoria <strong>Amministratore</strong> ha sempre accesso completo a
          tutto: i suoi flag sono indicativi e non possono escluderne i poteri.
        </p>
      )}
      {GROUPS.map((g) => (
        <div key={g.name} className="perm-group">
          <h3 className="perm-group-title">{g.name}</h3>
          <div className="perm-list">
            {g.perms.map((p) => {
              const on = !!activePerms[p.key]
              return (
                <label key={p.key} className={`perm-row${on ? ' on' : ''}`}>
                  <span className="perm-label">{p.label}</span>
                  <input
                    type="checkbox"
                    className="perm-switch"
                    checked={on}
                    disabled={!canEdit}
                    onChange={() => setPending({ type: 'toggle', cat: active, key: p.key, value: !on })}
                  />
                </label>
              )
            })}
          </div>
        </div>
      ))}

      {pending && (
        <PasswordConfirm
          summary={
            pending.type === 'create'
              ? `Creare la categoria “${pending.name}”`
              : `${pending.value ? 'Abilitare' : 'Disabilitare'} «${labelOf(pending.key)}» per “${pending.cat}”`
          }
          onConfirm={applyPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

function labelOf(key) {
  return PERMISSIONS.find((p) => p.key === key)?.label || key
}

// Modale di conferma: chiede la password dell'utente abilitato e la verifica
// prima di applicare la modifica.
function PasswordConfirm({ summary, onConfirm, onCancel }) {
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!pwd) { setErr('Inserisci la password.'); return }
    setBusy(true)
    setErr('')
    try {
      await onConfirm(pwd)
    } catch {
      setErr('Password non corretta.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="mini-title">Conferma modifica</h3>
        <p className="muted small">{summary}.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">La tua password</span>
            <input
              className="input"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="decision-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>Annulla</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Verifica…' : 'Conferma'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
