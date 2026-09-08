import { AREA_EPSILON, area, bounds, contains, overlapArea, placementGeometry, rectangle, subtractCut, validateGeometry } from './geometry';
import { getRecipes } from './recipes';
import type { Candidate, CutRecord, MultiPolygon, PieceOverrides, PieceSpec, Placement, Plan, PlanResult, Recipe, Scrap } from './types';

const MAX_ATTEMPTS = 12_000;
interface SearchBudget { attempts: number }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const failure = (code: 'NOT_FOUND' | 'INVALID_INPUT' | 'LOCKED_DIMENSIONS', message: string): PlanResult => ({ ok: false, code, message });
const equalDimensions = (a: PieceSpec | Placement, b: PieceSpec | Placement) => a.cutWidth === b.cutWidth && a.cutHeight === b.cutHeight;

function inputError(scraps: Scrap[], pieces: PieceSpec[], cuts: CutRecord[]): string | null {
  if (new Set(scraps.map(s => s.id)).size !== scraps.length) return 'Scrap IDs must be unique.';
  if (scraps.some(s => !validateGeometry(s.geometry) || !['fixed', 'free'].includes(s.grain))) return 'A scrap has invalid geometry or grain direction.';
  if (new Set(pieces.map(p => p.id)).size !== pieces.length) return 'Piece IDs must be unique.';
  if (pieces.some(p => !Number.isFinite(p.seam) || p.seam < 0 || !Number.isFinite(p.cutWidth) || !Number.isFinite(p.cutHeight)
    || p.cutWidth <= 2 * p.seam || p.cutHeight <= 2 * p.seam)) return 'Cut dimensions must leave positive finished dimensions after seam allowances.';
  if (new Set(cuts.map(c => c.piece.id)).size !== cuts.length) return 'Cut snapshots must be unique.';
  for (const cut of cuts) {
    const piece = pieces.find(p => p.id === cut.piece.id);
    if (!piece || !equalDimensions(piece, cut.piece) || !equalDimensions(piece, cut.placement)
      || cut.placement.pieceId !== piece.id || !validateGeometry(placementGeometry(cut.placement))) return 'A cut snapshot does not match this recipe.';
  }
  return null;
}

function applyOverrides(recipe: Recipe, cuts: CutRecord[], overrides: PieceOverrides): Recipe | PlanResult {
  const next = clone(recipe);
  for (const [id, edit] of Object.entries(overrides)) {
    const piece = next.pieces.find(p => p.id === id);
    if (!piece) return failure('INVALID_INPUT', `Unknown piece: ${id}.`);
    const width = edit.cutWidth ?? piece.cutWidth;
    const height = edit.cutHeight ?? piece.cutHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isInteger(width) || !Number.isInteger(height)) {
      return failure('INVALID_INPUT', 'Enter whole millimetres for an identified piece.');
    }
    if (width === piece.cutWidth && height === piece.cutHeight) continue;
    if (cuts.some(c => c.piece.id === id)) return failure('LOCKED_DIMENSIONS', `${piece.label} is already cut; its actual dimensions cannot change.`);
    if (piece.pairGroup && cuts.some(c => c.piece.pairGroup === piece.pairGroup)) {
      return failure('LOCKED_DIMENSIONS', `${piece.label} must match the already-cut ${piece.pairGroup} panel. Its ${piece.cutWidth} × ${piece.cutHeight} mm dimensions are fixed.`);
    }
    // The prototype's one approved adaptation is pocket depth, not arbitrary pattern resizing.
    if (piece.role !== 'pocket' || width !== piece.cutWidth || height > piece.cutHeight || height < (piece.minHeight ?? 40)) {
      return failure('INVALID_INPUT', 'Only an uncut pocket can become shallower, in 1 mm steps down to 40 mm. Choose another recipe before cutting to resize its body.');
    }
    piece.cutHeight = height;
  }
  const pairs = new Map<string, PieceSpec>();
  for (const piece of next.pieces) {
    if (!piece.pairGroup) continue;
    const partner = pairs.get(piece.pairGroup);
    if (partner && !equalDimensions(piece, partner)) return failure('LOCKED_DIMENSIONS', 'Paired panels must retain matching cut dimensions.');
    pairs.set(piece.pairGroup, piece);
  }
  return next;
}

/** Candidate anchors include every boundary/hole vertex plus a 5 mm grid. This is not exhaustive. */
function anchors(stock: MultiPolygon, width: number, height: number): [number[], number[]] {
  const box = bounds(stock);
  const xs = new Set<number>([box.minX, box.maxX - width]);
  const ys = new Set<number>([box.minY, box.maxY - height]);
  for (const [x, y] of stock.flat(2)) {
    xs.add(x); xs.add(x - width); ys.add(y); ys.add(y - height);
  }
  // Cap grid density for large user dimensions; edges remain exact at any scale.
  const step = Math.max(5, Math.ceil(Math.max(box.maxX - box.minX, box.maxY - box.minY) / 80));
  for (let x = box.minX; x + width <= box.maxX + 1e-8; x += step) xs.add(x);
  for (let y = box.minY; y + height <= box.maxY + 1e-8; y += step) ys.add(y);
  return [
    [...xs].filter(x => x >= box.minX - 1e-8 && x + width <= box.maxX + 1e-8).sort((a, b) => a - b),
    [...ys].filter(y => y >= box.minY - 1e-8 && y + height <= box.maxY + 1e-8).sort((a, b) => a - b),
  ];
}

/** Bounding boxes and area can reject a candidate, but can never establish polygon containment. */
function potentialFit(piece: PieceSpec, scrap: Scrap, stock: MultiPolygon): boolean {
  if (!stock.length || area(stock) + AREA_EPSILON < piece.cutWidth * piece.cutHeight) return false;
  const b = bounds(stock), width = b.maxX - b.minX, height = b.maxY - b.minY;
  return (piece.cutWidth <= width + 1e-8 && piece.cutHeight <= height + 1e-8)
    || (piece.grain === 'free' && scrap.grain === 'free' && piece.cutHeight <= width + 1e-8 && piece.cutWidth <= height + 1e-8);
}

function pack(recipe: Recipe, scraps: Scrap[], cuts: CutRecord[], bindings?: Map<string, string>, budget: SearchBudget = { attempts: 0 }): PlanResult {
  const error = inputError(scraps, recipe.pieces, cuts);
  if (error) return failure('INVALID_INPUT', error);
  const cutIds = new Set(cuts.map(c => c.piece.id));
  const todo = recipe.pieces.filter(p => !cutIds.has(p.id)).sort((a, b) => b.cutWidth * b.cutHeight - a.cutWidth * a.cutHeight);
  const available = new Map(scraps.map(s => [s.id, clone(s.geometry)]));
  // Stock normally already excludes cuts; subtracting again is idempotent and prevents corrupt callers from double-spending cut regions.
  for (const cut of cuts) {
    const stock = available.get(cut.placement.scrapId);
    if (stock) available.set(cut.placement.scrapId, subtractCut(stock, cut.placement));
  }
  // Check every piece before branching over another piece's many alternative positions.
  // In particular, a 20 mm-high bound pocket scrap cannot fit the 40 mm minimum pocket.
  for (const piece of todo) {
    const possible = scraps.some(scrap => (!bindings || bindings.get(piece.id) === scrap.id)
      && potentialFit(piece, scrap, available.get(scrap.id) ?? []));
    if (!possible) return failure('NOT_FOUND', `No valid layout found in this bounded search: ${piece.label} (${piece.cutWidth} × ${piece.cutHeight} mm) exceeds the available area or permitted orientation bounds${bindings ? ' of its selected fabric' : ''}. Try a shallower uncut pocket or add material.`);
  }
  let lastPiece = todo[0];
  function search(index: number, stock: Map<string, MultiPolygon>, placed: Placement[]): Placement[] | null {
    if (index === todo.length) return placed;
    if (budget.attempts >= MAX_ATTEMPTS) return null;
    const piece = todo[index];
    lastPiece = piece;
    const options = scraps.filter(s => (!bindings || bindings.get(piece.id) === s.id)
      && potentialFit(piece, s, stock.get(s.id) ?? []))
      .sort((a, b) => Number(b.id === piece.preferredScrapId) - Number(a.id === piece.preferredScrapId));
    for (const scrap of options) {
      const remaining = stock.get(scrap.id) ?? [];
      if (!remaining.length || area(remaining) + AREA_EPSILON < piece.cutWidth * piece.cutHeight) continue;
      const rotations: (0 | 90)[] = piece.grain === 'free' && scrap.grain === 'free' && piece.cutWidth !== piece.cutHeight ? [0, 90] : [0];
      for (const rotation of rotations) {
        const w = rotation === 0 ? piece.cutWidth : piece.cutHeight;
        const h = rotation === 0 ? piece.cutHeight : piece.cutWidth;
        const [xs, ys] = anchors(remaining, w, h);
        for (const y of ys) for (const x of xs) {
          if (++budget.attempts > MAX_ATTEMPTS) return null;
          const shape = rectangle(w, h, x, y);
          if (!contains(remaining, shape)) continue;
          const placement: Placement = { pieceId: piece.id, scrapId: scrap.id, x, y, rotation,
            polygon: shape[0][0], cutWidth: piece.cutWidth, cutHeight: piece.cutHeight };
          const nextStock = new Map(stock);
          nextStock.set(scrap.id, subtractCut(remaining, placement));
          const answer = search(index + 1, nextStock, [...placed, placement]);
          if (answer) return answer;
        }
      }
    }
    return null;
  }
  const placements = search(0, available, cuts.map(c => clone(c.placement)));
  if (!placements) {
    const scope = bindings ? 'on the selected fabrics' : 'in the available scraps';
    return failure('NOT_FOUND', `No valid layout found ${scope} in this bounded search${lastPiece ? ` (remaining piece: ${lastPiece.label}, ${lastPiece.cutWidth} × ${lastPiece.cutHeight} mm)` : ''}. Try a shallower uncut pocket or add material. This is not proof that every possible layout is impossible.`);
  }
  const plan: Plan = { ...clone(recipe), recipeId: recipe.id,
    placements: recipe.pieces.map(p => placements.find(placement => placement.pieceId === p.id)!),
    notes: ['Cut dimensions already include seam allowance.', 'Valid placement found by a bounded search; not a globally optimal nesting.', 'Original prototype pattern; not physically sewn or fit-tested.'] };
  return { ok: true, plan, changedPieceIds: [], message: 'A valid cutting layout was found. Cut dimensions include seam allowances.' };
}

export function planRecipe(recipeId: string, scraps: Scrap[], cuts: CutRecord[] = [], overrides: PieceOverrides = {}): PlanResult {
  const recipe = getRecipes().find(r => r.id === recipeId);
  if (!recipe) return failure('INVALID_INPUT', `Unknown recipe: ${recipeId}.`);
  const changed = applyOverrides(recipe, cuts, overrides);
  if ('ok' in changed) return changed;
  return pack(changed, scraps, cuts);
}

export function evaluateCandidates(scraps: Scrap[]): Candidate[] {
  return getRecipes().map(recipe => ({ recipe, result: planRecipe(recipe.id, scraps) }));
}

export function recoverPlan(currentPlan: Plan, scraps: Scrap[], cuts: CutRecord[], overrides: PieceOverrides = {}): PlanResult {
  const base = applyOverrides(currentPlan, cuts, overrides);
  if ('ok' in base) return base;
  const bindings = new Map(currentPlan.placements.map(p => [p.pieceId, p.scrapId]));
  if (bindings.size !== currentPlan.pieces.length) return failure('INVALID_INPUT', 'The current plan is missing a piece-to-fabric binding.');
  // One budget covers the entire recovery, including all shallower-pocket retries.
  const budget: SearchBudget = { attempts: 0 };
  let result = pack(base, scraps, cuts, bindings, budget);
  // Automatic recovery changes only the independent, uncut pocket. Explicit edits are tried exactly as requested.
  if (!result.ok && result.code === 'NOT_FOUND' && !Object.keys(overrides).length) {
    const pocket = base.pieces.find(p => p.role === 'pocket' && !cuts.some(c => c.piece.id === p.id));
    if (pocket) {
      for (let height = pocket.cutHeight - 1; height >= (pocket.minHeight ?? 40); height--) {
        if (budget.attempts >= MAX_ATTEMPTS) break;
        const candidate = clone(base);
        candidate.pieces.find(p => p.id === pocket.id)!.cutHeight = height;
        result = pack(candidate, scraps, cuts, bindings, budget);
        if (result.ok) break;
      }
    }
  }
  if (!result.ok) return result;
  const changedIds = result.plan.pieces.filter(piece => {
    const prior = currentPlan.pieces.find(p => p.id === piece.id)!;
    const before = currentPlan.placements.find(p => p.pieceId === piece.id);
    const after = result.plan.placements.find(p => p.pieceId === piece.id);
    return !equalDimensions(piece, prior) || JSON.stringify(before) !== JSON.stringify(after);
  }).map(p => p.id);
  const pocket = result.plan.pieces.find(p => p.role === 'pocket');
  const previousPocket = currentPlan.pieces.find(p => p.role === 'pocket');
  return { ...result, changedPieceIds: changedIds,
    message: pocket && previousPocket && pocket.cutHeight < previousPocket.cutHeight
      ? `The uncut pocket becomes ${pocket.cutHeight} mm deep. Cut panels and selected fabrics stay unchanged.`
      : 'A valid layout was found on the selected fabrics. Already-cut pieces stay unchanged.' };
}

/** Validates the actual saved layout, without treating a recovered alternative as the current plan. */
export function validatePlan(plan: Plan, scraps: Scrap[], cuts: CutRecord[]): boolean {
  if (inputError(scraps, plan.pieces, cuts) || plan.placements.length !== plan.pieces.length
    || new Set(plan.placements.map(p => p.pieceId)).size !== plan.pieces.length) return false;
  const pairs = new Map<string, PieceSpec>();
  for (const piece of plan.pieces) {
    if (piece.pairGroup) {
      const pair = pairs.get(piece.pairGroup);
      if (pair && !equalDimensions(pair, piece)) return false;
      pairs.set(piece.pairGroup, piece);
    }
    const placement = plan.placements.find(p => p.pieceId === piece.id);
    if (!placement || !equalDimensions(piece, placement)) return false;
    const cut = cuts.find(c => c.piece.id === piece.id);
    if (cut) {
      if (JSON.stringify(cut.placement) !== JSON.stringify(placement)) return false;
      continue;
    }
    const scrap = scraps.find(s => s.id === placement.scrapId);
    if (!scrap || ![0, 90].includes(placement.rotation) || (placement.rotation === 90 && (piece.grain === 'fixed' || scrap.grain === 'fixed'))) return false;
    const w = placement.rotation === 0 ? piece.cutWidth : piece.cutHeight;
    const h = placement.rotation === 0 ? piece.cutHeight : piece.cutWidth;
    const expected = rectangle(w, h, placement.x, placement.y);
    const shape = placementGeometry(placement);
    if (!validateGeometry(shape) || !contains(expected, shape) || !contains(shape, expected) || !contains(scrap.geometry, shape)) return false;
  }
  for (let a = 0; a < plan.placements.length; a++) for (let b = a + 1; b < plan.placements.length; b++) {
    const left = plan.placements[a], right = plan.placements[b];
    if (left.scrapId === right.scrapId && overlapArea(placementGeometry(left), placementGeometry(right)) > AREA_EPSILON) return false;
  }
  return true;
}
