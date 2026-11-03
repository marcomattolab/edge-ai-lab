import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { CameraHandle, clamp, errorMessage, frameLoop, startCamera } from '../../core/camera';
import { MediaPipeService } from '../../core/mediapipe.service';

type ClickMode = 'blink' | 'jaw';

@Component({
  selector: 'app-head-cursor',
  styles: `
    .head-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; border: 3px solid var(--alarm); background: rgba(214,51,74,.15); pointer-events: none; z-index: 1000; opacity: 0; }
    .head-cursor.tap { animation: tap .35s; }
    @keyframes tap { 40% { box-shadow: 0 0 0 16px rgba(214,51,74,.25); } }
    .targets { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .75rem; }
    .target { padding: 1.4rem 1rem; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; transition: transform .1s, box-shadow .15s, background .15s, border-color .15s; }
    .target:hover { border-color: var(--cobalt); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
    .target.hit { background: var(--cobalt); border-color: var(--cobalt); color: #fff; }
  `,
  template: `
    <header class="page-head">
      <h1>Cursore con la testa</h1>
      <p>Muovi il viso per spostare il puntatore su tutto lo schermo. Per cliccare, chiudi gli occhi per mezzo secondo oppure apri la bocca, a tua scelta.</p>
    </header>

    <div class="split">
      <section class="panel">
        <div class="video-wrap"><video #video playsinline muted></video></div>
        <div class="row" style="margin-top:.75rem">
          @if (status() === 'idle') {
            <button class="btn primary" (click)="start()">Avvia webcam</button>
          } @else {
            <button class="btn" (click)="stop()">Ferma</button>
            <button class="btn" (click)="calibrate()">Calibra il centro</button>
          }
          @if (status() === 'loading') { <span class="badge loading">Carico il modello…</span> }
        </div>
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <label class="field">Come clicco
          <select (change)="onMode($event)">
            <option value="blink" [selected]="mode() === 'blink'">Occhi chiusi per 0,5 secondi</option>
            <option value="jaw" [selected]="mode() === 'jaw'">Bocca aperta</option>
          </select>
        </label>
        <label class="field">Sensibilità: {{ gain() }}×
          <input type="range" min="2" max="10" step="0.5" [value]="gain()" (input)="onGain($event)" />
        </label>
        <p class="muted">Occhi chiusi</p>
        <div class="meter"><i [style.width.%]="blink() * 100"></i></div>
        <p class="muted" style="margin-top:.5rem">Bocca aperta</p>
        <div class="meter"><i [style.width.%]="jaw() * 100"></i></div>
        <p class="muted mono" style="margin-top:.5rem">clic: {{ clicks() }}</p>
      </section>

      <section class="panel">
        <h2>Prova a colpire i bersagli</h2>
        <div class="targets">
          @for (n of targets; track n) {
            <button class="target" [class.hit]="hits().has(n)" (click)="hit(n)">Bersaglio {{ n }}</button>
          }
        </div>
        <ul class="hint">
          <li>Siediti a circa mezzo metro e guarda lo schermo. Premi «Calibra il centro» quando sei comodo.</li>
          <li>Il puntatore funziona su tutta la pagina, comprese le voci del menu a sinistra.</li>
        </ul>
      </section>
    </div>
    <div class="head-cursor" #cursor></div>
  `,
})
export class HeadCursor implements OnDestroy {
  private readonly mp = inject(MediaPipeService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly cursor = viewChild.required<ElementRef<HTMLElement>>('cursor');

  protected readonly status = signal<'idle' | 'loading' | 'running'>('idle');
  protected readonly error = signal('');
  protected readonly mode = signal<ClickMode>('blink');
  protected readonly gain = signal(5);
  protected readonly blink = signal(0);
  protected readonly jaw = signal(0);
  protected readonly clicks = signal(0);
  protected readonly hits = signal<ReadonlySet<number>>(new Set());
  protected readonly targets = Array.from({ length: 12 }, (_, i) => i + 1);

  private face?: FaceLandmarker;
  private camera?: CameraHandle;
  private stopLoop?: () => void;
  private lastTime = -1;
  private last = { x: 0.5, y: 0.5 };
  private center?: { x: number; y: number };
  private pos = { x: 0.5, y: 0.5 };
  private closedSince = 0;
  private fired = false;
  private jawWasOpen = false;

  protected onMode(e: Event): void {
    this.mode.set((e.target as HTMLSelectElement).value as ClickMode);
  }
  protected onGain(e: Event): void {
    this.gain.set(Number((e.target as HTMLInputElement).value));
  }
  protected hit(n: number): void {
    this.hits.update((s) => new Set(s).add(n));
  }
  protected calibrate(): void {
    this.center = { ...this.last };
  }

  async start(): Promise<void> {
    this.error.set('');
    this.status.set('loading');
    try {
      this.face = await this.mp.face();
      this.camera = await startCamera(this.video().nativeElement);
      this.center = undefined;
      this.status.set('running');
      this.stopLoop = frameLoop(() => this.tick());
    } catch (e) {
      const msg = errorMessage(e);
      this.stop();
      this.error.set(msg);
    }
  }

  stop(): void {
    this.release();
    this.status.set('idle');
    this.cursor().nativeElement.style.opacity = '0';
  }

  ngOnDestroy(): void {
    this.release();
  }

  private release(): void {
    this.stopLoop?.();
    this.camera?.stop();
    this.face?.close();
    this.stopLoop = this.camera = this.face = undefined;
  }

  private tick(): void {
    const video = this.video().nativeElement;
    if (!this.face || video.readyState < 2 || video.currentTime === this.lastTime) return;
    this.lastTime = video.currentTime;

    const res = this.face.detectForVideo(video, performance.now());
    const cursor = this.cursor().nativeElement;
    const nose = res.faceLandmarks[0]?.[1];
    if (!nose) {
      cursor.style.opacity = '0';
      return;
    }

    // Punta del naso, specchiata: muovere la testa a destra sposta il puntatore a destra.
    this.last = { x: 1 - nose.x, y: nose.y };
    this.center ??= { ...this.last };
    const g = this.gain();
    const tx = clamp(0.5 + (this.last.x - this.center.x) * g);
    const ty = clamp(0.5 + (this.last.y - this.center.y) * g * 1.4);
    this.pos = { x: this.pos.x + (tx - this.pos.x) * 0.25, y: this.pos.y + (ty - this.pos.y) * 0.25 };

    const px = this.pos.x * window.innerWidth;
    const py = this.pos.y * window.innerHeight;
    cursor.style.opacity = '1';
    cursor.style.transform = `translate(${px}px, ${py}px)`;

    const cats = res.faceBlendshapes[0]?.categories ?? [];
    const score = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;
    const blink = Math.min(score('eyeBlinkLeft'), score('eyeBlinkRight'));
    const jaw = score('jawOpen');
    this.blink.set(Math.round(blink * 100) / 100);
    this.jaw.set(Math.round(jaw * 100) / 100);

    const now = performance.now();
    if (this.mode() === 'blink') {
      if (blink > 0.55) {
        this.closedSince ||= now;
        if (!this.fired && now - this.closedSince > 500) {
          this.fired = true;
          this.clickAt(px, py);
        }
      } else {
        this.closedSince = 0;
        this.fired = false;
      }
    } else {
      const open = jaw > 0.5;
      if (open && !this.jawWasOpen) this.clickAt(px, py);
      this.jawWasOpen = open;
    }
  }

  private clickAt(x: number, y: number): void {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('button, a, [role="button"]');
    if (!target) return;
    target.click();
    this.clicks.update((n) => n + 1);
    const c = this.cursor().nativeElement;
    c.classList.remove('tap');
    void c.offsetWidth;
    c.classList.add('tap');
  }
}
