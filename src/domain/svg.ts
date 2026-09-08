import { area, bounds } from './geometry';
import { validatePlan } from './planner';
import type { CutRecord, MultiPolygon, Plan, Scrap } from './types';

const n = (value: number) => Number(value.toFixed(4));
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
function path(geometry: MultiPolygon): string {
  return geometry.flat().map(ring => ring.map((p, index) => `${index ? 'L' : 'M'} ${n(p[0])} ${n(p[1])}`).join(' ') + ' Z').join(' ');
}

/** One SVG user-unit equals one millimetre; completed cut pieces are never exported as new cuts. */
export function makeSVG(plan: Plan, scraps: Scrap[], cuts: CutRecord[]): string {
  if (!validatePlan(plan, scraps, cuts)) throw new Error('Recover the invalid layout before exporting cutting instructions.');
  const cutIds = new Set(cuts.map(c => c.piece.id));
  const placements = plan.placements.filter(p => !cutIds.has(p.pieceId));
  const activeScraps = scraps.filter(s => placements.some(p => p.scrapId === s.id) && area(s.geometry) > 0);
  const width = Math.max(140, ...activeScraps.map(s => { const b = bounds(s.geometry); return b.maxX - b.minX + 20; }));
  const bodyHeight = activeScraps.reduce((height, s) => { const b = bounds(s.geometry); return height + b.maxY - b.minY + 32; }, 0);
  const height = 50 + bodyHeight + 40;
  let offset = 42;
  const stockGroups = activeScraps.map(scrap => {
    const b = bounds(scrap.geometry);
    const groupY = offset;
    offset += b.maxY - b.minY + 32;
    const pieces = placements.filter(p => p.scrapId === scrap.id).map(placement => {
      const spec = plan.pieces.find(p => p.id === placement.pieceId)!;
      const w = placement.rotation === 0 ? spec.cutWidth : spec.cutHeight;
      const h = placement.rotation === 0 ? spec.cutHeight : spec.cutWidth;
      const cx = placement.x + w / 2, cy = placement.y + h / 2;
      const arrow = placement.rotation === 0
        ? `x1="${n(cx)}" y1="${n(cy + 8)}" x2="${n(cx)}" y2="${n(cy - 8)}"`
        : `x1="${n(cx - 8)}" y1="${n(cy)}" x2="${n(cx + 8)}" y2="${n(cy)}"`;
      return `<g data-piece-id="${escape(spec.id)}" data-cut-width-mm="${spec.cutWidth}" data-cut-height-mm="${spec.cutHeight}" data-rotation="${placement.rotation}">
<path d="${path([[placement.polygon]])}" fill="white" fill-opacity="0.75" stroke="#111" stroke-width="0.35"/>
<rect data-seam-mm="${spec.seam}" x="${n(placement.x + spec.seam)}" y="${n(placement.y + spec.seam)}" width="${n(w - 2 * spec.seam)}" height="${n(h - 2 * spec.seam)}" fill="none" stroke="#555" stroke-width="0.25" stroke-dasharray="2 1.5"/>
<text x="${n(cx)}" y="${n(placement.y + 12)}" text-anchor="middle" font-size="3.5">${escape(spec.label)}</text>
<text x="${n(cx)}" y="${n(placement.y + 18)}" text-anchor="middle" font-size="3">${spec.cutWidth} × ${spec.cutHeight} mm · cut</text>
<line ${arrow} stroke="#555" stroke-width="0.35" marker-end="url(#grain-arrow)"/>
<text x="${n(cx + 4)}" y="${n(cy + 3)}" font-size="2.8">grain ${spec.grain === 'fixed' || scrap.grain === 'fixed' ? 'fixed' : 'free'}</text>
</g>`;
    }).join('\n');
    return `<g data-scrap-id="${escape(scrap.id)}" transform="translate(10 ${n(groupY)})">
<text x="0" y="-7" font-size="4">${escape(scrap.name)} · available stock</text>
<g transform="translate(${-n(b.minX)} ${-n(b.minY)})">
<path d="${path(scrap.geometry)}" fill="#eee" fill-rule="evenodd" stroke="#777" stroke-width="0.25"/>
${pieces}
</g></g>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}" data-unit="mm" data-uncut-count="${placements.length}">
<title>Offcut Studio — ${escape(plan.label)} ${escape(plan.size)} — uncut pieces</title>
<desc>One unit is one millimetre. Solid line: cut. Dashed line: included seam allowance. Print at 100 percent; disable fit to page and measure the 100 mm scale before cutting. Original prototype pattern, not physically sewn or fit-tested.</desc>
<defs><marker id="grain-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4" fill="#555"/></marker></defs>
<g font-family="sans-serif" fill="#111">
<text x="10" y="11" font-size="5">Offcut Studio · ${escape(plan.label)} / ${escape(plan.size)}</text>
<text x="10" y="19" font-size="3.2">${placements.length} uncut pieces. Solid = cut; dashed = included seam allowance.</text>
<text x="10" y="26" font-size="3.2">Print at 100%, with fit-to-page off. Verify the scale before cutting.</text>
${placements.length ? stockGroups : '<text x="10" y="43" font-size="4">No uncut pieces remain.</text>'}
<g id="scale-check" transform="translate(10 ${n(height - 22)})">
<line data-length-mm="100" x1="0" y1="0" x2="100" y2="0" stroke="#111" stroke-width="0.4"/>
<path d="M0 -3 V3 M100 -3 V3" stroke="#111" stroke-width="0.4"/>
<text x="50" y="8" text-anchor="middle" font-size="3.5">This line must measure exactly 100 mm</text>
</g></g></svg>`;
}
