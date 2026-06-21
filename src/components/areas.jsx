// Definizione delle quattro macro-aree dell'app e relative icone.
// Le icone sono SVG inline (nessuna dipendenza esterna) disegnate con
// "currentColor", così ereditano il colore impostato dal contenitore.

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

// Straordinari: orologio
function ClockIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3.2 1.8" />
    </svg>
  )
}

// Automezzi: furgone/camion
function TruckIcon() {
  return (
    <svg {...svgProps}>
      <path d="M1.5 6.5h12v8h-12z" />
      <path d="M13.5 9h3.7l2.8 3v2.5h-6.5" />
      <circle cx="5.6" cy="17.2" r="1.7" />
      <circle cx="16.6" cy="17.2" r="1.7" />
    </svg>
  )
}

// Attrezzature: chiave inglese
function WrenchIcon() {
  return (
    <svg {...svgProps}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
}

// Scarico magazzino: magazzino con freccia in uscita
function WarehouseIcon() {
  return (
    <svg {...svgProps}>
      <path d="M3 9.4 12 5l9 4.4V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-5h6v5" />
      <path d="M12 8.5v4m0 0 1.8-1.8M12 12.5l-1.8-1.8" />
    </svg>
  )
}

// Cantieri: gru da cantiere
function CraneIcon() {
  return (
    <svg {...svgProps}>
      <path d="M3 21h7" />
      <path d="M6.5 21V5.5" />
      <path d="M3.5 8.5 6.5 5.5 9.5 8.5" />
      <path d="M6.5 5.5H19" />
      <path d="M17 5.5V9" />
      <path d="M15.5 9h3l-1.5 2.2z" />
    </svg>
  )
}

// Elenco delle aree. L'ordine qui determina l'ordine in schermata.
export const AREAS = [
  {
    id: 'straordinari',
    title: 'Gestione richieste straordinarie',
    subtitle: 'Richiedi e approva le ore di straordinario',
    accent: '#0d3b66',
    Icon: ClockIcon,
    ready: true,
  },
  {
    id: 'automezzi',
    title: 'Presa in carico automezzi',
    subtitle: 'Registra l’uso dei mezzi aziendali',
    accent: '#ee964b',
    Icon: TruckIcon,
    ready: false,
  },
  {
    id: 'attrezzature',
    title: 'Presa in carico attrezzature',
    subtitle: 'Assegna e restituisci le attrezzature',
    accent: '#2e9e5b',
    Icon: WrenchIcon,
    ready: false,
  },
  {
    id: 'magazzino',
    title: 'Scarico magazzino',
    subtitle: 'Registra i materiali in uscita',
    accent: '#b7791f',
    Icon: WarehouseIcon,
    ready: false,
  },
  {
    id: 'cantieri',
    title: 'Stato d’avanzamento cantieri',
    subtitle: 'Monitora l’avanzamento dei cantieri attivi',
    accent: '#7a5195',
    Icon: CraneIcon,
    ready: false,
  },
]

export function getArea(id) {
  return AREAS.find((a) => a.id === id)
}
