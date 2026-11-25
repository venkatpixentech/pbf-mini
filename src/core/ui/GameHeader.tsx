import type { ReactNode } from 'react';

import { useCoreT } from 'core/i18n/react';
import { formatMoney } from 'core/services/money';

type Props = { title: ReactNode; eyebrow?: string; balance: number; currency: string; children?: ReactNode };

/**
 * Generic game header: optional eyebrow, uppercase display title (with optional pills), balance pill on the right.
 * The core carries no brand: a game passes its own eyebrow (e.g. a publisher name) if it wants one.
 */
export function GameHeader({ title, eyebrow, balance, currency, children }: Props) {
  const t = useCoreT();
  return (
    <header className="pbf-header">
      <div>
        {eyebrow && <span className="pbf-eyebrow">{eyebrow}</span>}
        <h1 className="pbf-title">
          {title} {children}
        </h1>
      </div>
      <div className="pbf-balance" aria-label={t('common.balance')}>
        <small>{t('common.balance')}</small>
        {formatMoney(balance, currency)}
      </div>
    </header>
  );
}
