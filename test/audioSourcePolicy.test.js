const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDefaultAudioSourcePolicyPath,
    loadAudioSourcePolicy,
} = require("../src/datasets/audioSourcePolicy");

test("loadAudioSourcePolicy parses the tracked release audio contract", () => {
    const policy = loadAudioSourcePolicy();

    assert.match(policy.policyPath, /audio_source_policy\.json$/);
    assert.equal(policy.releaseAudio.primarySourceId, "voicevox-nemo");
    assert.equal(policy.releaseAudio.primarySpeakerId, 10005);
    assert.equal(policy.releaseAudio.primarySpeakerName, "女声1");
    assert.deepEqual(policy.releaseAudio.allowedSourceIds, ["voicevox-nemo"]);
    assert.deepEqual(policy.releaseAudio.allowedCategories, [
        "kanji-reading",
        "word-reading",
        "word-example-sentence",
    ]);
    assert.equal(policy.releaseAudio.requiredLocale, "ja-JP");
    assert.equal(buildDefaultAudioSourcePolicyPath(), policy.policyPath);
});
