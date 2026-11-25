import { useCallback, useState } from 'react';

import { ApiError } from 'core/services/apiError';

/** Player-facing message state plus a `fail` that maps a backend error code to the game's copy. */
export function useApiMessage(errorText: Record<string, string>) {
  const [message, setMessage] = useState<string | null>(null);
  const fail = useCallback(
    (error: unknown) =>
      setMessage(
        error instanceof ApiError ? (errorText[error.code] ?? 'Something went wrong.') : 'Something went wrong.',
      ),
    [errorText],
  );
  return { message, setMessage, fail };
}
