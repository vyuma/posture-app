# Collection card fidelity verification — 2026-10-29

## Scope and sources

Web and desktop `src/features/work/home-layout.css` only for this card adjustment. Character metadata, assets, animations, hover transforms, modal cards, collection persistence and mobile contracts are unchanged.

Reviewed both Figma `4006:1383` (ホーム画面_初期, 1512×1742) and `4006:1440` (ホーム画面_all, 1512×2075), the supplied initial/all CSS, and fresh PNG exports. MCP design context was unavailable due the account tool limit; the existing Figma browser and supplied CSS were used. Evidence lives in the web repository at `output/collection-card-fidelity/`.

The initial frame governs equal 83/1512 side gutters; the all frame governs star cards. The user's five-column preference is retained. The all-frame 48px gutter, sample count 22, and sample locked numbers 023+ are not application data requirements.

## Corrected differences

- Large cards previously grew while name/star/tag sizes stopped at fixed maxima. They now follow card width; minimum readable sizes and wrapping remain for narrow cards.
- Outer/art corner radii follow card size. Initial-frame outer shadow is 8.10078px; locked cards use the two specified inset shadows.
- Portrait bounds use the exact 188/232 width and 32/232 top ratio from the all-frame CSS, replacing rounded width values.
- Oto's tag fill is #F0F0F0, separate from the lighter portrait background.

## Numeric verification

Browser CSS viewport 1512×982, first card, pixels:

| Element | Initial CSS | Measured |
| --- | --- | --- |
| Card x / y | 83 / 573.06 | 83 / 573.0547 |
| Card width / height | 251.01 / 330.88 | 250.9453 / 330.7969 |
| Art width / height | 220.58 / 220.58 | 220.5234 / 220.5234 |
| Portrait width / height | 178.72 / 287.19 | 178.6953 / 287.1484 |
| Portrait x / y within art | 20.92 / 30.43 | 20.9102 / 30.4141 |
| Name font size | 19.0159 | 19.0104 |
| Name line height | 23 | 22.8125 |
| Tag font size | 9.50795 | 9.50521 |

The 264×348 all-frame card is scaled to the initial frame's five-column grid. First-card dimensional residual is under 0.09px; name line-height residual is 0.19px. Star width at this scale is 19.0078px, five-star row 98.8203px. Computed first-card art/tag background #FDE6CC, tag/star accent #F78000, name #000000; Oto tag fill #F0F0F0.

`measurements.json` contains DOM bounds, font/line/spacing/color values for all 17 acquired cards at 1512×982, 1920×1080, 720×512, 390×844. No document horizontal overflow, card text overflow, or tag clipping was detected. Widths / columns: 250.95 / 5, 318.66 / 5, 204.31 / 3, 166.59 / 2. Names and stars may wrap independently on small cards; rows grow to keep content accessible. At 1920px name size now grows to 24.1406px.

All 17 web/desktop portraits are byte-identical; catalogs and presentation JSON are identical. Each portrait's opaque bounds were measured independently in `portrait-visible-bounds.json` and inspected against the all-frame screenshot (ears, hat, hair, fins differ). No common opaque bounding box was assumed. Nominal Figma artwork boxes are the same size, while visible character extents differ.

Actual macOS WKWebView checked at 720×512 and 1200×752 content sizes: scrolling, card elements, three/five columns, and long tags. Screenshots `native-720.png`, `native-1200.png`. Browser also checked empty collection (0 / 111), opening/closing an acquired card, and keyboard focus (visible 3px outline). Small-screen scroll reaches subsequent rows. Existing card animation rules were not edited.

## Limits

The Figma PNG and browser capture differ in rasterization/color management; their screenshot RGB values are not used as proof of exact color matching. CSS colors and geometry are measured; full pixel identity is not claimed. Browser/system Japanese font rasterization differs from the Figma export. Narrow screens deliberately use minimum sizes and wrapping rather than shrinking the entire 1512px canvas. Mobile native app was not changed; no catalog or transport contract changed.

## Validation

Both `bun run build` passed. Desktop `cargo check --manifest-path src-tauri/Cargo.toml` passed. Existing Lottie eval, bundle size, and unused pairing-code warnings remain. `git diff --check` passed in both repositories. No commit, push or merge performed.

Remote HEADs read 2026-10-29: PiiiN d3c75b7e8b357e12ded0627b7a128a8a86e400cd; posture-app 7c0f7f865f45abdacdf039c3c3ce1d7279742bef; vibe-app 053104b4c8348ed0f6cec5406cf87e066001f628. Existing unrelated local changes are preserved.
