import './cardpick.css';

import { useState } from 'react';

import { useSound, useSoundSettings } from 'core/audio/react';
import type { GameScreenProps } from 'core/game/defineGame';
import { useApiMessage } from 'core/hooks/useApiMessage';
import { CanvasFrame } from 'core/pixi/CanvasFrame';
import { PixiStage } from 'core/pixi/PixiStage';
import { formatMoney } from 'core/services/money';
import { GameHeader } from 'core/ui/GameHeader';
import { GameLayout } from 'core/ui/GameLayout';
import { StakeChips } from 'core/ui/StakeChips';

import { CARD_COUNT, type CardPickApi, type InitResponse, type PlayResponse } from './api/types';
import { cardpickCanvas, cardpickPixiConfig } from './pixi/config/game.config';
import { type CardPickSceneEvent, type CardPickSceneProps, CardPickScene } from './pixi/view/CardPickScene';
import { cardpickSounds } from './sound/sound.config';

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Not enough balance for that stake.',
  INVALID_STAKE: 'That stake is not allowed.',
  INVALID_PICK: 'That card cannot be picked.',
};

const createScene = () => new CardPickScene();

/**
 * Card Pick: pick one of three cards, the server turns them over. React owns the screen, the stake, the backend call, the sounds
 * and the controls; the Pixi scene only draws the cards and reports a tap. Every canvas pick also exists as a keyboard-accessible
 * button ("Pick card N") that calls the same `pick`.
 */
export function CardPickScreen({ api, init }: GameScreenProps<CardPickApi, InitResponse>) {
  const { currency, stakes } = init;
  const [balance, setBalance] = useState(init.balance);
  const [stake, setStake] = useState(stakes[0]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [result, setResult] = useState<PlayResponse | null>(null);
  const { message, setMessage, fail } = useApiMessage(ERROR_TEXT);
  // Audio is optional and lazy: useSound loads the sound code and files after the screen, and unlocks on the first tap or key.
  const sound = useSound(cardpickSounds, { storageKey: 'cardpick.sound' });
  const settings = useSoundSettings(sound?.service ?? null);

  /** The one action: a canvas tap and a keyboard button both land here. */
  const pick = async (index: number) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setResult(null);
    setPending(index);
    sound?.manager.handle('PICK');
    try {
      const r = await api.play(stake, index);
      setBalance(r.balance);
      setResult(r);
      sound?.manager.handle('REVEAL');
    } catch (e) {
      fail(e);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const sceneProps: CardPickSceneProps = {
    enabled: !busy,
    picked: result?.pick ?? pending,
    winning: result?.winningIndex ?? null,
  };
  const onSceneEvent = (event: CardPickSceneEvent) => {
    if (event.type === 'pick') void pick(event.index);
  };

  return (
    <GameLayout
      className="cardpick"
      header={<GameHeader title="Card Pick" balance={balance} currency={currency} />}
      stage={
        <div className="cardpick-stage">
          <CanvasFrame config={cardpickCanvas} fill className="cardpick-canvas">
            <PixiStage
              critical
              scene={createScene}
              props={sceneProps}
              assets={cardpickPixiConfig.assets}
              onEvent={onSceneEvent}
            />
          </CanvasFrame>
          <p className={`cardpick-result ${result ? (result.won ? 'won' : 'lost') : ''}`} role="status">
            {result ? (result.won ? `You won ${formatMoney(result.payout, currency)}` : 'No win this time') : ''}
          </p>
        </div>
      }
      controls={
        <>
          <StakeChips stakes={stakes} value={stake} onChange={setStake} currency={currency} disabled={busy} />
          <div className="cardpick-picks">
            {Array.from({ length: CARD_COUNT }, (_, i) => (
              <button key={i} className="pbf-btn" disabled={busy} onClick={() => void pick(i)}>
                Pick card {i + 1}
              </button>
            ))}
          </div>
          {message && <p className="pbf-footer-note">{message}</p>}
          <button
            className="pbf-btn"
            aria-pressed={!!settings?.muted}
            onClick={() => sound?.service.setMuted(!settings?.muted)}
          >
            {settings?.muted ? 'Sound off' : 'Sound on'}
          </button>
        </>
      }
      info={<p className="pbf-footer-note">Mock backend: outcomes and balance are simulated. 18+</p>}
    />
  );
}
