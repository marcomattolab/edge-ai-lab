import { Injectable, effect, signal } from '@angular/core';
import { AppSettings, DEFAULT_SETTINGS } from './defaults';

const KEY = 'edge-ai-lab.settings.v2';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly value = signal<AppSettings>(this.read());

  constructor() {
    effect(() => localStorage.setItem(KEY, JSON.stringify(this.value())));
  }

  update(fn: (s: AppSettings) => AppSettings): void {
    this.value.update(fn);
  }

  reset(): void {
    this.value.set(structuredClone(DEFAULT_SETTINGS));
  }

  private read(): AppSettings {
    const fresh = structuredClone(DEFAULT_SETTINGS);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AppSettings> | null;
      if (!saved) return fresh;
      return {
        ...fresh,
        ...saved,
        models: { ...fresh.models, ...saved.models },
        embedding: { ...fresh.embedding, ...saved.embedding },
        ocr: { ...fresh.ocr, ...saved.ocr },
        captioning: { ...fresh.captioning, ...saved.captioning },
      };
    } catch {
      return fresh;
    }
  }
}
