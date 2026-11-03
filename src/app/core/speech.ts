/** Sintesi vocale sul dispositivo (Web Speech API). */
export function speak(text: string, lang = 'it-IT', rate = 0.95): boolean {
  if (!('speechSynthesis' in window) || !text.trim()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
