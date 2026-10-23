import polygonClipping from 'polygon-clipping';
const { intersection } = polygonClipping;
import { rectangle, subtractCut } from '../domain/geometry';
import { getRecipes, seedScraps } from '../domain/recipes';
import { planRecipe, recoverPlan, validatePlan } from '../domain/planner';
import type { Grain, MultiPolygon, PieceOverrides, Plan, Scrap, Workspace } from '../domain/types';

export const MAX_DIMENSION_MM = 5000;

export function isSafeDimension(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= MAX_DIMENSION_MM;
}

function safeText(value: string, max = 80): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    && !/[<>\u0000-\u001f\u007f]/u.test(value);
}

/** A stock edit can trim an existing remnant; it cannot restore consumed fabric. */
function stockShape(width: number, height: number, shape: 'rectangle' | 'l'): MultiPolygon {
  if (shape === 'rectangle') return rectangle(width, height);
  return [[[[0, 0], [width, 0], [width, height * 0.55],
    [width * 0.65, height * 0.55], [width * 0.65, height], [0, height], [0, 0]]]];
}

export function withMessage(state: Workspace, message: string): Workspace {
  return { ...state, message };
}

function changed(state: Workspace, patch: Partial<Workspace>, message: string): Workspace {
  const revision = state.revision + 1;
  return { ...state, ...patch, revision, message,
    history: [...state.history, { revision, message }].slice(-60) };
}

/** Includes real polygon containment, not just the scraps' bounding rectangles. */
export function hasValidActiveLayout(plan: Plan, scraps: Scrap[], cuts: Workspace['cuts']): boolean {
  try { return validatePlan(plan, scraps, cuts); } catch { return false; }
}

export function createWorkspace(): Workspace {
  const scraps = seedScraps();
  const recipe = getRecipes().find(item => item.id === 'sleeve-medium');
  if (!recipe) throw new Error('The original medium sleeve recipe is missing.');
  const result = planRecipe(recipe.id, scraps);
  if (!result.ok) throw new Error(`The sample layout could not be created: ${result.message}`);
  const message = 'Sample scraps loaded. Choose a project, or switch to Make to begin cutting.';
  return { schemaVersion: 1, revision: 0, scraps, plan: result.plan, cuts: [], view: 'plan',
    message, pendingRecovery: false, history: [{ revision: 0, message }] };
}

export function nextInstruction(state: Workspace): string {
  if (state.pendingRecovery) return 'The remaining material changed. Replan the uncut pieces before continuing.';
  const piece = state.plan.pieces.find(item => !state.cuts.some(cut => cut.piece.id === item.id));
  if (!piece) return 'All pieces are marked cut. Follow the pattern assembly steps; sewing completion has not been recorded.';
  const placement = state.plan.placements.find(item => item.pieceId === piece.id);
  const scrap = state.scraps.find(item => item.id === placement?.scrapId);
  return `Next: cut ${piece.label}, ${piece.cutWidth} × ${piece.cutHeight} mm, from ${scrap?.name ?? 'the selected scrap'}. The dimensions already include the seam allowance. Mark it cut only after you finish.`;
}

export function markPieceCut(state: Workspace, pieceId: string): Workspace {
  if (state.cuts.some(cut => cut.piece.id === pieceId)) {
    return withMessage(state, 'That piece is already marked cut. No material was deducted again.');
  }
  const piece = state.plan.pieces.find(item => item.id === pieceId);
  const placement = state.plan.placements.find(item => item.pieceId === pieceId);
  const stock = state.scraps.find(item => item.id === placement?.scrapId);
  if (!piece || !placement || !stock) return withMessage(state, 'Choose an existing, placed piece to mark cut.');
  if (state.pendingRecovery || !hasValidActiveLayout(state.plan, state.scraps, state.cuts)) {
    return withMessage(state, 'Replan the remaining pieces before recording another cut.');
  }
  const geometry = subtractCut(stock.geometry, placement);
  const scraps = state.scraps.map(item => item.id === stock.id ? { ...item, geometry } : item);
  const cuts = [...state.cuts, { piece: { ...piece }, placement: { ...placement,
    polygon: placement.polygon.map(([x, y]) => [x, y] as [number, number]) }, cutAtRevision: state.revision + 1 }];
  const updated = changed(state, { scraps, cuts }, `${piece.label} marked cut. Its dimensions are now fixed.`);
  return { ...updated, message: `${updated.message} ${nextInstruction(updated)}` };
}

export function editScrap(state: Workspace, scrapId: string, width: number, height: number,
  shape: 'rectangle' | 'l' = 'rectangle', grain?: Grain): Workspace {
  if (!isSafeDimension(width) || !isSafeDimension(height) || !['rectangle', 'l'].includes(shape)
    || (grain !== undefined && !['fixed', 'free'].includes(grain))) {
    return withMessage(state, 'Use finite dimensions from 1 to 5,000 mm and a rectangle or L shape.');
  }
  if (!state.scraps.some(item => item.id === scrapId)) return withMessage(state, 'That scrap was not found.');
  const scraps = state.scraps.map(item => item.id === scrapId ? { ...item,
    grain: grain ?? item.grain,
    geometry: intersection(item.geometry, stockShape(width, height, shape)) } : item);
  const pendingRecovery = !hasValidActiveLayout(state.plan, scraps, state.cuts);
  return changed(state, { scraps, pendingRecovery }, pendingRecovery
    ? 'Material measurement updated. The current layout no longer fits; recover the uncut pieces. Completed cuts stay fixed.'
    : 'Material measurement updated. The current layout still fits. Only existing uncut material is retained.');
}

export interface NewScrap {
  name: string;
  width: number;
  height: number;
  color: string;
  shape: 'rectangle' | 'l';
  grain: Grain;
}

export function addScrap(state: Workspace, input: NewScrap): Workspace {
  if (state.scraps.length >= 30) return withMessage(state, 'This demo supports up to 30 scraps.');
  if (!input || !safeText(input.name) || !isSafeDimension(input.width) || !isSafeDimension(input.height)
    || !/^#[\da-f]{6}$/i.test(input.color) || !['rectangle', 'l'].includes(input.shape)
    || !['fixed', 'free'].includes(input.grain)) {
    return withMessage(state, 'Enter a name, valid millimetre dimensions, a six-digit hex colour, shape and grain setting.');
  }
  let index = state.scraps.length + 1;
  while (state.scraps.some(item => item.id === `scrap-${index}`)) index += 1;
  const scrap: Scrap = { id: `scrap-${index}`, name: input.name.trim(), color: input.color.toLowerCase(),
    grain: input.grain, material: 'User-entered fabric', geometry: stockShape(input.width, input.height, input.shape) };
  const scraps = [...state.scraps, scrap];
  return changed(state, { scraps, pendingRecovery: !hasValidActiveLayout(state.plan, scraps, state.cuts) },
    `${scrap.name} added. Re-evaluate projects or replan to use the new material.`);
}

export function selectRecipe(state: Workspace, recipeId: string): Workspace {
  if (state.cuts.length) return withMessage(state, 'A project with completed cuts cannot switch recipes. Start a new sample session to choose another project.');
  const result = planRecipe(recipeId, state.scraps);
  if (!result.ok) return withMessage(state, result.message);
  return changed(state, { plan: result.plan, pendingRecovery: false }, result.message);
}

export function replan(state: Workspace, overrides: PieceOverrides = {}): Workspace {
  const result = recoverPlan(state.plan, state.scraps, state.cuts, overrides);
  if (!result.ok) return withMessage(state, result.message);
  return changed(state, { plan: result.plan, pendingRecovery: false }, result.message);
}

export function setView(state: Workspace, view: Workspace['view']): Workspace {
  return view === 'plan' || view === 'make' ? { ...state, view } : state;
}
