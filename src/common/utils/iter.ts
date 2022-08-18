/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export type Falsey = false | 0 | "" | null | undefined;

interface Iterator<T> {
  filter(fn: (val: T) => unknown): Iterator<T>;
  filterMap<U>(fn: (val: T) => Falsey | U): Iterator<U>;
  find(fn: (val: T) => unknown): T | undefined;
  collect<U>(fn: (values: Iterable<T>) => U): U;
  map<U>(fn: (val: T) => U): Iterator<U>;
  flatMap<U>(fn: (val: T) => U[]): Iterator<U>;
  join(sep?: string): string;
}

export function pipeline<T>(src: IterableIterator<T>): Iterator<T> {
  return {
    filter: (fn) => pipeline(filter(src, fn)),
    filterMap: (fn) => pipeline(filterMap(src, fn)),
    map: (fn) => pipeline(map(src, fn)),
    flatMap: (fn) => pipeline(flatMap(src, fn)),
    find: (fn) => find(src, fn),
    join: (sep) => join(src, sep),
    collect: (fn) => fn(src),
  };
}

/**
 * Create a new type safe empty Iterable
 * @returns An `Iterable` that yields 0 items
 */
export function* newEmpty<T>(): IterableIterator<T> {}

/**
 * Creates a new `Iterable` that yields at most n items from src.
 * Does not modify `src` which can be used later.
 * @param src An initial iterator
 * @param n The maximum number of elements to take from src. Yields up to the floor of `n` and 0 items if n < 0
 */
export function* take<T>(src: Iterable<T>, n: number): IterableIterator<T> {
  outer: for (let i = 0; i < n; i += 1) {
    for (const item of src) {
      yield item;
      continue outer;
    }

    // if we are here that means that `src` has been exhausted. Don't bother trying again.
    break outer;
  }
}

/**
 * Creates a new iterator that iterates (lazily) over its input and yields the
 * result of `fn` for each item.
 * @param src A type that can be iterated over
 * @param fn The function that is called for each value
 */
export function* map<T, U>(src: Iterable<T>, fn: (from: T) => U): IterableIterator<U> {
  for (const from of src) {
    yield fn(from);
  }
}

/**
 * The single layer flattening of an iterator, discarding `Falsey` values.
 * @param src A type that can be iterated over
 * @param fn The function that returns either an iterable over items that should be filtered out or a `Falsey` value indicating that it should be ignored
 */
export function* filterFlatMap<T, U>(src: Iterable<T>, fn: (from: T) => Iterable<U | Falsey> | Falsey): IterableIterator<U> {
  for (const from of src) {
    if (!from) {
      continue;
    }

    const mapping = fn(from);

    if (!mapping) {
      continue;
    }

    for (const mapped of mapping) {
      if (mapped) {
        yield mapped;
      }
    }
  }
}

/**
 * Returns a new iterator that yields the items that each call to `fn` would produce
 * @param src A type that can be iterated over
 * @param fn A function that returns an iterator
 */
export function* flatMap<T, U>(src: Iterable<T>, fn: (from: T) => Iterable<U>): IterableIterator<U> {
  for (const from of src) {
    yield* fn(from);
  }
}

/**
 * Creates a new iterator that iterates (lazily) over its input and yields the
 * items that return a `truthy` value from `fn`.
 * @param src A type that can be iterated over
 * @param fn The function that is called for each value
 */
export function* filter<T>(src: Iterable<T>, fn: (from: T) => any): IterableIterator<T> {
  for (const from of src) {
    if (fn(from)) {
      yield from;
    }
  }
}

/**
 * Creates a new iterator that iterates (lazily) over its input and yields the
 * result of `fn` when it is `truthy`
 * @param src A type that can be iterated over
 * @param fn The function that is called for each value
 */
export function* filterMap<T, U>(src: Iterable<T>, fn: (from: T) => U | Falsey): IterableIterator<U> {
  for (const from of src) {
    const res = fn(from);

    if (res) {
      yield res;
    }
  }
}

/**
 * Creates a new iterator that iterates (lazily) over its input and yields the
 * result of `fn` when it is not null or undefined
 * @param src A type that can be iterated over
 * @param fn The function that is called for each value
 */
export function* filterMapStrict<T, U>(src: Iterable<T>, fn: (from: T) => U | null | undefined): IterableIterator<U> {
  for (const from of src) {
    const res = fn(from);

    if (res != null) {
      yield res;
    }
  }
}

/**
 * Iterate through `src` until `match` returns a truthy value
 * @param src A type that can be iterated over
 * @param match A function that should return a truthy value for the item that you want to find
 * @returns The first entry that `match` returns a truthy value for, or `undefined`
 */
export function find<T>(src: Iterable<T>, match: (i: T) => any): T | undefined {
  for (const from of src) {
    if (match(from)) {
      return from;
    }
  }

  return void 0;
}

/**
 * Iterate over `src` calling `reducer` with the previous produced value and the current
 * yielded value until `src` is exausted. Then return the final value.
 * @param src The value to iterate over
 * @param reducer A function for producing the next item from an accumilation and the current item
 * @param initial The initial value for the iteration
 */
export function reduce<T, R extends Iterable<any>>(src: Iterable<T>, reducer: (acc: R, cur: T) => R, initial: R): R;

export function reduce<T, R = T>(src: Iterable<T>, reducer: (acc: R, cur: T) => R, initial: R): R {
  let acc = initial;

  for (const item of src) {
    acc = reducer(acc, item);
  }

  return acc;
}

/**
 * A convenience function for reducing over an iterator of strings and concatenating them together
 * @param src The value to iterate over
 * @param connector The string value to intersperse between the yielded values
 * @returns The concatenated entries of `src` interspersed with copies of `connector`
 */
export function join(src: IterableIterator<unknown>, connector = ","): string {
  const iterSrc = src[Symbol.iterator]();
  const first = iterSrc.next();

  if (first.done === true) {
    return "";
  }

  return reduce(iterSrc, (acc, cur) => `${acc}${connector}${cur}`, `${first.value}`);
}

/**
 * Iterate `n` times and then return the next value.
 * @param src The value to iterate over
 * @param n The zero-index value for the item to return to.
 */
export function nth<T>(src: Iterable<T>, n: number): T | undefined {
  const iterator = src[Symbol.iterator]();

  while (n --> 0) {
    iterator.next();
  }

  return iterator.next().value;
}

/**
 * A convenience function to get the first item of an iterator
 * @param src The value to iterate over
 */
export function first<T>(src: Iterable<T>): T | undefined {
  return nth(src, 0);
}

/**
 * Iterate through `src` and return `true` if `fn` returns a thruthy value for every yielded value.
 * Otherwise, return `false`. This function short circuits.
 * @param src The type to be iterated over
 * @param fn A function to check each iteration
 */
export function every<T>(src: Iterable<T>, fn: (val: T) => any): boolean {
  for (const val of src) {
    if (!fn(val)) {
      return false;
    }
  }

  return true;
}
