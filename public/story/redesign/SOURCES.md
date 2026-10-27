# Story artwork

Source: Figma `IeFQalpaKriMC94IW7S2Mc`, 新・プロトタイプ, inspected 2026-10-27 JST.

- `arrow-back.svg`: 4057:6000 (next uses a horizontal mirror).
- `happy-body.svg`: 4057:6145, with `happy-cheek.svg`: 4057:6156 / 4057:6157.
- `angry.svg`: 4057:6305.

The original SVG paths are preserved. The angry SVG shadow offset/viewBox counteract the CSS mirror: Figma keeps its shadow in canvas coordinates, while an SVG image mirrors its filter with the artwork. Story references are 4006:1622, 4057:5814, 4057:5954, 4057:6267, 4057:5840, 4057:6164, all 1512 × 982.

Downloaded PNGs were SHA-256 identical to the existing logos, character portraits, and `public/figma/story-{nasubi,twin}.png`; those existing assets are reused without changing catalog IDs, metadata, or rarity.

`intro-to-happy.json` is generated with `node scripts/build-anago-story-lottie.mjs` from the existing desktop pet SVG poses and morph rig. It has 31 frames at 30fps, with the intro and happy endpoints positioned against the story references. The taller transparent composition keeps the body continuous in the mobile reflow. No change to the pet's `overlay.json` is required.

The star treatment follows `ホーム画面_all` (4006:1440), inspected in the Figma browser inspector: card 264×348, first star x144/y266, star box20×20, gap1, five-point star with38.2% inner radius, filled#F78000 / empty#EAEAEA. The story uses scale200.2/264. The SVG is the equivalent five-point primitive; names, tags and images remain story-specific. Grade values are in `src/features/characters/characterGrades.json`.

## Supplied expressions, 2026-10-27

`story-poses.json` supersedes `intro-to-happy.json` at runtime: intro frame 0,
happy frame 30, angry frame 61 (30fps). The second morph uses the supplied
`expressions/angry.svg`, with its original red color and rotated eyes.
The angry endpoint retains the Figma head center (541.0035, 432.2771) and
body width 146.064 in the 1512×982 artboard. `angry-story.svg` is a fallback
copy with extended export clipping only; its body/eye paths are unchanged.
