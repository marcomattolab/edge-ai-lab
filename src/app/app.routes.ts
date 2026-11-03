import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'Edge AI Lab', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  { path: 'pinch-scroll', title: 'Pinch & Scroll', loadComponent: () => import('./features/pinch-scroll/pinch-scroll').then((m) => m.PinchScroll) },
  { path: 'head-cursor', title: 'Cursore con la testa', loadComponent: () => import('./features/head-cursor/head-cursor').then((m) => m.HeadCursor) },
  { path: 'background', title: 'Sfondo intelligente', loadComponent: () => import('./features/background/background').then((m) => m.Background) },
  { path: 'semantic-search', title: 'Ricerca semantica', loadComponent: () => import('./features/semantic-search/semantic-search').then((m) => m.SemanticSearch) },
  { path: 'pii-ocr', title: 'OCR e dati personali', loadComponent: () => import('./features/pii-ocr/pii-ocr').then((m) => m.PiiOcr) },
  { path: 'settings', title: 'Impostazioni modelli', loadComponent: () => import('./features/settings/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: 'pinch-scroll' },
];
