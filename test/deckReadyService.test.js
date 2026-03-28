const test = require("node:test");
const assert = require("node:assert/strict");

const { formatDeckReadyReport } = require("../src/services/deckReadyService");

test("formatDeckReadyReport summarizes packaged media and readiness", () => {
    const text = formatDeckReadyReport({
        outDir: "C:/repo/out/build",
        levels: [5, 4],
        exports: [{ level: 5 }, { level: 4 }],
        package: {
            rootDir: "C:/repo/out/build/package",
            exportCount: 2,
            mediaAssetCount: 3,
            mediaCounts: {
                strokeOrder: 2,
                strokeOrderImage: 1,
                strokeOrderAnimation: 2,
                audio: 1,
            },
        },
        coverage: {
            strokeOrder: 0.5,
            audio: 0.25,
            fullMedia: 0.25,
        },
    }, {
        status: {
            mediaReadiness: [
                { label: "Stroke-order images", ready: true },
                { label: "Stroke-order animations", ready: true },
                { label: "Audio", ready: false },
            ],
        },
        quality: {
            levelReadiness: {
                overallReady: false,
                weakestLevels: [{ level: 4 }],
                levels: [
                    { level: 5, ready: true, readinessScore: 1 },
                    { level: 4, ready: false, readinessScore: 0.2 },
                ],
            },
        },
    });

    assert.match(text, /Japanese Kanji Builder Deck Ready/);
    assert.match(text, /Unique packaged media files: 3/);
    assert.match(text, /Stroke-order animation fields: 2/);
    assert.match(text, /Audio: not ready/);
    assert.match(text, /Full media coverage: 25.0%/);
    assert.match(text, /Level quality gates:/);
    assert.match(text, /N4: needs work; 20.0% checks passing/);
    assert.match(text, /Overall quality gate: failing/);
});

test("formatDeckReadyReport recommends configuring acquisition when no media was packaged", () => {
    const text = formatDeckReadyReport({
        outDir: "C:/repo/out/build",
        levels: [5],
        exports: [{ level: 5 }],
        package: {
            rootDir: "C:/repo/out/build/package",
            exportCount: 1,
            mediaAssetCount: 0,
            mediaCounts: {
                strokeOrder: 0,
                strokeOrderImage: 0,
                strokeOrderAnimation: 0,
                audio: 0,
            },
        },
        coverage: {
            strokeOrder: 0,
            audio: 0,
            fullMedia: 0,
        },
    });

    assert.match(text, /add local media sources or configure remote fallback providers/i);
});

test("formatDeckReadyReport hides audio sections when audio is disabled", () => {
    const text = formatDeckReadyReport({
        outDir: "C:/repo/out/build",
        levels: [5],
        exports: [{ level: 5 }],
        package: {
            rootDir: "C:/repo/out/build/package",
            exportCount: 1,
            mediaAssetCount: 2,
            mediaCounts: { strokeOrder: 2, strokeOrderImage: 1, strokeOrderAnimation: 1, audio: 0 },
        },
        coverage: { strokeOrder: 0.5, audio: 0, fullMedia: 0 },
    }, {
        status: { audioEnabled: false, mediaReadiness: [{ label: "Stroke-order images", ready: true }] },
        quality: { levelReadiness: { overallReady: false, weakestLevels: [{ level: 5 }], levels: [{ level: 5, ready: false, readinessScore: 0.6 }] } },
    });

    assert.doesNotMatch(text, /Audio fields:/);
    assert.doesNotMatch(text, /Audio coverage:/);
    assert.doesNotMatch(text, /Full media coverage:/);
});
