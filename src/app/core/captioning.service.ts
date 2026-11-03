import { Injectable, inject } from '@angular/core';
import { ModelStore } from './model-store.service';
import { SettingsService } from './settings.service';

interface Pending {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
}

@Injectable({ providedIn: 'root' })
export class CaptionService {
  private readonly settings = inject(SettingsService);
  private readonly store = inject(ModelStore);

  private worker?: Worker;
  private key = '';
  private ready?: Promise<void>;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readyHandlers?: { resolve: () => void; reject: (e: Error) => void };

  ensure(): Promise<void> {
    const c = this.settings.value().captioning;
    const key = `${c.modelId}|${c.local}|${c.device}`;
    if (this.worker && key === this.key && this.ready) return this.ready;

    this.worker?.terminate();
    this.key = key;
    this.store.setStatus('captioning', { state: 'loading', progress: 0, message: 'Avvio…' });

    const worker = new Worker(new URL('./captioning.worker', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }) => this.onMessage(data);
    worker.onerror = (e) => this.fail(new Error(e.message || 'Errore nel worker'));

    this.ready = new Promise<void>((resolve, reject) => (this.readyHandlers = { resolve, reject }));
    this.ready.catch(() => undefined);
    worker.postMessage({ type: 'init', modelId: c.modelId, device: c.device, local: c.local });
    return this.ready;
  }

  async caption(image: ImageData): Promise<string> {
    await this.ensure();
    const id = ++this.seq;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Il buffer dei pixel viene trasferito (non copiato) al worker.
      this.worker!.postMessage(
        { type: 'caption', id, width: image.width, height: image.height, data: image.data },
        [image.data.buffer as ArrayBuffer],
      );
    });
  }

  private onMessage(data: { type: string; id?: number; text?: string; message?: string; p?: any }): void {
    switch (data.type) {
      case 'progress': {
        const p = data.p ?? {};
        if (p.status === 'progress' && typeof p.progress === 'number') {
          this.store.setStatus('captioning', { progress: p.progress / 100, message: p.file ?? 'Download…' });
        }
        break;
      }
      case 'ready':
        this.store.setStatus('captioning', { state: 'ready', progress: 1, message: this.settings.value().captioning.modelId });
        this.readyHandlers?.resolve();
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
    this.store.setStatus('captioning', { state: 'error', message: err.message });
    this.readyHandlers?.reject(err);
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
  }
}
