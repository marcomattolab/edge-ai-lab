import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Slot } from './core/defaults';
import { ModelStore } from './core/model-store.service';

interface NavItem {
  path: string;
  label: string;
  slot: Slot;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <nav class="rail" aria-label="Sezioni">
        <a class="brand" routerLink="/">Edge AI Lab</a>
        <p class="rail-note">I modelli girano nel tuo browser. Nessun dato lascia il dispositivo.</p>
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active">
            <span class="dot" [attr.data-state]="store.status()[item.slot].state"></span>
            {{ item.label }}
          </a>
        }
        <a class="settings-link" routerLink="/settings" routerLinkActive="active">Impostazioni modelli</a>
      </nav>
      <main><router-outlet /></main>
    </div>
  `,
})
export class App {
  protected readonly store = inject(ModelStore);
  protected readonly nav: NavItem[] = [
    { path: 'pinch-scroll', label: 'Pinch & Scroll', slot: 'hand' },
    { path: 'head-cursor', label: 'Cursore con la testa', slot: 'face' },
    { path: 'background', label: 'Sfondo intelligente', slot: 'segmenter' },
    { path: 'semantic-search', label: 'Ricerca semantica', slot: 'embedding' },
    { path: 'pii-ocr', label: 'OCR e dati personali', slot: 'ocr' },
  ];
}
