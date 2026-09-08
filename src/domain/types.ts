/** All geometric coordinates and cut dimensions are millimetres. */
export type Point = [number, number];
export type Ring = Point[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];
export type Grain = 'fixed' | 'free';
export interface Scrap {
  id: string;
  name: string;
  material: string;
  color: string;
  /** Available, uncut stock. Holes and disconnected remnants are preserved. */
  geometry: MultiPolygon;
  grain: Grain;
}
export interface PieceSpec {
  id: string;
  label: string;
  role: 'front' | 'back' | 'pocket' | 'coaster-a' | 'coaster-b';
  /** Cut dimensions already include seam allowance. Never add it twice. */
  cutWidth: number;
  cutHeight: number;
  seam: number;
  grain: Grain;
  pairGroup?: string;
  preferredScrapId?: string;
  minHeight?: number;
}
export interface Placement {
  pieceId: string;
  scrapId: string;
  x: number;
  y: number;
  rotation: 0 | 90;
  polygon: Ring;
  cutWidth: number;
  cutHeight: number;
}
export interface Recipe {
  id: string;
  family: 'sleeve' | 'coaster';
  label: string;
  size: string;
  pieces: PieceSpec[];
  steps: string[];
}
export interface Plan extends Recipe {
  recipeId: string;
  placements: Placement[];
  notes: string[];
}
export interface CutRecord {
  piece: PieceSpec;
  placement: Placement;
  cutAtRevision: number;
}
export type PlanResult =
  | { ok: true; plan: Plan; changedPieceIds: string[]; message: string }
  | { ok: false; code: 'NOT_FOUND' | 'LOCKED_DIMENSIONS' | 'INVALID_INPUT'; message: string };
export interface Candidate { recipe: Recipe; result: PlanResult }
export type PieceOverrides = Record<string, { cutWidth?: number; cutHeight?: number }>;
export interface Workspace {
  schemaVersion: 1;
  revision: number;
  scraps: Scrap[];
  plan: Plan;
  cuts: CutRecord[];
  view: 'plan' | 'make';
  message: string;
  pendingRecovery: boolean;
  history: { revision: number; message: string }[];
}
