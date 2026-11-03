import { Injectable, inject } from '@angular/core';
import { FaceLandmarker, FilesetResolver, HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import { ModelStore } from './model-store.service';
import { SettingsService } from './settings.service';

// Runtime WASM copiato da `npm run offline` in public/vendor.
const WASM_URL = '/vendor/mediapipe/wasm';

@Injectable({ providedIn: 'root' })
export class MediaPipeService {
  private readonly store = inject(ModelStore);
  private readonly settings = inject(SettingsService);
  private vision?: ReturnType<typeof FilesetResolver.forVisionTasks>;

  private fileset() {
    return (this.vision ??= FilesetResolver.forVisionTasks(WASM_URL));
  }

  /** Prova la GPU e, se fallisce, ripiega sulla CPU. */
  private async withDelegate<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
    const wanted = this.settings.value().delegate;
    try {
      return await create(wanted);
    } catch (e) {
      if (wanted === 'CPU') throw e;
      return create('CPU');
    }
  }

  async hand(): Promise<HandLandmarker> {
    const [fileset, buf] = await Promise.all([this.fileset(), this.store.load('hand')]);
    return this.withDelegate((delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
      }),
    );
  }

  async face(): Promise<FaceLandmarker> {
    const [fileset, buf] = await Promise.all([this.fileset(), this.store.load('face')]);
    return this.withDelegate((delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
    );
  }

  async segmenter(): Promise<ImageSegmenter> {
    const [fileset, buf] = await Promise.all([this.fileset(), this.store.load('segmenter')]);
    return this.withDelegate((delegate) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    );
  }
}
