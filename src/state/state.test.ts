import { describe, expect, it } from 'vitest';
import { intersection } from 'polygon-clipping';
import { area, rectangle } from '../domain/geometry';
import { validatePlan } from '../domain/planner';
import type { Workspace } from '../domain/types';
import { executeCommand } from './commands';
import { loadWorkspace, saveWorkspace, STORAGE_KEY, type WorkspaceStorage } from './persistence';
import { addScrap, createWorkspace, editScrap, markPieceCut, replan, selectRecipe, setView } from './workspace';

function memoryStorage(initial: string | null = null): WorkspaceStorage {
  let stored = initial;
  return { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
}
const totalArea = (state: Workspace) => state.scraps.reduce((sum, scrap) => sum + area(scrap.geometry), 0);

describe('cutting state', () => {
  it('marks one physical cut only once and does not mutate the preceding workspace', () => {
    const seed = createWorkspace();
    const before = JSON.stringify(seed);
    const once = markPieceCut(seed, 'front');
    const twice = markPieceCut(once, 'front');
    expect(totalArea(seed) - totalArea(once)).toBeCloseTo(110 * 160, 6);
    expect(twice.cuts).toEqual(once.cuts);
    expect(twice.scraps).toEqual(once.scraps);
    expect(twice.revision).toBe(once.revision);
    expect(twice.history).toEqual(once.history);
    expect(JSON.stringify(seed)).toBe(before);
    expect(validatePlan(once.plan, once.scraps, once.cuts)).toBe(true);
  });

  it('cannot resurrect cut stock by shrinking and later enlarging a measurement', () => {
    const cut = markPieceCut(createWorkspace(), 'front');
    const trimmed = editScrap(cut, 'indigo', 180, 180, 'l');
    const enlarged = editScrap(trimmed, 'indigo', 300, 240, 'rectangle');
    const stock = enlarged.scraps.find(scrap => scrap.id === 'indigo')!;
    expect(area(intersection(stock.geometry, [[cut.cuts[0].placement.polygon]]))).toBe(0);
    expect(area(stock.geometry)).toBeCloseTo(area(trimmed.scraps[0].geometry), 6);
    expect(enlarged.cuts).toEqual(cut.cuts);
  });

  it('records an empty remnant without treating the cut piece as reusable material', () => {
    const cut = markPieceCut(createWorkspace(), 'front');
    const consumed = editScrap(cut, 'indigo', 110, 160, 'rectangle');
    expect(consumed.scraps[0].geometry).toEqual([]);
    expect(consumed.cuts).toEqual(cut.cuts);
    const storage = memoryStorage();
    expect(saveWorkspace(consumed, storage)).toBe(true);
    expect(loadWorkspace(storage).scraps[0].geometry).toEqual([]);
  });

  it('keeps ambiguous and unsupported commands from changing physical state', () => {
    const state = createWorkspace();
    for (const command of ['cut it', 'mark it cut', 'done', 'make pocket 2 shorter', 'ochre scrap is 6 tall']) {
      const result = executeCommand(state, command);
      expect(result.revision).toBe(state.revision);
      expect(result.cuts).toEqual(state.cuts);
      expect(result.scraps).toEqual(state.scraps);
      expect(result.plan).toEqual(state.plan);
      expect(result.message).not.toBe(state.message);
    }
  });

  it('rejects resizing a paired back after the front is cut, and rejects switching projects', () => {
    const cut = executeCommand(createWorkspace(), 'mark front cut');
    const rejected = executeCommand(cut, 'make back 10 cm wide');
    expect(rejected.plan).toEqual(cut.plan);
    expect(rejected.scraps).toEqual(cut.scraps);
    expect(rejected.revision).toBe(cut.revision);
    expect(rejected.message).toMatch(/match|fixed|cut/i);
    expect(selectRecipe(cut, 'coaster-medium').plan).toEqual(cut.plan);
  });

  it('executes the actual spoken demo sentence using the documented limited grammar', () => {
    const cut = executeCommand(createWorkspace(), 'Mark the front as cut.');
    const measured = executeCommand(cut, 'The ochre scrap is only six centimeters tall.');
    expect(measured.pendingRecovery).toBe(true);
    expect(area(measured.scraps.find(scrap => scrap.id === 'ochre')!.geometry)).toBe(160 * 60);
    expect(measured.cuts).toEqual(cut.cuts);
    const recovered = executeCommand(measured, 'replan pocket');
    expect(recovered.plan.pieces.find(piece => piece.id === 'pocket')!.cutHeight).toBe(60);
    const coaster = selectRecipe(createWorkspace(), 'coaster-medium');
    expect(executeCommand(coaster, 'cut it').message).toContain('coaster-a');
    expect(executeCommand(coaster, 'mark coaster face cut').cuts[0].piece.id).toBe('coaster-a');
  });

  it('recovers only an uncut pocket after a centimetre stock edit and persists the recovered cuts', () => {
    const frontCut = executeCommand(createWorkspace(), 'mark front cut');
    const edited = executeCommand(frontCut, 'ochre scrap is 6 cm tall');
    expect(edited.pendingRecovery).toBe(true);
    expect(edited.plan.pieces.find(piece => piece.id === 'pocket')!.cutHeight).toBe(80);
    expect(markPieceCut(edited, 'back').cuts).toEqual(edited.cuts);
    const recovered = executeCommand(edited, 'replan pocket');
    expect(recovered.pendingRecovery).toBe(false);
    expect(recovered.plan.pieces.find(piece => piece.id === 'pocket')!.cutHeight).toBe(60);
    expect(recovered.cuts).toEqual(frontCut.cuts);
    expect(recovered.plan.placements.find(item => item.pieceId === 'front')).toEqual(frontCut.cuts[0].placement);
    expect(validatePlan(recovered.plan, recovered.scraps, recovered.cuts)).toBe(true);
    const complete = markPieceCut(markPieceCut(recovered, 'back'), 'pocket');
    const storage = memoryStorage();
    expect(saveWorkspace(complete, storage)).toBe(true);
    const restored = loadWorkspace(storage);
    expect(restored.cuts).toEqual(complete.cuts);
    expect(restored.plan.pieces.find(piece => piece.id === 'pocket')!.cutHeight).toBe(60);
    expect(executeCommand(restored, "what's next").message).toMatch(/all pieces/i);
  });

  it('keeps failed recovery pending and supports an independently added concave scrap', () => {
    const edited = editScrap(createWorkspace(), 'ochre', 160, 20, 'rectangle');
    const failed = replan(edited);
    expect(failed.pendingRecovery).toBe(true);
    expect(failed.plan).toEqual(edited.plan);
    const added = addScrap(failed, { name: 'Spare blue', width: 200, height: 150, color: '#112233', shape: 'l', grain: 'free' });
    expect(added.scraps).toHaveLength(4);
    expect(area(added.scraps[3].geometry)).toBeCloseTo(200 * 150 * (1 - 0.35 * 0.45), 6);
    expect(added.pendingRecovery).toBe(true);
  });
});

describe('untrusted persistence', () => {
  it('round-trips physical state, view and grain while preserving cut idempotency after reload', () => {
    const storage = memoryStorage();
    const original = setView(markPieceCut(createWorkspace(), 'front'), 'make');
    const changed = editScrap(original, 'ochre', 160, 80, 'rectangle', 'free');
    expect(saveWorkspace(changed, storage)).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    const restored = loadWorkspace(storage);
    expect(restored).toEqual(changed);
    expect(markPieceCut(restored, 'front').scraps).toEqual(restored.scraps);
  });

  it.each(['{', 'null', '[]', '{"schemaVersion":99}', '{"schemaVersion":1,"revision":1e309}', 'x'.repeat(500_001)])(
    'falls back to the seed for malformed, unsupported or oversized data (case %#)', raw => {
      const restored = loadWorkspace(memoryStorage(raw));
      expect(restored.revision).toBe(0);
      expect(restored.cuts).toEqual([]);
      expect(restored.plan.recipeId).toBe('sleeve-medium');
    });

  it('rejects invalid numbers and malicious text in otherwise plausible saved state', () => {
    const poisoned = createWorkspace();
    poisoned.message = '<script>alert(1)</script>';
    expect(loadWorkspace(memoryStorage(JSON.stringify(poisoned))).message).not.toContain('<script>');
    poisoned.message = 'Sample';
    poisoned.scraps[0].geometry[0][0][1][0] = -12;
    expect(loadWorkspace(memoryStorage(JSON.stringify(poisoned))).revision).toBe(0);
    expect(loadWorkspace(memoryStorage(JSON.stringify(poisoned))).scraps[0].geometry).toEqual(rectangle(300, 240));
    expect(saveWorkspace(poisoned, memoryStorage())).toBe(false);
  });

  it('rejects stock that overlaps a completed cut and rejects altered cut snapshots', () => {
    const cut = markPieceCut(createWorkspace(), 'front');
    const resurrected = JSON.parse(JSON.stringify(cut)) as Workspace;
    resurrected.scraps[0].geometry = rectangle(300, 240);
    expect(saveWorkspace(resurrected, memoryStorage())).toBe(false);
    expect(loadWorkspace(memoryStorage(JSON.stringify(resurrected))).cuts).toEqual([]);
    const altered = JSON.parse(JSON.stringify(cut)) as Workspace;
    altered.cuts[0].piece.cutWidth = 100;
    expect(loadWorkspace(memoryStorage(JSON.stringify(altered))).cuts).toEqual([]);
  });

  it('recomputes stale recovery flags instead of trusting a forged valid flag', () => {
    const edited = editScrap(createWorkspace(), 'ochre', 160, 60);
    edited.pendingRecovery = false;
    expect(loadWorkspace(memoryStorage(JSON.stringify(edited))).pendingRecovery).toBe(true);
  });

  it('handles denied or full browser storage without crashing', () => {
    const denied: WorkspaceStorage = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota'); } };
    expect(saveWorkspace(createWorkspace(), denied)).toBe(false);
    expect(loadWorkspace(denied).cuts).toEqual([]);
  });
});
