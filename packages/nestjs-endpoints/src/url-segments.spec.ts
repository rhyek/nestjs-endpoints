import { routerFolderSegments } from './url-segments';

describe("a folder of a router's inferred base path", () => {
  test.each([
    ['$clinicId', [':clinicId']],
    ['$clinicId.visits', [':clinicId', 'visits']],
    ['visits.$visitId', ['visits', ':visitId']],
  ])('%s names a path parameter, and reads as in an endpoint path', (folder, segments) => {
    expect(routerFolderSegments(folder)).toEqual(segments);
  });

  test.each(['clinics', 'v1.2', '_internal', '..'])(
    '%s is one segment, as it is named',
    (folder) => {
      expect(routerFolderSegments(folder)).toEqual([folder]);
    },
  );
});
