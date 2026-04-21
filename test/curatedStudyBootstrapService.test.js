const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    bootstrapCuratedStudyData,
    isStarterDerivedEntry,
    refreshStarterEntries,
} = require("../src/services/curatedStudyBootstrapService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "curated-bootstrap-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("bootstrapCuratedStudyData initializes the target file from starter entries", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "curated_study_data.json");
        fs.writeFileSync(starterPath, JSON.stringify({
            日: {
                englishMeaning: "day",
                notes: "日本 - Japan",
            },
        }), "utf-8");

        const summary = bootstrapCuratedStudyData({ targetPath, starterPath, merge: false });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, true);
        assert.equal(summary.writtenEntries, 1);
        assert.equal(Object.keys(written).length, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("bootstrapCuratedStudyData merges starter entries into existing curated data", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "curated_study_data.json");
        fs.writeFileSync(starterPath, JSON.stringify({
            日: {
                englishMeaning: "day",
                notes: "日本 - Japan",
            },
        }), "utf-8");
        fs.writeFileSync(targetPath, JSON.stringify({
            本: {
                englishMeaning: "book",
                notes: "本 - book",
            },
        }), "utf-8");

        const summary = bootstrapCuratedStudyData({ targetPath, starterPath, merge: true });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, true);
        assert.equal(summary.existingEntries, 1);
        assert.equal(summary.writtenEntries, 2);
        assert.equal(Object.keys(written).length, 2);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("bootstrapCuratedStudyData leaves existing curated data untouched without merge", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "curated_study_data.json");
        fs.writeFileSync(starterPath, JSON.stringify({
            日: {
                englishMeaning: "day",
                notes: "日本 - Japan",
            },
        }), "utf-8");
        fs.writeFileSync(targetPath, JSON.stringify({
            本: {
                englishMeaning: "book",
                notes: "本 - book",
            },
        }), "utf-8");

        const summary = bootstrapCuratedStudyData({ targetPath, starterPath, merge: false });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, false);
        assert.equal(summary.writtenEntries, 1);
        assert.equal(Object.keys(written)[0], "本");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("bootstrapCuratedStudyData initializes from layered starter batches", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter_curated_study_data.json");
        const starterBatchPath = path.join(rootDir, "starter_curated_study_data_n1_batch_01.json");
        const targetPath = path.join(rootDir, "curated_study_data.json");
        fs.writeFileSync(starterPath, JSON.stringify({
            日: {
                englishMeaning: "day",
                notes: "日本 - Japan",
            },
        }), "utf-8");
        fs.writeFileSync(starterBatchPath, JSON.stringify({
            本: {
                englishMeaning: "book",
                notes: "本 - book",
            },
        }), "utf-8");

        const summary = bootstrapCuratedStudyData({ targetPath, starterPath, merge: false });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, true);
        assert.equal(summary.starterPaths.length, 2);
        assert.equal(summary.writtenEntries, 2);
        assert.deepEqual(Object.keys(written), ["日", "本"]);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("isStarterDerivedEntry detects tracked starter-derived local entries", () => {
    assert.equal(isStarterDerivedEntry({ source: "starter-curated" }), true);
    assert.equal(isStarterDerivedEntry({ tags: ["starter", "n5"] }), true);
    assert.equal(isStarterDerivedEntry({ source: "manual-curated", tags: ["curated"] }), false);
});

test("refreshStarterEntries refreshes stale starter-derived entries and preserves local custom entries", () => {
    const refreshed = refreshStarterEntries(
        {
            五: {
                englishMeaning: "five",
                displayWord: { written: "五", pron: "ご" },
                source: "starter-curated",
                tags: ["starter", "n5"],
            },
            日: {
                englishMeaning: "day",
                displayWord: { written: "日", pron: "ひ" },
                source: "starter-curated",
                tags: ["starter", "n5"],
            },
        },
        {
            五: {
                englishMeaning: "five",
                displayWord: { written: "五つ", pron: "いつつ" },
                source: "starter-curated",
                tags: ["starter", "n5"],
            },
            日: {
                englishMeaning: "sun / day",
                displayWord: { written: "日本", pron: "にほん" },
                source: "manual-curated",
                tags: ["curated"],
            },
            本: {
                englishMeaning: "book",
                displayWord: { written: "本", pron: "ほん" },
                source: "manual-curated",
                tags: ["curated"],
            },
        }
    );

    assert.deepEqual(refreshed.五.displayWord, { written: "五", pron: "ご" });
    assert.deepEqual(refreshed.日.displayWord, { written: "日本", pron: "にほん" });
    assert.deepEqual(refreshed.本.displayWord, { written: "本", pron: "ほん" });
});

test("bootstrapCuratedStudyData can refresh stale starter-derived entries without overwriting local custom entries", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "curated_study_data.json");
        fs.writeFileSync(starterPath, JSON.stringify({
            五: {
                englishMeaning: "five",
                displayWord: { written: "五", pron: "ご" },
                source: "starter-curated",
                tags: ["starter", "n5"],
                notes: "五分 （ごふん） - five minutes",
            },
        }), "utf-8");
        fs.writeFileSync(targetPath, JSON.stringify({
            五: {
                englishMeaning: "five",
                displayWord: { written: "五つ", pron: "いつつ" },
                source: "starter-curated",
                tags: ["starter", "n5"],
                notes: "五つ （いつつ） - five things",
            },
            日: {
                englishMeaning: "sun / day",
                displayWord: { written: "日本", pron: "にほん" },
                source: "manual-curated",
                tags: ["curated"],
                notes: "日本 （にほん） - Japan",
            },
        }), "utf-8");

        const summary = bootstrapCuratedStudyData({ targetPath, starterPath, refreshStarter: true });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, true);
        assert.equal(summary.refreshStarter, true);
        assert.deepEqual(written.五.displayWord, { written: "五", pron: "ご" });
        assert.deepEqual(written.日.displayWord, { written: "日本", pron: "にほん" });
    } finally {
        cleanupTempDir(rootDir);
    }
});
