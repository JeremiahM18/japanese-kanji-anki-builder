const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const releaseAudioSchema = z.object({
    primarySourceId: z.string().min(1),
    primarySpeakerId: z.number().int().nonnegative(),
    primarySpeakerName: z.string().min(1),
    allowedSourceIds: z.array(z.string().min(1)).min(1),
    requireSingleSourcePerDeck: z.boolean().default(true),
    requireVoiceMetadata: z.boolean().default(true),
    requiredLocale: z.string().min(1),
    allowedCategories: z.array(z.enum(["kanji-reading", "word-reading", "sentence"])).min(1),
    wordDeckAudioEnabled: z.boolean().default(false),
    remoteAudioProvidersAllowed: z.boolean().default(false),
});

const audioSourcePolicySchema = z.object({
    version: z.literal(1),
    releaseAudio: releaseAudioSchema,
    experimentalSourceIds: z.array(z.string().min(1)).default([]),
});

function buildDefaultAudioSourcePolicyPath() {
    return path.resolve(__dirname, "../../templates/audio_source_policy.json");
}

function loadAudioSourcePolicy(policyPath = buildDefaultAudioSourcePolicyPath()) {
    const resolvedPath = path.resolve(policyPath);
    const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    const parsed = audioSourcePolicySchema.parse(raw);

    return {
        ...parsed,
        policyPath: resolvedPath,
    };
}

module.exports = {
    audioSourcePolicySchema,
    buildDefaultAudioSourcePolicyPath,
    loadAudioSourcePolicy,
};
