# Expression sources

The designer files supplied on 2026-10-27 are preserved byte-for-byte:

- `rest.svg`: `シマアナゴ_休憩.svg` (休憩)
- `angry.svg`: `シマアナゴ_怒り.svg` (怒り)

The app maps `paused` to rest and `bad` to angry. Existing `bad.svg` and
`paused.svg` remain source material for the previous motion studies.
`good.svg` and `happy.svg` continue to supply the normal/recovery poses.
No character ID, catalog rarity, acquisition payload, or mobile portrait changes.

Generate `expression-states.json` with `node scripts/build-anago-expression-lottie.mjs`.
Generate the three story poses with `node scripts/build-anago-story-lottie.mjs`.
The generated manifests record source hashes and normalization transforms.

The importer preserves cubic paths and rigid SVG transforms. Rest uses exact
Bezier subdivision; stripes stay attached to the spine and clipped to the body.
Animated SVG filters are replaced by the existing platform CSS shadow. The
original SVG filters remain available in these source files.
