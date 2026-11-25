/**
 * Scrolls the layout, the stage and the info section back to the top (for example when a multi-screen game
 * switches screen). Games use this instead of reaching for the layout's CSS classes.
 */
export function resetLayoutScroll() {
  document.querySelectorAll('.pbf-layout, .pbf-play-stage, .pbf-info').forEach((el) => el.scrollTo({ top: 0 }));
}
