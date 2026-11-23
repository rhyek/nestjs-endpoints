import { declaredMembers, LIFECYCLE_HOOKS } from './instance-members';

const owners = [
  {
    owner: 'endpoint',
    own: ['handler', 'invoke'],
    at: 'endpoint.query() in /app/list.endpoint.ts',
  },
  { owner: 'router', own: ['configure'], at: 'EndpointRouter.create() in /app/router.ts' },
] as const;

describe.each(owners)('what a $owner declares for its instance', ({ owner, own, at }) => {
  const members = (declared: object, injected: string[] = []) =>
    declaredMembers(declared, { at, owner, injected, own });
  /** An instance of a class that has what `declared` declares. */
  const instanceOf = (declared: object, injected: string[] = []) => {
    const made = members(declared, injected);
    class Owner {}
    made.defineOn(Owner, undefined, at);
    const instance = new Owner() as Record<PropertyKey, any>;
    made.initialize(instance);
    return instance;
  };
  const each = `\`this\` has one member of each name.`;

  test('is nothing when it declares nothing', () => {
    const none = members({});
    expect(none).toMatchObject({ any: false, hooks: [] });
    expect(Object.keys(instanceOf({}))).toEqual([]);
  });

  test.each(['hook', 'method', 'properties'] as const)('is something with only a %s', (kind) => {
    const declared = {
      hook: { onModuleInit() {} },
      method: { methods: { find() {} } },
      properties: { properties: () => ({}) },
    }[kind];
    expect(members(declared).any).toBe(true);
  });

  test.each(LIFECYCLE_HOOKS)('has the hook %s on its class, and names it', (hook) => {
    const called: unknown[] = [];
    const declared = {
      [hook](this: unknown, signal?: string) {
        called.push(this, signal);
      },
    };
    expect(members(declared).hooks).toEqual([hook]);
    const instance = instanceOf(declared);
    expect(Object.keys(instance)).toEqual([]);
    (instance[hook] as (signal: string) => void)('SIGTERM');
    expect(called).toEqual([instance, 'SIGTERM']);
  });

  test.each(LIFECYCLE_HOOKS)('refuses a %s that is not a function', (hook) => {
    expect(() => members({ [hook]: 'no' })).toThrow(`${at}: \`${hook}\` must be a function.`);
  });

  test('has its methods on its class, with the instance as their `this`', () => {
    const instance = instanceOf({
      methods: {
        twice(this: { once(): number }) {
          return this.once() * 2;
        },
        once() {
          return 21;
        },
      },
    });
    expect((instance.twice as () => number)()).toBe(42);
    expect(Object.keys(instance)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(instance))).toEqual(
      expect.arrayContaining(['twice', 'once']),
    );
  });

  test('refuses a method that is not a function', () => {
    expect(() => members({ methods: { find: 1 } })).toThrow(
      `${at}: \`methods.find\` must be a function.`,
    );
  });

  test.each([
    [own[0], `a name the ${owner} has`],
    ['constructor', `a name the ${owner} has`],
    ['onApplicationBootstrap', 'a lifecycle hook'],
    ['users', 'which is injected'],
  ])('refuses a method named %s', (name, reason) => {
    expect(() => members({ methods: { [name]() {} } }, ['users'])).toThrow(
      `${at}: \`methods\` declares \`${name}\`, ${reason}: ${each}`,
    );
  });

  test.each([
    [own[0], `a name the ${owner} has`],
    ['constructor', `a name the ${owner} has`],
    ['beforeApplicationShutdown', 'a lifecycle hook'],
  ])('refuses what is injected under the name %s', (name, reason) => {
    expect(() => members({}, [name])).toThrow(
      `${at}: \`inject\` declares \`${name}\`, ${reason}: ${each}`,
    );
  });

  test('takes what is injected under any other name, with no member declared', () => {
    expect(members({}, ['users', 'clock']).any).toBe(false);
  });

  test.each([[{}], [[]], [1], ['x'], [null]])(
    'refuses properties given as %j, and not as a function',
    (properties) => {
      expect(() => members({ properties })).toThrow(
        `${at}: \`properties\` must be a function that returns them: each instance of the ${owner} has its own.`,
      );
    },
  );

  test.each([[null], [1], ['x'], [undefined]])(
    'refuses properties that return %j when an instance is made, and not before',
    (returned) => {
      const made = members({ properties: () => returned });
      expect(() => made.initialize({})).toThrow(`${at}: \`properties\` must return an object.`);
    },
  );

  test('asks for the properties once for each instance, and for none before', () => {
    const properties = vi.fn(() => ({ seen: [] as string[] }));
    const made = members({ properties });
    expect(properties).not.toHaveBeenCalled();
    const [one, other] = [{}, {}] as { seen?: string[] }[];
    made.initialize(one!);
    made.initialize(other!);
    expect(properties).toHaveBeenCalledTimes(2);
    expect(one!.seen).not.toBe(other!.seen);
  });

  test.each([
    [own[0], `a name the ${owner} has`],
    ['constructor', `a name the ${owner} has`],
    ['onModuleDestroy', 'a lifecycle hook'],
    ['users', 'which is injected'],
    ['find', 'which `methods` declares too'],
  ])('refuses a property named %s, when an instance is made', (name, reason) => {
    const made = members({ methods: { find() {} }, properties: () => ({ [name]: 1 }) }, ['users']);
    expect(() => made.initialize({})).toThrow(
      `${at}: \`properties\` declares \`${name}\`, ${reason}: ${each}`,
    );
  });

  test('refuses a property of such a name that is a getter, or that the keys of the object leave out', () => {
    const getter = () => Object.defineProperty({}, own[0], { get: () => 1, enumerable: true });
    const hidden = () => Object.defineProperty({}, own[0], { value: 1, enumerable: false });
    for (const properties of [getter, hidden]) {
      expect(() => members({ properties }).initialize({})).toThrow(
        `\`properties\` declares \`${own[0]}\``,
      );
    }
  });

  test('gives an instance its properties as they are declared: a value its own, a getter and a setter kept', () => {
    const key = Symbol('key');
    const instance = instanceOf({
      methods: {
        doubled(this: { count: number }) {
          return this.count * 2;
        },
      },
      properties: () => ({
        count: 1,
        [key]: 'by symbol',
        get double(): number {
          return (this as unknown as { doubled(): number }).doubled();
        },
        set double(value: number) {
          this.count = value / 2;
        },
      }),
    });
    expect(instance.count).toBe(1);
    expect(instance[key]).toBe('by symbol');
    expect(instance.double).toBe(2);
    instance.double = 10;
    expect(instance.count).toBe(5);
    // A value is among the instance's keys, as a field of a class is; an accessor is not.
    expect(Object.keys(instance)).toEqual(['count']);
    expect(Object.getOwnPropertyDescriptor(instance, 'count')).toMatchObject({
      writable: true,
      enumerable: true,
    });
  });

  test('keeps a property named `__proto__` a property', () => {
    const instance = instanceOf({ properties: () => JSON.parse('{ "__proto__": { "n": 1 } }') });
    expect(Object.getOwnPropertyDescriptor(instance, '__proto__')?.value).toEqual({ n: 1 });
    expect(Object.getPrototypeOf(instance)).not.toEqual({ n: 1 });
  });
});
