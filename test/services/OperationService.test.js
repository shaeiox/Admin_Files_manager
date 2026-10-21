// test/services/OperationService.test.js
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const OperationService = require('../../src/services/OperationService');

const SESSION = 'session-a';
const OTHER = 'session-b';

describe('OperationService: lifecycle states', () => {
    beforeEach(() => OperationService.reset());

    test('a new operation starts in preparing, not in progress', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 3 });
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.state, 'preparing');
        assert.equal(snap.items.total, 3);
    });

    test('a move is never determinate and offers no percentage', () => {
        const op = OperationService.create({ operationKind: 'move', sessionId: SESSION, itemsTotal: 2 });
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 0);
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.determinate, false);
        assert.equal(snap.percent, null);
    });

    test('an illegal transition is refused', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.start(op.id);
        OperationService.finish(op.id, { copied: 1 });
        // already terminal - cannot restart
        assert.throws(() => OperationService.start(op.id), /terminal/i);
        assert.throws(() => OperationService.setInFlight(op.id, '/a.txt', 'a.txt'), /terminal/i);
    });

    test('a terminal state is immutable across repeated reads', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 10);
        OperationService.finish(op.id, { copied: 1 });
        const first = OperationService.snapshot(op.id, SESSION);
        const second = OperationService.snapshot(op.id, SESSION);
        assert.equal(first.state, 'completed');
        assert.equal(second.state, 'completed');
    });

    test('every operation reaches exactly one terminal state', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 2 });
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 5);
        OperationService.failItem(op.id, '/b.txt', 'nope', 409);
        OperationService.finish(op.id, { copied: 1 });
        assert.equal(OperationService.snapshot(op.id, SESSION).state, 'partial');
    });

    test('a total failure terminates as failed, not completed', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.start(op.id);
        OperationService.failItem(op.id, '/a.txt', 'denied', 403);
        OperationService.finish(op.id, { copied: 0 });
        assert.equal(OperationService.snapshot(op.id, SESSION).state, 'failed');
    });

    test('cancellation is a terminal state distinct from completion', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 3 });
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 7);
        OperationService.cancel(op.id);
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.state, 'cancelled');
        assert.equal(snap.items.done, 1, 'work already finished is still reported as done');
    });

    test('cancelling an already-terminal operation is refused', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.start(op.id);
        OperationService.finish(op.id, { copied: 1 });
        assert.throws(() => OperationService.cancel(op.id), /terminal/i);
        assert.equal(OperationService.snapshot(op.id, SESSION).state, 'completed');
    });
});

describe('OperationService: progress is only measured work', () => {
    beforeEach(() => OperationService.reset());

    test('an unmeasured byte total is unavailable, never zero', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.setByteTotal(op.id, null);
        OperationService.start(op.id);
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.bytes.available, false);
        assert.equal(snap.bytes.total, null);
        assert.notEqual(snap.bytes.total, 0, 'unavailable must not masquerade as 0');
        assert.equal(snap.determinate, false);
    });

    test('a measured byte total makes the operation determinate', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 2 });
        OperationService.setByteTotal(op.id, 1000);
        OperationService.start(op.id);
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.bytes.available, true);
        assert.equal(snap.determinate, true);
    });

    test('bytes accumulate from completed files and never exceed the total', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 2 });
        OperationService.setByteTotal(op.id, 1000);
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 400);
        assert.equal(OperationService.snapshot(op.id, SESSION).bytes.transferred, 400);
        OperationService.completeItem(op.id, 400);
        assert.equal(OperationService.snapshot(op.id, SESSION).bytes.transferred, 800);
        assert.ok(OperationService.snapshot(op.id, SESSION).percent < 100);
    });

    test('completion reaches exactly one hundred percent', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.setByteTotal(op.id, 250);
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 250);
        OperationService.finish(op.id, { copied: 1 });
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.percent, 100);
        assert.equal(snap.bytes.transferred, snap.bytes.total);
    });

    test('a failed item contributes to neither side of the fraction', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 4 });
        OperationService.setByteTotal(op.id, 1000);
        OperationService.start(op.id);
        OperationService.completeItem(op.id, 1000);
        OperationService.failItem(op.id, '/a.txt', 'denied', 403);
        OperationService.failItem(op.id, '/b.txt', 'denied', 403);
        OperationService.failItem(op.id, '/c.txt', 'denied', 403);
        OperationService.finish(op.id, { copied: 1 });
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.bytes.transferred, snap.bytes.total, 'successes still account fully');
        assert.equal(snap.items.failed, 3, 'failures are reported separately');
        assert.equal(snap.items.total, 4, 'total is what was requested');
    });

    test('progress does not move without new work', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 2 });
        OperationService.setByteTotal(op.id, 100);
        OperationService.start(op.id);
        const a = OperationService.snapshot(op.id, SESSION);
        const b = OperationService.snapshot(op.id, SESSION);
        assert.deepEqual(a.bytes, b.bytes);
        assert.equal(a.percent, b.percent);
    });
});

describe('OperationService: the item in flight', () => {
    beforeEach(() => OperationService.reset());

    test('the in-flight item is reported while working', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 2 });
        OperationService.start(op.id);
        OperationService.setInFlight(op.id, '/media/clip.mp4', 'clip.mp4');
        const snap = OperationService.snapshot(op.id, SESSION);
        assert.equal(snap.itemInProgress.name, 'clip.mp4');
        assert.equal(snap.itemInProgress.path, '/media/clip.mp4');
    });

    test('the in-flight item belongs to the accepted request', () => {
        const paths = ['/media/a.txt', '/media/b.txt'];
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: paths.length, items: paths });
        OperationService.start(op.id);
        OperationService.setInFlight(op.id, '/media/a.txt', 'a.txt');
        assert.ok(paths.includes(OperationService.snapshot(op.id, SESSION).itemInProgress.path));
    });

    test('an item outside the request is refused', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1, items: ['/a.txt'] });
        OperationService.start(op.id);
        assert.throws(() => OperationService.setInFlight(op.id, '/elsewhere.txt', 'elsewhere.txt'), /not part of/i);
    });

    test('a completed operation reports no item in flight', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1, items: ['/a.txt'] });
        OperationService.start(op.id);
        OperationService.setInFlight(op.id, '/a.txt', 'a.txt');
        OperationService.completeItem(op.id, 5);
        OperationService.finish(op.id, { copied: 1 });
        assert.equal(OperationService.snapshot(op.id, SESSION).itemInProgress, null);
    });
});

describe('OperationService: failure detail survives to the terminal state', () => {
    beforeEach(() => OperationService.reset());

    test('each failure carries its own reason', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 2 });
        OperationService.start(op.id);
        OperationService.failItem(op.id, '/a.txt', 'collision', 409);
        OperationService.failItem(op.id, '/b.txt', 'missing', 404);
        OperationService.finish(op.id, { copied: 0 });
        const { failures } = OperationService.snapshot(op.id, SESSION);
        assert.equal(failures.length, 2);
        assert.equal(failures[0].statusCode, 409);
        assert.equal(failures[1].statusCode, 404);
    });

    test('recognised failures stay distinguishable from one another', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.start(op.id);
        OperationService.failItem(op.id, '/a.txt', 'Permission denied to copy item.', 403);
        OperationService.finish(op.id, { copied: 0 });
        assert.equal(OperationService.snapshot(op.id, SESSION).failures[0].statusCode, 403);
    });
});

describe('OperationService: scoping and retention', () => {
    beforeEach(() => OperationService.reset());

    test('another session cannot read the operation', () => {
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        assert.equal(OperationService.snapshot(op.id, OTHER), null);
    });

    test('an unknown operation reads as unknown rather than as a status', () => {
        assert.equal(OperationService.snapshot('nope', SESSION), null);
    });

    test('retention is bounded', () => {
        OperationService.configure({ maxRetained: 5, terminalTtlMs: 60000 });
        for (let i = 0; i < 20; i++) {
            const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
            OperationService.start(op.id);
            OperationService.finish(op.id, { copied: 1 });
        }
        assert.ok(OperationService.retainedCount() <= 5, `retained ${OperationService.retainedCount()}`);
        OperationService.configure({ maxRetained: 50, terminalTtlMs: 60000 });
    });

    test('an expired operation reads as unknown', () => {
        OperationService.configure({ maxRetained: 50, terminalTtlMs: 1 });
        const op = OperationService.create({ operationKind: 'copy', sessionId: SESSION, itemsTotal: 1 });
        OperationService.start(op.id);
        OperationService.finish(op.id, { copied: 1 });
        const later = Date.now() + 50;
        const realNow = Date.now;
        Date.now = () => later;
        try {
            assert.equal(OperationService.snapshot(op.id, SESSION), null);
        } finally {
            Date.now = realNow;
            OperationService.configure({ maxRetained: 50, terminalTtlMs: 60000 });
        }
    });
});