import { describe, expect, it } from 'vitest';
import { difference, intersection } from 'polygon-clipping';
import { AREA_EPSILON, area, contains, overlapArea, placementGeometry, rectangle, subtractCut, validateGeometry } from './geometry';
import { evaluateCandidates, planRecipe, recoverPlan, validatePlan } from './planner';
import { getRecipes, seedScraps } from './recipes';
import { makeSVG } from './svg';
import type { CutRecord, MultiPolygon, Plan, PlanResult, Scrap } from './types';

function successful(result: PlanResult): Plan {
  if (!result.ok) throw new Error(result.message);
  return result.plan;
}
function cutFront() {
  const scraps = seedScraps();
  const plan = successful(planRecipe('sleeve-medium', scraps));
  const placement = plan.placements.find(p => p.pieceId === 'front')!;
  const record: CutRecord = { piece: plan.pieces.find(p => p.id === 'front')!, placement, cutAtRevision: 1 };
  scraps.find(s => s.id === placement.scrapId)!.geometry = subtractCut(scraps.find(s => s.id === placement.scrapId)!.geometry, placement);
  return { scraps, plan, cuts: [record] };
}

describe('geometry uses actual stock and cut dimensions', () => {
  it('rejects a bounding-box-only fit through an L-shaped void, and preserves holes/remnants', () => {
    const l: MultiPolygon = [[[[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60], [0, 0]]]];
    expect(validateGeometry(l)).toBe(true);
    expect(contains(l, rectangle(50, 50))).toBe(false);
    expect(contains(l, rectangle(15, 50))).toBe(true);
    const withHole = difference(rectangle(100, 100), rectangle(20, 20, 40, 40));
    expect(validateGeometry(withHole)).toBe(true);
    expect(contains(withHole, rectangle(60, 60, 20, 20))).toBe(false);
    const split = difference(rectangle(100, 100), rectangle(10, 100, 45, 0));
    expect(split).toHaveLength(2);
    expect(area(split)).toBeCloseTo(9000);
    expect(validateGeometry([])).toBe(true);
    expect(validateGeometry([[[[0, 0], [10, 10], [0, 10], [10, 0], [0, 0]]]])).toBe(false);
  });

  it('does not add seam twice or rotate fixed grain to create a false fit', () => {
    const stock = (width: number, height: number): Scrap[] => [{ ...seedScraps()[0], geometry: rectangle(width, height) }];
    expect(planRecipe('coaster-small', stock(100, 200)).ok).toBe(true); // exactly two 100 mm cut squares
    expect(planRecipe('coaster-small', stock(99, 200)).ok).toBe(false); // nominal 90 mm finish is not the cut width
    const medium = getRecipes().find(r => r.id === 'sleeve-medium')!;
    expect(medium.pieces.find(p => p.id === 'front')!.cutWidth).toBe(110);
    const rotationOnly: Scrap[] = ['indigo', 'linen'].map(id => ({ ...seedScraps()[0], id, geometry: rectangle(160, 110), grain: 'fixed' }));
    rotationOnly.push({ ...seedScraps()[2], geometry: rectangle(100, 80) });
    expect(planRecipe('sleeve-medium', rotationOnly).ok).toBe(false);
  });
});

describe('computed candidates and preserved work', () => {
  it('prunes an undersized bound pocket before branching, while respecting free 90-degree rotation', () => {
    const scraps = seedScraps();
    const plan = successful(planRecipe('sleeve-medium', scraps));
    scraps.find(s => s.id === 'ochre')!.geometry = rectangle(160, 20);
    const start = performance.now();
    const failed = recoverPlan(plan, scraps, []);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe('NOT_FOUND');
    expect(performance.now() - start).toBeLessThan(1000);

    // A short material height alone is not grounds for rejection when a legitimate 90° fit exists.
    const custom = JSON.parse(JSON.stringify(plan)) as Plan;
    const pocket = custom.pieces.find(p => p.id === 'pocket')!;
    pocket.cutWidth = 20; pocket.grain = 'free';
    const stock = scraps.find(s => s.id === 'ochre')!;
    stock.geometry = rectangle(80, 20); stock.grain = 'free';
    const rotated = successful(recoverPlan(custom, scraps, []));
    expect(rotated.placements.find(p => p.pieceId === 'pocket')!.rotation).toBe(90);
    expect(rotated.pieces.find(p => p.id === 'pocket')!.cutHeight).toBe(80);
    expect(validatePlan(rotated, scraps, [])).toBe(true);
  });

  it('changes the candidate list with material, returns truthful NOT_FOUND, and validates concave layouts', () => {
    const ample = evaluateCandidates(seedScraps());
    expect(new Set(ample.filter(c => c.result.ok).map(c => c.recipe.family))).toEqual(new Set(['sleeve', 'coaster']));
    const tiny = evaluateCandidates([{ ...seedScraps()[0], geometry: rectangle(80, 80) }]);
    expect(tiny.filter(c => c.result.ok).length).toBeLessThan(ample.filter(c => c.result.ok).length);
    for (const candidate of tiny) {
      expect(candidate.result.ok).toBe(false);
      if (!candidate.result.ok) {
        expect(candidate.result.code).toBe('NOT_FOUND');
        expect(candidate.result.message).toMatch(/bounded search/);
      }
    }
    const concave: MultiPolygon = [[[[0, 0], [210, 0], [210, 105], [105, 105], [105, 210], [0, 210], [0, 0]]]];
    const scraps = [{ ...seedScraps()[0], geometry: concave }];
    const plan = successful(planRecipe('coaster-small', scraps));
    expect(validatePlan(plan, scraps, [])).toBe(true);
    for (const placement of plan.placements) expect(area(difference(placementGeometry(placement), concave))).toBeLessThanOrEqual(AREA_EPSILON);
    expect(overlapArea(placementGeometry(plan.placements[0]), placementGeometry(plan.placements[1]))).toBeLessThanOrEqual(AREA_EPSILON);
  });

  it('subtracts a completed cut idempotently and round-trips snapshots without replenishing stock', () => {
    const { scraps, plan, cuts } = cutFront();
    const originalArea = 300 * 240;
    const indigo = scraps.find(s => s.id === 'indigo')!;
    expect(area(indigo.geometry)).toBeCloseTo(originalArea - 110 * 160);
    expect(area(subtractCut(indigo.geometry, cuts[0].placement))).toBeCloseTo(area(indigo.geometry));
    const reloaded = JSON.parse(JSON.stringify({ scraps, plan, cuts })) as ReturnType<typeof cutFront>;
    const recovered = successful(recoverPlan(reloaded.plan, reloaded.scraps, reloaded.cuts));
    expect(recovered.placements.find(p => p.pieceId === 'front')).toEqual(cuts[0].placement);
    expect(validatePlan(recovered, reloaded.scraps, reloaded.cuts)).toBe(true);
    expect(area(reloaded.scraps.find(s => s.id === 'indigo')!.geometry)).toBeCloseTo(originalArea - 110 * 160);
  });

  it('freezes paired cut dimensions, recovers only an uncut pocket on its original fabric, and exports real millimetres', () => {
    const { scraps, plan, cuts } = cutFront();
    const cutSnapshot = JSON.stringify(cuts);
    const changed = recoverPlan(plan, scraps, cuts, { back: { cutWidth: 100 } });
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.code).toBe('LOCKED_DIMENSIONS');
    const ochre = scraps.find(s => s.id === 'ochre')!;
    ochre.geometry = intersection(ochre.geometry, rectangle(160, 60));
    expect(validatePlan(plan, scraps, cuts)).toBe(false);
    const result = recoverPlan(plan, scraps, cuts);
    const recovered = successful(result);
    expect(recovered.pieces.find(p => p.id === 'pocket')!.cutHeight).toBe(60);
    expect(recovered.placements.find(p => p.pieceId === 'pocket')!.scrapId).toBe('ochre');
    expect(recovered.placements.find(p => p.pieceId === 'front')).toEqual(cuts[0].placement);
    expect(JSON.stringify(cuts)).toBe(cutSnapshot);
    expect(validatePlan(recovered, scraps, cuts)).toBe(true);
    const invalidDepth = recoverPlan(recovered, scraps, cuts, { pocket: { cutHeight: 39 } });
    expect(invalidDepth.ok).toBe(false);
    const svg = makeSVG(recovered, scraps, cuts);
    const rootTag = svg.match(/<svg\b[^>]+>/)![0];
    const width = Number(rootTag.match(/width="([\d.]+)mm"/)![1]);
    const height = Number(rootTag.match(/height="([\d.]+)mm"/)![1]);
    const viewBox = rootTag.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    expect(viewBox).toEqual([0, 0, width, height]);
    expect([...svg.matchAll(/data-piece-id="([^"]+)"/g)].map(m => m[1])).toEqual(['back', 'pocket']);
    const ruler = svg.match(/<line data-length-mm="100"[^>]+>/)![0];
    expect(Number(ruler.match(/x2="([\d.]+)"/)![1]) - Number(ruler.match(/x1="([\d.]+)"/)![1])).toBe(100);
    expect(svg).toContain('data-cut-height-mm="60"');
    expect(() => makeSVG(plan, scraps, cuts)).toThrow(/Recover/);
    const tooShort = scraps.map(s => s.id === 'ochre' ? { ...s, geometry: rectangle(160, 39) } : s);
    const noSwitch = recoverPlan(plan, tooShort, cuts);
    expect(noSwitch.ok).toBe(false); // Spare indigo cannot silently replace the selected ochre pocket.
  });
});
