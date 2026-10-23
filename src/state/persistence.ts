import polygonClipping from 'polygon-clipping';
const { intersection, xor } = polygonClipping;
import { area, rectangle, validateGeometry } from '../domain/geometry';
import { getRecipes } from '../domain/recipes';
import type { CutRecord, MultiPolygon, PieceSpec, Placement, Plan, Ring, Scrap, Workspace } from '../domain/types';
import { createWorkspace, hasValidActiveLayout, MAX_DIMENSION_MM } from './workspace';

export const STORAGE_KEY = 'offcut-studio.workspace.v1';
export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const MAX_JSON_LENGTH = 500_000;
const EPSILON = 0.00001;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && !Object.hasOwn(value, '__proto__') && !Object.hasOwn(value, 'constructor') && !Object.hasOwn(value, 'prototype');
}
function text(value: unknown, max = 300): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[<>\u0000-\u001f\u007f]/u.test(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
}
function number(value: unknown, min = 0, max = MAX_DIMENSION_MM): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function revision(value: unknown): value is number {
  return number(value, 0, Number.MAX_SAFE_INTEGER - 1) && Number.isInteger(value);
}
function ring(value: unknown): Ring | null {
  if (!Array.isArray(value) || value.length < 4 || value.length > 512) return null;
  const result: Ring = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2 || !number(point[0]) || !number(point[1])) return null;
    result.push([point[0], point[1]]);
  }
  if (result[0][0] !== result.at(-1)![0] || result[0][1] !== result.at(-1)![1]) return null;
  return result;
}
function geometry(value: unknown): MultiPolygon | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const result: MultiPolygon = [];
  for (const polygon of value) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 32) return null;
    const rings: Ring[] = [];
    for (const item of polygon) {
      const parsed = ring(item);
      if (!parsed) return null;
      rings.push(parsed);
    }
    result.push(rings);
  }
  return !result.length || validateGeometry(result) ? result : null;
}
function piece(value: unknown): PieceSpec | null {
  if (!record(value) || !id(value.id) || !text(value.label, 80)
    || !['front', 'back', 'pocket', 'coaster-a', 'coaster-b'].includes(String(value.role))
    || !number(value.cutWidth, 1) || !number(value.cutHeight, 1)
    || !number(value.seam, 0, Math.min(value.cutWidth, value.cutHeight) / 2)
    || !['fixed', 'free'].includes(String(value.grain))
    || (value.pairGroup !== undefined && !id(value.pairGroup))
    || (value.preferredScrapId !== undefined && !id(value.preferredScrapId))
    || (value.minHeight !== undefined && !number(value.minHeight, 1, value.cutHeight))) return null;
  return { id: value.id, label: value.label, role: value.role as PieceSpec['role'],
    cutWidth: value.cutWidth, cutHeight: value.cutHeight, seam: value.seam, grain: value.grain as PieceSpec['grain'],
    ...(value.pairGroup === undefined ? {} : { pairGroup: value.pairGroup as string }),
    ...(value.preferredScrapId === undefined ? {} : { preferredScrapId: value.preferredScrapId as string }),
    ...(value.minHeight === undefined ? {} : { minHeight: value.minHeight as number }) };
}
function placement(value: unknown): Placement | null {
  if (!record(value) || !id(value.pieceId) || !id(value.scrapId) || !number(value.x) || !number(value.y)
    || !number(value.cutWidth, 1) || !number(value.cutHeight, 1)
    || (value.rotation !== 0 && value.rotation !== 90)) return null;
  const polygon = ring(value.polygon);
  if (!polygon || !validateGeometry([[polygon]])) return null;
  const width = value.rotation === 90 ? value.cutHeight : value.cutWidth;
  const height = value.rotation === 90 ? value.cutWidth : value.cutHeight;
  if (area(xor([[polygon]], rectangle(width, height, value.x, value.y))) > EPSILON) return null;
  return { pieceId: value.pieceId, scrapId: value.scrapId, x: value.x, y: value.y,
    cutWidth: value.cutWidth, cutHeight: value.cutHeight, rotation: value.rotation, polygon };
}
function samePiece(a: PieceSpec, b: PieceSpec): boolean {
  return a.id === b.id && a.role === b.role && a.cutWidth === b.cutWidth && a.cutHeight === b.cutHeight
    && a.seam === b.seam && a.grain === b.grain && a.pairGroup === b.pairGroup;
}
function samePlacement(a: Placement, b: Placement): boolean {
  return a.pieceId === b.pieceId && a.scrapId === b.scrapId && a.x === b.x && a.y === b.y
    && a.rotation === b.rotation && a.cutWidth === b.cutWidth && a.cutHeight === b.cutHeight
    && area(xor([[a.polygon]], [[b.polygon]])) <= EPSILON;
}

/** Reconstruct only known fields. Storage is untrusted, including apparently valid JSON. */
function decodeWorkspace(value: unknown): Workspace | null {
  if (!record(value) || value.schemaVersion !== 1 || !revision(value.revision)
    || !['plan', 'make'].includes(String(value.view)) || !text(value.message, 2000)
    || typeof value.pendingRecovery !== 'boolean' || !Array.isArray(value.scraps)
    || !value.scraps.length || value.scraps.length > 30 || !Array.isArray(value.cuts)
    || value.cuts.length > 20 || !Array.isArray(value.history) || value.history.length > 60) return null;
  const scraps: Scrap[] = [];
  for (const item of value.scraps) {
    if (!record(item) || !id(item.id) || scraps.some(other => other.id === item.id)
      || !text(item.name, 80) || !text(item.material, 100) || typeof item.color !== 'string'
      || !/^#[\da-f]{6}$/i.test(item.color) || !['fixed', 'free'].includes(String(item.grain))) return null;
    const parsed = geometry(item.geometry);
    if (!parsed) return null;
    scraps.push({ id: item.id, name: item.name, material: item.material, color: item.color,
      grain: item.grain as Scrap['grain'], geometry: parsed });
  }
  const rawPlan = value.plan;
  if (!record(rawPlan) || !id(rawPlan.id) || rawPlan.recipeId !== rawPlan.id
    || !text(rawPlan.label, 100) || !text(rawPlan.size, 80) || !Array.isArray(rawPlan.pieces)
    || !rawPlan.pieces.length || rawPlan.pieces.length > 20 || !Array.isArray(rawPlan.placements)
    || rawPlan.placements.length !== rawPlan.pieces.length || !Array.isArray(rawPlan.steps)
    || rawPlan.steps.length > 40 || !rawPlan.steps.every(item => text(item, 2000))
    || !Array.isArray(rawPlan.notes) || rawPlan.notes.length > 40 || !rawPlan.notes.every(item => text(item, 2000))) return null;
  const original = getRecipes().find(item => item.id === rawPlan.id);
  if (!original || rawPlan.family !== original.family || rawPlan.pieces.length !== original.pieces.length) return null;
  const pieces: PieceSpec[] = [];
  for (const raw of rawPlan.pieces) {
    const parsed = piece(raw);
    const source = original.pieces.find(item => item.id === parsed?.id);
    if (!parsed || !source || pieces.some(item => item.id === parsed.id)
      || parsed.role !== source.role || parsed.seam !== source.seam || parsed.pairGroup !== source.pairGroup
      || parsed.grain !== source.grain || parsed.minHeight !== source.minHeight) return null;
    // The current product supports only shallower pockets; arbitrary saved pattern edits are not a recipe.
    if (parsed.cutWidth !== source.cutWidth
      || (parsed.role === 'pocket' ? parsed.cutHeight > source.cutHeight : parsed.cutHeight !== source.cutHeight)) return null;
    pieces.push(parsed);
  }
  for (const a of pieces) {
    if (a.pairGroup && pieces.some(b => b.pairGroup === a.pairGroup
      && (a.cutWidth !== b.cutWidth || a.cutHeight !== b.cutHeight))) return null;
  }
  const placements: Placement[] = [];
  for (const raw of rawPlan.placements) {
    const parsed = placement(raw);
    const spec = pieces.find(item => item.id === parsed?.pieceId);
    if (!parsed || !spec || placements.some(item => item.pieceId === parsed.pieceId)
      || !scraps.some(item => item.id === parsed.scrapId)
      || spec.cutWidth !== parsed.cutWidth || spec.cutHeight !== parsed.cutHeight) return null;
    placements.push(parsed);
  }
  const plan: Plan = { id: original.id, recipeId: original.id, family: original.family,
    label: rawPlan.label, size: rawPlan.size, pieces, placements, steps: rawPlan.steps as string[], notes: rawPlan.notes as string[] };
  const cuts: CutRecord[] = [];
  for (const raw of value.cuts) {
    if (!record(raw) || !revision(raw.cutAtRevision) || raw.cutAtRevision < 1 || raw.cutAtRevision > value.revision) return null;
    const spec = piece(raw.piece);
    const pos = placement(raw.placement);
    const currentPiece = pieces.find(item => item.id === spec?.id);
    const currentPlacement = placements.find(item => item.pieceId === pos?.pieceId);
    if (!spec || !pos || !currentPiece || !currentPlacement || !samePiece(spec, currentPiece)
      || !samePlacement(pos, currentPlacement) || cuts.some(item => item.piece.id === spec.id)) return null;
    const stock = scraps.find(item => item.id === pos.scrapId)!;
    if (stock.geometry.length && area(intersection(stock.geometry, [[pos.polygon]])) > EPSILON) return null;
    for (const other of cuts) {
      if (other.placement.scrapId === pos.scrapId
        && area(intersection([[pos.polygon]], [[other.placement.polygon]])) > EPSILON) return null;
    }
    cuts.push({ piece: spec, placement: pos, cutAtRevision: raw.cutAtRevision });
  }
  const history: Workspace['history'] = [];
  for (const item of value.history) {
    if (!record(item) || !revision(item.revision) || item.revision > value.revision || !text(item.message, 2000)) return null;
    history.push({ revision: item.revision, message: item.message });
  }
  return { schemaVersion: 1, revision: value.revision, scraps, plan, cuts, view: value.view as Workspace['view'],
    message: value.message, pendingRecovery: !hasValidActiveLayout(plan, scraps, cuts), history };
}

function storageOrDefault(storage?: WorkspaceStorage): WorkspaceStorage | null {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

export function saveWorkspace(state: Workspace, storage?: WorkspaceStorage): boolean {
  try {
    const clean = decodeWorkspace(state);
    const destination = storageOrDefault(storage);
    if (!clean || !destination) return false;
    const serialized = JSON.stringify(clean);
    if (serialized.length > MAX_JSON_LENGTH) return false;
    destination.setItem(STORAGE_KEY, serialized);
    return true;
  } catch { return false; }
}

export function loadWorkspace(storage?: WorkspaceStorage): Workspace {
  try {
    const serialized = storageOrDefault(storage)?.getItem(STORAGE_KEY);
    if (serialized && serialized.length <= MAX_JSON_LENGTH) {
      const clean = decodeWorkspace(JSON.parse(serialized) as unknown);
      if (clean) return clean;
    }
  } catch { /* Invalid or unavailable browser storage must never prevent opening the sample. */ }
  return createWorkspace();
}
