import type { ImageAnalysis } from "../schemas/ai";
import type { Layout } from "../schemas/template";
import type { ResolvedImage } from "./slideComposer";

// Casamento imagem↔slot determinístico — cada mediaId só pode ser usado UMA
// vez em toda a apresentação (usedMediaIds é compartilhado entre chamadas
// pra cada slide). Prefere orientação compatível quando o slot declara
// allowedImageRatio; cai pra qualquer imagem não usada senão.
export function resolveImagesForLayout(
  layout: Layout,
  images: ImageAnalysis[],
  urlByMediaId: Record<string, string>,
  usedMediaIds: Set<string>,
): ResolvedImage[] {
  const resolved: ResolvedImage[] = [];
  const imageSlots = layout.slots.filter((s) => s.kind === "image").sort((a, b) => b.priority - a.priority);

  for (const slot of imageSlots) {
    const candidates = images.filter((img) => !usedMediaIds.has(img.mediaId) && urlByMediaId[img.mediaId]);
    if (candidates.length === 0) continue;

    const preferred = slot.allowedImageRatio ? candidates.find((c) => orientationMatches(c, slot.allowedImageRatio!)) : undefined;
    const chosen = preferred ?? candidates[0];

    usedMediaIds.add(chosen.mediaId);
    resolved.push({ slotId: slot.id, url: urlByMediaId[chosen.mediaId], mediaId: chosen.mediaId });
  }

  return resolved;
}

function orientationMatches(image: ImageAnalysis, allowedRatio: string): boolean {
  if (allowedRatio === "1:1") return image.orientation === "square";
  const [w, h] = allowedRatio.split(":").map(Number);
  if (!w || !h) return true;
  return w >= h ? image.orientation === "landscape" : image.orientation === "portrait";
}
