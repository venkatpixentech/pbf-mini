import type { ReactNode } from 'react';

import { formatMoney } from 'core/services/money';

type Props = { title: ReactNode; eyebrow?: string; balance: number; currency: string; children?: ReactNode };

/** PBF game header: eyebrow + uppercase display title (with optional pills), balance pill on the right. */
export function GameHeader({ title, eyebrow = 'Playbook', balance, currency, children }: Props) {
  return (
    <header className="pbf-header">
      <div>
        <span className="pbf-eyebrow">{eyebrow}</span>
        <h1 className="pbf-title">
          {title} {children}
        </h1>
      </div>
      <div className="pbf-balance" aria-label="Balance">
        <small>BALANCE</small>
        {formatMoney(balance, currency)}
      </div>
    </header>
  );
}
