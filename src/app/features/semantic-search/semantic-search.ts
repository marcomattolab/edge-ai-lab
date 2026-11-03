import { Component, inject, signal } from '@angular/core';
import { errorMessage } from '../../core/camera';
import { ModelStore } from '../../core/model-store.service';
import { Hit, SemanticIndexService } from '../../core/semantic-index.service';

const SAMPLES: [string, string][] = [
  ['Carbonara', 'Per la carbonara servono guanciale, pecorino romano, uova e pepe nero. Niente panna: la cremina nasce dal tuorlo e dall\'acqua di cottura della pasta.'],
  ['Idraulico', 'Il rubinetto della cucina perde da lunedì. L\'idraulico passa giovedì mattina tra le 9 e le 11, ha chiesto di liberare il mobile sotto il lavello.'],
  ['Vacanza in Puglia', 'Idee per giugno: base a Ostuni, giornata a Polignano, trulli di Alberobello, bagno a Torre Guaceto. Prenotare l\'auto a noleggio con largo anticipo.'],
  ['Checklist rilascio', 'Prima del rilascio: eseguire i test end-to-end, controllare le variabili d\'ambiente di produzione, aggiornare il changelog e avvisare il supporto.'],
  ['Retrospettiva sprint', 'Cosa è andato bene: code review rapide. Da migliorare: le stime dei ticket e le riunioni troppo lunghe. Azione: tempo massimo di 15 minuti per il daily.'],
  ['Bicicletta', 'La catena della bici va lubrificata ogni 200 km circa. Controllare la pressione delle gomme prima di ogni uscita e sostituire le pastiglie quando sono consumate.'],
  ['Palestra', 'L\'abbonamento in palestra scade a fine mese. Disdetta con preavviso scritto di 15 giorni, oppure rinnovo trimestrale con sconto del 10 per cento.'],
  ['Orto sul balcone', 'Pomodori e basilico vanno in vaso grande con terriccio drenante. Annaffiare la sera, evitare ristagni e raccogliere i frutti quando sono ben colorati.'],
];

@Component({
  selector: 'app-semantic-search',
  template: `
    <header class="page-head">
      <h1>Ricerca semantica</h1>
      <p>Cerca per significato, non per parole esatte. I testi vengono trasformati in vettori da un modello che gira nel browser e restano salvati sul tuo dispositivo.</p>
    </header>

    <div class="split">
      <section class="panel">
        <h2>Contenuti</h2>
        <label class="field">Nome
          <input type="text" [value]="docName()" (input)="docName.set($any($event.target).value)" placeholder="Es. Appunti riunione" />
        </label>
        <label class="field">Testo
          <textarea [value]="docText()" (input)="docText.set($any($event.target).value)" placeholder="Incolla qui appunti, email o documenti"></textarea>
        </label>
        <div class="row">
          <button class="btn primary" [disabled]="index.busy() || !docText().trim()" (click)="addText()">Aggiungi all'indice</button>
          <label class="btn">Carica file .txt / .md
            <input type="file" accept=".txt,.md,text/plain,text/markdown" multiple hidden (change)="addFiles($event)" />
          </label>
          <button class="btn" [disabled]="index.busy()" (click)="addSamples()">Carica esempi</button>
        </div>
        @if (index.busy()) { <p class="muted" style="margin-top:.6rem">Indicizzo… la prima volta scarica il modello ({{ pct() }}%).</p> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <p class="muted" style="margin-top:.9rem">
          {{ index.chunks().length }} frammenti da {{ index.docs().length }} documenti.
          @if (index.stale() > 0) {
            <br /><span class="error-text">{{ index.stale() }} frammenti sono stati creati con un altro modello e non vengono cercati. Svuota l'indice e riaggiungili.</span>
          }
        </p>
        @if (index.chunks().length) {
          <button class="btn danger" (click)="index.clear()">Svuota indice</button>
        }
      </section>

      <section class="panel">
        <form class="row" (submit)="$event.preventDefault(); search()">
          <input class="input" type="search" style="flex:1" placeholder="Cosa stai cercando? Es. «quando viene l'idraulico»" [value]="query()" (input)="query.set($any($event.target).value)" />
          <button class="btn primary" type="submit" [disabled]="searching() || !query().trim() || !index.chunks().length">Cerca</button>
        </form>

        @if (searching()) { <p class="muted" style="margin-top:1rem">Cerco…</p> }
        @if (searched() && !searching() && !hits().length) { <p class="muted" style="margin-top:1rem">Nessun risultato.</p> }
        @if (!index.chunks().length) { <p class="muted" style="margin-top:1rem">Aggiungi qualche testo, oppure carica gli esempi, per iniziare.</p> }

        <ol style="padding:0; list-style:none; margin:1rem 0 0; display:grid; gap:.75rem">
          @for (h of hits(); track h.chunk.id) {
            <li class="panel">
              <div class="row" style="justify-content:space-between">
                <strong>{{ h.chunk.doc }}</strong>
                <span class="mono muted">{{ (h.score * 100).toFixed(0) }}%</span>
              </div>
              <div class="meter" style="margin:.4rem 0"><i [style.width.%]="clampPct(h.score)"></i></div>
              <p style="margin:0; white-space:pre-line">{{ h.chunk.text }}</p>
            </li>
          }
        </ol>
      </section>
    </div>
  `,
})
export class SemanticSearch {
  protected readonly index = inject(SemanticIndexService);
  private readonly store = inject(ModelStore);

  protected readonly docName = signal('');
  protected readonly docText = signal('');
  protected readonly query = signal('');
  protected readonly hits = signal<Hit[]>([]);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly error = signal('');

  protected pct(): number {
    return Math.round(this.store.status().embedding.progress * 100);
  }

  protected clampPct(score: number): number {
    return Math.max(0, Math.min(100, score * 100));
  }

  protected async addText(): Promise<void> {
    await this.guard(async () => {
      await this.index.add(this.docName().trim() || 'Nota senza titolo', this.docText());
      this.docText.set('');
      this.docName.set('');
    });
  }

  protected async addFiles(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    await this.guard(async () => {
      for (const f of files) await this.index.add(f.name, await f.text());
    });
    input.value = '';
  }

  protected async addSamples(): Promise<void> {
    await this.guard(async () => {
      const known = new Set(this.index.docs());
      for (const [name, text] of SAMPLES) if (!known.has(name)) await this.index.add(name, text);
    });
  }

  protected async search(): Promise<void> {
    this.searching.set(true);
    this.error.set('');
    try {
      this.hits.set(await this.index.search(this.query().trim()));
      this.searched.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.searching.set(false);
    }
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
