// test/services/MetadataService.dashboard.test.js
'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const MetadataServiceSingleton = require('../../src/services/MetadataService');
const MetadataService = MetadataServiceSingleton.constructor;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-mdash-'));
let seq = 0;

function freshStore(contents) {
    const dir = path.join(TMP, `s${seq++}`);
    fs.mkdirSync(dir, { recursive: true });
    const instance = new MetadataService();
    instance.dbPath = path.join(dir, 'metadata.json');
    instance.cache = null;
    if (contents) {
        fs.writeFileSync(instance.dbPath, JSON.stringify(contents));
    }
    return instance;
}

const store = (downloads = {}) => ({ downloads, starred: [], activities: [] });

after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('getTopDownloads - ranking', () => {
    test('orders by descending download count', async () => {
        const svc = freshStore(store({
            '/a.txt': 3, '/b.txt': 10, '/c.txt': 7,
        }));

        const result = await svc.getTopDownloads(5);

        assert.deepEqual(result.map((e) => e.path), ['/b.txt', '/c.txt', '/a.txt']);
    });

    test('supplies max equal to the highest count in the returned set', async () => {
        const svc = freshStore(store({ '/a.txt': 3, '/b.txt': 10, '/c.txt': 7 }));

        const result = await svc.getTopDownloads(5);

        assert.equal(result[0].downloads, 10);
        assert.ok(result.every((e) => e.max === 10), 'every entry carries the set maximum');
        assert.equal(result[0].downloads, result[0].max,
            'the first entry equals max when sorted descending');
    });

    test('max is recomputed after filtering, not taken from the global peak', async () => {
        // /top.txt is the global peak but will be filtered out as stale.
        const svc = freshStore(store({ '/top.txt': 99, '/keep.txt': 4, '/keep2.txt': 2 }));

        const retained = [
            { path: '/keep.txt', downloads: 4 },
            { path: '/keep2.txt', downloads: 2 },
        ];

        const result = await svc.getTopDownloads(5, { retain: () => retained });

        assert.equal(result.length, 2);
        assert.equal(result[0].max, 4, 'max reflects the retained set, not the global peak');
        assert.ok(result.every((e) => e.max === 4));
    });

    test('excludes zero-download files', async () => {
        const svc = freshStore(store({ '/a.txt': 5, '/never.txt': 0, '/also-never.txt': 0 }));

        const result = await svc.getTopDownloads(10);

        assert.deepEqual(result.map((e) => e.path), ['/a.txt']);
    });

    test('returns an empty array when nothing has been downloaded', async () => {
        const svc = freshStore(store());
        assert.deepEqual(await svc.getTopDownloads(5), []);
    });

    test('returns an empty array for an empty store', async () => {
        const svc = freshStore();
        assert.deepEqual(await svc.getTopDownloads(5), []);
    });

    test('bounds the result size', async () => {
        const downloads = {};
        for (let i = 0; i < 50; i++) downloads[`/f${i}.txt`] = i + 1;

        const svc = freshStore(store(downloads));

        const result = await svc.getTopDownloads(5);
        assert.equal(result.length, 5);
        assert.equal(result[0].path, '/f49.txt', 'the highest is kept');
    });

    test('is deterministic for tied counts', async () => {
        const svc = freshStore(store({ '/a.txt': 5, '/b.txt': 5, '/c.txt': 5 }));

        const first = await svc.getTopDownloads(3);
        const second = await svc.getTopDownloads(3);

        assert.deepEqual(
            first.map((e) => e.path),
            second.map((e) => e.path),
            'ties resolve identically across calls'
        );
    });

    test('ignores non-numeric or corrupt counters', async () => {
        const svc = freshStore({
            downloads: { '/a.txt': 5, '/bad.txt': 'lots', '/nan.txt': NaN, '/neg.txt': -3 },
            starred: [],
            activities: [],
        });

        const result = await svc.getTopDownloads(10);

        assert.deepEqual(result.map((e) => e.path), ['/a.txt']);
    });

    test('returns only path and numeric fields - no filesystem paths', async () => {
        const svc = freshStore(store({ '/a.txt': 5 }));

        const [entry] = await svc.getTopDownloads(1);

        assert.deepEqual(Object.keys(entry).sort(), ['downloads', 'max', 'path']);
        assert.ok(entry.path.startsWith('/'), 'client path, not an OS path');
        assert.ok(!/[A-Za-z]:[\\/]/.test(JSON.stringify(entry)), 'no drive letter');
    });
});

describe('getActivities - timestamp integrity', () => {
    test('returns only activities with a finite epoch-millisecond time', async () => {
        const svc = freshStore({
            downloads: {},
            starred: [],
            activities: [
                { type: 'upload', action: 'good', target: 'a.txt', time: 1700000000000 },
                { type: 'upload', action: 'missing time', target: 'b.txt' },
                { type: 'upload', action: 'null time', target: 'c.txt', time: null },
                { type: 'upload', action: 'string time', target: 'd.txt', time: 'yesterday' },
                { type: 'upload', action: 'NaN time', target: 'e.txt', time: NaN },
                { type: 'upload', action: 'obj time', target: 'f.txt', time: {} },
                { type: 'upload', action: 'infinite', target: 'g.txt', time: Infinity },
            ],
        });

        const result = await svc.getActivities(50);

        assert.equal(result.length, 1, 'only the one valid timestamp survives');
        assert.equal(result[0].action, 'good');
    });

    test('never returns a timestamp that would render as 1970', async () => {
        const svc = freshStore({
            downloads: {},
            starred: [],
            activities: [
                { action: 'zero', target: 'a', time: 0 },
                { action: 'neg', target: 'b', time: -1 },
                { action: 'ok', target: 'c', time: 1700000000000 },
            ],
        });

        const result = await svc.getActivities(50);

        assert.ok(!result.some((a) => a.time === 0), 'epoch-zero is not a real timestamp');
        assert.ok(!result.some((a) => a.time < 0), 'negative is not a real timestamp');
        assert.ok(result.every((a) => Number.isFinite(a.time) && a.time > 0));
    });

    test('respects the requested limit', async () => {
        const svc = freshStore();
        for (let i = 0; i < 20; i++) {
            await svc.addActivity({ type: 'upload', action: `A${i}`, target: `f${i}` });
        }

        assert.equal((await svc.getActivities(5)).length, 5);
    });

    test('honours the 50-entry retention cap written by addActivity', async () => {
        const svc = freshStore();
        for (let i = 0; i < 80; i++) {
            await svc.addActivity({ type: 'upload', action: `A${i}`, target: `f${i}` });
        }

        const all = await svc.getActivities(1000);
        assert.equal(all.length, 50, 'retention cap enforced at the store');
    });

    test('drops invalid entries without dropping valid ones around them', async () => {
        const svc = freshStore({
            downloads: {},
            starred: [],
            activities: [
                { action: 'newest', target: 'a', time: 1700000003000 },
                { action: 'bad', target: 'b', time: 'nope' },
                { action: 'older', target: 'c', time: 1700000001000 },
            ],
        });

        const result = await svc.getActivities(10);

        assert.deepEqual(result.map((a) => a.action), ['newest', 'older'],
            'order preserved, invalid entry removed');
    });

    test('returns an empty array rather than null for an empty store', async () => {
        const svc = freshStore(store());
        const result = await svc.getActivities(10);
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
    });
});

describe('getHealthMetrics - honesty about units', () => {
    const FileSystemService = require('../../src/services/FileSystemService');

    test('every metric has a name, numeric value, unit and icon', () => {
        const metrics = FileSystemService.getHealthMetrics();

        assert.ok(Array.isArray(metrics));
        for (const m of metrics) {
            assert.equal(typeof m.name, 'string');
            assert.ok(m.name.length > 0);
            assert.equal(typeof m.value, 'number');
            assert.ok(Number.isFinite(m.value), `${m.name} value is finite`);
            assert.equal(typeof m.unit, 'string');
            assert.equal(typeof m.icon, 'string');
        }
    });

    test('no duration metric is labelled as a percentage', () => {
        const metrics = FileSystemService.getHealthMetrics();
        const uptime = metrics.find((m) => /uptime/i.test(m.name));

        if (uptime) {
            assert.notEqual(uptime.unit, '%', 'uptime is not a percentage');
            assert.ok(uptime.unit === 's' || uptime.unit === 'seconds' || uptime.unit === 'sec',
                `uptime unit should be seconds, got ${uptime.unit}`);
        }
    });

    test('percentage metrics really are percentages', () => {
        const metrics = FileSystemService.getHealthMetrics();
        for (const m of metrics.filter((x) => x.unit === '%')) {
            assert.ok(m.value >= 0 && m.value <= 100,
                `${m.name} = ${m.value} is outside 0..100`);
        }
    });

    test('no healthy/warning/critical status is asserted', () => {
        const metrics = FileSystemService.getHealthMetrics();
        for (const m of metrics) {
            assert.equal(m.status, undefined,
                `${m.name} must not carry an unevidenced status`);
            assert.equal(m.level, undefined);
            assert.equal(m.state, undefined);
        }
    });

    test('load average is not exposed anywhere', () => {
        // os.loadavg() exists on Windows and returns [0,0,0] - a plausible-looking
        // but fabricated reading with no error to detect. There is no portable
        // capability probe, and platform gating is forbidden, so the metric is
        // omitted entirely rather than reported as a healthy 0%.
        const metrics = FileSystemService.getHealthMetrics();
        assert.ok(!metrics.some((m) => /load/i.test(m.name)),
            'load average must not be surfaced');
    });

    test('the metric name set is stable across repeated calls', () => {
        const names = () => FileSystemService.getHealthMetrics().map((m) => m.name).sort();
        const first = names();
        for (let i = 0; i < 5; i++) {
            assert.deepEqual(names(), first, 'rows must not appear and disappear between polls');
        }
    });
});
