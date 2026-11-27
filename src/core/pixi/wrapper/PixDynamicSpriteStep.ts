// The rules behind PixDynamicSprite: which image URLs may be loaded, and how a loaded image is fitted into its bounding rectangle. Plain
// TypeScript with no Pixi import, so `PixDynamicSprite.check.ts` runs it in Node. The loading and drawing are in PixDynamicSprite.ts.
import { fitScale } from '../layout.ts';

export type UrlVerdict =
  { ok: true; url: string } | { ok: false; reason: 'empty' | 'invalid' | 'scheme' | 'extension' | 'origin' };

/**
 * Whether an image URL may be requested. It must be an http or https URL (resolved against `base`, so a relative path is the page's own
 * origin), end in a real image file extension (the legacy rule: Pixi cannot pick a parser otherwise and never rejects), and come from the
 * page's own origin or one of `allowedOrigins`. Nothing else is fetched: no `javascript:`, `file:` or credential-carrying URL.
 */
export function checkImageUrl(raw: string | undefined | null, base: string, allowedOrigins: string[] = []): UrlVerdict {
  if (!raw) return { ok: false, reason: 'empty' };
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'scheme' };
  if (url.username || url.password) return { ok: false, reason: 'invalid' };
  const last = url.pathname.split('/').pop() ?? '';
  if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(last)) return { ok: false, reason: 'extension' };
  const own = new URL(base).origin;
  if (url.origin !== own && !allowedOrigins.includes(url.origin)) return { ok: false, reason: 'origin' };
  return { ok: true, url: url.href };
}

export type Size = { width: number; height: number };
export type RectFit = { width: number; height: number; isForced?: boolean };

/** The size to draw an image at inside a bounding rectangle: stretched to it when forced, otherwise scaled to fit (the legacy onImageLoaded). */
export function imageSizeInRect(image: Size, rect: RectFit): Size {
  if (rect.isForced) return { width: rect.width, height: rect.height };
  const k = fitScale(image, rect, 'contain');
  return { width: image.width * k, height: image.height * k };
}
