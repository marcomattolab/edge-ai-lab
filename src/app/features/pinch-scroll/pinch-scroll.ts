import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import { CameraHandle, clamp, errorMessage, frameLoop, startCamera } from '../../core/camera';
import { MediaPipeService } from '../../core/mediapipe.service';

@Component({
  selector: 'app-pinch-scroll',
  styles: `
    .stage { position: relative; padding: 0; overflow: hidden; height: min(70vh, 640px); }
    .scroller { height: 100%; overflow-y: auto; padding: 1rem; display: grid; gap: .75rem; align-content: start; }
    .card { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 10px; }
    .card.liked { border-color: var(--cobalt); background: var(--cobalt-soft); }
    .cursor { position: absolute; left: 0; top: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; border: 3px solid var(--cobalt); background: rgba(39,72,240,.15); pointer-events: none; opacity: 0; z-index: 5; transition: opacity .15s; }
    .cursor.down { background: var(--cobalt); }
    .cursor.tap { animation: tap .3s; }
    @keyframes tap { 40% { box-shadow: 0 0 0 14px rgba(39,72,240,.25); } }
  `,
  template: `
    <header class="page-head">
      <h1>Pinch &amp; Scroll</h1>
      <p>Pizzica pollice e indice davanti alla webcam. Tieni il pizzico e muovi la mano per scorrere; un pizzico rapido clicca dove si trova il cursore.</p>
    </header>

    <div class="split">
      <section class="panel">
        <div class="video-wrap">
          <video #video playsinline muted></video>
          <canvas #overlay></canvas>
        </div>
        <div class="row" style="margin-top:.75rem">
          @if (status() === 'idle') {
            <button class="btn primary" (click)="start()">Avvia webcam</button>
          } @else {
            <button class="btn" (click)="stop()">Ferma</button>
          }
          <span class="badge" [class.on]="pinching()">{{ pinching() ? 'Pizzico attivo' : 'Mano aperta' }}</span>
          @if (status() === 'loading') { <span class="badge loading">Carico il modello…</span> }
        </div>
        @if (error()) { <p class="error-text">{{ error() }}</p> }
        <label class="field">Velocità di scorrimento: {{ gain() }}×
          <input type="range" min="1" max="5" step="0.5" [value]="gain()" (input)="onGain($event)" />
        </label>
        <p class="muted mono">distanza pizzico: {{ ratio() }} · clic: {{ clicks() }}</p>
        <ul class="hint">
          <li>Tieni la mano a circa 40–60 cm dalla camera, con una buona luce.</li>
          <li>Per scorrere verso il basso, trascina la mano verso l'alto, come su un touchscreen.</li>
        </ul>
      </section>

      <section class="panel stage" #stage>
        <div class="scroller" #demo>
          @for (n of cards; track n) {
            <div class="card" [class.liked]="liked().has(n)">
              <div>
                <strong>Scheda {{ n + 1 }}</strong>
                <div class="muted">Pizzica sul pulsante per attivarlo.</div>
              </div>
              <button class="btn" [class.primary]="liked().has(n)" (click)="toggle(n)">
                {{ liked().has(n) ? 'Salvata' : 'Salva' }}
              </button>
            </div>
          }
        </div>
        <div class="cursor" #cursor [class.down]="pinching()"></div>
      </section>
    </div>
  `,
})
export class PinchScroll implements OnDestroy {
  private readonly mp = inject(MediaPipeService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly demo = viewChild.required<ElementRef<HTMLElement>>('demo');
  private readonly cursor = viewChild.required<ElementRef<HTMLElement>>('cursor');

  protected readonly status = signal<'idle' | 'loading' | 'running'>('idle');
  protected readonly error = signal('');
  protected readonly pinching = signal(false);
  protected readonly ratio = signal(0);
  protected readonly clicks = signal(0);
  protected readonly gain = signal(2.5);
  protected readonly liked = signal<ReadonlySet<number>>(new Set());
  protected readonly cards = Array.from({ length: 24 }, (_, i) => i);

  private landmarker?: HandLandmarker;
  private camera?: CameraHandle;
  private stopLoop?: () => void;
  private drawing?: DrawingUtils;
  private lastTime = -1;
  private pos?: { x: number; y: number };
  private pinchOn = false;
  private press = { t: 0, x: 0, y: 0, scroll: 0, dragged: false };

  protected onGain(e: Event): void {
    this.gain.set(Number((e.target as HTMLInputElement).value));
  }

  protected toggle(n: number): void {
    this.liked.update((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async start(): Promise<void> {
    this.error.set('');
    this.status.set('loading');
    try {
      this.landmarker = await this.mp.hand();
      this.camera = await startCamera(this.video().nativeElement);
      this.drawing = new DrawingUtils(this.overlay().nativeElement.getContext('2d')!);
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
    this.pinchOn = false;
    this.pos = undefined;
    this.pinching.set(false);
    this.status.set('idle');
    this.cursor().nativeElement.style.opacity = '0';
  }

  ngOnDestroy(): void {
    this.release();
  }

  private release(): void {
    this.stopLoop?.();
    this.camera?.stop();
    this.landmarker?.close();
    this.stopLoop = this.camera = this.landmarker = this.drawing = undefined;
  }

  private tick(): void {
    const video = this.video().nativeElement;
    if (!this.landmarker || video.readyState < 2 || video.currentTime === this.lastTime) return;
    this.lastTime = video.currentTime;

    const res = this.landmarker.detectForVideo(video, performance.now());
    const canvas = this.overlay().nativeElement;
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);

    const cursor = this.cursor().nativeElement;
    const hand = res.landmarks[0];
    if (!hand) {
      this.pinchOn = false;
      this.pinching.set(false);
      cursor.style.opacity = '0';
      return;
    }
    this.drawing?.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: '#ffffff', lineWidth: 2 });
    this.drawing?.drawLandmarks(hand, { color: '#2748f0', radius: 3 });

    const thumb = hand[4];
    const index = hand[8];
    const size = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y) || 1;
    const ratio = Math.hypot(thumb.x - index.x, thumb.y - index.y) / size;
    this.ratio.set(Math.round(ratio * 100) / 100);
    const on = this.pinchOn ? ratio < 0.42 : ratio < 0.28; // isteresi: evita sfarfallii

    // Posizione del cursore: punto medio tra le due dita, specchiato e ritagliato ai bordi.
    const tx = clamp((1 - (thumb.x + index.x) / 2 - 0.12) / 0.76);
    const ty = clamp(((thumb.y + index.y) / 2 - 0.12) / 0.76);
    this.pos = this.pos
      ? { x: this.pos.x + (tx - this.pos.x) * 0.4, y: this.pos.y + (ty - this.pos.y) * 0.4 }
      : { x: tx, y: ty };

    const rect = this.stage().nativeElement.getBoundingClientRect();
    cursor.style.opacity = '1';
    cursor.style.transform = `translate(${this.pos.x * rect.width}px, ${this.pos.y * rect.height}px)`;

    const now = performance.now();
    const scroller = this.demo().nativeElement;
    if (on && !this.pinchOn) {
      this.press = { t: now, x: this.pos.x, y: this.pos.y, scroll: scroller.scrollTop, dragged: false };
    } else if (on) {
      const dx = (this.pos.x - this.press.x) * rect.width;
      const dy = (this.pos.y - this.press.y) * rect.height;
      if (Math.hypot(dx, dy) > 16) this.press.dragged = true;
      if (this.press.dragged) scroller.scrollTop = this.press.scroll - dy * this.gain();
    } else if (this.pinchOn && !this.press.dragged && now - this.press.t < 450) {
      this.clickAt(rect, this.press.x, this.press.y);
    }
    this.pinchOn = on;
    this.pinching.set(on);
  }

  private clickAt(rect: DOMRect, x: number, y: number): void {
    const el = document.elementFromPoint(rect.left + x * rect.width, rect.top + y * rect.height);
    const target = el?.closest<HTMLElement>('button, a, [role="button"]');
    if (!target) return;
    target.click();
    this.clicks.update((n) => n + 1);
    const c = this.cursor().nativeElement;
    c.classList.remove('tap');
    void c.offsetWidth;
    c.classList.add('tap');
  }
}
