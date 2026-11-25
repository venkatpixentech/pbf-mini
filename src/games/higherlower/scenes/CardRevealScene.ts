import { Container, type Text, type Ticker } from 'pixi.js';

import { buildElements } from 'core/pixi/buildView';
import type { PixiScene, SceneContext, StageAsset } from 'core/pixi/scene';
import { TIER_COLORS, type Tier } from 'core/pixi/theme';

import { BACK, CARD, cardRevealConfig, FACE, NATIONS, type Nation, VS } from './cardReveal.config';

export type { Nation, Tier };
export { NATIONS };
export type Card = {
  name: string;
  club: string;
  position: string;
  nation: Nation;
  ovr: number;
  attack: number;
  creativity: number;
  defence: number;
  tier: Tier;
};
export type CardRevealProps = { current: Card; next: Card | null };
export type CardRevealEvent = { type: 'REVEAL_DONE'; ovr: number; tier: Tier };

export const CARD_REVEAL_ASSETS: StageAsset[] = cardRevealConfig.assets;

const { timings: T, layout } = cardRevealConfig;
const { width: W, height: H } = CARD;

/** Builds the card face from the FACE config; every part keeps its config id so the reveal can animate it. */
const cardFace = (card: Card) =>
  buildElements(FACE, {
    ...card,
    tierName: card.tier,
    face: TIER_COLORS[card.tier].face,
    rim: TIER_COLORS[card.tier].rim,
  });
const cardBack = () => buildElements(BACK);

/** Current card face up, next card face down; flips when `next` arrives, then emits REVEAL_DONE. */
export class CardRevealScene implements PixiScene<CardRevealProps, CardRevealEvent> {
  private ctx!: SceneContext<CardRevealEvent>;
  private left = new Container();
  private right = new Container();
  private vs = buildElements(VS);
  /** The face-down card, built once and reused every time the right slot goes back to face down. */
  private back = cardBack();
  private shown: CardRevealProps | null = null;
  /** Stops the reveal in progress (if any). One reveal runs at a time. */
  private stopFlip: (() => void) | null = null;
  private disposed = false;

  init(ctx: SceneContext<CardRevealEvent>, props: CardRevealProps) {
    this.ctx = ctx;
    ctx.root.addChild(this.left, this.right, this.vs);
    ctx.track(() => this.cancelFlip()); // one disposer for every reveal this scene runs
    this.update(props);
  }

  update(props: CardRevealProps) {
    const prev = this.shown;
    this.shown = props;
    if (!prev || prev.current !== props.current) this.swap(this.left, cardFace(props.current));
    if (props.next && props.next !== prev?.next) {
      this.cancelFlip();
      this.flip(props.next);
    } else if (!props.next) {
      this.cancelFlip();
      this.showBack();
    }
  }

  resize(width: number, height: number) {
    const scale = Math.min(1, width / (W * layout.fitWidth), height / (H * layout.fitHeight));
    this.left.scale.set(scale);
    this.right.scale.set(scale); // flip() animates scale.x relative to scale.y
    this.left.position.set(width / 2 - W * layout.gap * scale, height / 2);
    this.right.position.set(width / 2 + W * layout.gap * scale, height / 2);
    this.vs.scale.set(scale);
    this.vs.position.set(width / 2, height / 2);
  }

  destroy() {
    // Safe before or after the stage tears down: once `disposed` is set it only removes the ticker callback
    // and touches no display object.
    this.disposed = true;
    this.cancelFlip();
    this.shown = null;
    if (!this.back.destroyed) this.back.destroy({ children: true }); // may be detached while a face is shown
  }

  /** Stops the reveal in progress. Idempotent. An interrupted reveal is fully reset: the slot goes back to the face-down card. */
  private cancelFlip() {
    const stop = this.stopFlip;
    this.stopFlip = null;
    if (!stop) return;
    stop();
    if (!this.disposed) this.showBack();
  }

  /** Reveal finished normally: stop the ticker and keep the revealed face. */
  private finishFlip() {
    this.stopFlip?.();
    this.stopFlip = null;
  }

  private swap(slot: Container, content: Container) {
    for (const child of slot.removeChildren()) if (child !== this.back) child.destroy({ children: true });
    slot.addChild(content);
  }

  /** Face-down card in the right slot, unsquashed, reusing the same objects. No-op if already shown. */
  private showBack() {
    if (this.disposed || this.right.destroyed) return;
    if (this.right.children.length !== 1 || this.right.children[0] !== this.back) this.swap(this.right, this.back);
    this.right.scale.x = this.right.scale.y; // undo a half-finished flip squash
  }

  /**
   * Staged reveal (all timings in cardReveal.config.ts): flip, badge pops in, name slides up, position fades,
   * team (flag + club) fades, stats fade in together, OVR rolls through random values and lands with a pop,
   * then REVEAL_DONE.
   */
  private flip(card: Card) {
    const ticker = this.ctx.app.ticker;
    this.showBack(); // every reveal starts from the same state: face down, unsquashed
    const face = cardFace(card);
    const part = (label: string) => face.getChildByLabel(label)!;
    const ovr = part('ovr') as Text;
    const [position, badge, name, team, stats, tier] = [
      part('position'),
      part('badge'),
      part('name'),
      part('team'),
      part('stats'),
      part('tier'),
    ];
    const tierAlpha = tier.alpha;
    const badgeScale = badge.scale.x;
    const nameY = name.y;
    for (const p of [ovr, position, badge, name, team, stats, tier]) p.alpha = 0;
    let elapsed = 0;
    let swapped = false;
    let lastRoll = 0;
    const step = (t: Ticker) => {
      elapsed += t.deltaMS;
      // 1. flip
      const f = Math.min(1, elapsed / T.flipMs);
      if (!swapped && f >= 0.5) {
        swapped = true;
        this.swap(this.right, face);
      }
      // relative to the current scale.y, so a resize in the middle of the flip cannot leave it squashed
      this.right.scale.x = this.right.scale.y * Math.abs(1 - 2 * f);
      // 2. PLAYER: badge pops in
      const b = window01(elapsed, T.badgeFrom, T.badgeMs);
      badge.alpha = Math.min(1, b * 2);
      badge.scale.set(badgeScale * easeOutBack(b));
      // 3. NAME: slides up
      const n = window01(elapsed, T.nameFrom, T.nameMs);
      name.alpha = n;
      name.y = nameY + T.nameRise * (1 - n);
      // 4. POSITION
      position.alpha = window01(elapsed, T.positionFrom, T.positionMs);
      // 5. TEAM: flag + club
      team.alpha = window01(elapsed, T.teamFrom, T.teamMs);
      // 6. ATT / CRE / DEF together
      stats.alpha = window01(elapsed, T.statsFrom, T.statsMs);
      tier.alpha = tierAlpha * window01(elapsed, T.tierFrom, T.tierMs);
      // 7. OVR rolls, then lands with a pop
      if (elapsed >= T.rollFrom && elapsed < T.rollEnd) {
        ovr.alpha = 1;
        if (elapsed - lastRoll > T.rollEveryMs) {
          lastRoll = elapsed;
          ovr.text = String(T.rollMin + Math.floor(Math.random() * T.rollRange));
        }
      } else if (elapsed >= T.rollEnd) {
        ovr.alpha = 1;
        ovr.text = String(card.ovr);
        ovr.scale.set(1 + 0.5 * (1 - easeOutBack(window01(elapsed, T.rollEnd, T.popMs))));
      }
      if (elapsed >= T.revealMs) {
        this.finishFlip();
        ovr.scale.set(1);
        this.ctx.emit({ type: 'REVEAL_DONE', ovr: card.ovr, tier: card.tier });
      }
    };
    ticker.add(step);
    this.stopFlip = () => ticker.remove(step);
  }
}

/** Progress 0..1 of a window starting at `from` lasting `ms`. */
const window01 = (t: number, from: number, ms: number) => Math.min(1, Math.max(0, (t - from) / ms));
const easeOutBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
