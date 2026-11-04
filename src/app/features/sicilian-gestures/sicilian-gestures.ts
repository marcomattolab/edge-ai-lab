import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import { CameraHandle, errorMessage, frameLoop, startCamera } from '../../core/camera';
import { MediaPipeService } from '../../core/mediapipe.service';
import { speak, stopSpeaking } from '../../core/speech';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';

interface Point {
  x: number;
  y: number;
}

interface Gesture {
  id: string;
  name: string;
  /** Parola o espressione in siciliano. */
  sicilian: string;
  meaning: string;
  emoji: string;
  /** Esegue l'azione e restituisce il testo da registrare (o null). */
  action: () => string | null;
}

interface LogEntry {
  id: number;
  emoji: string;
  text: string;
  time: string;
}

const SICILIAN_PHRASES = [
  'Chi voi? Non ti capisco!',
  'Bedda matri, che caldo!',
  'Veni cca, ti devo dire una cosa.',
  'Minchia, che bello!',
  'Unn è? Dove vai di fretta?',
  'Ma chi si? Chi ti credi di essere?',
  'Nun mi rumpiri i scatuli!',
  'Nenti, nun è nenti.',
  'Sta attentu, ca cadi!',
  'Ammuccia, ca veni u maistru!',
];

const STABLE_FRAMES = 5;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

@Component({
  selector: 'app-sicilian-gestures',
  styles: `
    .gesture-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.6rem; }
    .gesture { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem; border-radius: 10px; border: 1px solid var(--line); background: var(--panel-2); transition: border-color .15s, background .15s, box-shadow .15s; }
    .gesture.live { border-color: var(--cobalt); background: var(--cobalt-soft); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cobalt) 18%, transparent); }
    .gesture-emoji { font-size: 1.5rem; line-height: 1; flex: none; }
    .sicilian { color: var(--cobalt); font-weight: 700; font-style: italic; font-size: 0.95rem; }
    .log { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
    .log li { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.7rem; border-radius: 9px; background: var(--panel-2); font-size: 0.92rem; }
    .log .time { margin-left: auto; }
  `,
  template: `
    <header class="page-head">
      <h1>Gesti siciliani</h1>
      <p>Mostra i gesti alla webcam: l'AI li riconosce dai 21 punti della mano, ti dice la parola in siciliano e compie un'azione. Tutto gira nel tuo browser.</p>
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
          @if (status() === 'loading') { <span class="badge loading">Carico il modello…</span> }
        </div>
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <div class="row" style="margin-top:.75rem">
          <span class="badge" [class.on]="currentGesture() !== null">{{ currentLabel() }}</span>
          <label class="row">
            <input type="checkbox" [checked]="voice()" (change)="onVoice($event)" />
            <span>Voce</span>
          </label>
        </div>
        <div class="row" style="margin-top:.6rem">
          <span class="mono muted">azioni: {{ log().length }} · mi piace: {{ likes() }}</span>
          <button class="btn" (click)="clear()">Svuota registro</button>
        </div>
        <ul class="hint">
          <li>Tieni la mano a 40–60 cm dalla camera, con una buona luce.</li>
          <li>Un gesto scatta quando resta fermo per un attimo; cambia gesto per ripeterlo.</li>
          <li>I gesti nuovi (telefono, OK, dita incrociate, pistola) richiedono una mano ben illuminata.</li>
        </ul>
      </section>

      <div class="stack">
        <section class="panel">
          <h2>Gesti e vocabolario siciliano</h2>
          <div class="gesture-grid">
            @for (g of gestures; track g.id) {
              <div class="gesture" [class.live]="current() === g.id">
                <span class="gesture-emoji">{{ g.emoji }}</span>
                <div>
                  <strong>{{ g.name }}</strong>
                  <div class="sicilian">{{ g.sicilian }}</div>
                  <div class="muted">{{ g.meaning }}</div>
                </div>
              </div>
            }
          </div>
        </section>

        <section class="panel">
          <h2>Registro azioni</h2>
          @if (log().length) {
            <ol class="log">
              @for (entry of log(); track entry.id) {
                <li>
                  <span class="gesture-emoji">{{ entry.emoji }}</span>
                  <span>{{ entry.text }}</span>
                  <span class="muted mono time">{{ entry.time }}</span>
                </li>
              }
            </ol>
          } @else {
            <p class="muted">Fai un gesto per vederne l'azione qui.</p>
          }
        </section>
      </div>
    </div>
  `,
})
export class SicilianGestures implements OnDestroy {
  private readonly mp = inject(MediaPipeService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');

  protected readonly status = signal<'idle' | 'loading' | 'running'>('idle');
  protected readonly error = signal('');
  protected readonly current = signal<string | null>(null);
  protected readonly likes = signal(0);
  protected readonly voice = signal(true);
  protected readonly log = signal<LogEntry[]>([]);

  protected readonly gestures: Gesture[] = [
    {
      id: 'open', name: 'Mano aperta', sicilian: 'Basta!', meaning: 'Fermati / Basta', emoji: '🖐',
      action: () => { this.stop(); return 'Ferma la webcam'; },
    },
    {
      id: 'fist', name: 'Pugno', sicilian: 'Nienti!', meaning: 'Niente / Chiudi', emoji: '✊',
      action: () => { this.log.set([]); return null; },
    },
    {
      id: 'horns', name: 'Corna', sicilian: 'Si u bàbbaluci!', meaning: 'Contro il malocchio', emoji: '🤘',
      action: () => {
        this.theme.toggle();
        return this.theme.theme() === 'dark' ? 'Tema scuro attivato: protezione dal malocchio' : 'Tema chiaro attivato';
      },
    },
    {
      id: 'pigna', name: 'A pigna', sicilian: 'Chì booi?', meaning: 'Che vuoi? / Ma chi ti credi?', emoji: '🤌',
      action: () => SICILIAN_PHRASES[Math.floor(Math.random() * SICILIAN_PHRASES.length)],
    },
    {
      id: 'thumbup', name: 'Pollice su', sicilian: 'Braaavu!', meaning: 'Tutto a posto / Bravo', emoji: '👍',
      action: () => { this.likes.update((n) => n + 1); return 'Mi piace +1'; },
    },
    {
      id: 'thumbdown', name: 'Pollice giù', sicilian: 'Mi siddìia!', meaning: 'Non mi va', emoji: '👎',
      action: () => { this.likes.update((n) => n - 1); return 'Mi piace −1'; },
    },
    {
      id: 'peace', name: 'V di pace', sicilian: 'Paci!', meaning: 'Pace', emoji: '✌️',
      action: () => this.copyToClipboard('Paci!'),
    },
    {
      id: 'one', name: 'Indice su', sicilian: 'Staccùra!', meaning: 'Attento / Ascolta', emoji: '☝️',
      action: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); return 'Scorri in cima alla pagina'; },
    },
    {
      id: 'call', name: 'Telefono', sicilian: 'Ti chiamu!', meaning: 'Ti chiamo', emoji: '🤙',
      action: () => this.copyToClipboard('Ti chiamu!'),
    },
    {
      id: 'ok', name: 'OK', sicilian: 'Tutt"àppost!', meaning: 'Va bene / Perfetto', emoji: '👌',
      action: () => { this.toast.show('Tutt"àppost!'); return 'Tutto a posto!'; },
    },
    {
      id: 'crossed', name: 'Dita incrociate', sicilian: 'Speriaaaaamo!', meaning: 'Buona fortuna / Speriamo', emoji: '🤞',
      action: () => this.copyToClipboard('Speriaaaaamo!'),
    },
    {
      id: 'gun', name: 'Pistola', sicilian: 'Attentu ca ti sparru!', meaning: 'Per gioco / Ti sparo', emoji: '🔫',
      action: () => { this.toast.show('Bang! 💥 (per gioco)'); return 'Bang!'; },
    },
  ];

  private readonly byId = new Map(this.gestures.map((g) => [g.id, g]));

  private landmarker?: HandLandmarker;
  private camera?: CameraHandle;
  private stopLoop?: () => void;
  private drawing?: DrawingUtils;
  private lastTime = -1;
  private heldId: string | null = null;
  private heldFrames = 0;
  private lastId: string | null = null;
  private logId = 0;
  // Smussamento temporale delle classificazioni (voto a maggioranza sulle ultime 3).
  private recent: (string | null)[] = [];

  protected onVoice(e: Event): void {
    this.voice.set((e.target as HTMLInputElement).checked);
  }

  protected currentGesture(): Gesture | null {
    const id = this.current();
    return id ? (this.byId.get(id) ?? null) : null;
  }

  protected currentLabel(): string {
    const g = this.currentGesture();
    return g ? `${g.emoji} ${g.sicilian}` : 'Mano non rilevata';
  }

  protected clear(): void {
    this.log.set([]);
    this.likes.set(0);
  }

  private copyToClipboard(text: string): string {
    const p = navigator.clipboard?.writeText(text);
    if (p) {
      void p.then(() => this.toast.show(`Copiato: ${text}`)).catch(() => this.toast.show('Impossibile copiare', 'error'));
    } else {
      this.toast.show('Copiare non è disponibile', 'error');
    }
    return `Copia «${text}» negli appunti`;
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
    this.heldId = null;
    this.heldFrames = 0;
    this.current.set(null);
    this.recent = [];
    this.status.set('idle');
  }

  ngOnDestroy(): void {
    this.release();
    stopSpeaking();
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

    const hand = res.landmarks[0];
    if (!hand) {
      this.heldId = null;
      this.heldFrames = 0;
      this.current.set(null);
      this.recent = [];
      return;
    }
    this.drawing?.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: '#ffffff', lineWidth: 2 });
    this.drawing?.drawLandmarks(hand, { color: '#3b5bff', radius: 3 });

    // Classificazione statica smussata con voto a maggioranza (3 frame) per ridurre i falsi scatti.
    this.recent.push(this.classify(hand));
    if (this.recent.length > 3) this.recent.shift();
    const id = this.majority(this.recent);

    if (id !== this.heldId) {
      this.heldId = id;
      this.heldFrames = 0;
    }
    this.heldFrames++;
    this.current.set(id);

    if (id && this.heldFrames === STABLE_FRAMES && id !== this.lastId) {
      this.lastId = id;
      this.trigger(id);
    }
    if (!id && this.heldFrames >= STABLE_FRAMES * 2) this.lastId = null;
  }

  private majority(ids: (string | null)[]): string | null {
    const counts = new Map<string, number>();
    for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    let best: string | null = null;
    let bestN = 0;
    for (const [id, n] of counts) if (n > bestN) { bestN = n; best = id; }
    return bestN >= 2 ? best : null;
  }

  private classify(lm: Point[]): string | null {
    const wrist = lm[0];
    const scale = Math.max(dist(lm[0], lm[9]), 1e-4);
    const extended = (tip: number, pip: number) => dist(lm[tip], wrist) > dist(lm[pip], wrist);

    // Il pollice è "teso" se la punta è lontana dall'attaccatura dell'indice (lm[5]);
    // quando è piegato sul palmo la punta resta vicino alle nocche. Molto più affidabile
    // del confronto punta/polso, che scambiava "indice su" con "pistola".
    const thumb = dist(lm[4], lm[5]) > scale * 0.6;
    const index = extended(8, 6);
    const middle = extended(12, 10);
    const ring = extended(16, 14);
    const pinky = extended(20, 18);

    const fingersFolded = !index && !middle && !ring && !pinky;

    // "A pigna" (che vuoi?): tutte e cinque le punte convergono in un punto.
    // Includendo il pollice si evita di confonderla con l'OK.
    const fiveTips = [lm[4], lm[8], lm[12], lm[16], lm[20]];
    let fiveSpread = 0;
    for (let i = 0; i < fiveTips.length; i++)
      for (let j = i + 1; j < fiveTips.length; j++)
        fiveSpread = Math.max(fiveSpread, dist(fiveTips[i], fiveTips[j]));

    if (!fingersFolded && fiveSpread < scale * 0.45) return 'pigna';

    if (fingersFolded) {
      // Pollice su/giù: le altre quattro dita sono chiuse. Soglia proporzionale alla mano.
      if (thumb && lm[4].y < wrist.y - scale * 0.5) return 'thumbup';
      if (thumb && lm[4].y > wrist.y + scale * 0.5) return 'thumbdown';
      return 'fist';
    }

    // Telefono: pollice e mignolo tesi, indice, medio e anulare chiusi.
    if (thumb && pinky && !index && !middle && !ring) return 'call';

    // Pistola: pollice e indice tesi, le altre tre dita chiuse.
    if (thumb && index && !middle && !ring && !pinky) return 'gun';

    // OK: pollice e indice formano un anello, le altre tre dita sono aperte.
    if (thumb && middle && ring && pinky && dist(lm[4], lm[8]) < scale * 0.3) return 'ok';

    if (thumb && index && middle && ring && pinky) return 'open';
    if (index && pinky && !middle && !ring) return 'horns';
    if (index && middle && !ring && !pinky) {
      // Dita incrociate: punte sovrapposte; V di pace: punte separate.
      return dist(lm[8], lm[12]) < scale * 0.35 ? 'crossed' : 'peace';
    }
    if (index && !middle && !ring && !pinky) return 'one';
    return null;
  }

  private trigger(id: string): void {
    const g = this.byId.get(id);
    if (!g) return;
    const text = g.action();
    if (text) {
      this.log.update((l) => [{ id: ++this.logId, emoji: g.emoji, text, time: new Date().toLocaleTimeString('it-IT') }, ...l].slice(0, 30));
    }
    if (this.voice()) speak(`${g.sicilian}. ${g.meaning}.`, 'it-IT');
  }
}
