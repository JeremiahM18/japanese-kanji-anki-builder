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
            loadSentenceCorpusFn: () => [{ kanji: "日", japanese: "日本です。", english: "It is Japan." }],
            loadCuratedStudyDataFn: () => ({ 日: { notes: "fixture" } }),
            buildCoverageSummaryFn: () => ({
                totalKanji: 2,
                coveredKanji: 1,
                missingKanji: 1,
                coverageRatio: 0.5,
                levels: [{ level: 5, totalKanji: 2, coveredKanji: 1, coverageRatio: 0.5, sampleMissing: ["本"] }],
                missingByPriority: [{ kanji: "本", level: 5 }],
            }),
            buildCuratedStudySummaryFn: () => ({
                totalKanji: 2,
                curatedKanji: 1,
                missingKanji: 1,
                coverageRatio: 0.5,
                levels: [{ level: 5, totalKanji: 2, curatedKanji: 1, coverageRatio: 0.5, sampleMissing: ["本"] }],
            }),
            buildMediaCoverageSummaryFn: async () => ({
                totalKanji: 2,
                strokeOrderCovered: 1,
                audioCovered: 0,
                fullMediaCovered: 0,
                strokeOrderCoverageRatio: 0.5,
                audioCoverageRatio: 0,
                fullMediaCoverageRatio: 0,
                levels: [{ level: 5, totalKanji: 2, strokeOrderCovered: 1, audioCovered: 0, fullMediaCovered: 0, strokeOrderCoverageRatio: 0.5, audioCoverageRatio: 0, fullMediaCoverageRatio: 0, sampleMissing: [{ kanji: "本", missingStrokeOrder: true, missingAudio: true }] }],
            }),
            buildCardQualitySummaryFn: () => ({
                levels: [{
                    level: 5,
                    totalKanji: 2,
                    readingCovered: 1,
                    meaningCovered: 1,
                    exampleCovered: 1,
                    contextualNotesCovered: 1,
                    genericNotesFallback: 1,
                    readingCoverageRatio: 0.5,
                    meaningCoverageRatio: 0.5,
                    exampleCoverageRatio: 0.5,
                    contextualNotesCoverageRatio: 0.5,
                    genericNotesFallbackRatio: 0.5,
                    sampleMissing: { reading: ["本"], meaning: ["本"], example: ["本"], contextualNotes: ["本"] },
                }],
            }),
        });

        assert.equal(report.ready, true);
        assert.equal(report.coverage.media.audioCoverageRatio, 0);
        assert.equal(report.quality.levelReadiness.overallReady, false);
        assert.equal(report.quality.cardQuality.levels[0].exampleCoverageRatio, 0.5);
        assert.equal(report.nextSteps.some((step) => step.includes("REMOTE_AUDIO_BASE_URL")), true);
        assert.equal(report.nextSteps.some((step) => step.includes("sentence coverage")), true);
        assert.equal(report.nextSteps.some((step) => step.includes("quality gate")), true);
        assert.equal(report.nextSteps.some((step) => step.includes("offline card quality")), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatDoctorReport produces a human-readable setup summary", () => {
    const text = formatDoctorReport({
        ready: false,
        status: {
            audioEnabled: true,
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
        quality: {
            levelReadiness: {
                overallReady: false,
                thresholds: { audioCoverage: 0.75 },
                levels: [
                    {
                        level: 5,
                        ready: false,
                        metrics: {
                            sentenceCoverage: 0,
                            curatedCoverage: 0,
                            strokeOrderCoverage: 0,
                            audioCoverage: 0,
                            fullMediaCoverage: 0,
                        },
                        cardQuality: {
                            metrics: {
                                readingCoverage: 0.8,
                                meaningCoverage: 0.7,
                                exampleCoverage: 0.5,
                                contextualNotesCoverage: 0.4,
                                genericNotesFallbackRatio: 0.6,
                            },
                            failingChecks: ["local example coverage"],
                        },
                    },
                ],
            },
        },
        nextSteps: ["Add the JLPT dataset first."],
    });

    assert.match(text, /Overall status: missing required setup/);
    assert.match(text, /Required inputs:/);
    assert.match(text, /Media acquisition readiness:/);
    assert.match(text, /Level quality gates:/);
    assert.match(text, /REMOTE_AUDIO_BASE_URL/);
    assert.match(text, /Card quality: readings 80.0%, meanings 70.0%, examples 50.0%, contextual notes 40.0%, generic fallback notes 60.0%/);
    assert.match(text, /Quality checks: local example coverage/);
    assert.match(text, /Next steps:/);
    assert.match(text, /Add the JLPT dataset first/);
    assert.match(text, /C:\/repo\/data\/kanji_jlpt_only\.json/);
});

test("formatDoctorReport hides audio sections when audio is disabled", () => {
    const text = formatDoctorReport({
        ready: true,
        status: {
            audioEnabled: false,
            required: [],
            optionalDatasets: [],
            mediaSources: [],
            mediaReadiness: [],
        },
        coverage: {
            sentenceCorpus: null,
            curatedStudyData: null,
            media: { strokeOrderCoverageRatio: 0.5, strokeOrderCovered: 1, totalKanji: 2, audioCoverageRatio: 0, audioCovered: 0, fullMediaCoverageRatio: 0, fullMediaCovered: 0 },
        },
        quality: {
            levelReadiness: {
                overallReady: false,
                thresholds: { audioCoverage: null },
                levels: [{
                    level: 5,
                    ready: false,
                    metrics: { sentenceCoverage: 1, curatedCoverage: 0.5, strokeOrderCoverage: 0.5, audioCoverage: 0, fullMediaCoverage: 0 },
                    cardQuality: {
                        metrics: {
                            readingCoverage: 1,
                            meaningCoverage: 1,
                            exampleCoverage: 0.8,
                            contextualNotesCoverage: 0.8,
                            genericNotesFallbackRatio: 0.2,
                        },
                        failingChecks: ["local example coverage"],
                    },
                }],
            },
        },
        nextSteps: ["Keep improving stroke order."],
    });

    assert.doesNotMatch(text, /Audio media:/);
    assert.doesNotMatch(text, /full media/);
    assert.match(text, /Card quality: readings 100.0%, meanings 100.0%, examples 80.0%, contextual notes 80.0%, generic fallback notes 20.0%/);
});
