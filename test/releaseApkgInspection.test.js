const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolvePythonCommand } = require("../src/services/toolchainService");

function writeFile(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, "utf-8");
}

function buildFixture(python, tempRoot, deckKind = "kanji") {
    const buildRoot = path.join(tempRoot, "build");
    const packageRoot = path.join(buildRoot, "package");
    const fixtureTsv = fs.readFileSync(
        path.join(
            process.cwd(),
            "examples",
            "n5-mini",
            deckKind === "word" ? "sample-word-output.tsv" : "sample-kanji-output.tsv"
        ),
        "utf-8"
    );
    writeFile(
        path.join(packageRoot, "exports", deckKind === "word" ? "jlpt-n5-words.tsv" : "jlpt-n5.tsv"),
        fixtureTsv
    );
    const referencedMedia = [...fixtureTsv.matchAll(/\[sound:([^\]]+)\]|src="([^"]+)"/gu)]
        .map((match) => match[1] || match[2]);
    for (const mediaName of referencedMedia) {
        writeFile(path.join(packageRoot, "media", mediaName), `fixture media for ${mediaName}\n`);
    }
    const build = spawnSync(
        python.command,
        [
            ...python.argsPrefix,
            path.join(process.cwd(), "scripts", "buildApkg.py"),
            "--out-dir",
            buildRoot,
            "--levels=5",
            `--deck-kind=${deckKind}`,
            "--json",
        ],
        { cwd: process.cwd(), encoding: "utf-8" }
    );
    assert.equal(build.status, 0, build.stderr || build.stdout);
    return JSON.parse(build.stdout);
}

function runInspector(python, packetPath, artifactDirectory, json = false) {
    return spawnSync(
        python.command,
        [
            ...python.argsPrefix,
            path.join(process.cwd(), "scripts", "inspectReleaseApkg.py"),
            `--packet=${packetPath}`,
            `--artifact-dir=${artifactDirectory}`,
            ...(json ? ["--json"] : []),
        ],
        { cwd: process.cwd(), encoding: "utf-8" }
    );
}

const python = resolvePythonCommand();

test("release APKG inspector verifies archive, SQLite, decks, counts, fields, cards, and media", {
    skip: python ? false : "Python is unavailable",
}, (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-apkg-inspector-"));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
    const build = buildFixture(python, tempRoot);
    const artifactDirectory = path.join(tempRoot, "release-assets");
    fs.mkdirSync(artifactDirectory);
    const releaseAssetName = "japanese-kanji-builder-n5.apkg";
    fs.copyFileSync(build.filePath, path.join(artifactDirectory, releaseAssetName));
    const packetPath = path.join(tempRoot, "packet.json");
    writeFile(packetPath, JSON.stringify({
        scope: {
            releaseCandidateId: "fixture",
            artifacts: [{
                deckKind: "kanji",
                levels: [5],
                releaseAssetName,
                notes: 1,
                cards: 1,
                mediaEntries: build.mediaFileCount,
            }],
        },
    }));

    const result = runInspector(python, packetPath, artifactDirectory, true);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "pass");
    assert.equal(report.artifacts[0].collectionVersion, 11);
    assert.equal(report.artifacts[0].notes, 1);
    assert.equal(report.artifacts[0].cards, 1);
    assert.equal(report.artifacts[0].mediaEntries, build.mediaFileCount);
    assert.deepEqual(report.artifacts[0].decks, ["Japanese Kanji Builder::JLPT N5"]);
});

test("release APKG inspector verifies the shipped word-deck contract", {
    skip: python ? false : "Python is unavailable",
}, (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-word-apkg-inspector-"));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
    const build = buildFixture(python, tempRoot, "word");
    const artifactDirectory = path.join(tempRoot, "release-assets");
    fs.mkdirSync(artifactDirectory);
    const releaseAssetName = "japanese-kanji-builder-words-n5.apkg";
    fs.copyFileSync(build.filePath, path.join(artifactDirectory, releaseAssetName));
    const packetPath = path.join(tempRoot, "packet.json");
    writeFile(packetPath, JSON.stringify({
        scope: {
            releaseCandidateId: "fixture",
            artifacts: [{
                deckKind: "word",
                levels: [5],
                releaseAssetName,
                notes: 1,
                cards: 1,
                mediaEntries: build.mediaFileCount,
            }],
        },
    }));

    const result = runInspector(python, packetPath, artifactDirectory, true);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "pass");
    assert.deepEqual(report.artifacts[0].decks, ["Japanese Kanji Builder::Word Deck::JLPT N5"]);
    assert.equal(report.artifacts[0].notes, 1);
    assert.equal(report.artifacts[0].cards, 1);
});

test("release APKG inspector fails closed on declared-count mismatch and unsafe archive members", {
    skip: python ? false : "Python is unavailable",
}, (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-apkg-inspector-fail-"));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
    const build = buildFixture(python, tempRoot);
    const artifactDirectory = path.join(tempRoot, "release-assets");
    fs.mkdirSync(artifactDirectory);
    const releaseAssetName = "candidate.apkg";
    const artifactPath = path.join(artifactDirectory, releaseAssetName);
    fs.copyFileSync(build.filePath, artifactPath);
    const packetPath = path.join(tempRoot, "packet.json");
    const packet = {
        scope: {
            releaseCandidateId: "fixture",
            artifacts: [{
                deckKind: "kanji",
                levels: [5],
                releaseAssetName,
                notes: 2,
                cards: 1,
                mediaEntries: build.mediaFileCount,
            }],
        },
    };
    writeFile(packetPath, JSON.stringify(packet));
    let result = runInspector(python, packetPath, artifactDirectory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /note count mismatch/u);

    packet.scope.artifacts[0].notes = 1;
    writeFile(packetPath, JSON.stringify(packet));
    const mutate = spawnSync(
        python.command,
        [
            ...python.argsPrefix,
            "-c",
            "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'a'); z.writestr('../escape','x'); z.close()",
            artifactPath,
        ],
        { cwd: process.cwd(), encoding: "utf-8" }
    );
    assert.equal(mutate.status, 0, mutate.stderr || mutate.stdout);
    result = runInspector(python, packetPath, artifactDirectory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe APKG archive member/u);
});
