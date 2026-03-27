const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildDoctorReport,
    buildDoctorStatus,
    formatDoctorReport,
} = require("../src/services/doctorService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "doctor-service-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildDoctorStatus reports required paths and media readiness clearly", () => {
    const rootDir = makeTempDir();

    try {
        const config = {
            jlptJsonPath: path.join(rootDir, "kanji_jlpt_only.json"),
            kradfilePath: path.join(rootDir, "KRADFILE"),
            sentenceCorpusPath: path.join(rootDir, "sentence_corpus.json"),
            curatedStudyDataPath: path.join(rootDir, "curated_study_data.json"),
            strokeOrderImageSourceDir: path.join(rootDir, "images"),
            strokeOrderAnimationSourceDir: path.join(rootDir, "animations"),
            audioSourceDir: path.join(rootDir, "audio"),
            remoteStrokeOrderImageBaseUrl: "https://media.example.com/stroke/images/",
            remoteStrokeOrderAnimationBaseUrl: "",
            remoteAudioBaseUrl: "",
        };

        fs.writeFileSync(config.jlptJsonPath, "{}", "utf-8");
        fs.mkdirSync(config.audioSourceDir, { recursive: true });
        fs.writeFileSync(path.join(config.audioSourceDir, "日.mp3"), "fixture", "utf-8");

        const status = buildDoctorStatus(config);

        assert.equal(status.required[0].exists, true);
        assert.equal(status.required[1].exists, false);
        assert.equal(status.mediaSources[2].entryCount, 1);
        assert.equal(status.mediaReadiness[0].remoteConfigured, true);
        assert.equal(status.mediaReadiness[0].ready, true);
        assert.equal(status.mediaReadiness[1].ready, false);
        assert.equal(status.mediaReadiness[2].ready, true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildDoctorReport summarizes readiness coverage and acquisition next steps", async () => {
    const rootDir = makeTempDir();

    try {
        const config = {
            jlptJsonPath: path.join(rootDir, "kanji_jlpt_only.json"),
            kradfilePath: path.join(rootDir, "KRADFILE"),
            sentenceCorpusPath: path.join(rootDir, "sentence_corpus.json"),
            curatedStudyDataPath: path.join(rootDir, "curated_study_data.json"),
            strokeOrderImageSourceDir: path.join(rootDir, "images"),
            strokeOrderAnimationSourceDir: path.join(rootDir, "animations"),
            audioSourceDir: path.join(rootDir, "audio"),
            mediaRootDir: path.join(rootDir, "media"),
            remoteStrokeOrderImageBaseUrl: "",
            remoteStrokeOrderAnimationBaseUrl: "",
            remoteAudioBaseUrl: "",
        };

        fs.writeFileSync(config.jlptJsonPath, JSON.stringify({ 日: { jlpt: 5 }, 本: { jlpt: 5 } }), "utf-8");
        fs.writeFileSync(config.kradfilePath, "日 : 日\n本 : 木\n", "utf-8");

        const report = await buildDoctorReport({
            config,
            loadSentenceCorpusFn: () => [{ kanji: "日" }],
            loadCuratedStudyDataFn: () => ({ 日: { notes: "fixture" } }),
            buildCoverageSummaryFn: () => ({
                totalKanji: 2,
                coveredKanji: 1,
                missingKanji: 1,
                coverageRatio: 0.5,
                missingByPriority: [{ kanji: "本", level: 5 }],
            }),
            buildCuratedStudySummaryFn: () => ({
                totalKanji: 2,
                curatedKanji: 1,
                missingKanji: 1,
                coverageRatio: 0.5,
            }),
            buildMediaCoverageSummaryFn: async () => ({
                totalKanji: 2,
                strokeOrderCovered: 1,
                audioCovered: 0,
                fullMediaCovered: 0,
                strokeOrderCoverageRatio: 0.5,
                audioCoverageRatio: 0,
                fullMediaCoverageRatio: 0,
            }),
        });

        assert.equal(report.ready, true);
        assert.equal(report.coverage.media.audioCoverageRatio, 0);
        assert.equal(report.nextSteps.some((step) => step.includes("REMOTE_AUDIO_BASE_URL")), true);
        assert.equal(report.nextSteps.some((step) => step.includes("sentence coverage")), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatDoctorReport produces a human-readable setup summary", () => {
    const text = formatDoctorReport({
        ready: false,
        status: {
            required: [
                { label: "JLPT dataset", exists: false, required: true, path: "C:/repo/data/kanji_jlpt_only.json", kind: "file" },
            ],
            optionalDatasets: [],
            mediaSources: [],
            mediaReadiness: [
                { label: "Audio", ready: false, localDirectoryExists: false, localFileCount: 0, remoteConfigured: false, remoteEnvVar: "REMOTE_AUDIO_BASE_URL" },
            ],
        },
        coverage: {
            sentenceCorpus: null,
            curatedStudyData: null,
            media: null,
        },
        nextSteps: ["Add the JLPT dataset first."],
    });

    assert.match(text, /Overall status: missing required setup/);
    assert.match(text, /Required inputs:/);
    assert.match(text, /Media acquisition readiness:/);
    assert.match(text, /REMOTE_AUDIO_BASE_URL/);
    assert.match(text, /Next steps:/);
    assert.match(text, /Add the JLPT dataset first/);
    assert.match(text, /C:\/repo\/data\/kanji_jlpt_only\.json/);
});
