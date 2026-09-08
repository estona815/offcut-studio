import { rectangle } from './geometry';
import type { Recipe, Scrap } from './types';

export function seedScraps(): Scrap[] {
  return [
    { id: 'indigo', name: 'Indigo cotton', material: 'Cotton canvas · sample', color: '#344a64', geometry: rectangle(300, 240), grain: 'fixed' },
    { id: 'linen', name: 'Natural linen', material: 'Linen blend · sample', color: '#d9c9ac', geometry: rectangle(220, 180), grain: 'fixed' },
    { id: 'ochre', name: 'Ochre offcut', material: 'Cotton · sample', color: '#c58a3b', geometry: rectangle(160, 80), grain: 'fixed' },
  ];
}

function sleeve(size: string, width: number, height: number, pocketHeight: number): Recipe {
  return {
    id: `sleeve-${size.toLowerCase()}`, family: 'sleeve', label: 'Pocket sleeve', size,
    pieces: [
      { id: 'front', label: 'Front panel', role: 'front', cutWidth: width, cutHeight: height, seam: 5, grain: 'fixed', pairGroup: 'body', preferredScrapId: 'indigo' },
      { id: 'back', label: 'Back panel', role: 'back', cutWidth: width, cutHeight: height, seam: 5, grain: 'fixed', pairGroup: 'body', preferredScrapId: 'linen' },
      { id: 'pocket', label: 'Patch pocket', role: 'pocket', cutWidth: width - 10, cutHeight: pocketHeight, seam: 5, grain: 'fixed', minHeight: 40, preferredScrapId: 'ochre' },
    ],
    steps: [
      'Check the measured scraps and print at 100% scale. Cut dimensions include 5 mm allowance on every edge.',
      'Cut the front and back panels at their matching dimensions; do not resize one panel independently.',
      'Cut the pocket. Turn its edges by the included allowance and attach it to the front panel.',
      'Join the front and back at their matching sides and bottom, keeping the top open; finish the top edges.',
      'This original prototype pattern has not been physically sewn or fit-tested. Verify its construction before making.',
    ],
  };
}

function coaster(size: string, edge: number): Recipe {
  return {
    id: `coaster-${size.toLowerCase()}`, family: 'coaster', label: 'Two-sided coaster', size,
    pieces: [
      { id: 'coaster-a', label: 'Coaster face', role: 'coaster-a', cutWidth: edge, cutHeight: edge, seam: 5, grain: 'free', pairGroup: 'coaster', preferredScrapId: 'indigo' },
      { id: 'coaster-b', label: 'Coaster reverse', role: 'coaster-b', cutWidth: edge, cutHeight: edge, seam: 5, grain: 'free', pairGroup: 'coaster', preferredScrapId: 'linen' },
    ],
    steps: [
      'Cut two matching squares. The cut dimensions include 5 mm allowance on each edge.',
      'Join with right sides together, leaving a turning gap. Turn and close the gap.',
      'This prototype pattern is not tested for heat protection. It is not a protective potholder.',
    ],
  };
}

export function getRecipes(): Recipe[] {
  return [sleeve('Small', 90, 130, 70), sleeve('Medium', 110, 160, 80), sleeve('Large', 140, 200, 100),
    coaster('Small', 100), coaster('Medium', 120), coaster('Large', 160)];
}
