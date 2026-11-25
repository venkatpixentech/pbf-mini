import { useCoreT } from 'core/i18n/react';
import { compareMoney, formatMoney } from 'core/services/money';

type Props = {
  stakes: number[];
  value: number;
  onChange: (stake: number) => void;
  currency: string;
  disabled?: boolean;
  label?: string;
};

/** Stake selector shared by the games. The server still validates every stake. */
export function StakeChips({ stakes, value, onChange, currency, disabled, label }: Props) {
  const t = useCoreT();
  return (
    <div className="stake-chips" role="group" aria-label={label ?? t('common.stake')}>
      {stakes.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={compareMoney(s, value) === 0}
          disabled={disabled}
          onClick={() => onChange(s)}
        >
          {formatMoney(s, currency)}
        </button>
      ))}
    </div>
  );
}
