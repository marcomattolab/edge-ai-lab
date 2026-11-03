import { Component, inject } from '@angular/core';
import { MpSlot, SLOT_INFO, Slot } from '../../core/defaults';
import { EmbeddingService } from '../../core/embedding.service';
import { ModelStore } from '../../core/model-store.service';
import { OcrService } from '../../core/ocr.service';
import { SettingsService } from '../../core/settings.service';

@Component({
  selector: 'app-settings',
  template: `
    <header class="page-head">
      <h1>Impostazioni modelli</h1>
      <p>Scegli da dove prendere il modello iniziale di ogni funzione: un URL (scaricato una volta e tenuto in cache) oppure un file sul tuo computer. Le modifiche valgono dal prossimo avvio della funzione.</p>
    </header>

    <div class="row" style="margin-bottom:1rem">
      <button class="btn primary" (click)="preloadAll()">Precarica tutti i modelli</button>
      <button class="btn" (click)="settings.reset()">Ripristina predefiniti</button>
      <button class="btn danger" (click)="store.clearCache()">Svuota cache modelli</button>
      <span class="badge" [class.on]="hasWebGpu">{{ hasWebGpu ? 'WebGPU disponibile' : 'WebGPU non disponibile' }}</span>
    </div>

    <div class="stack">
      @for (slot of mpSlots; track slot) {
        @let src = settings.value().models[slot];
        @let st = store.status()[slot];
        <section class="panel">
          <div class="row" style="justify-content:space-between">
            <h2 style="margin:0">{{ info[slot].title }}</h2>
            <span class="badge" [class]="st.state">{{ label(st.state) }}</span>
          </div>
          <p class="muted">{{ info[slot].hint }}</p>

          <div class="row">
            <label class="row"><input type="radio" [name]="slot" [checked]="src.kind === 'url'" (change)="setKind(slot, 'url')" /> URL</label>
            <label class="row"><input type="radio" [name]="slot" [checked]="src.kind === 'file'" (change)="setKind(slot, 'file')" /> File sul computer</label>
          </div>

          @if (src.kind === 'url') {
            <label class="field">Indirizzo del modello
              <input type="text" [value]="src.url" (change)="setUrl(slot, $any($event.target).value)" />
            </label>
          } @else {
            <label class="field">File del modello (.task o .tflite)
              <input type="file" accept=".task,.tflite,.bin" (change)="onFile(slot, $event)" />
            </label>
            @if (src.fileName) { <p class="mono">Salvato: {{ src.fileName }}</p> }
          }

          @if (st.state === 'loading') { <div class="meter"><i [style.width.%]="st.progress * 100"></i></div> }
          @if (st.message && st.state !== 'loading') { <p class="mono muted">{{ st.message }}</p> }
          <button class="btn" style="margin-top:.5rem" [disabled]="st.state === 'loading'" (click)="warm(slot)">Carica ora</button>
        </section>
      }

      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">{{ info.embedding.title }}</h2>
          <span class="badge" [class]="store.status().embedding.state">{{ label(store.status().embedding.state) }}</span>
        </div>
        <p class="muted">{{ info.embedding.hint }}</p>
        <label class="field">Modello
          <input type="text" list="presets" [value]="settings.value().embedding.modelId" (change)="setEmbedding({ modelId: $any($event.target).value.trim() })" />
          <datalist id="presets">
            <option value="Xenova/paraphrase-multilingual-MiniLM-L12-v2"></option>
            <option value="Xenova/all-MiniLM-L6-v2"></option>
          </datalist>
        </label>
        <label class="field">Dispositivo
          <select (change)="setEmbedding({ device: $any($event.target).value })">
            <option value="webgpu" [selected]="settings.value().embedding.device === 'webgpu'">WebGPU (veloce)</option>
            <option value="wasm" [selected]="settings.value().embedding.device === 'wasm'">CPU / WASM (compatibile)</option>
          </select>
        </label>
        <label class="row">
          <input type="checkbox" [checked]="settings.value().embedding.local" (change)="setEmbedding({ local: $any($event.target).checked })" />
          <span>Usa un modello già presente nella cartella <span class="mono">public/models/</span> dell'app</span>
        </label>
        @if (store.status().embedding.state === 'loading') { <div class="meter" style="margin-top:.5rem"><i [style.width.%]="store.status().embedding.progress * 100"></i></div> }
        @if (store.status().embedding.message && store.status().embedding.state !== 'loading') { <p class="mono muted">{{ store.status().embedding.message }}</p> }
        <button class="btn" style="margin-top:.5rem" [disabled]="store.status().embedding.state === 'loading'" (click)="warm('embedding')">Carica ora</button>
      </section>

      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">{{ info.ocr.title }}</h2>
          <span class="badge" [class]="store.status().ocr.state">{{ label(store.status().ocr.state) }}</span>
        </div>
        <p class="muted">{{ info.ocr.hint }}</p>
        <label class="field">Lingue (codici Tesseract separati da +)
          <input type="text" [value]="settings.value().ocr.lang" (change)="setOcr({ lang: $any($event.target).value.trim() })" />
        </label>
        <label class="field">Cartella dei dati lingua (vuoto = scarica da internet)
          <input type="text" placeholder="/tessdata" [value]="settings.value().ocr.langPath" (change)="setOcr({ langPath: $any($event.target).value.trim() })" />
        </label>
        @if (store.status().ocr.message) { <p class="mono muted">{{ store.status().ocr.message }}</p> }
        <button class="btn" [disabled]="store.status().ocr.state === 'loading'" (click)="warm('ocr')">Carica ora</button>
      </section>

      <section class="panel">
        <h2>Accelerazione MediaPipe</h2>
        <label class="field">Delegato
          <select (change)="setDelegate($any($event.target).value)">
            <option value="GPU" [selected]="settings.value().delegate === 'GPU'">GPU (con ripiego automatico sulla CPU)</option>
            <option value="CPU" [selected]="settings.value().delegate === 'CPU'">Solo CPU</option>
          </select>
        </label>
      </section>
    </div>
  `,
})
export class Settings {
  protected readonly settings = inject(SettingsService);
  protected readonly store = inject(ModelStore);
  private readonly embeddings = inject(EmbeddingService);
  private readonly ocr = inject(OcrService);

  protected readonly info = SLOT_INFO;
  protected readonly mpSlots: MpSlot[] = ['hand', 'face', 'segmenter'];
  protected readonly hasWebGpu = 'gpu' in navigator;

  protected label(state: string): string {
    return { idle: 'Non caricato', loading: 'In corso', ready: 'Pronto', error: 'Errore' }[state] ?? state;
  }

  protected setKind(slot: MpSlot, kind: 'url' | 'file'): void {
    this.settings.update((s) => ({ ...s, models: { ...s.models, [slot]: { ...s.models[slot], kind } } }));
  }

  protected setUrl(slot: MpSlot, url: string): void {
    this.settings.update((s) => ({ ...s, models: { ...s.models, [slot]: { ...s.models[slot], url } } }));
  }

  protected async onFile(slot: MpSlot, e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await this.store.saveFile(slot, file);
  }

  protected setEmbedding(patch: Partial<ReturnType<SettingsService['value']>['embedding']>): void {
    this.settings.update((s) => ({ ...s, embedding: { ...s.embedding, ...patch } }));
  }

  protected setOcr(patch: Partial<ReturnType<SettingsService['value']>['ocr']>): void {
    this.settings.update((s) => ({ ...s, ocr: { ...s.ocr, ...patch } }));
  }

  protected setDelegate(delegate: 'GPU' | 'CPU'): void {
    this.settings.update((s) => ({ ...s, delegate }));
  }

  protected async warm(slot: Slot): Promise<void> {
    try {
      if (slot === 'embedding') await this.embeddings.ensure();
      else if (slot === 'ocr') await this.ocr.ensure();
      else await this.store.load(slot);
    } catch {
      /* l'errore è già visibile nello stato dello slot */
    }
  }

  protected async preloadAll(): Promise<void> {
    await Promise.allSettled((['hand', 'face', 'segmenter', 'embedding', 'ocr'] as Slot[]).map((s) => this.warm(s)));
  }
}
