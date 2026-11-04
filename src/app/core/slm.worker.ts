/// <reference lib="webworker" />
import { env, pipeline, TextStreamer } from '@huggingface/transformers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any;

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
      generator = await (pipeline as any)('text-generation', data.modelId, {
        device,
        dtype: device === 'webgpu' ? 'q4f16' : 'q4',
        progress_callback: (p: unknown) => postMessage({ type: 'progress', p }),
      });
      postMessage({ type: 'ready' });
    } else if (data.type === 'generate') {
      // Lo streamer invia i pezzi di testo appena vengono generati.
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => postMessage({ type: 'token', id: data.id, text }),
      });
      const out = await generator(data.messages, {
        max_new_tokens: data.maxNewTokens ?? 256,
        do_sample: true,
        temperature: data.temperature ?? 0.7,
        streamer,
      });
      const content = out[0]?.generated_text?.at(-1)?.content ?? '';
      postMessage({ type: 'result', id: data.id, text: content });
    }
  } catch (e) {
    postMessage({ type: 'error', id: data.id, message: e instanceof Error ? e.message : String(e) });
  }
});
