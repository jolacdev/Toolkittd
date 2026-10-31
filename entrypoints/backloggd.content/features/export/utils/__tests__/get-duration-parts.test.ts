import { getDurationParts } from '../get-duration-parts';

describe('getDurationParts', () => {
  it.each([
    [0, { hours: 0, minutes: 0, seconds: 0 }],
    [59, { hours: 0, minutes: 0, seconds: 59 }],
    [60, { hours: 0, minutes: 1, seconds: 0 }],
    [3661, { hours: 1, minutes: 1, seconds: 1 }],
    [90_061, { hours: 25, minutes: 1, seconds: 1 }],
    [3661.9, { hours: 1, minutes: 1, seconds: 1 }],
  ])('splits %s seconds into duration parts', (seconds, expected) => {
    expect(getDurationParts(seconds)).toEqual(expected);
  });
});
