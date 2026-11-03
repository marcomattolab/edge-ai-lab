export type MpSlot = 'hand' | 'face' | 'segmenter';
export type Slot = MpSlot | 'embedding' | 'ocr' | 'captioning';

export interface ModelSource {
  kind: 'url' | 'file';
  url: string;
  fileName?: string;
}

export interface AppSettings {
  delegate: 'GPU' | 'CPU';
  models: Record<MpSlot, ModelSource>;
  embedding: { modelId: string; device: 'webgpu' | 'wasm'; local: boolean };
  ocr: { lang: string; langPath: string };
  captioning: { modelId: string; device: 'webgpu' | 'wasm'; local: boolean };
}

const LOCAL = '/models/mediapipe';

export const DEFAULT_SETTINGS: AppSettings = {
  delegate: 'GPU',
  models: {
    hand: {
      kind: 'url',
      url: `${LOCAL}/hand_landmarker.task`,
    },
    face: {
      kind: 'url',
      url: `${LOCAL}/face_landmarker.task`,
    },
    segmenter: {
      kind: 'url',
      url: `${LOCAL}/selfie_segmenter.tflite`,
    },
  },
  embedding: { modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', device: 'wasm', local: true },
  ocr: { lang: 'ita+eng', langPath: '/vendor/tessdata' },
  captioning: { modelId: 'Xenova/vit-gpt2-image-captioning', device: 'wasm', local: false },
};

export const SLOT_INFO: Record<Slot, { title: string; hint: string }> = {
  hand: { title: 'Hand Landmarker', hint: 'Usato da Pinch & Scroll (.task)' },
  face: { title: 'Face Landmarker', hint: 'Usato dal Cursore con la testa (.task)' },
  segmenter: { title: 'Selfie Segmenter', hint: 'Usato dallo Sfondo intelligente (.tflite)' },
  embedding: { title: 'Embeddings', hint: 'Usato dalla Ricerca semantica (Transformers.js)' },
  ocr: { title: 'OCR', hint: 'Usato da OCR, redazione dati personali e Assistente visivo (Tesseract)' },
  captioning: { title: 'Descrizione immagini', hint: 'Usato dall\'Assistente visivo (Transformers.js, image-to-text)' },
};
