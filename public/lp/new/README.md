# 新LP assets

Source: Figma `PiiiN_new` (`IeFQalpaKriMC94IW7S2Mc`), 新LP `4061:6342`, checked 2026-10-29.

These are individual exported illustration/mockup nodes, not screenshots of the landing page. Page layout, copy, cards, headings, and controls remain HTML/CSS.

| File | Figma node | Use |
| --- | --- | --- |
| how-screens.png | 4061:7208 | Original 3× artwork spanning the three laptop examples. Each step clips its own region at the original aspect ratio. |
| how-laptop.png | 4061:6710 | Laptop shell beneath the second example. |
| result-graph.svg | 4061:7042 | Editorial sample graph, including its axes and curve. Not measurement data. |
| posture-bad.svg | 4061:7102 | Angry character, speech, and timer illustration. |
| posture-normal.svg | 4061:7127 | Happy character, speech, and timer illustration. |
| posture-straight.svg | 4061:7180 | Enlarged angry character and timer illustration. Filename follows the existing LP step ID; it does not describe good posture. |

The SVG exports include shadow bounds. CSS positions account for those bounds so the visible timer surfaces match the Figma coordinates. Existing animated desktop/shore characters continue using their original assets and motion code.

`posture-growing-body.svg` and `posture-growing-timer.svg` are exact layer splits of `posture-straight.svg` (4061:7180). The original mask, paths, colors and filters are unchanged. Only the body layer scales; the timer remains at its original size and coordinates.
