import { Injectable, inject } from '@angular/core';
import { ModelStore } from './model-store.service';
import { SettingsService } from './settings.service';

interface Pending {
  resolve: (v: number[][]) => void;
  reject: (e: Error) => void;
}

@Injectable({ providedIn: 'root' })
export class EmbeddingService {
  private readonly settings = inject(SettingsService);
  private readonly store = inject(ModelStore);

  private worker?: Worker;
  private key = '';
  private ready?: Promise<void>;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readyHandlers?: { resolve: () => void; reject: (e: Error) => void };

  /** Identificativo del modello attivo: serve a sapere se l'indice è ancora valido. */
  get modelKey(): string {
    const c = this.settings.value().embedding;
    return `${c.modelId}|${c.local ? 'local' : 'hub'}`;
  }

  ensure(): Promise<void> {
    const c = this.settings.value().embedding;
    const key = `${this.modelKey}|${c.device}`;
    if (this.worker && key === this.key && this.ready) return this.ready;

    this.worker?.terminate();
    this.key = key;
    this.store.setStatus('embedding', { state: 'loading', progress: 0, message: 'Avvio…' });

    const worker = new Worker(new URL('./embedding.worker', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }) => this.onMessage(data);
    worker.onerror = (e) => this.fail(new Error(e.message || 'Errore nel worker'));

    this.ready = new Promise<void>((resolve, reject) => (this.readyHandlers = { resolve, reject }));
    this.ready.catch(() => undefined);
    worker.postMessage({ type: 'init', modelId: c.modelId, device: c.device, local: c.local });
    return this.ready;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    await this.ensure();
    const id = ++this.seq;
    const vectors = await new Promise<number[][]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: 'embed', id, texts });
    });
    return vectors.map((v) => Float32Array.from(v));
  }

  private onMessage(data: { type: string; id?: number; vectors?: number[][]; message?: string; p?: any }): void {
    switch (data.type) {
      case 'progress': {
        const p = data.p ?? {};
        if (p.status === 'progress' && typeof p.progress === 'number') {
          this.store.setStatus('embedding', { progress: p.progress / 100, message: p.file ?? 'Download…' });
        }
        break;
      }
      case 'ready':
        this.store.setStatus('embedding', { state: 'ready', progress: 1, message: this.settings.value().embedding.modelId });
        this.readyHandlers?.resolve();
        break;
      case 'result':
        this.pending.get(data.id!)?.resolve(data.vectors!);
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
    this.store.setStatus('embedding', { state: 'error', message: err.message });
    this.readyHandlers?.reject(err);
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
  }
}
