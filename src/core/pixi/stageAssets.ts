// The assets a mounted stage holds. The ownership rules (ref counts shared across stages, release while loading, retry after a
// failed load) are the shared registry's: see AssetRegistry.ts and AssetLoader.ts. PixiStage takes a lease on mount and
// releases it after the Application is destroyed.
export { acquireAssets as acquireStageAssets } from './AssetLoader';
