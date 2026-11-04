/** Sintesi vocale sul dispositivo (Web Speech API). */

export interface SpeechVoice {
  uri: string;
  name: string;
  lang: string;
  local: boolean;
  default: boolean;
}

/** Restituisce tutte le voci disponibili sul dispositivo. */
export function getAvailableVoices(): SpeechVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().map((v) => ({
    uri: v.voiceURI,
    name: v.name,
    lang: v.lang,
    local: v.localService,
    default: v.default,
  }));
}

/** Filtra le voci per lingua (corrispondenza esatta oppure sulla lingua base, es. "en" per "en-US"). */
export function voicesFor(voices: SpeechVoice[], lang: string): SpeechVoice[] {
  const exact = lang.toLowerCase();
  const base = exact.split('-')[0];
  return voices.filter((v) => {
    const l = v.lang.toLowerCase();
    return l === exact || l.startsWith(base);
  });
}

/**
 * Registra un callback richiamato quando l'elenco delle voci cambia
 * (alcuni browser caricano le voci in modo asincrono). Restituisce la funzione di deregistrazione.
 */
export function onVoicesChanged(cb: () => void): () => void {
  if (!('speechSynthesis' in window)) return () => {};
  const handler = () => cb();
  window.speechSynthesis.addEventListener('voiceschanged', handler);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler);
}

export function speak(text: string, lang = 'it-IT', rate = 0.95, voiceUri?: string): boolean {
  if (!('speechSynthesis' in window) || !text.trim()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  if (voiceUri) {
    const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceUri);
    if (voice) u.voice = voice;
  }
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
