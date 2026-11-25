// Typed translator for Acca Crash: keys are this game's dictionary plus the shared core keys.
import { makeTranslator } from 'core/i18n/react';

import type en from './en';

export const { t, useT } = makeTranslator<typeof en>();
export type AccaKey = keyof typeof en;
