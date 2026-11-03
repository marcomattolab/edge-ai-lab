import { Injectable, inject } from '@angular/core';
import { createWorker, type Worker as TessWorker } from 'tesseract.js';
import { ModelStore } from './model-store.service';
import { SettingsService } from './settings.service';

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

@Injectable({ providedIn: 'root' })
export class OcrService {
  private readonly settings = inject(SettingsService);
  private readonly store = inject(ModelStore);
  private worker?: TessWorker;
  private key = '';

  async ensure(): Promise<TessWorker> {
    const { lang, langPath } = this.settings.value().ocr;
    const key = `${lang}|${langPath}`;
    if (this.worker && key === this.key) return this.worker;

    await this.worker?.terminate();
    this.worker = undefined;
    this.store.setStatus('ocr', { state: 'loading', progress: 0, message: 'Avvio…' });
    try {
      this.worker = await createWorker(lang, 1, {
        // Worker e core WASM serviti dall'app (public/vendor), così non serve internet.
        workerPath: '/vendor/tesseract/worker.min.js',
        corePath: '/vendor/tesseract-core',
        gzip: false,
        ...(langPath ? { langPath } : {}),
        logger: (m: { status: string; progress: number }) =>
          this.store.setStatus('ocr', { progress: m.progress, message: m.status }),
      });
      this.key = key;
      this.store.setStatus('ocr', { state: 'ready', progress: 1, message: lang });
      return this.worker;
    } catch (e) {
      this.store.setStatus('ocr', { state: 'error', message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  async recognize(image: Blob): Promise<OcrWord[]> {
    const worker = await this.ensure();
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words) {
            if (w.text.trim()) words.push({ text: w.text, ...w.bbox });
          }
    return words;
  }
}
