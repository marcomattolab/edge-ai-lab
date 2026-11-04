import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CameraHandle, errorMessage, startCamera as openCamera } from '../../core/camera';
import { CaptionService } from '../../core/captioning.service';
import { ModelStore } from '../../core/model-store.service';
import { OcrService } from '../../core/ocr.service';
import { joinWords } from '../../core/pii';
import { getAvailableVoices, onVoicesChanged, speak as speakText, stopSpeaking, voicesFor } from '../../core/speech';
import type { SpeechVoice } from '../../core/speech';

type Mode = 'caption' | 'ocr';

const VOICE_KEY = 'edge-ai-lab.vision-assist.voice';

@Component({
  selector: 'app-vision-assist',
  styles: `
    .caption-box { margin-top: 1rem; padding: 1.1rem; border-radius: 12px; border: 1px solid var(--line); background: var(--panel-2); }
    .caption-text { font-size: 1.3rem; line-height: 1.55; margin: 0.5rem 0 0.9rem; }
    .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line); }
    .seg button { font: inherit; font-weight: 600; font-size: 0.9rem; padding: 0.4rem 0.8rem; border: 0; border-radius: 8px; background: transparent; color: var(--slate); cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
    .seg button.on { background: var(--panel); color: var(--ink); box-shadow: var(--shadow-sm); }
  `,
  template: `
    <header class="page-head">
      <h1>Assistente visivo</h1>
      <p>Pensato per persone non vedenti o ipovedenti: inquadra con la webcam oppure carica un'immagine e l'AI descrive la scena o ne legge il testo ad alta voce. Tutto avviene sul dispositivo.</p>
    </header>

    <div class="split">
      <section class="panel">
        <div class="video-wrap"><video #video playsinline muted></video></div>
        <div class="row" style="margin-top:.75rem">
          @if (!cameraOn()) {
            <button class="btn primary" (click)="start()">Avvia webcam</button>
          } @else {
            <button class="btn" (click)="stop()">Ferma webcam</button>
          }
          <label class="btn">Carica immagine
            <input type="file" accept="image/*" hidden (change)="onFile($event)" />
          </label>
        </div>

        <div class="field">Cosa vuoi fare?
          <div class="seg" role="group" aria-label="Modalità di analisi">
            <button [class.on]="mode() === 'caption'" (click)="mode.set('caption')">Descrivi la scena</button>
            <button [class.on]="mode() === 'ocr'" (click)="mode.set('ocr')">Leggi il testo</button>
          </div>
        </div>

        <div class="row" style="margin-top:.6rem">
          <button class="btn primary" [disabled]="busy()" (click)="analyze()">Analizza</button>
          <label class="row">
            <input type="checkbox" [checked]="voice()" (change)="onVoice($event)" />
            <span>Leggi ad alta voce</span>
          </label>
        </div>

        <div class="field" style="margin-top:.75rem">Voce dello speaker
          <div class="row" style="margin-top:.3rem">
            <select [value]="selectedVoiceUri()" (change)="onVoiceSelect($event)">
              <option value="">Voce di sistema (predefinita)</option>
              @for (v of voices(); track v.uri) {
                <option [value]="v.uri">{{ v.name }} · {{ v.lang }}</option>
              }
            </select>
            <button class="btn" (click)="previewVoice()">Prova</button>
          </div>
          <p class="muted" style="margin:.3rem 0 0">La voce scelta vale per la modalità corrente ({{ mode() === 'caption' ? 'descrizione in inglese' : 'lettura testo in italiano' }}).</p>
        </div>

        @if (busy()) {
          <p class="muted" style="margin-top:.6rem">
            {{ mode() === 'caption' ? 'Analizzo la scena…' : 'Leggo il testo…' }}
            <span class="mono">{{ mode() === 'caption' ? store.status().captioning.message : store.status().ocr.message }}</span>
          </p>
          <div class="meter"><i [style.width.%]="mode() === 'caption' ? captionPct() : ocrPct()"></i></div>
        }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <ul class="hint">
          <li>La prima descrizione scarica un piccolo modello di visione (qualche decina di MB).</li>
          <li>La voce usa la sintesi vocale del sistema operativo, spesso disponibile anche senza rete.</li>
          <li>La descrizione è in inglese: è la lingua del modello di riconoscimento immagini.</li>
        </ul>
      </section>

      <section class="panel">
        <canvas #canvas class="canvas-out" style="transform:none"></canvas>
        @if (result()) {
          <div class="caption-box" role="status">
            <span class="badge on">{{ mode() === 'caption' ? 'Descrizione' : 'Testo rilevato' }}</span>
            <p class="caption-text">{{ result() }}</p>
            <button class="btn" (click)="speak()">Rileggi ad alta voce</button>
          </div>
        } @else {
          <p class="muted">Qui comparirà l'immagine con la descrizione o il testo rilevato, in caratteri grandi.</p>
        }
      </section>
    </div>
  `,
})
export class VisionAssist implements OnInit, OnDestroy {
  protected readonly store = inject(ModelStore);
  private readonly caption = inject(CaptionService);
  private readonly ocr = inject(OcrService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly mode = signal<Mode>('caption');
  protected readonly voice = signal(true);
  protected readonly cameraOn = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal('');

  private readonly allVoices = signal<SpeechVoice[]>([]);
  private readonly voicePrefs = signal<Record<string, string>>(this.readVoicePrefs());
  private readonly lang = computed(() => (this.mode() === 'caption' ? 'en-US' : 'it-IT'));
  protected readonly voices = computed(() => voicesFor(this.allVoices(), this.lang()));
  protected readonly selectedVoiceUri = computed(() => this.voicePrefs()[this.lang()] ?? this.defaultVoiceUri());

  private camera?: CameraHandle;
  private bitmap?: ImageBitmap;
  private stopVoicesListener?: () => void;

  ngOnInit(): void {
    this.refreshVoices();
    this.stopVoicesListener = onVoicesChanged(() => this.refreshVoices());
  }

  protected captionPct(): number {
    return Math.round(this.store.status().captioning.progress * 100);
  }
  protected ocrPct(): number {
    return Math.round(this.store.status().ocr.progress * 100);
  }
  protected onVoice(e: Event): void {
    this.voice.set((e.target as HTMLInputElement).checked);
  }

  protected onVoiceSelect(e: Event): void {
    const uri = (e.target as HTMLSelectElement).value;
    this.voicePrefs.update((prefs) => {
      const next = { ...prefs, [this.lang()]: uri };
      localStorage.setItem(VOICE_KEY, JSON.stringify(next));
      return next;
    });
  }

  protected previewVoice(): void {
    const sample =
      this.mode() === 'caption'
        ? 'This is how the selected voice sounds.'
        : 'Ecco come suona la voce selezionata.';
    speakText(sample, this.lang(), 0.95, this.selectedVoiceUri());
  }

  private refreshVoices(): void {
    this.allVoices.set(getAvailableVoices());
  }

  private defaultVoiceUri(): string {
    // Per le descrizioni in inglese preferisci la voce Google UK Male, se disponibile.
    if (this.lang() !== 'en-US') return '';
    return this.allVoices().find((v) => /google.*uk.*male/i.test(v.name))?.uri ?? '';
  }

  private readVoicePrefs(): Record<string, string> {
    try {
      return (JSON.parse(localStorage.getItem(VOICE_KEY) ?? 'null') as Record<string, string> | null) ?? {};
    } catch {
      return {};
    }
  }

  protected async start(): Promise<void> {
    this.error.set('');
    try {
      this.camera = await openCamera(this.video().nativeElement);
      this.cameraOn.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  protected stop(): void {
    this.camera?.stop();
    this.camera = undefined;
    this.cameraOn.set(false);
  }

  ngOnDestroy(): void {
    this.stop();
    this.stopVoicesListener?.();
    stopSpeaking();
  }

  protected async onFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set('');
    try {
      this.bitmap = await createImageBitmap(file);
      this.paintBitmap();
      this.result.set('');
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  protected async analyze(): Promise<void> {
    this.error.set('');
    this.result.set('');
    this.busy.set(true);
    try {
      const canvas = this.canvas().nativeElement;
      if (this.bitmap) {
        this.paintBitmap();
      } else {
        if (!this.camera) await this.start();
        await this.ensureFrame();
        const video = this.video().nativeElement;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
      }

      if (this.mode() === 'caption') {
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.result.set(await this.caption.caption(imageData));
      } else {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossibile leggere l'immagine"))), 'image/png'),
        );
        const text = joinWords(await this.ocr.recognize(blob)).text.trim();
        if (!text) this.error.set("Nessun testo riconosciuto nell'immagine.");
        else this.result.set(text);
      }

      if (this.voice() && this.result()) this.speak();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected speak(): void {
    // Le didascalie del modello di visione sono in inglese, il testo OCR è in italiano.
    speakText(this.result(), this.lang(), 0.95, this.selectedVoiceUri());
  }

  private paintBitmap(): void {
    const b = this.bitmap;
    if (!b) return;
    const canvas = this.canvas().nativeElement;
    canvas.width = b.width;
    canvas.height = b.height;
    canvas.getContext('2d')!.drawImage(b, 0, 0);
  }

  private async ensureFrame(): Promise<void> {
    const v = this.video().nativeElement;
    const start = performance.now();
    while ((v.readyState < 2 || v.videoWidth === 0) && performance.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 150));
    if (v.videoWidth === 0) throw new Error('La webcam non ha ancora prodotto un fotogramma.');
  }
}
