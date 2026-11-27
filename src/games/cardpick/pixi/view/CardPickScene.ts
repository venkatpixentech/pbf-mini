import { Container, Graphics } from 'pixi.js';

import { buildElements } from 'core/pixi/buildView';
import { applyPlacement, stageFit } from 'core/pixi/layout';
import type { PixiScene, SceneContext } from 'core/pixi/scene';
import { type InteractionBinding, UIUtil } from 'core/pixi/UIUtilService';

import { CARD_COUNT } from '../../api/types';
import {
  badgeAlias,
  CARD,
  cardIndex,
  cardpickElements,
  cardpickPixiConfig,
  cardTarget,
  COLORS,
} from '../config/game.config';

/**
 * What React tells the scene. `enabled` is whether a card may be picked now. `winning` is null until the server has answered; then the
 * scene turns every card over. The scene never calls the backend and never decides an outcome.
 */
export type CardPickSceneProps = { enabled: boolean; picked: number | null; winning: number | null };

/** The scene reports a tap on a card; React makes the pick (the keyboard buttons make the same pick). */
export type CardPickSceneEvent = { type: 'pick'; index: number };

/** Three cards: tap one (or use the React buttons), and once the server answers every card turns over. */
export class CardPickScene implements PixiScene<CardPickSceneProps, CardPickSceneEvent> {
  private root = new Container();
  private binding: InteractionBinding | undefined;
  private shown: CardPickSceneProps | null = null;
  private overlays: Container[] = [];

  init(ctx: SceneContext<CardPickSceneEvent>, props: CardPickSceneProps) {
    this.root.addChild(buildElements(cardpickElements));
    ctx.root.addChild(this.root);
    this.binding = UIUtil.bindInteractions(ctx, this.root, cardpickElements, (event) => {
      if (event.type !== 'tap') return;
      const index = cardIndex(event.target);
      if (index >= 0) ctx.emit({ type: 'pick', index });
    });
    this.update(props);
  }

  update(props: CardPickSceneProps) {
    const before = this.shown;
    this.shown = props;
    for (let i = 0; i < CARD_COUNT; i++) this.binding?.setEnabled(cardTarget(i), props.enabled);
    if (before && before.winning === props.winning && before.picked === props.picked) return;
    this.draw(props);
  }

  resize(width: number, height: number) {
    applyPlacement(this.root, stageFit(cardpickPixiConfig.design, { width, height }, cardpickPixiConfig.design.fit));
    this.binding?.refresh();
  }

  destroy() {
    this.binding?.dispose();
    this.binding = undefined;
    this.overlays = [];
  }

  /** Face down, or every card turned over: the winner green with a gold badge, the others grey with a bronze one, the pick ringed. */
  private draw({ picked, winning }: CardPickSceneProps) {
    for (const overlay of this.overlays) overlay.destroy({ children: true });
    this.overlays = [];
    for (let i = 0; i < CARD_COUNT; i++) {
      const card = this.root.getChildByLabel(cardTarget(i), true) as Graphics;
      const mark = this.root.getChildByLabel(`mark-${i}`, true) as Container;
      const open = winning !== null;
      mark.visible = !open;
      card.tint = !open ? 0xffffff : i === winning ? COLORS.win : COLORS.lose;
      if (open) {
        const badge = buildElements([
          { type: 'sprite', id: `badge-${i}`, x: CARD.xs[i], y: CARD.y, alias: badgeAlias(i === winning) },
        ]);
        this.root.addChild(badge);
        this.overlays.push(badge);
      }
      if (picked === i) {
        const ring = new Graphics()
          .roundRect(
            CARD.xs[i] - CARD.width / 2 - 8,
            CARD.y - CARD.height / 2 - 8,
            CARD.width + 16,
            CARD.height + 16,
            CARD.radius + 8,
          )
          .stroke({ width: 6, color: COLORS.pickedRim });
        this.root.addChild(ring);
        this.overlays.push(ring);
      }
    }
  }
}
