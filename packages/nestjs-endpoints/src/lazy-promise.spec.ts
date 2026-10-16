import { LazyPromise } from './lazy-promise.js';

describe('LazyPromise', () => {
  test('is a Promise, and does nothing until awaited', async () => {
    const run = vi.fn(() => Promise.resolve(42));
    const lazy = new LazyPromise(run);
    expect(lazy).toBeInstanceOf(Promise);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    await expect(lazy).resolves.toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('runs once and shares the result between concurrent awaits', async () => {
    const run = vi.fn(() => Promise.resolve({}));
    const lazy = new LazyPromise(run);
    const [a, b] = await Promise.all([lazy, lazy]);
    expect(a).toBe(b);
    expect(await lazy).toBe(a);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('passes rejections to catch and finally', async () => {
    const onFinally = vi.fn();
    const lazy = new LazyPromise<number>(() =>
      Promise.reject(new Error('boom')),
    );
    await expect(lazy.catch((e: Error) => e.message)).resolves.toBe(
      'boom',
    );
    await expect(lazy.finally(onFinally)).rejects.toThrow('boom');
    expect(onFinally).toHaveBeenCalledTimes(1);
  });
});
