const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAnkiPackage } = require("../src/services/ankiPackageService");
const { resolvePythonCommand } = require("../src/services/toolchainService");

function writeFile(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf-8");
}

function sha256Buffer(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const python = resolvePythonCommand();

test("buildAnkiPackage reuses a sha-verified content-addressed APKG cache", {
    skip: !python,
}, async () => {
    const rootDir = fs.mkdtempSync(path.join(process.cwd(), "out", "anki-package-cache-test-"));

    try {
        const packageRootDir = path.join(rootDir, "package");
        const exportsDir = path.join(packageRootDir, "exports");
        const mediaDir = path.join(packageRootDir, "media");
        const exportPath = path.join(exportsDir, "jlpt-n5.tsv");
        const mediaBytes = Buffer.from("cache-test-media\n", "utf-8");
        const uniqueNote = `cache test ${Date.now()}`;

        writeFile(
            exportPath,
            [
                "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
                `日\t日\tday\tにち\tday\t日本\tニチ\tひ\t\t[sound:sample.txt]\t日\t${uniqueNote}\t日本が好きです。`,
            ].join("\n")
        );
        writeFile(path.join(mediaDir, "sample.txt"), mediaBytes);
        writeFile(path.join(packageRootDir, "media-integrity.json"), `${JSON.stringify({
            version: 1,
            generatedArtifact: true,
            checksumAlgorithm: "sha256",
            sourceRoot: null,
            files: [{
                fileName: "sample.txt",
                sha256: sha256Buffer(mediaBytes),
                byteSize: mediaBytes.length,
                kind: "audio",
                kanji: "日",
                relativePath: "audio/sample.txt",
                sourceRelativePath: null,
            }],
        }, null, 2)}\n`);

        const first = await buildAnkiPackage({
            packageRootDir,
            exports: [{
                level: 5,
                filePath: exportPath,
                rows: 1,
            }],
            mediaDir,
            levels: [5],
            deckKind: "kanji",
        });
        assert.equal(first.skipped, false);
        assert.equal(first.cacheHit, undefined);
        assert.match(first.pythonRuntime.pythonVersion, /^\d+\.\d+\.\d+/u);
        assert.equal(first.integrityChecks.mediaFilesChecked, 1);
        const firstSha256 = sha256File(first.filePath);

        const second = await buildAnkiPackage({
            packageRootDir,
            exports: [{
                level: 5,
                filePath: exportPath,
                rows: 1,
            }],
            mediaDir,
            levels: [5],
            deckKind: "kanji",
        });
        assert.equal(second.skipped, false);
        assert.equal(second.cacheHit, true);
        assert.equal(second.pythonTimingsMs, null);
        assert.equal(second.pythonRuntime, null);
        assert.equal("describePythonTool" in second.timingsMs, false);
        assert.equal("runPythonApkgBuilder" in second.timingsMs, false);
        assert.equal(sha256File(second.filePath), firstSha256);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
