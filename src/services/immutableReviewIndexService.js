"use strict";

const EMPTY_BUCKET = Object.freeze([]);

function normalizeLookupKey(value) {
    return String(value ?? "").trim();
}

/**
 * Recursively freezes JSON-shaped review input and rejects collection types
 * whose internal slots remain mutable after Object.freeze().
 *
 * @param {*} value
 * @param {WeakSet<object>} [seen]
 * @returns {*}
 */
function deepFreeze(value, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (value instanceof Map || value instanceof Set || value instanceof WeakMap || value instanceof WeakSet || ArrayBuffer.isView(value)) {
        throw new TypeError("Shared review inputs must use plain objects and arrays; mutable collection inputs are not allowed.");
    }
    if (seen.has(value)) {
        return value;
    }
    seen.add(value);

    for (const key of Reflect.ownKeys(value)) {
        deepFreeze(value[key], seen);
    }
    return Object.isFrozen(value) ? value : Object.freeze(value);
}

function normalizeKeys(value) {
    const values = Array.isArray(value) ? value : [value];
    return [...new Set(values.map(normalizeLookupKey).filter(Boolean))];
}

/**
 * Builds a read-only lookup facade over deep-frozen review values. The facade
 * intentionally exposes no mutation methods and returns frozen buckets.
 *
 * @param {Array<any>} values
 * @param {{getKeys: (value: any) => any, includeValue?: (value: any) => boolean}} options
 * @returns {{size: number, get: (key: any) => ReadonlyArray<any>, has: (key: any) => boolean, keys: () => ReadonlyArray<string>}}
 */
function createImmutableReviewIndex(values = [], {
    getKeys,
    includeValue = () => true,
} = {}) {
    if (typeof getKeys !== "function") {
        throw new TypeError("createImmutableReviewIndex requires getKeys.");
    }

    const indexedValues = deepFreeze(Array.isArray(values) ? values : []);
    const mutableBuckets = new Map();
    for (const value of indexedValues) {
        if (!includeValue(value)) {
            continue;
        }
        for (const key of normalizeKeys(getKeys(value))) {
            if (!mutableBuckets.has(key)) {
                mutableBuckets.set(key, []);
            }
            mutableBuckets.get(key).push(value);
        }
    }

    const buckets = new Map();
    for (const [key, bucket] of mutableBuckets.entries()) {
        buckets.set(key, Object.freeze([...bucket]));
    }
    const keys = Object.freeze([...buckets.keys()]);

    return Object.freeze({
        size: buckets.size,
        get(key) {
            return buckets.get(normalizeLookupKey(key)) || EMPTY_BUCKET;
        },
        has(key) {
            return buckets.has(normalizeLookupKey(key));
        },
        keys() {
            return keys;
        },
    });
}

module.exports = {
    createImmutableReviewIndex,
    deepFreeze,
};
