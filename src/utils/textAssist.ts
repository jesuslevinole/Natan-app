/**
 * Traducción y corrección de texto para campos libres (Description, Pending Work).
 * Usa dos servicios públicos gratuitos, directo desde el navegador:
 *  - MyMemory (translated.net) para traducir — sin API key, ~5.000 palabras/día por IP.
 *  - LanguageTool (languagetool.org) para ortografía/gramática — sin API key, textos cortos.
 * Si el servicio no responde (sin internet, límite diario), se lanza un error y la UI
 * muestra el aviso sin tocar el texto.
 */

const MAX_CHARS = 500;

export type Lang = 'es' | 'en';

interface MyMemoryResponse {
  responseStatus: number;
  responseData?: { translatedText?: string };
}

export const translateText = async (text: string, from: Lang, to: Lang): Promise<string> => {
  const q = text.trim().slice(0, MAX_CHARS);
  if (!q) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation service returned ${res.status}`);
  const data = (await res.json()) as MyMemoryResponse;
  const out = data.responseData?.translatedText;
  if (data.responseStatus !== 200 || !out) throw new Error('Translation service unavailable');
  // MyMemory devuelve entidades HTML en algunos casos
  const el = document.createElement('textarea');
  el.innerHTML = out;
  return el.value.trim();
};

interface LTMatch {
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
}

interface LTResponse {
  matches?: LTMatch[];
}

/** Aplica la primera sugerencia de cada error detectado por LanguageTool (idioma autodetectado). */
export const fixWriting = async (text: string): Promise<{ fixed: string; corrections: number }> => {
  const q = text.trim().slice(0, MAX_CHARS);
  if (!q) return { fixed: text, corrections: 0 };
  const body = new URLSearchParams({ text: q, language: 'auto', level: 'default' });
  const res = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Grammar service returned ${res.status}`);
  const data = (await res.json()) as LTResponse;
  const matches = (data.matches ?? []).filter(m => m.replacements.length > 0);
  if (matches.length === 0) return { fixed: q, corrections: 0 };
  // Aplicar de atrás hacia adelante para no invalidar los offsets
  let fixed = q;
  for (const m of [...matches].sort((a, b) => b.offset - a.offset)) {
    fixed = fixed.slice(0, m.offset) + m.replacements[0].value + fixed.slice(m.offset + m.length);
  }
  return { fixed, corrections: matches.length };
};
