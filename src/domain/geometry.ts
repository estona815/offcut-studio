import { difference, intersection } from 'polygon-clipping';
import type { MultiPolygon, Placement, Point, Ring } from './types';

/** Squared millimetres: only numerical slivers below this are disregarded. */
export const AREA_EPSILON = 1e-6;
const EPSILON = 1e-8;

export function ringArea(ring: Ring): number {
  return Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

export function area(geometry: MultiPolygon): number {
  return geometry.reduce((total, polygon) => total + Math.max(0,
    (polygon[0] ? ringArea(polygon[0]) : 0) - polygon.slice(1).reduce((sum, hole) => sum + ringArea(hole), 0)), 0);
}

export function rectangle(width: number, height: number, x = 0, y = 0): MultiPolygon {
  if (![width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Rectangle dimensions must be positive finite millimetres.');
  }
  return [[[[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]]];
}

export function placementGeometry(placement: Placement): MultiPolygon {
  return [[placement.polygon]];
}

export function contains(stock: MultiPolygon, shape: MultiPolygon): boolean {
  return area(difference(shape, stock)) <= AREA_EPSILON;
}

export function overlapArea(a: MultiPolygon, b: MultiPolygon): number {
  return area(intersection(a, b));
}

export function subtractCut(geometry: MultiPolygon, placement: Placement): MultiPolygon {
  return difference(geometry, placementGeometry(placement));
}

export function bounds(geometry: MultiPolygon) {
  const points = geometry.flat(2);
  return {
    minX: Math.min(...points.map(point => point[0])),
    minY: Math.min(...points.map(point => point[1])),
    maxX: Math.max(...points.map(point => point[0])),
    maxY: Math.max(...points.map(point => point[1])),
  };
}

const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(a: Point, b: Point, p: Point) {
  return Math.abs(cross(a, b, p)) < EPSILON && p[0] >= Math.min(a[0], b[0]) - EPSILON
    && p[0] <= Math.max(a[0], b[0]) + EPSILON && p[1] >= Math.min(a[1], b[1]) - EPSILON
    && p[1] <= Math.max(a[1], b[1]) + EPSILON;
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON || abC < -EPSILON && abD > EPSILON)
    && (cdA > EPSILON && cdB < -EPSILON || cdA < -EPSILON && cdB > EPSILON))
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
function simpleRing(ring: Ring): boolean {
  if (!Array.isArray(ring) || ring.length < 3 || ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) return false;
  const points = same(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
  if (points.length < 3 || ringArea(points) <= AREA_EPSILON) return false;
  for (let i = 0; i < points.length; i++) {
    const nextI = (i + 1) % points.length;
    if (same(points[i], points[nextI])) return false;
    for (let j = i + 1; j < points.length; j++) {
      const nextJ = (j + 1) % points.length;
      if (nextI === j || nextJ === i) continue;
      if (intersects(points[i], points[nextI], points[j], points[nextJ])) return false;
    }
  }
  return true;
}

/** Empty stock is valid: the user may have consumed an entire scrap. */
export function validateGeometry(geometry: MultiPolygon): boolean {
  if (!Array.isArray(geometry)) return false;
  try {
    for (let i = 0; i < geometry.length; i++) {
      const polygon = geometry[i];
      if (!Array.isArray(polygon) || !polygon.length || polygon.some(ring => !simpleRing(ring))) return false;
      for (let h = 1; h < polygon.length; h++) {
        if (!contains([[polygon[0]]], [[polygon[h]]])) return false;
        for (let other = 1; other < h; other++) {
          if (overlapArea([[polygon[h]]], [[polygon[other]]]) > AREA_EPSILON) return false;
        }
      }
      for (let other = 0; other < i; other++) {
        if (overlapArea([polygon], [geometry[other]]) > AREA_EPSILON) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
