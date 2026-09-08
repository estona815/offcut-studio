import type { MultiPolygon, Scrap } from '../domain/types';
import { bounds } from '../domain/geometry';
import indigo from '../assets/fabric-indigo__2026-09-08__v001.png';
import linen from '../assets/fabric-linen__2026-09-08__v001.png';
import ochre from '../assets/fabric-ochre__2026-09-08__v001.png';

export const fabricAssets = { indigo, linen, ochre };
export function fabricFor(scrap: Scrap) {
  if (scrap.id === 'indigo' || scrap.color.toLowerCase() === '#344a64') return indigo;
  if (scrap.id === 'linen' || scrap.color.toLowerCase() === '#d9c9ac') return linen;
  return ochre;
}
export const mm = (value: number) => Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
export function stockSize(scrap: Scrap) {
  if (!scrap.geometry.length) return { width: 0, height: 0 };
  const box = bounds(scrap.geometry);
  return { width: mm(box.maxX - box.minX), height: mm(box.maxY - box.minY) };
}
export function geometryPath(geometry: MultiPolygon) {
  return geometry.flatMap(polygon => polygon.map(ring => ring.length ? `M${ring.map(p => `${p[0]},${p[1]}`).join(' L')} Z` : '')).join(' ');
}
