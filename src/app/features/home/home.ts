import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FEATURES } from '../../core/features';
import { ModelStore } from '../../core/model-store.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <header class="hero">
      <span class="hero-badge">100% on-device · Nessun dato in uscita</span>
      <h1>Edge AI Lab</h1>
      <p class="hero-sub">
        Cinque esperimenti di intelligenza artificiale che girano interamente nel tuo browser:
        niente server, niente cloud, i modelli restano sul tuo dispositivo.
      </p>
      <div class="hero-actions">
        <a class="btn primary" routerLink="/pinch-scroll">Prova il primo esperimento</a>
        <a class="btn" routerLink="/settings">Impostazioni modelli</a>
      </div>
    </header>

    <div class="features-grid">
      @for (f of features; track f.path) {
        <a class="feature-card" [routerLink]="f.path" [style.--tone]="f.tone">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="f.icon"></svg>
          </div>
          <div class="feature-body">
            <div class="feature-head">
              <h2>{{ f.name }}</h2>
              <span class="badge" [class]="store.status()[f.slot].state">{{ label(store.status()[f.slot].state) }}</span>
            </div>
            <p>{{ f.description }}</p>
          </div>
          <span class="feature-arrow" aria-hidden="true">→</span>
        </a>
      }
    </div>

    <footer class="home-foot muted">
      Serve una webcam per gli esperimenti con la mano, il viso e lo sfondo. Tutti i modelli vengono
      scaricati una volta e tenuti in cache: puoi gestirli dalla pagina <a routerLink="/settings">Impostazioni modelli</a>.
    </footer>
  `,
})
export class Home {
  protected readonly store = inject(ModelStore);
  protected readonly features = FEATURES;

  protected label(state: string): string {
    return { idle: 'Da avviare', loading: 'Caricamento…', ready: 'Pronto', error: 'Errore' }[state] ?? state;
  }
}
