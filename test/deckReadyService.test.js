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
        exportIssues: {
            count: 0,
            warnings: 0,
            errors: 0,
        },
        reports: {
            exportIssuesPath: "C:/repo/out/build/reports/export-issues.json",
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
    assert.match(text, /Export fallback issues: 0/);
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
        exportIssues: {
            count: 0,
            warnings: 0,
            errors: 0,
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
        exportIssues: { count: 0, warnings: 0, errors: 0 },
    }, {
        status: { audioEnabled: false, mediaReadiness: [{ label: "Stroke-order images", ready: true }] },
        quality: { levelReadiness: { overallReady: false, weakestLevels: [{ level: 5 }], levels: [{ level: 5, ready: false, readinessScore: 0.6 }] } },
    });

    assert.doesNotMatch(text, /Audio fields:/);
    assert.doesNotMatch(text, /Audio coverage:/);
    assert.doesNotMatch(text, /Full media coverage:/);
});


test("formatDeckReadyReport keeps single-level next steps scoped to the built deck", () => {
    const text = formatDeckReadyReport({
        outDir: "C:/repo/out/build",
        levels: [5],
        exports: [{ level: 5 }],
        package: {
            rootDir: "C:/repo/out/build/package",
            exportCount: 1,
            mediaAssetCount: 158,
            mediaCounts: {
                strokeOrder: 79,
                strokeOrderImage: 79,
                strokeOrderAnimation: 79,
                audio: 0,
            },
        },
        coverage: {
            strokeOrder: 1,
            trueAnimation: 1,
            audio: 0,
            fullMedia: 0,
        },
        exportIssues: { count: 0, warnings: 0, errors: 0 },
    }, {
        status: {
            audioEnabled: false,
            mediaReadiness: [
                { label: "Stroke-order images", ready: true },
                { label: "Stroke-order animations", ready: true },
            ],
        },
        quality: {
            levelReadiness: {
                overallReady: false,
                weakestLevels: [{ level: 3 }],
                levels: [
                    { level: 5, ready: true, readinessScore: 1 },
                    { level: 3, ready: false, readinessScore: 0 },
                ],
            },
        },
    });

    assert.match(text, /this deck is ready, but the project-wide quality gate is still blocked by JLPT N3/i);
    assert.doesNotMatch(text, /raise JLPT N3 above the quality gate before calling this deck truly ready/i);
});

test("formatDeckReadyReport elevates export fallbacks to the next step", () => {
    const text = formatDeckReadyReport({
        outDir: "C:/repo/out/build",
        levels: [4],
        exports: [{ level: 4 }],
        package: {
            rootDir: "C:/repo/out/build/package",
            exportCount: 1,
            mediaAssetCount: 40,
            mediaCounts: {
                strokeOrder: 20,
                strokeOrderImage: 20,
                strokeOrderAnimation: 20,
                audio: 0,
            },
        },
        coverage: {
            strokeOrder: 1,
            trueAnimation: 1,
            audio: 0,
            fullMedia: 0,
        },
        exportIssues: {
            count: 3,
            warnings: 3,
            errors: 0,
        },
        reports: {
            exportIssuesPath: "C:/repo/out/build/reports/export-issues.json",
        },
    }, {
        status: {
            audioEnabled: false,
            mediaReadiness: [
                { label: "Stroke-order images", ready: true },
                { label: "Stroke-order animations", ready: true },
            ],
        },
        quality: {
            levelReadiness: {
                overallReady: true,
                weakestLevels: [],
                levels: [
                    { level: 4, ready: true, readinessScore: 1 },
                ],
            },
        },
    });

    assert.match(text, /Export fallback issues: 3/);
    assert.match(text, /Export issue report: C:\/repo\/out\/build\/reports\/export-issues.json/i);
    assert.match(text, /rerun with `--allow-export-fallbacks` only if you intentionally accept those fallback cards/i);
});
