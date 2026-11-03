import { Injectable, computed, inject, signal } from '@angular/core';
import { EmbeddingService } from './embedding.service';
import { idb } from './idb';

export interface Chunk {
  id: string;
  doc: string;
  text: string;
  vec: Float32Array;
  model: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

/** Spezza il testo in paragrafi di circa `max` caratteri. */
export function splitText(text: string, max = 500): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (cur && cur.length + para.length > max) {
      out.push(cur);
      cur = '';
    }
    if (para.length > max) {
      for (const s of para.match(/[^.!?]+[.!?]*\s*/g) ?? [para]) {
        if (cur && cur.length + s.length > max) {
          out.push(cur.trim());
          cur = '';
        }
        cur += s;
      }
    } else {
      cur += (cur ? '\n' : '') + para;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

@Injectable({ providedIn: 'root' })
export class SemanticIndexService {
  private readonly embeddings = inject(EmbeddingService);

  readonly chunks = signal<Chunk[]>([]);
  readonly busy = signal(false);
  readonly stale = computed(() => this.chunks().filter((c) => c.model !== this.embeddings.modelKey).length);
  readonly docs = computed(() => [...new Set(this.chunks().map((c) => c.doc))]);

  constructor() {
    idb.all<Chunk>('chunks').then((all) => this.chunks.set(all)).catch(() => undefined);
  }

  async add(doc: string, text: string): Promise<number> {
    const parts = splitText(text);
    if (!parts.length) return 0;
    this.busy.set(true);
    try {
      const model = this.embeddings.modelKey;
      const vectors = await this.embeddings.embed(parts);
      const created = parts.map<Chunk>((t, i) => ({ id: crypto.randomUUID(), doc, text: t, vec: vectors[i], model }));
      await Promise.all(created.map((c) => idb.put('chunks', c.id, c)));
      this.chunks.update((all) => [...all, ...created]);
      return created.length;
    } finally {
      this.busy.set(false);
    }
  }

  async search(query: string, k = 5): Promise<Hit[]> {
    const [q] = await this.embeddings.embed([query]);
    const model = this.embeddings.modelKey;
    return this.chunks()
      .filter((c) => c.model === model)
      .map((chunk) => ({ chunk, score: dot(q, chunk.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async clear(): Promise<void> {
    await idb.clear('chunks');
    this.chunks.set([]);
  }
}

// I vettori sono già normalizzati: il prodotto scalare coincide con la similarità coseno.
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
