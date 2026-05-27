const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
    buildDeckPackage,
    buildPackageAssetCandidatesFromManifest,
} = require("../src/services/deckPackageService");
const {
    ensureMediaLayout,
    writeManifest,
} = require("../src/services/mediaStore");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "deck-package-service-test-"));
}

function makeWorkspaceTempDir(prefix) {
    const root = path.join(process.cwd(), "out");
    fs.mkdirSync(root, { recursive: true });
    return fs.mkdtempSync(path.join(root, prefix));
}

function buildSuccessfulAnkiPackageStub(outDir) {
    return async ({ levels = [], deckKind = "kanji" } = {}) => ({
        filePath: path.join(outDir, "package", `${deckKind}-fixture.apkg`),
        skipped: false,
        skipReason: "",
        noteCount: 1,
        deckCount: levels.length || 1,
        mediaFileCount: 0,
        timingsMs: {
            total: 0,
            runPythonApkgBuilder: 0,
        },
        pythonTimingsMs: {
            writeArchive: 0,
        },
    });
}

function buildSkippedAnkiPackageStub() {
    return async () => ({
        filePath: "",
        skipped: true,
        skipReason: "fixture packaging skipped",
        noteCount: 0,
        deckCount: 0,
        mediaFileCount: 0,
        timingsMs: {
            total: 0,
            runPythonApkgBuilder: 0,
        },
        pythonTimingsMs: null,
    });
}

test("buildPackageAssetCandidatesFromManifest can restrict kanji media to rendered word-deck assets", () => {
    const manifest = {
        assets: {
            strokeOrderImage: { path: "images/65E5_日-stroke-order.png" },
            strokeOrderAnimation: { path: "animations/65E5_日-stroke-order.gif" },
            audio: [
                { path: "audio/65E5_日-word-reading-日本-にほん.wav", category: "word-reading", text: "日本" },
                { path: "audio/65E5_日-kanji-reading-日-ひ.wav", category: "kanji-reading", text: "日" },
            ],
        },
    };

    assert.deepEqual(
        buildPackageAssetCandidatesFromManifest(manifest, "日").map((asset) => asset.kind),
        ["strokeOrder", "strokeOrderImage", "strokeOrderAnimation", "audio"]
    );
    assert.deepEqual(
        buildPackageAssetCandidatesFromManifest(manifest, "日", {
            assetKinds: ["strokeOrder", "strokeOrderAnimation"],
        }),
        [
            { kind: "strokeOrder", relativePath: "animations/65E5_日-stroke-order.gif" },
            { kind: "strokeOrderAnimation", relativePath: "animations/65E5_日-stroke-order.gif" },
        ]
    );
});

test("deck packaging builds source-backed APKG media without duplicating package media files", async () => {
    const rootDir = makeWorkspaceTempDir("deck-package-source-backed-");

    try {
        const mediaRootDir = path.join(rootDir, "media-root");
        const outDir = path.join(rootDir, "out");
        const exportPath = path.join(rootDir, "jlpt-n5.tsv");
        fs.writeFileSync(
            exportPath,
            [
                "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
                "日\t日\tday\tにち\t\tニチ\tひ\t<img src=\"65E5_日-stroke-order.gif\" />\t[sound:65E5_日-kanji-reading-日-にち.wav]\t日\t\t",
            ].join("\n"),
            "utf-8"
        );

        const layout = ensureMediaLayout(mediaRootDir, "日");
        fs.writeFileSync(path.join(layout.animationsDir, "65E5_日-stroke-order.gif"), "animation");
        fs.writeFileSync(path.join(layout.audioDir, "65E5_日-kanji-reading-日-にち.wav"), "audio");
        await writeManifest(mediaRootDir, {
            kanji: "日",
            version: 1,
            updatedAt: new Date().toISOString(),
            assets: {
                strokeOrderImage: null,
                strokeOrderAnimation: {
                    kind: "animation",
                    path: "animations/65E5_日-stroke-order.gif",
                    mimeType: "image/gif",
                    source: "fixture",
                },
                audio: [{
                    kind: "audio",
                    path: "audio/65E5_日-kanji-reading-日-にち.wav",
                    mimeType: "audio/wav",
                    source: "fixture",
                    category: "kanji-reading",
                    text: "日",
                    reading: "にち",
                }],
            },
        });

        const summary = await buildDeckPackage({
            outDir,
            exports: [{
                level: 5,
                filePath: exportPath,
                rows: 1,
            }],
            kanjiByLevel: { 5: ["日"] },
            mediaRootDir,
            deckKind: "kanji",
            buildAnkiPackageFn: buildSuccessfulAnkiPackageStub(outDir),
        });

        assert.equal(summary.mediaDirectoryMode, "source-backed-apkg");
        assert.equal(summary.mediaAssetCount, 2);
        assert.equal(summary.materializedMediaAssetCount, 0);
        assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-stroke-order.gif")), false);
        assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-kanji-reading-日-にち.wav")), false);

        const mediaIntegrity = JSON.parse(fs.readFileSync(summary.mediaIntegrityPath, "utf-8"));
        assert.equal(mediaIntegrity.sourceRoot.endsWith("/media-root"), true);
        assert.equal(mediaIntegrity.files.length, 2);
        assert.equal(mediaIntegrity.files.every((entry) => entry.sourceRelativePath), true);
        assert.equal(mediaIntegrity.files.every((entry) => entry.byteSize > 0), true);

        const guide = fs.readFileSync(summary.readmePath, "utf-8");
        assert.match(guide, /Package media folder: not materialized/);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test("deck packaging materializes package media when APKG creation is skipped", async () => {
    const rootDir = makeWorkspaceTempDir("deck-package-apkg-skipped-");

    try {
        const mediaRootDir = path.join(rootDir, "media-root");
        const outDir = path.join(rootDir, "out");
        const exportPath = path.join(rootDir, "jlpt-n5.tsv");
        fs.writeFileSync(
            exportPath,
            [
                "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
                "日\t日\tday\tにち\t\tニチ\tひ\t<img src=\"65E5_日-stroke-order.gif\" />\t\t日\t\t",
            ].join("\n"),
            "utf-8"
        );

        const layout = ensureMediaLayout(mediaRootDir, "日");
        fs.writeFileSync(path.join(layout.animationsDir, "65E5_日-stroke-order.gif"), "animation");
        await writeManifest(mediaRootDir, {
            kanji: "日",
            version: 1,
            updatedAt: new Date().toISOString(),
            assets: {
                strokeOrderImage: null,
                strokeOrderAnimation: {
                    kind: "animation",
                    path: "animations/65E5_日-stroke-order.gif",
                    mimeType: "image/gif",
                    source: "fixture",
                },
                audio: [],
            },
        });

        const summary = await buildDeckPackage({
            outDir,
            exports: [{
                level: 5,
                filePath: exportPath,
                rows: 1,
            }],
            kanjiByLevel: { 5: ["日"] },
            mediaRootDir,
            deckKind: "kanji",
            buildAnkiPackageFn: buildSkippedAnkiPackageStub(),
        });

        assert.equal(summary.ankiPackage.skipped, true);
        assert.equal(summary.mediaDirectoryMode, "materialized");
        assert.equal(summary.materializedMediaAssetCount, 1);
        assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-stroke-order.gif")), true);

        const guide = fs.readFileSync(summary.readmePath, "utf-8");
        assert.match(guide, /Package media folder: materialized/);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test("word deck packaging includes explicit word audio but prunes static images and kanji-reading audio", async () => {
    const rootDir = makeTempDir();
    const mediaRootDir = path.join(rootDir, "media-root");
    const outDir = path.join(rootDir, "out");
    const exportPath = path.join(rootDir, "jlpt-n5-words.tsv");
    fs.writeFileSync(exportPath, "Word\tReading\tMeaning\n日本\tにほん\tJapan\n", "utf-8");

    const layout = ensureMediaLayout(mediaRootDir, "日");
    fs.writeFileSync(path.join(layout.imagesDir, "65E5_日-stroke-order.png"), "image");
    fs.writeFileSync(path.join(layout.animationsDir, "65E5_日-stroke-order.gif"), "animation");
    fs.writeFileSync(path.join(layout.audioDir, "65E5_日-kanji-reading-日-ひ.wav"), "kanji-audio");
    fs.writeFileSync(path.join(layout.audioDir, "65E5_日-word-reading-日本-にほん.wav"), "word-audio");

    await writeManifest(mediaRootDir, {
        kanji: "日",
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: {
            strokeOrderImage: {
                kind: "image",
                path: "images/65E5_日-stroke-order.png",
                mimeType: "image/png",
                source: "fixture",
            },
            strokeOrderAnimation: {
                kind: "animation",
                path: "animations/65E5_日-stroke-order.gif",
                mimeType: "image/gif",
                source: "fixture",
            },
            audio: [
                {
                    kind: "audio",
                    path: "audio/65E5_日-kanji-reading-日-ひ.wav",
                    mimeType: "audio/wav",
                    source: "fixture",
                    category: "kanji-reading",
                    text: "日",
                    reading: "ひ",
                },
                {
                    kind: "audio",
                    path: "audio/65E5_日-word-reading-日本-にほん.wav",
                    mimeType: "audio/wav",
                    source: "fixture",
                    category: "word-reading",
                    text: "日本",
                    reading: "にほん",
                },
            ],
        },
    });

    const summary = await buildDeckPackage({
        outDir,
        exports: [{
            level: 5,
            filePath: exportPath,
            rows: 1,
            mediaKanji: ["日"],
        }],
        kanjiByLevel: { 5: ["日"] },
        mediaRootDir,
        deckKind: "word",
        referencedMedia: [{
            kind: "audio",
            kanji: "日",
            relativePath: "audio/65E5_日-word-reading-日本-にほん.wav",
        }],
    });

    assert.deepEqual(summary.mediaCounts, {
        strokeOrder: 1,
        strokeOrderImage: 0,
        strokeOrderAnimation: 1,
        trueStrokeOrderAnimation: 1,
        svgStrokeOrderAnimationFallback: 0,
        audio: 1,
    });
    assert.equal(summary.mediaAssetCount, 2);
    assert.equal(summary.timingsMs.copyMedia >= 0, true);
    assert.equal(summary.timingsMs.writeMediaIntegrity >= 0, true);
    assert.equal(summary.timingsMs.buildAnkiPackage >= 0, true);
    assert.equal(summary.ankiPackage.timingsMs.total >= 0, true);
    const mediaIntegrity = JSON.parse(fs.readFileSync(summary.mediaIntegrityPath, "utf-8"));
    assert.equal(mediaIntegrity.files.length, 2);
    assert.equal(mediaIntegrity.files.some((entry) => entry.sha256 === crypto.createHash("sha256").update("word-audio").digest("hex")), true);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-stroke-order.gif")), true);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-word-reading-日本-にほん.wav")), true);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-stroke-order.png")), false);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "65E5_日-kanji-reading-日-ひ.wav")), false);

    const guide = fs.readFileSync(summary.readmePath, "utf-8");
    assert.match(guide, /Unique media files included: 2/);
    assert.match(guide, /- Audio fields: 1/);
});

test("kanji deck packaging copies only media referenced by exported card fields", async () => {
    const rootDir = makeTempDir();
    const mediaRootDir = path.join(rootDir, "media-root");
    const outDir = path.join(rootDir, "out");
    const exportPath = path.join(rootDir, "jlpt-n5.tsv");
    fs.writeFileSync(
        exportPath,
        [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
            "車\t車\t車 （くるま） ／ car\tくるま\t\tシャ\tくるま\t<img src=\"8ECA_車-stroke-order.gif\" />\t\t車\t電車 （でんしゃ） - train\t",
        ].join("\n"),
        "utf-8"
    );

    const layout = ensureMediaLayout(mediaRootDir, "車");
    fs.writeFileSync(path.join(layout.imagesDir, "8ECA_車-stroke-order.png"), "image");
    fs.writeFileSync(path.join(layout.animationsDir, "8ECA_車-stroke-order.gif"), "animation");
    fs.writeFileSync(path.join(layout.audioDir, "8ECA_車-kanji-reading-車-でんしゃ.wav"), "wrong-audio");

    await writeManifest(mediaRootDir, {
        kanji: "車",
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: {
            strokeOrderImage: {
                kind: "image",
                path: "images/8ECA_車-stroke-order.png",
                mimeType: "image/png",
                source: "fixture",
            },
            strokeOrderAnimation: {
                kind: "animation",
                path: "animations/8ECA_車-stroke-order.gif",
                mimeType: "image/gif",
                source: "fixture",
            },
            audio: [{
                kind: "audio",
                path: "audio/8ECA_車-kanji-reading-車-でんしゃ.wav",
                mimeType: "audio/wav",
                source: "fixture",
                category: "kanji-reading",
                text: "車",
                reading: "でんしゃ",
            }],
        },
    });

    const summary = await buildDeckPackage({
        outDir,
        exports: [{
            level: 5,
            filePath: exportPath,
            rows: 1,
        }],
        kanjiByLevel: { 5: ["車"] },
        mediaRootDir,
        deckKind: "kanji",
    });

    assert.deepEqual(summary.mediaCounts, {
        strokeOrder: 1,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        trueStrokeOrderAnimation: 0,
        svgStrokeOrderAnimationFallback: 0,
        audio: 0,
    });
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-stroke-order.gif")), true);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-stroke-order.png")), false);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-kanji-reading-車-でんしゃ.wav")), false);
});

test("kanji deck packaging copies the exact referenced primary-reading audio", async () => {
    const rootDir = makeTempDir();
    const mediaRootDir = path.join(rootDir, "media-root");
    const outDir = path.join(rootDir, "out");
    const exportPath = path.join(rootDir, "jlpt-n5.tsv");
    fs.writeFileSync(
        exportPath,
        [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
            "車\t車\tcar\tくるま\t\tシャ\tくるま\t\t[sound:8ECA_車-kanji-reading-車-くるま.wav]\t車\t\t",
        ].join("\n"),
        "utf-8"
    );

    const layout = ensureMediaLayout(mediaRootDir, "車");
    fs.writeFileSync(path.join(layout.imagesDir, "8ECA_車-stroke-order.png"), "image");
    fs.writeFileSync(path.join(layout.animationsDir, "8ECA_車-stroke-order.gif"), "animation");
    fs.writeFileSync(path.join(layout.audioDir, "8ECA_車-kanji-reading-車-くるま.wav"), "primary-audio");
    fs.writeFileSync(path.join(layout.audioDir, "8ECA_車-kanji-reading-車-でんしゃ.wav"), "alternate-audio");

    await writeManifest(mediaRootDir, {
        kanji: "車",
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: {
            strokeOrderImage: {
                kind: "image",
                path: "images/8ECA_車-stroke-order.png",
                mimeType: "image/png",
                source: "fixture",
            },
            strokeOrderAnimation: {
                kind: "animation",
                path: "animations/8ECA_車-stroke-order.gif",
                mimeType: "image/gif",
                source: "fixture",
            },
            audio: [
                {
                    kind: "audio",
                    path: "audio/8ECA_車-kanji-reading-車-でんしゃ.wav",
                    mimeType: "audio/wav",
                    source: "fixture",
                    category: "kanji-reading",
                    text: "車",
                    reading: "でんしゃ",
                },
                {
                    kind: "audio",
                    path: "audio/8ECA_車-kanji-reading-車-くるま.wav",
                    mimeType: "audio/wav",
                    source: "fixture",
                    category: "kanji-reading",
                    text: "車",
                    reading: "くるま",
                },
            ],
        },
    });

    const summary = await buildDeckPackage({
        outDir,
        exports: [{
            level: 5,
            filePath: exportPath,
            rows: 1,
        }],
        kanjiByLevel: { 5: ["車"] },
        mediaRootDir,
        deckKind: "kanji",
    });

    assert.deepEqual(summary.mediaCounts, {
        strokeOrder: 0,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        trueStrokeOrderAnimation: 0,
        svgStrokeOrderAnimationFallback: 0,
        audio: 1,
    });
    assert.equal(
        summary.ankiPackage.cacheHit
            ? summary.ankiPackage.timingsMs.cacheLookup >= 0
            : summary.ankiPackage.timingsMs.runPythonApkgBuilder >= 0,
        true
    );
    if (!summary.ankiPackage.cacheHit) {
        assert.equal(summary.ankiPackage.pythonTimingsMs.writeArchive >= 0, true);
    }
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-stroke-order.gif")), false);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-stroke-order.png")), false);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-kanji-reading-車-くるま.wav")), true);
    assert.equal(fs.existsSync(path.join(summary.mediaDir, "8ECA_車-kanji-reading-車-でんしゃ.wav")), false);
});

test("deck packaging rejects managed media paths that escape the kanji media directory", async () => {
    const rootDir = makeTempDir();
    const mediaRootDir = path.join(rootDir, "media-root");
    const outDir = path.join(rootDir, "out");
    const exportPath = path.join(rootDir, "jlpt-n5.tsv");
    fs.writeFileSync(
        exportPath,
        [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
            "車\t車\tcar\tくるま\t\tシャ\tくるま\t<img src=\"secret.txt\" />\t\t車\t\t",
        ].join("\n"),
        "utf-8"
    );

    const layout = ensureMediaLayout(mediaRootDir, "車");
    fs.writeFileSync(layout.manifestPath, `${JSON.stringify({
        kanji: "車",
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: {
                kind: "animation",
                path: "../secret.txt",
                mimeType: "image/gif",
                source: "fixture",
            },
            audio: [],
        },
    }, null, 2)}\n`, "utf-8");

    await assert.rejects(
        () => buildDeckPackage({
            outDir,
            exports: [{
                level: 5,
                filePath: exportPath,
                rows: 1,
            }],
            kanjiByLevel: { 5: ["車"] },
            mediaRootDir,
            deckKind: "kanji",
        }),
        /Invalid managed media asset relative path/
    );
});

test("deck packaging refuses cleanup outside governed generated-output roots", async () => {
    const outDir = path.join(process.cwd(), "unsafe-package-test");
    const exportPath = path.join(process.cwd(), "README.md");

    await assert.rejects(
        () => buildDeckPackage({
            outDir,
            exports: [{
                level: 5,
                filePath: exportPath,
                rows: 0,
            }],
            kanjiByLevel: { 5: [] },
            mediaRootDir: path.join(process.cwd(), "data", "media"),
            deckKind: "kanji",
        }),
        /outside governed generated-output roots/
    );
    assert.equal(fs.existsSync(path.join(outDir, "package")), false);
});
