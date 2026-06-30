import { useEffect, useRef, useState } from 'react'
import { searchAddress } from '../data/geocode.js'

// Campo indirizzo con suggerimenti da OpenStreetMap (Nominatim). Digitando una
// via o il nome di un'attività, propone risultati; selezionandone uno si
// ottengono indirizzo e coordinate (lat/lng). Debounce 600 ms e minimo 3
// caratteri, per rispettare le policy d'uso di OSM.
export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, id }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const seq = useRef(0)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function handleInput(v) {
    onChange(v)
    if (timer.current) clearTimeout(timer.current)
    const trimmed = (v || '').trim()
    if (trimmed.length < 3) { setResults([]); setOpen(false); return }
    const mySeq = ++seq.current
    setLoading(true)
    timer.current = setTimeout(async () => {
      const r = await searchAddress(trimmed)
      if (mySeq !== seq.current) return // risposta superata da una più recente
      setResults(r)
      setOpen(true)
      setLoading(false)
    }, 600)
  }

  function pick(r) {
    setOpen(false)
    setResults([])
    onSelect(r)
  }

  return (
    <div className="addr-ac">
      <input
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <span className="addr-ac-spin" aria-hidden>…</span>}
      {open && (results.length > 0 || (value || '').trim().length >= 3) && (
        <ul className="addr-ac-list">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" className="addr-ac-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
                {r.label}
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && <li className="addr-ac-empty">Nessun risultato</li>}
        </ul>
      )}
    </div>
  )
}
