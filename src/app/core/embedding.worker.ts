/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any;

addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'init') {
      // "local" = cartella /models/<nome> servita dall'app (public/models). Altrimenti Hugging Face Hub.
      env.allowLocalModels = data.local;
      env.allowRemoteModels = !data.local;
      env.localModelPath = '/models/';
      // Runtime ONNX servito dall'app (public/vendor/ort), non da una CDN.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (env.backends.onnx as any).wasm.wasmPaths = '/vendor/ort/';
      const device = data.device as 'webgpu' | 'wasm';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extractor = await (pipeline as any)('feature-extraction', data.modelId, {
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (p: unknown) => postMessage({ type: 'progress', p }),
      });
      postMessage({ type: 'ready' });
    } else if (data.type === 'embed') {
      const out = await extractor(data.texts, { pooling: 'mean', normalize: true });
      postMessage({ type: 'result', id: data.id, vectors: out.tolist() as number[][] });
    }
  } catch (e) {
    postMessage({ type: 'error', id: data.id, message: e instanceof Error ? e.message : String(e) });
  }
});
