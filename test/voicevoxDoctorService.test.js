const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildVoicevoxDoctorReport,
    describeVoicevoxError,
    findSpeakerByStyleId,
    formatVoicevoxDoctorReport,
} = require("../src/services/voicevoxDoctorService");

test("describeVoicevoxError turns generic fetch failures into actionable guidance", () => {
    const message = describeVoicevoxError(new Error("fetch failed"), "http://127.0.0.1:50021");
    assert.match(message, /not reachable/);
    assert.match(message, /127\.0\.0\.1:50021/);
});

test("findSpeakerByStyleId resolves the pinned style from speaker metadata", () => {
    const result = findSpeakerByStyleId([
        {
            name: "女性1",
            styles: [{ id: 1, name: "ノーマル" }],
        },
    ], 1);

    assert.deepEqual(result, {
        speakerName: "女性1",
        styleName: "ノーマル",
        label: "女性1 / ノーマル",
    });
});

test("buildVoicevoxDoctorReport verifies the pinned release speaker when the engine is reachable", async () => {
    const report = await buildVoicevoxDoctorReport({
        config: {
            voicevoxEngineUrl: "http://127.0.0.1:50021",
        },
        voicevoxClient: {
            async listSpeakers() {
                return [
                    {
                        name: "女性1",
                        styles: [{ id: 1, name: "ノーマル" }],
                    },
                ];
            },
        },
    });

    assert.equal(report.reachable, true);
    assert.equal(report.speakerVerified, true);
    assert.equal(report.ready, true);
    assert.equal(report.actualSpeaker.label, "女性1 / ノーマル");
});

test("buildVoicevoxDoctorReport reports a clear issue when the engine is unreachable", async () => {
    const report = await buildVoicevoxDoctorReport({
        config: {
            voicevoxEngineUrl: "http://127.0.0.1:50021",
        },
        voicevoxClient: {
            async listSpeakers() {
                throw new Error("fetch failed");
            },
        },
    });

    assert.equal(report.ready, false);
    assert.equal(report.reachable, false);
    assert.match(report.error, /not reachable/);
    assert.equal(report.nextSteps.some((step) => step.includes("doctor:voicevox")), true);
});

test("buildVoicevoxDoctorReport flags the wrong installed speaker mapping", async () => {
    const report = await buildVoicevoxDoctorReport({
        config: {
            voicevoxEngineUrl: "http://127.0.0.1:50021",
        },
        voicevoxClient: {
            async listSpeakers() {
                return [
                    {
                        name: "男性1",
                        styles: [{ id: 1, name: "ノーマル" }],
                    },
                ];
            },
        },
    });

    assert.equal(report.reachable, true);
    assert.equal(report.ready, false);
    assert.match(report.error, /expected 女性1/);
});

test("formatVoicevoxDoctorReport renders the release-audio preflight clearly", () => {
    const text = formatVoicevoxDoctorReport({
        engineUrl: "http://127.0.0.1:50021",
        primarySourceId: "voicevox-nemo",
        expectedSpeakerId: 1,
        expectedSpeakerName: "女性1",
        reachable: false,
        speakerVerified: false,
        actualSpeaker: null,
        speakerCount: 0,
        error: "VOICEVOX engine is not reachable.",
        ready: false,
        nextSteps: ["Start the local VOICEVOX Nemo engine."],
    });

    assert.match(text, /Pinned release speaker: 女性1 \(style id 1\)/);
    assert.match(text, /Release voice ready: no/);
    assert.match(text, /Start the local VOICEVOX Nemo engine/);
});
