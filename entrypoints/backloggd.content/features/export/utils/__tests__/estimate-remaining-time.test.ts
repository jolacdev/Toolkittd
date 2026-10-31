import { createRemainingTimeEstimator } from '../estimate-remaining-time';

describe('createRemainingTimeEstimator', () => {
  it('waits for five completed games before estimating', () => {
    const estimate = createRemainingTimeEstimator({
      minimumCompletedItems: 5,
      recentIntervalCount: 10,
    });
    expect(estimate(0, 15, 0)).toBeUndefined();
    for (let current = 1; current < 5; current++) {
      expect(estimate(current, 15, current * 1000)).toBeUndefined();
    }
    expect(estimate(5, 15, 5000)).toBe(10);
  });

  it('uses the most recent ten games and includes slow requests', () => {
    const estimate = createRemainingTimeEstimator({
      minimumCompletedItems: 5,
      recentIntervalCount: 10,
    });
    estimate(0, 30, 0);
    for (let current = 1; current <= 10; current++) {
      estimate(current, 30, current * 1000);
    }
    expect(estimate(11, 30, 15_000)).toBe(27);

    for (let current = 12; current < 20; current++) {
      estimate(current, 30, 15_000 + (current - 11) * 100);
    }
    expect(estimate(20, 30, 15_900)).toBe(6);
    expect(estimate(21, 30, 16_000)).toBe(1);
  });

  it('omits the estimate after the last game', () => {
    const estimate = createRemainingTimeEstimator({
      minimumCompletedItems: 5,
      recentIntervalCount: 10,
    });
    for (let current = 0; current < 6; current++) {
      estimate(current, 6, current * 1000);
    }
    expect(estimate(6, 6, 6000)).toBeUndefined();
  });

  it('uses caller-provided warmup and sample window sizes', () => {
    const estimate = createRemainingTimeEstimator({
      minimumCompletedItems: 2,
      recentIntervalCount: 2,
    });
    estimate(0, 5, 0);
    expect(estimate(1, 5, 1000)).toBeUndefined();
    expect(estimate(2, 5, 2000)).toBe(3);
    expect(estimate(3, 5, 10_000)).toBe(9);
  });

  it('allows a zero estimate for instantaneous progress', () => {
    const estimate = createRemainingTimeEstimator({
      minimumCompletedItems: 1,
      recentIntervalCount: 1,
    });
    estimate(0, 3, 0);
    expect(estimate(1, 3, 0)).toBe(0);
  });
});
