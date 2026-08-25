// Busca fontes reais do Google Fonts em .woff (v1) — satori só entende
// TTF/OTF/WOFF, não WOFF2. Um User-Agent de Chrome antigo faz o Google
// Fonts responder com .woff em vez de .woff2 (técnica verificada
// empiricamente contra a rede real).
const OLD_CHROME_UA = "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.149 Safari/537.36";

export interface FontFile {
  weight: 400 | 700;
  data: Buffer;
}

const cache = new Map<string, FontFile[]>();

export function parseFontFaceUrls(css: string): { weight: number; url: string }[] {
  const matches: { weight: number; url: string }[] = [];
  const blocks = css.split("@font-face").slice(1);
  for (const block of blocks) {
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const urlMatch = block.match(/url\(([^)]+)\)\s*format\('woff'\)/);
    if (weightMatch && urlMatch) {
      matches.push({ weight: Number(weightMatch[1]), url: urlMatch[1] });
    }
  }
  return matches;
}

export async function fetchGoogleFontFiles(family: string): Promise<FontFile[] | null> {
  if (cache.has(family)) return cache.get(family)!;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  const cssRes = await fetch(cssUrl, { headers: { "User-Agent": OLD_CHROME_UA } });
  if (!cssRes.ok) return null;
  const css = await cssRes.text();
  const faces = parseFontFaceUrls(css);
  if (faces.length === 0) return null;

  const files: FontFile[] = [];
  for (const face of faces) {
    if (face.weight !== 400 && face.weight !== 700) continue;
    const fontRes = await fetch(face.url);
    if (!fontRes.ok) continue;
    const buf = Buffer.from(await fontRes.arrayBuffer());
    files.push({ weight: face.weight as 400 | 700, data: buf });
  }
  if (files.length === 0) return null;
  cache.set(family, files);
  return files;
}

export function clearGoogleFontCache(): void {
  cache.clear();
}
