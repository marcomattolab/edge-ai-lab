import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FEATURES } from '../../core/features';
import { ModelStore } from '../../core/model-store.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <header class="hero">
      <span class="hero-logo" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 46 L27 18 L40 46" stroke-width="8"/>
          <path d="M21.5 38 L32.5 38" stroke-width="6"/>
          <path d="M50 18 L50 46" stroke-width="8"/>
        </svg>
      </span>
      <span class="hero-badge">Laboratorio didattico · AI sul dispositivo</span>
      <h1>Edge AI Lab</h1>
      <p class="hero-owner">di <a href="https://www.youtube.com/@MarcoMartoranaAI" target="_blank" rel="noopener">Marco Martorana</a> · Informatica, AI e didattica</p>
      <p class="hero-sub">
        Otto esperimenti per capire l'intelligenza artificiale toccandola con mano:
        niente server, niente cloud, i modelli girano interamente nel tuo browser.
      </p>
      <div class="hero-actions">
        <a class="btn primary" routerLink="/pinch-scroll">Inizia con il primo esperimento</a>
        <a class="btn" routerLink="/settings">Impostazioni modelli</a>
      </div>
      <div class="hero-stats">
        <div class="stat"><strong>8</strong><span>esperimenti</span></div>
        <div class="stat"><strong>100%</strong><span>on-device</span></div>
        <div class="stat"><strong>0</strong><span>dati inviati</span></div>
        <div class="stat"><strong>0 €</strong><span>modelli gratuiti e open source</span></div>
      </div>
    </header>

    <section class="home-section">
      <div class="section-head">
        <h2>Esplora gli esperimenti</h2>
        <p class="muted">Ogni scheda spiega cosa fa il modello e cosa impari usandolo.</p>
      </div>
      <div class="features-grid">
        @for (f of features; track f.path) {
          <a class="feature-card" [routerLink]="f.path" [style.--tone]="f.tone">
            <span class="feature-cat">{{ f.category }}</span>
            <div class="feature-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="f.icon"></svg>
            </div>
            <div class="feature-body">
              <div class="feature-head">
                <h2>{{ f.name }}</h2>
                <span class="badge" [class]="store.status()[f.slot].state">{{ label(store.status()[f.slot].state) }}</span>
              </div>
              <p>{{ f.description }}</p>
              <p class="feature-learn">🎓 <span>Cosa impari:</span> {{ f.learn }}</p>
            </div>
            <span class="feature-arrow" aria-hidden="true">→</span>
          </a>
        }
      </div>
    </section>

    <section class="home-section how">
      <div class="section-head">
        <h2>Come funziona</h2>
        <p class="muted">Un percorso in quattro passi per capire l'AI che gira nel tuo browser.</p>
      </div>
      <div class="steps">
        <div class="step">
          <span class="step-n">1</span>
          <h3>Scegli un esperimento</h3>
          <p>Ogni esperimento è un caso d'uso reale: accessibilità, ricerca, privacy, automazione.</p>
        </div>
        <div class="step">
          <span class="step-n">2</span>
          <h3>Il modello si scarica una volta</h3>
          <p>Viene tenuto in cache sul tuo dispositivo: poi funziona anche offline.</p>
        </div>
        <div class="step">
          <span class="step-n">3</span>
          <h3>L'AI gira nel browser</h3>
          <p>L'inferenza avviene con WebGPU o WASM, sfruttando la tua GPU o la CPU.</p>
        </div>
        <div class="step">
          <span class="step-n">4</span>
          <h3>I tuoi dati restano con te</h3>
          <p>Immagini, testi e voce non lasciano mai il dispositivo. Zero cloud.</p>
        </div>
      </div>
    </section>

    <section class="home-section channel">
      <h2>Vuoi approfondire?</h2>
      <p class="muted">
        Sul canale <strong>Marco Martorana — Informatica, AI e didattica</strong> trovi tutorial pratici
        per usare l'AI a scuola, nello studio e nel lavoro.
      </p>
      <div class="channel-cards">
        <div class="channel-card">🎓 <strong>Per studenti</strong><span>studia meglio, ripassa in modo efficiente</span></div>
        <div class="channel-card">🍎 <strong>Per docenti</strong><span>lezioni e verifiche in pochi minuti</span></div>
        <div class="channel-card">💻 <strong>Per chi vuole imparare</strong><span>dall'idea al codice</span></div>
      </div>
      <a class="btn primary" href="https://www.youtube.com/@MarcoMartoranaAI" target="_blank" rel="noopener">Vai al canale YouTube</a>
    </section>

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
