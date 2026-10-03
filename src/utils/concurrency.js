// src/utils/concurrency.js
'use strict';

/**
 * Map `items` through an async `fn` with at most `limit` calls in flight.
 *
 * Results are returned in INPUT order regardless of completion order, so callers
 * that sort afterwards get a deterministic result and callers that do not still
 * see the order they passed in.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit - Positive integer bound on concurrent calls.
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;

    async function worker() {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
    await Promise.all(workers);
    return results;
}

module.exports = { mapWithConcurrency };
