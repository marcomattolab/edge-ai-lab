import { Injectable, inject, signal } from '@angular/core';
import { MpSlot, Slot } from './defaults';
import { idb } from './idb';
import { SettingsService } from './settings.service';

export interface SlotStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
}

const CACHE = 'edge-ai-models';
const idle = (): SlotStatus => ({ state: 'idle', progress: 0, message: '' });

const match = (b: Uint8Array, offset: number, sig: number[]): boolean =>
  offset >= 0 && offset + sig.length <= b.length && sig.every((v, i) => b[offset + i] === v);

const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];

/** I .task MediaPipe hanno 2 byte di prefisso prima dell'archivio ZIP ("PK.."). */
const isZip = (b: Uint8Array): boolean => {
  for (let i = 0; i + ZIP_SIG.length <= Math.min(b.length, 16); i++) {
    if (match(b, i, ZIP_SIG)) return true;
  }
  return false;
};

/** Magic TFLite (0x1C000000 little-endian). */
const isTflite = (b: Uint8Array): boolean => match(b, 0, [0x1c, 0x00, 0x00, 0x00]);

@Injectable({ providedIn: 'root' })
export class ModelStore {
  private readonly settings = inject(SettingsService);

  readonly status = signal<Record<Slot, SlotStatus>>({
    hand: idle(),
    face: idle(),
    segmenter: idle(),
    embedding: idle(),
    ocr: idle(),
  });

  setStatus(slot: Slot, patch: Partial<SlotStatus>): void {
    this.status.update((s) => ({ ...s, [slot]: { ...s[slot], ...patch } }));
  }

  /** Salva un file scelto dall'utente (IndexedDB) e lo imposta come sorgente dello slot. */
  async saveFile(slot: MpSlot, file: File): Promise<void> {
    try {
      const buf = await file.arrayBuffer();
      this.assertValidModel(slot, new Uint8Array(buf));
      await idb.put('models', slot, { name: file.name, buf });
      this.settings.update((s) => ({
        ...s,
        models: { ...s.models, [slot]: { kind: 'file', url: s.models[slot].url, fileName: file.name } },
      }));
      this.setStatus(slot, { state: 'ready', progress: 1, message: file.name });
    } catch (e) {
      this.setStatus(slot, { state: 'error', message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  /** Restituisce i byte del modello: da file locale oppure da URL (con cache persistente). */
  async load(slot: MpSlot): Promise<Uint8Array> {
    const src = this.settings.value().models[slot];
    this.setStatus(slot, { state: 'loading', progress: 0, message: 'Caricamento…' });
    try {
      let buf: ArrayBuffer;
      if (src.kind === 'file') {
        const rec = await idb.get<{ name: string; buf: ArrayBuffer }>('models', slot);
        if (!rec) throw new Error('Nessun file caricato: scegline uno nelle impostazioni.');
        buf = rec.buf;
      } else {
        buf = await this.fetchCached(slot, src.url, (p) => this.setStatus(slot, { progress: p }));
      }
      if (!(buf instanceof ArrayBuffer)) {
        throw new Error(
          `Dato corrotto per "${slot}": attendevo ArrayBuffer, ricevuto ${buf === null ? 'null' : typeof buf}. Svuota la cache modelli e riprova.`,
        );
      }
      const bytes = new Uint8Array(buf);
      this.assertValidModel(slot, bytes);
      this.setStatus(slot, { state: 'ready', progress: 1, message: src.kind === 'file' ? (src.fileName ?? '') : 'In cache' });
      return bytes;
    } catch (e) {
      this.setStatus(slot, { state: 'error', message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  async clearCache(): Promise<void> {
    await caches.delete(CACHE);
    await idb.clear('models');
    this.status.set({ hand: idle(), face: idle(), segmenter: idle(), embedding: idle(), ocr: idle() });
  }

  private async fetchCached(slot: MpSlot, url: string, onProgress: (p: number) => void): Promise<ArrayBuffer> {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (this.isValidModel(slot, bytes)) return bytes.buffer;
      // Cache corrotta (es. fallback SPA salvato al posto del modello): ricarica.
      await cache.delete(url);
    }

    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download fallito (HTTP ${res.status})`);
    if ((res.headers.get('content-type') ?? '').includes('text/html')) {
      throw new Error(`Modello non trovato su "${url}". Esegui "npm run offline" o carica il file nelle impostazioni.`);
    }
    const total = Number(res.headers.get('content-length') ?? 0);
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      if (total) onProgress(got / total);
    }
    const bytes = new Uint8Array(await new Blob(parts as unknown as BlobPart[]).arrayBuffer());
    this.assertValidModel(slot, bytes);
    await cache.put(url, new Response(new Blob([bytes])));
    return bytes.buffer;
  }

  private isValidModel(slot: MpSlot, bytes: Uint8Array): boolean {
    return slot === 'segmenter' ? isTflite(bytes) : isZip(bytes);
  }

  private assertValidModel(slot: MpSlot, bytes: Uint8Array): void {
    if (this.isValidModel(slot, bytes)) return;
    const expected = slot === 'segmenter' ? 'TFLite (.tflite)' : 'MediaPipe task (.task, ZIP)';
    throw new Error(
      `Il modello "${slot}" non è un ${expected} valido (${bytes.length} byte). Esegui "npm run offline" o carica un file corretto.`,
    );
  }
}
