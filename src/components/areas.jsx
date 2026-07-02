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

// Rapportini d'intervento: appunti/clipboard con checklist e penna
function ReportIcon() {
  return (
    <svg {...svgProps}>
      <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5" />
      <rect x="9" y="2.8" width="6" height="3.2" rx="1" />
      <path d="M8.5 11l1 1 1.6-1.8" />
      <path d="M8.5 15.5l1 1 1.6-1.8" />
      <path d="M13 11.5h2.5" /><path d="M13 16h2.5" />
      <path d="M15.8 8.6l3-3 1.6 1.6-3 3-1.9.3z" />
    </svg>
  )
}

// Scarico magazzino: muletto (carrello elevatore)
function ForkliftIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="7" cy="18.5" r="1.6" />
      <circle cx="12" cy="18.5" r="1.6" />
      <path d="M4.8 16.9V9.5h4l2.2 4.2v3.2" />
      <path d="M14.5 5.5V17" />
      <path d="M14.5 16.5h4" />
      <rect x="14.5" y="7.5" width="4.2" height="4" rx="0.4" />
    </svg>
  )
}

// Timbrature presenze: orologio con spunta (presenza registrata)
function ClockCheckIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="M10.8 7.2v3.6l2.4 1.4" />
      <path d="M14.8 17.6l2.2 2.2 3.7-4" />
    </svg>
  )
}

// Elenco delle aree. L'ordine qui determina l'ordine in schermata.
export const AREAS = [
  {
    id: 'timbrature',
    title: 'Timbrature Presenze',
    subtitle: 'Registra entrate e uscite del personale',
    accent: '#1f7a8c',
    Icon: ClockCheckIcon,
    ready: true,
  },
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
    subtitle: 'Scansiona il QR e dichiara lo stato del mezzo',
    accent: '#ee964b',
    Icon: TruckIcon,
    ready: true,
  },
  {
    id: 'rapportini',
    title: "Rapportini d'intervento",
    subtitle: 'Compila e consulta i rapportini di intervento',
    accent: '#2e9e5b',
    Icon: ReportIcon,
    ready: true,
  },
  {
    id: 'magazzino',
    title: 'Scarico magazzino',
    subtitle: 'Registra i materiali in uscita',
    accent: '#b7791f',
    Icon: ForkliftIcon,
    ready: false,
  },
]

export function getArea(id) {
  return AREAS.find((a) => a.id === id)
}
