# 新LP assets

Source: Figma `PiiiN_new` (`IeFQalpaKriMC94IW7S2Mc`), 新LP `4061:6342`, checked 2026-10-29.

Page layout, copy, cards, headings, and controls remain HTML/CSS. The original illustrations below were exported individually from Figma.

| File | Figma node | Use |
| --- | --- | --- |
| how-screens.png | 4061:7208 | Original 3× artwork, retained as a source reference; replaced in the LP by current app captures. |
| how-laptop.png | 4061:6710 | Original laptop shell used around all three current app captures. |
| result-graph.svg | 4061:7042 | Editorial sample graph, including its axes and curve. Not measurement data. |
| posture-bad.svg | 4061:7102 | Original angry character illustration, retained as a source reference. |
| posture-normal.svg | 4061:7127 | Original happy character illustration, retained as a source reference. |
| posture-straight.svg | 4061:7180 | Enlarged angry character and timer illustration. Filename follows the existing LP step ID; it does not describe good posture. |

The SVG exports include shadow bounds. CSS positions account for those bounds so the visible timer surfaces match the Figma coordinates. Existing animated desktop/shore characters continue using their original assets and motion code.

`posture-growing-body.svg` and `posture-growing-timer.svg` are exact layer splits of `posture-straight.svg` (4061:7180). The original mask, paths, colors and filters are unchanged. Only the body layer scales; the timer remains at its original size and coordinates.

## Current app captures (2026-11-28)

Copy and orange warning widgets follow the updated 新LP frame. The existing growing-widget animation uses the product rig and keeps its original timing.

| File | Rendered component/state | Capture size |
| --- | --- | --- |
| how-1-current.jpg | `TimerSettings`: normal sensitivity, one monitor, 35-minute focus, 5-minute break, 4 cycles. | 1512 × 960 |
| how-2-current.jpg | `MeasureScreen`: calibration at 5 seconds, circular countdown. | 1512 × 960 |
| how-3-current.jpg | `MeasureScreen`: active focus, before the first posture result. | 1512 × 960 |
| posture-warning-current.jpg | `LandingPet`: orange warning pose with 「首が曲がってるよ！」 and the existing sample timer. | 642 × 930 (3×) |
| posture-normal-current.jpg | `LandingPet`: orange normal pose with 「いい感じ！」 and the same sample timer. | 642 × 930 (3×) |

Captured from the current components based on `42a4e7c`, with Japanese text and synthetic preview state. Camera areas are empty; no camera, account, or personal measurement data was captured. The laptop screen is inset within the original Figma shell; the surrounding LP animations remain live.
