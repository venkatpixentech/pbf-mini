import { useCallback, useState } from 'react';

import { hasKey, translate, type Vars } from 'core/i18n';
import { useLanguage } from 'core/i18n/react';
import { ApiError } from 'core/services/apiError';

type Message = { text: string; vars?: Vars };

/**
 * Player-facing message state plus a `fail` that maps a backend error code to the game's copy.
 * A message (and each value of `errorText`) is either a translation key, which is translated when it is shown so
 * it follows a language switch, or plain text, shown as it is.
 */
export function useApiMessage(errorText: Record<string, string>) {
  const [raw, setRaw] = useState<Message | null>(null);
  useLanguage();
  const setMessage = useCallback(
    (text: string | null, vars?: Vars) => setRaw(text === null ? null : { text, vars }),
    [],
  );
  const fail = useCallback(
    (error: unknown) => {
      const code = error instanceof ApiError ? error.code : null;
      const shared = code && hasKey(`common.error.${code}`) ? `common.error.${code}` : 'common.error.generic';
      setRaw({ text: (code && errorText[code]) || shared });
    },
    [errorText],
  );
  const message = raw && (hasKey(raw.text) ? translate(raw.text, raw.vars) : raw.text);
  return { message, setMessage, fail };
}
