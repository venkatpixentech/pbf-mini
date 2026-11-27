// PixDynamicSprite: adapted from the legacy framework's corelib/pixiwrapper/PixDynamicSprite.ts (kept in legacy/corelib). Same members
// (showImage, updateImage, cleanUpGPU, getWidth, getHeight, the IMAGE_LOADED event, the bounding rectangle with `isForced`); changed, and why:
//  - Loading: each URL is a lease on the shared asset registry machinery (AssetRegistry.ts, key = URL), so two sprites showing the same
//    image share one request and the last release unloads it. The legacy sprite called Assets.load directly and kept the texture for good.
//  - Stale results: a URL change or destroy while an image is loading is ignored when it arrives (the lease is released, nothing is drawn).
//  - Safety: only http(s) image URLs from the page origin or a configured allowlist are requested (PixDynamicSpriteStep.ts).
//  - Failure: a failed or refused image shows the fallback (nothing, or a texture you pass) and calls `onFailed`; no global event bus.
//  - Gone: the global protect registries, the loader sprite, the CORS-retry callback and the BaseView parent.
import { Container, Sprite, Texture, Assets } from 'pixi.js';

import { type AssetBackend, type AssetLease, createAssetRegistry } from '../AssetRegistry';
import { checkImageUrl, imageSizeInRect, type RectFit } from './PixDynamicSpriteStep';

type RemoteImage = { url: string };

/** Remote images share one registry, so one URL shown by two sprites is one request. */
const backend: AssetBackend<RemoteImage> = {
  async load({ url }) {
    if (!Assets.resolver.hasKey(url)) Assets.add({ alias: url, src: url });
    await Assets.load(url);
  },
  async unload({ url }) {
    if (Assets.cache.has(url)) await Assets.unload(url);
  },
};

const registry = createAssetRegistry<RemoteImage>(backend, {
  keyOf: (a) => a.url,
  same: (a, b) => a.url === b.url,
  label: 'Remote image',
});

/** Reference counts and load state per URL, for tests. */
export const remoteImageStats = () => registry.stats();

export type DynamicSpriteOptions = {
  /** Origins other than the page's that images may come from. */
  allowedOrigins?: string[];
  /** The rectangle an image is fitted into. */
  boundingRect?: RectFit;
  /** Shown while loading and when an image fails or is refused. */
  fallback?: Texture;
  onLoaded?: (sprite: PixDynamicSprite) => void;
  onFailed?: (url: string, error: unknown) => void;
};

export class PixDynamicSprite extends Container {
  public static readonly IMAGE_LOADED = 'imageLoaded';

  private readonly image = new Sprite(Texture.EMPTY);
  private lease: AssetLease | null = null;
  private url = '';
  /** Bumped by every showImage, updateImage and destroy: a result that arrives for an older value is ignored. */
  private token = 0;
  private options: DynamicSpriteOptions;

  constructor(options: DynamicSpriteOptions = {}) {
    super();
    this.options = options;
    this.addChild(this.image);
    this.image.anchor.set(0.5);
    this.showFallback();
  }

  /** The URL currently shown or loading ('' when none). */
  get currentUrl(): string {
    return this.url;
  }

  set boundingRect(rect: RectFit | undefined) {
    this.options.boundingRect = rect;
    if (this.lease && this.image.texture !== Texture.EMPTY && this.image.texture !== this.options.fallback) this.fit();
  }

  /** Shows an image from a URL (the legacy showImage). Returns false when the URL is refused. */
  public showImage(image: string): boolean {
    const verdict = checkImageUrl(image, document.baseURI, this.options.allowedOrigins);
    this.token++;
    const mine = this.token;
    this.dropLease();
    if (!verdict.ok) {
      this.url = '';
      this.showFallback();
      this.options.onFailed?.(image, new Error(`Image URL refused (${verdict.reason})`));
      return false;
    }
    this.url = verdict.url;
    this.showFallback();
    const lease = registry.acquire([{ url: verdict.url }]);
    this.lease = lease;
    lease.ready.then(
      () => {
        if (mine !== this.token || this.destroyed) return; // the URL changed or the sprite is gone: nothing to draw
        this.image.texture = Assets.get<Texture>(verdict.url) ?? Texture.EMPTY;
        this.fit();
        this.emit(PixDynamicSprite.IMAGE_LOADED, this);
        this.options.onLoaded?.(this);
      },
      (error: unknown) => {
        if (mine !== this.token || this.destroyed) return;
        this.showFallback();
        this.options.onFailed?.(verdict.url, error);
      },
    );
    return true;
  }

  /** Same as showImage (the legacy updateImage swapped the texture for another image). */
  public updateImage(image: string): boolean {
    return this.showImage(image);
  }

  /** Gives the image back (the legacy cleanUpGPU unloaded it). The sprite shows its fallback afterwards. */
  public cleanUpGPU(): void {
    this.token++;
    this.url = '';
    this.dropLease();
    this.showFallback();
  }

  getWidth(): number {
    return this.image.width;
  }

  getHeight(): number {
    return this.image.height;
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.token++;
    this.dropLease();
    // The shared texture belongs to the asset registry, never to this sprite, so it is never destroyed here.
    super.destroy({ children: true, texture: false, textureSource: false });
  }

  private dropLease() {
    this.lease?.release();
    this.lease = null;
  }

  private showFallback() {
    this.image.texture = this.options.fallback ?? Texture.EMPTY;
    this.image.scale.set(1);
    if (this.options.fallback) this.fit();
  }

  private fit() {
    const tex = this.image.texture;
    const rect = this.options.boundingRect;
    this.image.scale.set(1);
    if (!rect) return;
    const size = imageSizeInRect({ width: tex.width, height: tex.height }, rect);
    this.image.width = size.width;
    this.image.height = size.height;
  }
}
