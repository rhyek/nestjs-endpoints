// What the Performance page and the home page show: nestjs-endpoints against the same API as
// plain NestJS controllers that validate with NestJS's own schema validation. Requests per
// second on one saturated CPU core: the median of six ten-second rounds, and the range across
// them. The repository's `benchmarks/` folder is what measured them.

type Measured = { median: number; range: [number, number] };

export type Scenario = {
  id: string;
  /** The request, as a reader would say it. */
  label: string;
  /** What is validated on the way in and out. */
  validated: string;
  endpoints: Measured;
  nest: Measured;
};

export const measuredOn =
  'Apple M1 Pro, Node.js 26.13, NestJS 12.4 on @nestjs/platform-node, Zod 4.6';

/** Two runs of the same app differed by up to this much: a smaller difference is not one. */
export const noisePercent = 0.6;

export const scenarios: Scenario[] = [
  {
    id: 'params',
    label: 'GET with path and search parameters',
    validated: 'Parameters in, an object out',
    endpoints: { median: 40_635, range: [40_481, 41_507] },
    nest: { median: 32_021, range: [31_817, 32_141] },
  },
  {
    id: 'body',
    label: 'POST with a JSON body',
    validated: 'An object in, an object out',
    endpoints: { median: 33_938, range: [33_730, 34_304] },
    nest: { median: 27_107, range: [26_885, 27_443] },
  },
  {
    id: 'list',
    label: 'GET a list of 50 items',
    validated: 'A 14 KB object out',
    endpoints: { median: 10_072, range: [9_963, 10_260] },
    nest: { median: 9_682, range: [9_521, 9_767] },
  },
  {
    id: 'invalid',
    label: 'POST rejected with a 400',
    validated: 'An object in, which breaks five rules',
    endpoints: { median: 24_619, range: [24_488, 24_675] },
    nest: { median: 24_560, range: [24_191, 25_271] },
  },
  {
    id: 'none',
    label: 'GET with no schemas',
    validated: 'Nothing',
    endpoints: { median: 49_837, range: [48_597, 50_494] },
    nest: { median: 49_744, range: [48_836, 50_496] },
  },
];

/** How much faster nestjs-endpoints is, in percent. */
export function difference({ endpoints, nest }: Scenario): number {
  return (endpoints.median / nest.median - 1) * 100;
}

/** The difference as a reader sees it: `+27%`, or `Level` when it is within the noise. */
export function differenceLabel(scenario: Scenario): string {
  const percent = difference(scenario);
  return Math.abs(percent) <= noisePercent ? 'Level' : `+${Math.round(percent)}%`;
}

export const count = (value: number) => value.toLocaleString('en-US');
