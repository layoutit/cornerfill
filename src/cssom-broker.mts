type StylesheetMutation = Readonly<
  | { readonly index: number; readonly kind: "delete" }
  | { readonly index: number; readonly kind: "insert"; readonly rule: string }
>;

type MutationSubscriber = (mutation: StylesheetMutation) => void;
type StateSubscriber = () => void;

interface MutationBroker {
  readonly release: () => void;
  readonly subscribe: (subscriber: MutationSubscriber) => () => void;
}

interface StateBroker {
  readonly release: () => void;
  readonly subscribe: (subscriber: StateSubscriber) => () => void;
}

interface BrokerRegistry {
  readonly mutations: WeakMap<CSSStyleSheet, MutationBroker>;
  readonly states: WeakMap<object, StateBroker>;
}

const REGISTRY_KEY = Symbol.for("layoutit.cornerfill.cssom-broker@1");

function registry(globalObject: typeof globalThis): BrokerRegistry {
  const record = globalObject as typeof globalThis & { [REGISTRY_KEY]?: BrokerRegistry };
  if (!record[REGISTRY_KEY]) {
    Object.defineProperty(record, REGISTRY_KEY, {
      configurable: true,
      value: {
        mutations: new WeakMap<CSSStyleSheet, MutationBroker>(),
        states: new WeakMap<object, StateBroker>(),
      } satisfies BrokerRegistry,
    });
  }
  return record[REGISTRY_KEY]!;
}

function reportSubscriberError(globalObject: typeof globalThis, error: unknown): void {
  let reported = error;
  try {
    if (typeof globalObject.reportError === "function") {
      globalObject.reportError(error);
      return;
    }
  } catch (reportingError) {
    reported = new AggregateError([error, reportingError], "Cornerfill CSSOM observer error reporting failed");
  }
  globalObject.queueMicrotask(() => { throw reported; });
}

function notify<T>(
  globalObject: typeof globalThis,
  subscribers: ReadonlySet<(value: T) => void>,
  value: T,
): void {
  let errors: unknown[] | null = null;
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(value);
    } catch (error) {
      (errors ??= []).push(error);
    }
  }
  if (errors?.length === 1) reportSubscriberError(globalObject, errors[0]);
  else if (errors) {
    reportSubscriberError(globalObject, new AggregateError(errors, "Cornerfill CSSOM observers failed"));
  }
}

function subscribeUntilEmpty<T>(
  subscribers: Set<T>,
  release: () => void,
  subscriber: T,
): () => void {
  subscribers.add(subscriber);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    subscribers.delete(subscriber);
    if (subscribers.size === 0) release();
  };
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  previous: PropertyDescriptor | undefined,
): void {
  if (previous) Object.defineProperty(target, property, previous);
  else Reflect.deleteProperty(target, property);
}

export function observeStylesheetMutations(
  globalObject: typeof globalThis,
  sheet: CSSStyleSheet,
  subscriber: MutationSubscriber,
): (() => void) | null {
  const brokers = registry(globalObject).mutations;
  const existing = brokers.get(sheet);
  if (existing) return existing.subscribe(subscriber);
  const insertDescriptor = Object.getOwnPropertyDescriptor(sheet, "insertRule");
  const deleteDescriptor = Object.getOwnPropertyDescriptor(sheet, "deleteRule");
  const originalInsert = sheet.insertRule;
  const originalDelete = sheet.deleteRule;
  const subscribers = new Set<MutationSubscriber>();
  const wrappedInsert = function cornerfillInsertRule(
    this: CSSStyleSheet,
    rule: string,
    index?: number,
  ): number {
    const result = arguments.length < 2
      ? Reflect.apply(originalInsert, this, [rule])
      : Reflect.apply(originalInsert, this, [rule, index]);
    notify(globalObject, subscribers, Object.freeze({ kind: "insert", rule: String(rule), index: result }));
    return result;
  };
  const wrappedDelete = function cornerfillDeleteRule(this: CSSStyleSheet, index: number): void {
    Reflect.apply(originalDelete, this, [index]);
    notify(globalObject, subscribers, Object.freeze({ kind: "delete", index }));
  };
  try {
    Object.defineProperty(sheet, "insertRule", {
      configurable: true,
      value: wrappedInsert,
      writable: true,
    });
    Object.defineProperty(sheet, "deleteRule", {
      configurable: true,
      value: wrappedDelete,
      writable: true,
    });
  } catch {
    if (sheet.insertRule === wrappedInsert) restoreProperty(sheet, "insertRule", insertDescriptor);
    if (sheet.deleteRule === wrappedDelete) restoreProperty(sheet, "deleteRule", deleteDescriptor);
    return null;
  }
  let broker: MutationBroker;
  const release = () => {
    if (brokers.get(sheet) !== broker) return;
    brokers.delete(sheet);
    if (sheet.insertRule === wrappedInsert) restoreProperty(sheet, "insertRule", insertDescriptor);
    if (sheet.deleteRule === wrappedDelete) restoreProperty(sheet, "deleteRule", deleteDescriptor);
    subscribers.clear();
  };
  broker = { release, subscribe: (next) => subscribeUntilEmpty(subscribers, release, next) };
  brokers.set(sheet, broker);
  return broker.subscribe(subscriber);
}

function inheritedDescriptor(target: object, property: PropertyKey): PropertyDescriptor | undefined {
  for (let current: object | null = target; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, property);
    if (descriptor) return descriptor;
  }
  return undefined;
}

export function observeDisabledState(
  globalObject: typeof globalThis,
  target: object,
  subscriber: StateSubscriber,
): (() => void) | null {
  const brokers = registry(globalObject).states;
  const existing = brokers.get(target);
  if (existing) return existing.subscribe(subscriber);
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, "disabled");
  const descriptor = inheritedDescriptor(target, "disabled");
  if (!descriptor) return null;
  let dataValue = descriptor.value;
  const read = descriptor.get
    ? () => Reflect.apply(descriptor.get!, target, [])
    : () => dataValue;
  const write = descriptor.set
    ? (value: unknown) => Reflect.apply(descriptor.set!, target, [value])
    : descriptor.writable
      ? (value: unknown) => { dataValue = value; }
      : null;
  if (!write) return null;
  const subscribers = new Set<StateSubscriber>();
  const getDisabled = () => read();
  const setDisabled = (value: unknown) => {
    const before = read();
    write(value);
    if ((descriptor.set !== undefined && descriptor.get === undefined)
      || !Object.is(before, read())) {
      notify<void>(globalObject, subscribers, undefined);
    }
  };
  try {
    Object.defineProperty(target, "disabled", {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      get: getDisabled,
      set: setDisabled,
    });
  } catch {
    return null;
  }
  let broker: StateBroker;
  const release = () => {
    if (brokers.get(target) !== broker) return;
    brokers.delete(target);
    const current = Object.getOwnPropertyDescriptor(target, "disabled");
    if (current?.get === getDisabled && current.set === setDisabled) {
      if (ownDescriptor && "value" in ownDescriptor) {
        Object.defineProperty(target, "disabled", { ...ownDescriptor, value: read() });
      } else if (!ownDescriptor && "value" in descriptor) {
        Object.defineProperty(target, "disabled", {
          configurable: true,
          enumerable: true,
          value: read(),
          writable: true,
        });
      } else restoreProperty(target, "disabled", ownDescriptor);
    }
    subscribers.clear();
  };
  broker = { release, subscribe: (next) => subscribeUntilEmpty(subscribers, release, next) };
  brokers.set(target, broker);
  return broker.subscribe(subscriber);
}
