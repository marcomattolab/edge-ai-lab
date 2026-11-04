import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { ChatMessage, SlmService } from '../../core/slm.service';
import { ModelStore } from '../../core/model-store.service';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: boolean;
}

const SYSTEM_PROMPT =
  'Sei un assistente utile e conciso che gira interamente nel browser. Rispondi in italiano, in modo chiaro e amichevole.';

@Component({
  selector: 'app-slm-chat',
  imports: [],
  styles: `
    .chat-panel { display: flex; flex-direction: column; height: min(72vh, 760px); }
    .chat-log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0.2rem 0.6rem; }
    .msg { max-width: 82%; padding: 0.65rem 0.85rem; border-radius: 13px; font-size: 0.95rem; white-space: pre-wrap; word-break: break-word; }
    .msg.user { align-self: flex-end; background: var(--cobalt); color: #fff; border-bottom-right-radius: 4px; }
    .msg.assistant { align-self: flex-start; background: var(--panel-2); color: var(--ink); border-bottom-left-radius: 4px; }
    .msg.pending { opacity: 0.85; }
    .msg.error { background: var(--alarm-soft); color: var(--alarm); align-self: flex-start; }
    .msg .cursor { display: inline-block; width: 8px; height: 1em; background: currentColor; vertical-align: text-bottom; margin-left: 2px; animation: pulse 1s infinite; }
    .composer { display: flex; gap: 0.6rem; margin-top: 0.75rem; border-top: 1px solid var(--line); padding-top: 0.75rem; }
    .composer textarea { flex: 1; resize: none; min-height: 3rem; }
    .composer .btn { align-self: flex-end; }
    .empty { margin: auto; text-align: center; color: var(--slate); padding: 2rem 1rem; }
  `,
  template: `
    <header class="page-head">
      <h1>Chat con SLM</h1>
      <p>
        Chatta con un piccolo modello linguistico (SLM) che gira interamente nel tuo browser:
        nessuna domanda lascia il dispositivo. Il modello viene scaricato una sola volta e poi resta in cache.
      </p>
    </header>

    <section class="panel chat-panel">
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <span class="badge" [class]="store.status().slm.state">{{ label(store.status().slm.state) }}</span>
          @if (store.status().slm.state === 'loading') {
            <span class="mono muted">{{ store.status().slm.message }} {{ Math.round(store.status().slm.progress * 100) }}%</span>
          }
        </div>
        <button class="btn" (click)="clear()">Svuota chat</button>
      </div>

      @if (store.status().slm.state === 'loading') {
        <div class="meter" style="margin-top:.5rem"><i [style.width.%]="store.status().slm.progress * 100"></i></div>
      }
      @if (store.status().slm.state === 'error') {
        <p class="error-text" style="margin-top:.5rem">{{ store.status().slm.message }}</p>
      }

      <div class="chat-log" #logEl>
        @if (!messages().length) {
          <div class="empty">
            <p>👋 Ciao! Fammi una domanda: il modello risponderà un pezzo alla volta, tutto sul tuo dispositivo.</p>
            <p class="muted" style="font-size:.85rem">Al primo invio il modello si scarica (può pesare qualche centinaio di MB) e poi resta in cache.</p>
          </div>
        }
        @for (m of messages(); track m.id) {
          <div class="msg" [class]="m.role + (m.pending ? ' pending' : '') + (m.error ? ' error' : '')">
            {{ m.content }}@if (m.pending) {<span class="cursor"></span>}
          </div>
        }
      </div>

      <div class="composer">
        <textarea
          class="input"
          placeholder="Scrivi qui la tua domanda…"
          [value]="input()"
          (input)="input.set($any($event.target).value)"
          (keydown.control.enter)="send()"
          (keydown.meta.enter)="send()"
          [disabled]="busy()"
        ></textarea>
        <button class="btn primary" [disabled]="busy() || !input().trim()" (click)="send()">
          {{ busy() ? 'Rispondo…' : 'Invia' }}
        </button>
      </div>
      <p class="muted" style="margin:.4rem 0 0;font-size:.8rem">Invio = Ctrl/⌘ + Invio · Enter per andare a capo</p>
    </section>
  `,
})
export class SlmChat implements OnDestroy {
  private readonly slm = inject(SlmService);
  protected readonly store = inject(ModelStore);
  private readonly logEl = viewChild.required<ElementRef<HTMLElement>>('logEl');

  protected readonly messages = signal<Message[]>([]);
  protected readonly input = signal('');
  protected readonly busy = signal(false);
  protected readonly Math = Math;

  private id = 0;

  protected label(state: string): string {
    return { idle: 'Modello non caricato', loading: 'Caricamento…', ready: 'Pronto', error: 'Errore' }[state] ?? state;
  }

  protected clear(): void {
    this.messages.set([]);
  }

  async send(): Promise<void> {
    const text = this.input().trim();
    if (!text || this.busy()) return;
    this.input.set('');

    this.messages.update((l) => [...l, { id: ++this.id, role: 'user', content: text }]);
    const assistantId = ++this.id;
    this.messages.update((l) => [...l, { id: assistantId, role: 'assistant', content: '', pending: true }]);
    this.busy.set(true);
    this.scrollDown();

    const history: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.messages()
        .filter((m) => !m.pending && !m.error && m.id !== assistantId)
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const full = await this.slm.generate(history, (token) => {
        this.messages.update((l) => l.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m)));
        this.scrollDown();
      });
      this.messages.update((l) =>
        l.map((m) => (m.id === assistantId ? { ...m, content: full, pending: false } : m)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.messages.update((l) =>
        l.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || msg, error: true, pending: false }
            : m,
        ),
      );
    } finally {
      this.busy.set(false);
      this.scrollDown();
    }
  }

  private scrollDown(): void {
    requestAnimationFrame(() => {
      const el = this.logEl().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
  }

  ngOnDestroy(): void {
    this.slm.dispose();
  }
}
