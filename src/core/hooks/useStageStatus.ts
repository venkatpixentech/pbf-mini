import { useCallback } from 'react';

import type { Vars } from 'core/i18n';

import type { StageError } from 'core/pixi/PixiStage';

/**
 * The `onError` and `onRecovered` props of a PixiStage, shared by every Pixi screen: a failure shows the shared
 * "display error" message (a translation key, so it follows a language switch) and recovery clears it.
 * `setMessage` is the one from `useApiMessage`.
 */
export function useStageStatus(setMessage: (text: string | null, vars?: Vars) => void) {
  const onError = useCallback((e: StageError) => setMessage('common.display.error', { kind: e.kind }), [setMessage]);
  const onRecovered = useCallback(() => setMessage(null), [setMessage]);
  return { onError, onRecovered };
}
