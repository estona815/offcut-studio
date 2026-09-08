# Offcut Studio

Keep the cut. Change the plan.

Offcut Studio helps a home maker continue a fabric project after discovering that a remaining scrap is smaller than expected. It computes layouts for a pocket sleeve or a two-sided coaster, records completed cuts, and recovers the uncut pieces while preserving paired-panel dimensions and fabric choices.

This is an **Alexa+ web simulation**, created during the Amazon Build, Ship, Shape hackathon using Codex. It runs locally in the browser. It does not connect to Alexa, Amazon devices, AWS, or a live language model. Its supported command grammar dispatches real state transitions and geometric calculations; it is not an open-ended conversational model. Optional browser speech features depend on browser support and permission.

## Run

Requires Node.js 24+ and pnpm 11+, available on your shell's PATH. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:4178`. No account or API key is required. To validate and build:

```sh
pnpm test
pnpm build
pnpm preview
```

The development server uses port 4178. For `pnpm preview`, open the URL printed by Vite; the preview server uses its own port.

Sample inventory is fictional. Local browser storage keeps the current workspace between reloads. Reset demo starts the labelled sample again; it does not alter source files or media. Do not use Reset demo to record changes to real material.

## Try the recovery workflow

1. Start with the medium pocket sleeve. Inspect the three sample scraps and alternative recipe candidates.
2. Mark the front panel cut. Its110×160mm cut dimensions and placement become a permanent snapshot in that workspace.
3. Type `the ochre scrap is only six centimeters tall` (or edit the ochre scrap height to60mm).
4. Type `make back 10 cm wide`. The app rejects a back panel that would no longer match the already cut front.
5. Select Replan pocket. The uncut pocket becomes shallower if a valid layout is found, while the front and back remain the same size.
6. Download SVG for the remaining pieces. Print at 100% and check the 100 mm scale before using the pattern.
7. Reload. The cut history, revised plan and next uncut piece should remain.

Try `cut it` for a clarification instead of an ambiguous mutation. Repeating `mark front cut` must not consume fabric twice. The app exposes a command help list for the exact supported forms.

SVG page size depends on the remaining scraps. The recovered medium-sleeve example exports a 240 × 394 mm page, larger than A4 (210 × 297 mm), so it cannot be printed to scale on one A4 sheet. Use sufficiently large paper, or an SVG-capable print workflow with tiled/poster printing at 100% actual size. Do not use “fit to page.” Measure the 100 mm check line on the physical output before cutting. The app does not generate tiled A4 pages automatically; any format conversion must preserve the SVG's millimetre dimensions.

## What is computed

- Inventory is a MultiPolygon of available stock, including concave boundaries, holes and disconnected remnants.
- Polygon Boolean operations check containment and subtract actual cut footprints. A bounding box alone is insufficient evidence of fit.
- Recipe cut dimensions include seam allowance once. Grain restrictions limit rotation. Completed pieces retain their dimensions and placement.
- Recovery keeps the current fabric binding of each piece and adapts only eligible uncut pocket depth within recipe bounds. It does not silently switch the maker's pocket to another fabric.
- SVG uses millimetre dimensions and exports only uncut pieces. The display diagram is code-native and uses calculated coordinates; generated fabric textures are visual decoration, not material measurements.

The packer is a bounded heuristic. “No layout found” is not proof that no layout exists. The two original simple pattern families are prototype templates and have **not been physically sewn or wear-tested**. Material stretch, fraying, shrinkage, thickness, hem construction and sewing-machine tolerances are not modelled. Measure the intended object and validate a paper prototype before cutting fabric.

## Architecture

- `src/domain`: geometry, recipes, constrained planner and SVG export.
- `src/state`: workspace transitions, supported commands and validated persistence.
- `src/components`: accessible UI regions; `App.tsx` composes the workflow.
- `src/assets`: generated fabric textures.

No telemetry, user account, payment, cloud storage, or hidden remote model call is included. Speech recognition, if enabled by the user, is supplied by their browser and may use that browser vendor's service; typed commands work without microphone access.

## Development and attribution

Codex assisted with design exploration, implementation, tests and documentation. Built-in ImageGen produced the original concept references and fabric textures. React, Vite, TypeScript, Vitest and polygon-clipping are third-party software. Their licenses remain applicable; see `THIRD_PARTY_NOTICES.md`.

Existing products already offer nesting, seam allowances and scrap scanning. This project's specific focus is **recovering a partly cut, multi-piece project while respecting its completed pieces and assembly relationships**. It does not claim to have invented nesting or to be the first product with all related capabilities.

This repository is prepared for the simulated-experience route described in the [official hackathon rules](https://amazonappdev2026.devpost.com/rules). Eligibility is determined by the organizer. A working public repository and English demonstration video are required before submission; local completion alone does not constitute a submitted entry.
