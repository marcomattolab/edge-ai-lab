// Prepara tutto il necessario per usare l'app senza internet.
//   npm run offline                 copia i runtime da node_modules e scarica i modelli
//   npm run offline -- --webgpu     scarica anche i pesi fp32 per WebGPU (circa 470 MB)
//   npm run offline -- --skip-models  copia solo i runtime
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = new Set(process.argv.slice(2));
const PUBLIC = 'public';
const out = (...p) => join(PUBLIC, ...p);
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

function copy(from, to, filter = () => true) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from).filter(filter)) {
    cpSync(join(from, f), join(to, f));
  }
  console.log(`✔ ${to}`);
}

// 1) Runtime WASM già presenti in node_modules
copy('node_modules/@mediapipe/tasks-vision/wasm', out('vendor/mediapipe/wasm'));
copy('node_modules/onnxruntime-web/dist', out('vendor/ort'), (f) =>
  /^ort-wasm-simd-threaded(\.jsep|\.jspi|\.asyncify)?\.(mjs|wasm)$/.test(f),
);
copy('node_modules/tesseract.js-core', out('vendor/tesseract-core'), (f) => f.endsWith('.wasm.js'));
copy('node_modules/tesseract.js/dist', out('vendor/tesseract'), (f) => f === 'worker.min.js');

// 2) File da scaricare (modelli e dati lingua)
const GCS = 'https://storage.googleapis.com/mediapipe-models';
const HF = 'https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main';
const TESS = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main';

const files = [
  { url: `${GCS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, to: out('models/mediapipe/hand_landmarker.task') },
  { url: `${GCS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, to: out('models/mediapipe/face_landmarker.task') },
  { url: `${GCS}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`, to: out('models/mediapipe/selfie_segmenter.tflite') },
  { url: `${TESS}/ita.traineddata`, to: out('vendor/tessdata/ita.traineddata') },
  { url: `${TESS}/eng.traineddata`, to: out('vendor/tessdata/eng.traineddata') },
  ...['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'].map((f) => ({
    url: `${HF}/${f}`,
    to: out('models/Xenova/paraphrase-multilingual-MiniLM-L12-v2', f),
  })),
  { url: `${HF}/special_tokens_map.json`, to: out('models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/special_tokens_map.json'), optional: true },
];
if (args.has('--webgpu')) {
  files.push({ url: `${HF}/onnx/model.onnx`, to: out('models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/onnx/model.onnx') });
}

const failed = [];
if (!args.has('--skip-models')) {
  for (const f of files) {
    if (existsSync(f.to) && statSync(f.to).size > 0) {
      console.log(`= ${f.to} (già presente)`);
      continue;
    }
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(f.to), { recursive: true });
      writeFileSync(f.to, buf);
      console.log(`✔ ${f.to} (${mb(buf.length)})`);
    } catch (e) {
      if (f.optional) continue;
      failed.push(f);
      console.warn(`✘ ${f.to}: ${e.message}\n  scaricalo a mano da ${f.url}`);
    }
  }
}
console.log(failed.length ? `\nMancano ${failed.length} file: controlla la connessione e rilancia il comando.` : '\nTutto pronto.');
process.exitCode = failed.length ? 1 : 0;
