/** Error returned by a game backend. Each game narrows `code` to its own union. Shared by every game. */
export class ApiError<C extends string = string> extends Error {
  readonly code: C;
  constructor(code: C) {
    super(code);
    this.code = code;
  }
}

/** Codes every game backend can return during session start (PBF: init errors and maintenance, doc 07). */
export type SessionErrorCode = 'SESSION_INVALID' | 'SESSION_EXPIRED' | 'MAINTENANCE';
