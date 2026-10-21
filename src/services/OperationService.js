// src/services/OperationService.js
'use strict';

const AppError = require('../utils/AppError');
const { randomUUID } = require('node:crypto');

/**
 * Registry for long-running filesystem operations (bulk Copy and Move).
 *
 * WHY THIS EXISTS. Copy and Move bytes move SERVER-side: FileSystemService.copy
 * walks the tree and move() calls fs.rename, both inside this process against
 * STORAGE_ROOT. The client sends a few hundred bytes of JSON and gets the whole
 * result at the end, so there is no transport-level signal to hang progress on.
 * The operation is therefore tracked here and read back by id.
 *
 * TRUTHFUL PROGRESS ONLY. Every figure below is counted from work that actually
 * happened. A quantity that was not measured is `null` with an `available:false`
 * flag - never 0, which is a real reading and would invent a measurement. There
 * is no timer, no elapsed-time interpolation, and no ETA: `fs.rename` is a single
 * atomic syscall with no intermediate state, so a move reports per-item counts and
 * `determinate:false` rather than a fabricated percentage.
 *
 * IN-PROCESS, SINGLE-NODE (ADR-008). Nothing is persisted, so an operation cannot
 * survive a restart. `snapshot()` answering null for an unknown id is therefore a
 * NORMAL answer a client must resolve, not an error to retry forever.
 */

const STATES = Object.freeze({
    PREPARING: 'preparing',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    PARTIAL: 'partial',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const TERMINAL = new Set([STATES.COMPLETED, STATES.PARTIAL, STATES.FAILED, STATES.CANCELLED]);

/**
 * A move relocates each item with one syscall; there is no sub-item state to
 * observe, so it never offers a determinate percentage. A copy does, but only
 * once its byte total has actually been measured.
 */
function isDeterminate(operationKind, bytesAvailable) {
    return operationKind === 'copy' && bytesAvailable;
}

class OperationService {
    /** @type {Map<string, object>} insertion-ordered, which is what eviction walks. */
    static _ops = new Map();

    static _config = {
        maxRetained: 50,
        terminalTtlMs: 5 * 60 * 1000,
    };

    /** Test seam, and the place a future deployment would read its limits from. */
    static configure(options = {}) {
        if (Number.isSafeInteger(options.maxRetained) && options.maxRetained > 0) {
            this._config.maxRetained = options.maxRetained;
        }
        if (Number.isSafeInteger(options.terminalTtlMs) && options.terminalTtlMs > 0) {
            this._config.terminalTtlMs = options.terminalTtlMs;
        }
        return this._config;
    }

    static reset() {
        this._ops.clear();
        this.configure({ maxRetained: 50, terminalTtlMs: 5 * 60 * 1000 });
    }

    /**
     * @param {{operationKind: 'copy'|'move', sessionId: string, itemsTotal: number, items?: string[]}} input
     * @returns {{id: string}} handle carrying the operation id
     */
    static create({ operationKind, sessionId, itemsTotal, items } = {}) {
        const op = {
            id: randomUUID(),
            operationKind,
            sessionId,
            state: STATES.PREPARING,
            // An accepted item list is the only thing the in-flight item may ever
            // be drawn from, so a caller cannot report work it never asked for.
            accepted: Array.isArray(items) ? items.slice() : null,
            itemInProgress: null,
            itemsDone: 0,
            itemsTotal: Number.isSafeInteger(itemsTotal) && itemsTotal > 0 ? itemsTotal : 0,
            itemsFailed: 0,
            bytesTransferred: 0,
            bytesTotal: null,
            pendingBytes: 0,
            failures: [],
            result: null,
            startedAt: null,
            finishedAt: null,
        };
        this._ops.set(op.id, op);
        this._evict();
        return { id: op.id };
    }

    /** @returns {object|undefined} the live record, or undefined if unknown. */
    static _get(id) {
        return this._ops.get(id);
    }

    /** @returns {object} the live record, guaranteed to exist and be mutable. */
    static _mutate(id) {
        const op = this._get(id);
        if (!op) throw new AppError('Operation not found.', 404);
        if (TERMINAL.has(op.state)) {
            throw new AppError('Operation is already in a terminal state.', 409);
        }
        return op;
    }

    /** Total bytes for the whole operation, or null when it could not be measured. */
    static setByteTotal(id, bytes) {
        const op = this._mutate(id);
        op.bytesTotal = Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
        return op;
    }

    static start(id) {
        const op = this._mutate(id);
        if (op.state !== STATES.PREPARING) {
            throw new AppError('Operation has already started.', 409);
        }
        op.state = STATES.IN_PROGRESS;
        op.startedAt = Date.now();
        return op;
    }

    /** Name the item actually being worked on right now. */
    static setInFlight(id, itemPath, itemName) {
        const op = this._mutate(id);
        if (op.accepted && !op.accepted.includes(itemPath)) {
            throw new AppError('Item is not part of this operation.', 400);
        }
        op.itemInProgress = { path: itemPath, name: itemName };
        return op;
    }

    /** One item finished successfully. Byte counts advance per FILE, not per chunk. */
    static completeItem(id, bytes = 0) {
        const op = this._mutate(id);
        op.itemsDone += 1;
        op.itemInProgress = null;
        const reported = Number.isSafeInteger(bytes) && bytes > 0 ? bytes : op.pendingBytes;
        if (op.bytesTotal != null && reported > 0) {
            op.bytesTransferred = Math.min(op.bytesTotal, op.bytesTransferred + reported);
        }
        op.pendingBytes = 0;
        return op;
    }

    /**
     * Bytes for the item currently being worked on. A folder copy reports one
     * value per FILE but completes as a single top-level item, so the running
     * total is accumulated here and folded in by completeItem().
     */
    static addFileBytes(id, bytes) {
        const op = this._mutate(id);
        if (!Number.isSafeInteger(bytes) || bytes <= 0 || op.bytesTotal == null) return op;
        op.pendingBytes = (op.pendingBytes || 0) + bytes;
        return op;
    }

    static failItem(id, itemPath, error, statusCode = 500) {
        const op = this._mutate(id);
        op.itemsFailed += 1;
        op.itemInProgress = null;
        op.failures.push({ path: itemPath, error, statusCode });
        return op;
    }

    /**
     * Move the operation to its one terminal state.
     *
     * @param {string} id
     * @param {{copied?: number, moved?: number, result?: object}} payload counts
     *   from the controller, which are the authority on what actually happened on
     *   disk, plus the per-item outcome list an asynchronous client needs in order
     *   to reconcile the tree once the operation completes.
     */
    static finish(id, payload = {}) {
        const { result, ...counts } = payload;
        const op = this._mutate(id);
        const succeeded = Number.isSafeInteger(counts.copied)
            ? counts.copied
            : (Number.isSafeInteger(counts.moved) ? counts.moved : op.itemsDone);

        op.finishedAt = Date.now();
        op.itemInProgress = null;
        op.result = result && typeof result === 'object' ? result : null;

        if (op.itemsFailed === 0 && succeeded > 0) {
            op.state = STATES.COMPLETED;
        } else if (succeeded > 0) {
            op.state = STATES.PARTIAL;
        } else {
            op.state = STATES.FAILED;
        }
        return op;
    }

    static cancel(id) {
        const op = this._mutate(id);
        op.state = STATES.CANCELLED;
        op.finishedAt = Date.now();
        op.itemInProgress = null;
        return op;
    }

    /**
     * The public, client-facing shape. A BARE object, matching the read-only
     * aggregate convention - there is no `{ success }` envelope on a status read.
     *
     * @returns {object|null} null when unknown, expired, or owned by another session.
     *   All three are deliberately indistinguishable to a non-owner: a caller must
     *   not be able to probe for the existence of another session's operations.
     */
    static snapshot(id, sessionId) {
        this._sweep();
        const op = this._get(id);
        if (!op || op.sessionId !== sessionId) return null;

        const bytesAvailable = op.bytesTotal != null;
        // A failed item is excluded from BOTH sides of the fraction, which is what
        // stops a bar from silently "completing" over work that was refused.
        const determinate = isDeterminate(op.operationKind, bytesAvailable);

        let percent = null;
        if (determinate && op.bytesTotal > 0) {
            percent = Math.round((op.bytesTransferred / op.bytesTotal) * 100);
        } else if (determinate && op.state === STATES.COMPLETED) {
            percent = 100;
        }
        if (percent != null) percent = Math.max(0, Math.min(100, percent));

        return {
            id: op.id,
            operationKind: op.operationKind,
            state: op.state,
            determinate,
            percent,
            itemInProgress: op.itemInProgress,
            items: {
                done: op.itemsDone,
                total: op.itemsTotal,
                failed: op.itemsFailed,
            },
            bytes: {
                transferred: bytesAvailable ? op.bytesTransferred : null,
                total: bytesAvailable ? op.bytesTotal : null,
                available: bytesAvailable,
            },
            failures: op.failures.slice(),
            // The per-item outcome, so an asynchronous client can reconcile its
            // tree from the same data the synchronous contract has always returned.
            result: op.result,
            startedAt: op.startedAt,
            finishedAt: op.finishedAt,
        };
    }

    static retainedCount() {
        return this._ops.size;
    }

    /** Drop terminal operations past their TTL. Active operations are never swept. */
    static _sweep() {
        const now = Date.now();
        for (const [id, op] of this._ops) {
            if (!TERMINAL.has(op.state)) continue;
            if (op.finishedAt != null && now - op.finishedAt > this._config.terminalTtlMs) {
                this._ops.delete(id);
            }
        }
    }

    /**
     * Keep the registry inside its bound. Insertion order is oldest-first, so
     * the oldest terminal operations go first and an active one is never the
     * victim unless it is genuinely the oldest entry in the map.
     */
    static _evict() {
        this._sweep();
        while (this._ops.size > this._config.maxRetained) {
            const oldest = this._ops.keys().next();
            if (oldest.done) break;
            this._ops.delete(oldest.value);
        }
    }
}

OperationService.STATES = STATES;
OperationService.TERMINAL = TERMINAL;

module.exports = OperationService;