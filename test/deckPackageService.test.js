const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
