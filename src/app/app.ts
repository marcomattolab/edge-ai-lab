import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FEATURES, HOME_ICON, SETTINGS_ICON } from './core/features';
import { ModelStore } from './core/model-store.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <button class="scrim" (click)="closeNav()" aria-label="Chiudi menu"></button>
      <button class="menu-btn" (click)="navOpen.set(true)" aria-label="Apri menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      <nav class="rail" aria-label="Sezioni">
        <div class="rail-head">
          <a class="brand" routerLink="/" (click)="closeNav()">
            <span class="brand-mark">AI</span>
            <span class="brand-text">Edge AI Lab</span>
          </a>
          <button class="rail-close" (click)="closeNav()" aria-label="Chiudi menu">&times;</button>
        </div>
        <p class="rail-note">I modelli girano nel tuo browser. Nessun dato lascia il dispositivo.</p>

        <a class="rail-link" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeNav()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="homeIcon"></svg>
          <span class="rail-label">Home</span>
        </a>

        <p class="rail-section">Esperimenti</p>
        @for (item of features; track item.path) {
          <a class="rail-link" [routerLink]="item.path" routerLinkActive="active" (click)="closeNav()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="item.icon"></svg>
            <span class="rail-label">{{ item.label }}</span>
            <span class="dot" [attr.data-state]="store.status()[item.slot].state" [title]="stateLabel(store.status()[item.slot].state)"></span>
          </a>
        }

        <div class="rail-footer">
          <button class="rail-link theme-toggle" (click)="theme.toggle()">
            @if (theme.theme() === 'dark') {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            } @else {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
            <span class="rail-label">{{ theme.theme() === 'dark' ? 'Tema chiaro' : 'Tema scuro' }}</span>
          </button>
          <a class="rail-link settings-link" routerLink="/settings" routerLinkActive="active" (click)="closeNav()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="settingsIcon"></svg>
            <span class="rail-label">Impostazioni modelli</span>
          </a>
        </div>
      </nav>

      <main><router-outlet /></main>
    </div>

    <div class="toasts" aria-live="polite">
      @for (t of toasts.items(); track t.id) {
        <div class="toast" [class]="t.tone">
          <span>{{ t.message }}</span>
          <button class="toast-close" (click)="toasts.dismiss(t.id)" aria-label="Chiudi">&times;</button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly store = inject(ModelStore);
  protected readonly toasts = inject(ToastService);
  protected readonly theme = inject(ThemeService);
  protected readonly features = FEATURES;
  protected readonly homeIcon = HOME_ICON;
  protected readonly settingsIcon = SETTINGS_ICON;
  protected readonly navOpen = signal(false);

  protected closeNav(): void {
    this.navOpen.set(false);
  }

  protected stateLabel(state: string): string {
    return { idle: 'Modello non caricato', loading: 'Caricamento…', ready: 'Pronto', error: 'Errore' }[state] ?? state;
  }
}
