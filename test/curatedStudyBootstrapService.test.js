const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { bootstrapCuratedStudyData } = require("../src/services/curatedStudyBootstrapService");

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
