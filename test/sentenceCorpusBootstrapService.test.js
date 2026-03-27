const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { bootstrapSentenceCorpus } = require("../src/services/sentenceCorpusBootstrapService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "sentence-bootstrap-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("bootstrapSentenceCorpus initializes the target file from starter entries", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "sentence_corpus.json");
        fs.writeFileSync(starterPath, JSON.stringify([
            {
                kanji: "日",
                written: "日本へ行きます。",
                japanese: "日本へ行きます。",
                reading: "にほんへいきます。",
                english: "I will go to Japan.",
            },
        ]), "utf-8");

        const summary = bootstrapSentenceCorpus({ targetPath, starterPath, merge: false });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, true);
        assert.equal(summary.writtenEntries, 1);
        assert.equal(written.length, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("bootstrapSentenceCorpus merges starter entries into an existing corpus", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "sentence_corpus.json");
        fs.writeFileSync(starterPath, JSON.stringify([
            {
                kanji: "日",
                written: "日本へ行きます。",
                japanese: "日本へ行きます。",
                reading: "にほんへいきます。",
                english: "I will go to Japan.",
            },
        ]), "utf-8");
        fs.writeFileSync(targetPath, JSON.stringify([
            {
                kanji: "本",
                written: "本を読みます。",
                japanese: "本を読みます。",
                reading: "ほんをよみます。",
                english: "I read a book.",
            },
        ]), "utf-8");

        const summary = bootstrapSentenceCorpus({ targetPath, starterPath, merge: true });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, true);
        assert.equal(summary.existingEntries, 1);
        assert.equal(summary.writtenEntries, 2);
        assert.equal(written.length, 2);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("bootstrapSentenceCorpus leaves an existing corpus untouched without merge", () => {
    const rootDir = makeTempDir();

    try {
        const starterPath = path.join(rootDir, "starter.json");
        const targetPath = path.join(rootDir, "sentence_corpus.json");
        fs.writeFileSync(starterPath, JSON.stringify([
            {
                kanji: "日",
                written: "日本へ行きます。",
                japanese: "日本へ行きます。",
                reading: "にほんへいきます。",
                english: "I will go to Japan.",
            },
        ]), "utf-8");
        fs.writeFileSync(targetPath, JSON.stringify([
            {
                kanji: "本",
                written: "本を読みます。",
                japanese: "本を読みます。",
                reading: "ほんをよみます。",
                english: "I read a book.",
            },
        ]), "utf-8");

        const summary = bootstrapSentenceCorpus({ targetPath, starterPath, merge: false });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.changed, false);
        assert.equal(summary.writtenEntries, 1);
        assert.equal(written[0].kanji, "本");
    } finally {
        cleanupTempDir(rootDir);
    }
});
