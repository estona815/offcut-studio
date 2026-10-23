# Offcut Studio

Keep the cut. Recover the plan with MCP.

Offcut Studio helps a home maker continue a fabric project after discovering that a remaining scrap is smaller than expected. It computes layouts for a pocket sleeve or a two-sided coaster, records completed cuts, and recovers the uncut pieces while preserving paired-panel dimensions and fabric choices.

This project includes a **local MCP server and browser client**, plus the original Alexa+ web simulation, created during the Amazon Build, Ship, Shape hackathon using Codex. The MCP client calls the local workspace engine through Streamable HTTP (protocol 2025-11-25). It does not connect to Alexa, Amazon devices, AWS, or a live language model. Its supported command grammar dispatches real state transitions and geometric calculations; it is not an open-ended conversational model. Optional browser speech features depend on browser support and permission.

## Run

Requires Node.js 24+ and pnpm 11+, available on your shell's PATH. Python 3 is additionally required only for `pnpm test:mcp`; it is not needed to run the browser demonstration. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **`http://127.0.0.1:4178/mcp.html` for the MCP demonstration**. The original browser simulation is at `http://127.0.0.1:4178`. No account or API key is required. To validate and build:

```sh
pnpm test
pnpm build
pnpm preview
```

The development server uses port 4178. For `pnpm preview`, open the URL printed by Vite; the preview server uses its own port.

Sample inventory is fictional. In the original browser simulation only, local browser storage keeps the current workspace between reloads, and Reset demo starts the labelled sample again without altering source files or media. Do not use Reset demo to record changes to real material. MCP sessions instead live temporarily in server memory, as described below.

## Judge walkthrough: preserve the cut, recover the plan

[Watch the public 105-second MCP demonstration](https://youtu.be/WwLuto3isxg). It uses actual local application captures and synthetic sample inventory, edited with English captions and no audio. It is not a continuous real-time recording.

1. Run the development server and open `/mcp.html`; connect to initialize a session and discover the two tools.
2. Send `mark front cut`. Inspect the reported cut and changed remaining-stock geometry.
3. Repeat `mark front cut`. The cut count and remaining stock must stay unchanged.
4. Send `the ochre scrap is only six centimeters tall`. The old remaining layout becomes invalid.
5. Send `replan pocket`. The pocket becomes 60 mm deep while the completed front cut is preserved.

For reproducible protocol checks, keep `pnpm dev` running and execute `pnpm test:mcp` in another terminal. The script checks geometry changes, duplicate delivery, stale revisions, ambiguous commands, and preservation of cuts during recovery. A PASS covers those bounded cases only; it does not establish physical fabric savings or full MCP conformance.

The main app's browser storage and MCP server sessions are separate. Do not expect cuts made in one to appear in the other. The MCP endpoint exists only under `pnpm dev`; static `build`/`preview` serves the original app without that endpoint.

## Try the original browser recovery workflow

1. Start with the medium pocket sleeve. Inspect the three sample scraps and alternative recipe candidates.
2. Mark the front panel cut. Its 110 × 160 mm cut dimensions and placement become a permanent snapshot in that workspace.
3. Type `the ochre scrap is only six centimeters tall` (or edit the ochre scrap height to 60 mm).
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

This repository contains a self-hosted MCP prototype for the Alexa+ track described in the [official hackathon rules](https://amazonappdev2026.devpost.com/rules). The original browser simulation remains available. Eligibility is determined by the organizer. Public code and a public demonstration do not by themselves establish final Devpost submission or acceptance.

## Local MCP workbench and boundaries

Run `pnpm install --frozen-lockfile` and `pnpm dev`, then open `http://127.0.0.1:4178/mcp.html`. This addition serves `/mcp` from the local Vite process using Streamable HTTP JSON responses and protocol 2025-11-25. The browser performs initialize, initialized notification, tools/list and tools/call. No paid API, device or language model is required. It is not an Alexa-connected deployment.

Each connection creates its own synthetic workspace in server memory. `inspect_workspace` reads it; `apply_command` dispatches the existing supported grammar with an expected revision. The server rejects stale revisions and changed arguments under a repeated request ID. Repeated cut commands retain the original cut footprint. Closing/restarting the local process discards sessions; sessions expire after 30 idle minutes. This workbench does not sync the main app's browser-local saved state.

For a demonstration: connect, mark front cut, repeat the same command, reduce the ochre scrap to six centimeters tall, then replan pocket. The original front cut stays fixed and the remaining pocket becomes 60 mm deep. The UI displays actual protocol responses. Physical cutting is not inferred from a command or validated by the software.

The endpoint is restricted to 127.0.0.1 and same-origin browser requests. It provides no account authentication and is only intended for a local synthetic demonstration; do not expose the Vite server publicly. GET streaming is not offered (405); JSON request responses and session DELETE are supported. Static `build`/`preview` does not include this local server. The standard frozen-lockfile install, TypeScript/Vite build, 25 existing tests and real HTTP integration scenario passed locally. With `pnpm dev` running in another terminal, run `pnpm test:mcp` to reproduce initialization, tool listing, cut geometry changes, replay protection, stale-revision rejection and recovery checks. No full MCP conformance certification is claimed. The linked MCP demonstration above replaces the earlier browser-only walkthrough. The demonstrated implementation is revision `23e08f97415dca8bf79037f23dcb1049414c82e3`; this README update changes navigation and documentation only.
