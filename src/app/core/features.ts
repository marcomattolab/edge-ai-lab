import { Slot } from './defaults';

export interface Feature {
  path: string;
  /** Etichetta corta usata nella barra laterale. */
  label: string;
  /** Titolo mostrato sulla card della home. */
  name: string;
  description: string;
  slot: Slot;
  /** SVG interno (path, circle, ecc.) per l'icona, tratto in stile Feather. */
  icon: string;
  /** Colore di accento della card. */
  tone: string;
}

export const FEATURES: Feature[] = [
  {
    path: 'pinch-scroll',
    label: 'Pinch & Scroll',
    name: 'Pinch & Scroll',
    description: 'Pizzica pollice e indice davanti alla webcam per scorrere e cliccare, come su un touchscreen.',
    slot: 'hand',
    tone: '#3b5bff',
    icon: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
  },
  {
    path: 'head-cursor',
    label: 'Cursore con la testa',
    name: 'Cursore con la testa',
    description: 'Muovi il viso per controllare il puntatore su tutto lo schermo: sbatti le palpebre per cliccare.',
    slot: 'face',
    tone: '#e5484d',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  },
  {
    path: 'background',
    label: 'Sfondo intelligente',
    name: 'Sfondo intelligente',
    description: 'Il modello separa te dallo sfondo in tempo reale: sfoca, usa un colore o un\'immagine tua.',
    slot: 'segmenter',
    tone: '#12b886',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  },
  {
    path: 'semantic-search',
    label: 'Ricerca semantica',
    name: 'Ricerca semantica',
    description: 'Cerca nei tuoi testi per significato, non per parole esatte, con vettori calcolati nel browser.',
    slot: 'embedding',
    tone: '#7048e8',
    icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  },
  {
    path: 'pii-ocr',
    label: 'OCR e dati personali',
    name: 'OCR e dati personali',
    description: 'Legge documenti e oscura automaticamente email, IBAN, codici fiscali e altri dati sensibili.',
    slot: 'ocr',
    tone: '#f08c00',
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  },
];

export const HOME_ICON = '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>';

export const SETTINGS_ICON =
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
