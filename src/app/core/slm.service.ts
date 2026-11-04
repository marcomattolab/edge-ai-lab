import { Injectable, inject } from '@angular/core';
import { ModelStore } from './model-store.service';
import { SettingsService } from './settings.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface Pending {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
  onToken: (t: string) => void;
}

@Injectable({ providedIn: 'root' })
export class SlmService {
  private readonly settings = inject(SettingsService);
  private readonly store = inject(ModelStore);

  private worker?: Worker;
  private key = '';
  private ready?: Promise<void>;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readyHandlers?: { resolve: () => void; reject: (e: Error) => void };

  ensure(): Promise<void> {
    const c = this.settings.value().slm;
    const key = `${c.modelId}|${c.local}|${c.device}`;
    if (this.worker && key === this.key && this.ready) return this.ready;

    this.worker?.terminate();
    this.key = key;
    this.store.setStatus('slm', { state: 'loading', progress: 0, message: 'Avvio…' });

    const worker = new Worker(new URL('./slm.worker', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }) => this.onMessage(data);
    worker.onerror = (e) => this.fail(new Error(e.message || 'Errore nel worker'));

    this.ready = new Promise<void>((resolve, reject) => (this.readyHandlers = { resolve, reject }));
    this.ready.catch(() => undefined);
    worker.postMessage({ type: 'init', modelId: c.modelId, device: c.device, local: c.local });
    return this.ready;
  }

  /** Genera una risposta: chiama onToken per ogni pezzo di testo in arrivo, poi risolve col testo completo. */
  async generate(messages: ChatMessage[], onToken: (t: string) => void): Promise<string> {
    await this.ensure();
    const id = ++this.seq;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onToken });
      this.worker!.postMessage({ type: 'generate', id, messages });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
  }

  private onMessage(data: { type: string; id?: number; text?: string; message?: string; p?: any }): void {
    switch (data.type) {
      case 'progress': {
        const p = data.p ?? {};
        if (p.status === 'progress' && typeof p.progress === 'number') {
          this.store.setStatus('slm', { progress: p.progress / 100, message: p.file ?? 'Download…' });
        }
        break;
      }
      case 'ready':
        this.store.setStatus('slm', { state: 'ready', progress: 1, message: this.settings.value().slm.modelId });
        this.readyHandlers?.resolve();
        break;
      case 'token':
        this.pending.get(data.id!)?.onToken(data.text ?? '');
        break;
      case 'result':
        this.pending.get(data.id!)?.resolve(data.text ?? '');
        this.pending.delete(data.id!);
        break;
      case 'error': {
        const err = new Error(data.message);
        if (data.id !== undefined && this.pending.has(data.id)) {
          this.pending.get(data.id)!.reject(err);
          this.pending.delete(data.id);
        } else {
          this.fail(err);
        }
        break;
      }
    }
  }

  private fail(err: Error): void {
    this.store.setStatus('slm', { state: 'error', message: err.message });
    this.readyHandlers?.reject(err);
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
  }
}
