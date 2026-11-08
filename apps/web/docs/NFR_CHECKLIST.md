# NFR checklist (Wave 5.4) — perf / mobile / a11y

This is a working checklist, not a completed audit. Do not mark items done without evidence from a real pass.

## Viewport / mobile (360px)

- [ ] Root layout exports a `viewport` meta (`width=device-width`, sensible initial scale).
- [ ] Tree chart (`FamilyChart` / `/tree/[id]`) does not force horizontal page scroll at 360px width.
- [ ] Chart toolbar and find panel remain usable (or wrap) below 400px.
- [ ] PFT (`/pft`) and FAQ (`/faq`) pages remain readable at 360px without clipped text.
- [ ] Touch: chart pan works without capturing vertical page scroll exclusively on small screens.

## WCAG AA (spot checks, not a full audit)

- [ ] Interactive controls on the chart layout toggle and admin verification links have visible focus rings.
- [ ] Layout toggle buttons expose `aria-pressed` / accessible names (AR + EN).
- [ ] FAQ accordion buttons use `aria-expanded`.
- [ ] Colour contrast of body text on stone/olive backgrounds meets AA for normal text (spot-check with a contrast tool).
- [ ] Decorative chart spokes / generation rails are `aria-hidden` where they add no information.

## Performance (spot checks)

- [ ] Family chart does not attempt to render the entire Palestinian Family Tree graph; PFT uses linked-group lists.
- [ ] Access logging (`log_access`) does not block document open if the insert fails (best-effort).
- [ ] Large trees: zoom/pan remains interactive; note any frame drops for follow-up virtualisation work.

## Notes

- Layout mode preference persists via `?layout=` and `localStorage` key `juthoor.chartLayout`.
- Access log covers verification-doc opens, person contact reveals, living person page views, and displacement / story content when present.
