/**
 * A promise that starts its work the first time it is awaited, and shares that
 * one result with every later await.
 *
 * It is a real `Promise` subclass because NestJS's scanner only awaits module
 * imports that pass `instanceof Promise`.
 */
export class LazyPromise<T> extends Promise<T> {
  readonly #run: () => Promise<T>;
  #started?: Promise<T>;

  constructor(run: () => Promise<T>) {
    // The base promise is never observed: `then` below is the only way in.
    super((resolve) => resolve(undefined as T));
    this.#run = run;
  }

  // Derived promises (from `then`/`catch`/`finally`) are plain ones.
  static override get [Symbol.species]() {
    return Promise;
  }

  override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?:
      ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.#started ??= this.#run();
    return this.#started.then(onfulfilled, onrejected);
  }

  override catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.then(undefined, onrejected);
  }

  override finally(onfinally?: (() => void) | null): Promise<T> {
    this.#started ??= this.#run();
    return this.#started.finally(onfinally);
  }
}
