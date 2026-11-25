// Typed translator for Higher or Lower: keys are this game's dictionary plus the shared core keys.
import { makeTranslator } from 'core/i18n/react';

import type en from './en';

export const { t, useT } = makeTranslator<typeof en>();
export type HolKey = keyof typeof en;
