import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { ImageSegmenter } from '@mediapipe/tasks-vision';
import { CameraHandle, errorMessage, frameLoop, startCamera } from '../../core/camera';
import { MediaPipeService } from '../../core/mediapipe.service';

type Mode = 'blur' | 'color' | 'image';

@Component({
  selector: 'app-background',
  template: `
    <header class="page-head">
      <h1>Sfondo intelligente</h1>
      <p>Il modello separa te dallo sfondo frame per frame. Sfoca la stanza, usa un colore pieno o un'immagine tua. Il video non viene registrato né inviato.</p>
    </header>

    <div class="split">
      <section class="panel">
        <div class="row">
          @if (status() === 'idle') {
            <button class="btn primary" (click)="start()">Avvia webcam</button>
          } @else {
            <button class="btn" (click)="stop()">Ferma</button>
          }
          @if (status() === 'loading') { <span class="badge loading">Carico il modello…</span> }
          @if (status() === 'running') { <span class="badge on">{{ fps() }} fps</span> }
        </div>
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <label class="field">Sfondo
          <select (change)="onMode($event)">
            <option value="blur" [selected]="mode() === 'blur'">Sfocato</option>
            <option value="color" [selected]="mode() === 'color'">Colore pieno</option>
            <option value="image" [selected]="mode() === 'image'">Immagine mia</option>
          </select>
        </label>
        @switch (mode()) {
          @case ('blur') {
            <label class="field">Intensità: {{ blur() }} px
              <input type="range" min="4" max="40" step="2" [value]="blur()" (input)="onBlur($event)" />
            </label>
          }
          @case ('color') {
            <label class="field">Colore
              <input type="color" [value]="color()" (input)="onColor($event)" />
            </label>
          }
          @case ('image') {
            <label class="field">Immagine
              <input type="file" accept="image/*" (change)="onImage($event)" />
            </label>
          }
        }
        <label class="row" style="margin-top:.6rem">
          <input type="checkbox" [checked]="invert()" (change)="onInvert($event)" />
          <span>Inverti la maschera (se vedi te sfocato invece dello sfondo)</span>
        </label>
      </section>

      <section class="panel">
        <video #video class="offscreen" playsinline muted></video>
        <canvas #out class="canvas-out"></canvas>
      </section>
    </div>
  `,
})
export class Background implements OnDestroy {
  private readonly mp = inject(MediaPipeService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly out = viewChild.required<ElementRef<HTMLCanvasElement>>('out');

  protected readonly status = signal<'idle' | 'loading' | 'running'>('idle');
  protected readonly error = signal('');
  protected readonly mode = signal<Mode>('blur');
  protected readonly blur = signal(16);
  protected readonly color = signal('#1f5eff');
  protected readonly invert = signal(false);
  protected readonly fps = signal(0);

  private segmenter?: ImageSegmenter;
  private camera?: CameraHandle;
  private stopLoop?: () => void;
  private lastTime = -1;
  private bg?: ImageBitmap;

  private readonly maskCanvas = document.createElement('canvas');
  private readonly personCanvas = document.createElement('canvas');
  private maskImage?: ImageData;
  private frames = 0;
  private fpsStart = 0;

  protected onMode(e: Event): void { this.mode.set((e.target as HTMLSelectElement).value as Mode); }
  protected onBlur(e: Event): void { this.blur.set(Number((e.target as HTMLInputElement).value)); }
  protected onColor(e: Event): void { this.color.set((e.target as HTMLInputElement).value); }
  protected onInvert(e: Event): void { this.invert.set((e.target as HTMLInputElement).checked); }
  protected async onImage(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.bg = await createImageBitmap(file);
  }

  async start(): Promise<void> {
    this.error.set('');
    this.status.set('loading');
    try {
      this.segmenter = await this.mp.segmenter();
      this.camera = await startCamera(this.video().nativeElement);
      this.status.set('running');
      this.fpsStart = performance.now();
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
    this.fps.set(0);
  }

  ngOnDestroy(): void {
    this.release();
  }

  private release(): void {
    this.stopLoop?.();
    this.camera?.stop();
    this.segmenter?.close();
    this.stopLoop = this.camera = this.segmenter = undefined;
  }

  private tick(): void {
    const video = this.video().nativeElement;
    if (!this.segmenter || video.readyState < 2 || video.currentTime === this.lastTime) return;
    this.lastTime = video.currentTime;

    const result = this.segmenter.segmentForVideo(video, performance.now());
    const mask = result.categoryMask;
    if (mask) this.compose(video, mask.width, mask.height, mask.getAsUint8Array());
    result.close();

    this.frames++;
    const now = performance.now();
    if (now - this.fpsStart > 1000) {
      this.fps.set(Math.round((this.frames * 1000) / (now - this.fpsStart)));
      this.frames = 0;
      this.fpsStart = now;
    }
  }

  private compose(video: HTMLVideoElement, mw: number, mh: number, data: Uint8Array): void {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = this.out().nativeElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = this.personCanvas.width = w;
      canvas.height = this.personCanvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;

    // 1) Maschera: pixel opachi dove c'è la persona.
    if (!this.maskImage || this.maskImage.width !== mw || this.maskImage.height !== mh) {
      this.maskCanvas.width = mw;
      this.maskCanvas.height = mh;
      this.maskImage = new ImageData(mw, mh);
    }
    const px = this.maskImage.data;
    const inv = this.invert();
    for (let i = 0; i < data.length; i++) px[i * 4 + 3] = data[i] > 0 !== inv ? 255 : 0;
    this.maskCanvas.getContext('2d')!.putImageData(this.maskImage, 0, 0);

    // 2) Sfondo.
    ctx.globalCompositeOperation = 'source-over';
    switch (this.mode()) {
      case 'blur': {
        const b = this.blur();
        ctx.filter = `blur(${b}px)`;
        ctx.drawImage(video, -b, -b, w + b * 2, h + b * 2); // margine extra per non avere bordi trasparenti
        ctx.filter = 'none';
        break;
      }
      case 'color':
        ctx.fillStyle = this.color();
        ctx.fillRect(0, 0, w, h);
        break;
      case 'image':
        if (this.bg) this.drawCover(ctx, this.bg, w, h);
        else {
          ctx.fillStyle = '#0b1424';
          ctx.fillRect(0, 0, w, h);
        }
        break;
    }

    // 3) Persona ritagliata con la maschera (bordo leggermente sfumato) e sovrapposta.
    const pctx = this.personCanvas.getContext('2d')!;
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, w, h);
    pctx.drawImage(video, 0, 0, w, h);
    pctx.globalCompositeOperation = 'destination-in';
    pctx.filter = 'blur(2px)';
    pctx.drawImage(this.maskCanvas, 0, 0, w, h);
    pctx.filter = 'none';
    ctx.drawImage(this.personCanvas, 0, 0);
  }

  private drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number): void {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}
