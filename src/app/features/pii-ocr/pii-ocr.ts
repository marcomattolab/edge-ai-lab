import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { errorMessage } from '../../core/camera';
import { ModelStore } from '../../core/model-store.service';
import { OcrService, OcrWord } from '../../core/ocr.service';
import { PiiMatch, detectPii, joinWords, wordsForMatch } from '../../core/pii';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-pii-ocr',
  styles: `.canvas-doc { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line); background: var(--panel-2); }`,
  template: `
    <header class="page-head">
      <h1>OCR e dati personali</h1>
      <p>Carica la foto o la scansione di un documento. Il testo viene letto sul tuo dispositivo e i dati personali (email, IBAN, codice fiscale, telefono e altri) vengono oscurati prima che il file vada da qualche altra parte.</p>
    </header>

    <div class="split">
      <section class="panel">
        <label class="field">Immagine del documento
          <input type="file" accept="image/*" (change)="onFile($event)" />
        </label>
        @if (busy()) {
          <p class="muted">Leggo il testo… {{ pct() }}% <span class="mono">{{ store.status().ocr.message }}</span></p>
          <div class="meter"><i [style.width.%]="pct()"></i></div>
        }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        @if (matches().length) {
          <h2 style="margin-top:1rem">Dati trovati ({{ matches().length }})</h2>
          <p class="muted">Togli la spunta per lasciare visibile un elemento.</p>
          <ul style="list-style:none; padding:0; margin:0; display:grid; gap:.4rem">
            @for (m of matches(); track m.id) {
              <li>
                <label class="row">
                  <input type="checkbox" [checked]="!excluded().has(m.id)" (change)="toggle(m.id)" />
                  <span class="badge">{{ m.kind }}</span>
                  <span class="mono">{{ m.value }}</span>
                </label>
              </li>
            }
          </ul>
        } @else if (done() && !busy()) {
          <p class="muted" style="margin-top:1rem">Nessun dato personale riconosciuto. Il riconoscimento usa regole su formati noti, quindi nomi e indirizzi non vengono individuati.</p>
        }

        @if (done()) {
          <div class="row" style="margin-top:1rem">
            <button class="btn primary" (click)="download()">Scarica immagine oscurata</button>
            <button class="btn" (click)="copyText()">Copia testo oscurato</button>
          </div>
        }
      </section>

      <section class="panel">
        <canvas #canvas class="canvas-doc"></canvas>
        @if (done()) {
          <h2 style="margin-top:1rem">Testo oscurato</h2>
          <pre class="mono" style="white-space:pre-wrap; margin:0">{{ redactedText() }}</pre>
        } @else if (!busy()) {
          <p class="muted">Qui vedrai il documento con le parti riservate coperte.</p>
        }
      </section>
    </div>
  `,
})
export class PiiOcr {
  protected readonly store = inject(ModelStore);
  private readonly ocr = inject(OcrService);
  private readonly toast = inject(ToastService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');
  protected readonly excluded = signal<ReadonlySet<number>>(new Set());

  private readonly words = signal<OcrWord[]>([]);
  private readonly joined = computed(() => joinWords(this.words()));
  protected readonly matches = computed<PiiMatch[]>(() => detectPii(this.joined().text));
  private image?: ImageBitmap;

  protected readonly redactedText = computed(() => {
    const text = this.joined().text;
    let out = '';
    let pos = 0;
    for (const m of this.matches()) {
      if (this.excluded().has(m.id)) continue;
      out += text.slice(pos, m.start) + `[${m.kind.toUpperCase()}]`;
      pos = m.end;
    }
    return out + text.slice(pos);
  });

  protected pct(): number {
    return Math.round(this.store.status().ocr.progress * 100);
  }

  protected async onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.done.set(false);
    this.excluded.set(new Set());
    this.words.set([]);
    this.busy.set(true);
    try {
      this.image = await createImageBitmap(file);
      this.paint();
      this.words.set(await this.ocr.recognize(file));
      this.done.set(true);
      this.paint();
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected toggle(id: number): void {
    this.excluded.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    this.paint();
  }

  protected download(): void {
    this.canvas().nativeElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'documento-oscurato.png';
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
    this.toast.show('Immagine oscurata scaricata');
  }

  protected async copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.redactedText());
      this.toast.show('Testo copiato negli appunti');
    } catch {
      this.toast.show('Impossibile copiare il testo', 'error');
    }
  }

  private paint(): void {
    const img = this.image;
    if (!img) return;
    const canvas = this.canvas().nativeElement;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const words = this.words();
    const spans = this.joined().spans;
    const pad = Math.max(3, Math.round(img.height * 0.004));
    ctx.fillStyle = '#000';
    for (const m of this.matches()) {
      if (this.excluded().has(m.id)) continue;
      for (const i of wordsForMatch(spans, m)) {
        const w = words[i];
        ctx.fillRect(w.x0 - pad, w.y0 - pad, w.x1 - w.x0 + pad * 2, w.y1 - w.y0 + pad * 2);
      }
    }
  }
}
