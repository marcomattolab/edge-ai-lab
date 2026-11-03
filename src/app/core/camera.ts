export interface CameraHandle {
  stop(): void;
}

export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Webcam non disponibile: serve HTTPS oppure localhost.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return {
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** Esegue `cb` a ogni frame di rendering. Restituisce la funzione di stop. */
export function frameLoop(cb: (now: number) => void): () => void {
  let id = 0;
  let on = true;
  const tick = (now: number) => {
    if (!on) return;
    cb(now);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => {
    on = false;
    cancelAnimationFrame(id);
  };
}

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
