const { createVoicevoxClient } = require("../clients/voicevoxClient");
const { loadAudioSourcePolicy } = require("../datasets/audioSourcePolicy");

function describeVoicevoxError(error, engineUrl) {
    const message = String(error?.message || error || "").trim();
    const lower = message.toLowerCase();

    if (lower.includes("fetch failed")) {
        return `VOICEVOX engine is not reachable at ${engineUrl}. Run npm run voicevox:start and verify the local VOICEVOX Nemo container publishes 127.0.0.1:50021, or set VOICEVOX_ENGINE_URL correctly.`;
    }

    if (lower.includes("econnrefused") || lower.includes("connect")) {
        return `VOICEVOX engine refused the connection at ${engineUrl}. Run npm run voicevox:status to confirm the container maps host 50021 to Nemo container port 50121, then run npm run voicevox:start or npm run voicevox:start:fresh as needed.`;
    }

    return message || `VOICEVOX verification failed at ${engineUrl}.`;
}

function findSpeakerByStyleId(speakers, styleId) {
    for (const speaker of Array.isArray(speakers) ? speakers : []) {
        for (const style of Array.isArray(speaker.styles) ? speaker.styles : []) {
            if (style.id === styleId) {
                return {
                    speakerName: speaker.name,
                    styleName: style.name,
                    label: `${speaker.name} / ${style.name}`,
                };
            }
        }
    }

    return null;
}

async function buildVoicevoxDoctorReport({
    config,
    audioSourcePolicy = loadAudioSourcePolicy(),
    voicevoxClient = createVoicevoxClient({
        baseUrl: config.voicevoxEngineUrl,
    }),
} = {}) {
    const releaseAudio = audioSourcePolicy.releaseAudio;
    const report = {
        engineUrl: config.voicevoxEngineUrl,
        primarySourceId: releaseAudio.primarySourceId,
        expectedSpeakerId: releaseAudio.primarySpeakerId,
        expectedSpeakerName: releaseAudio.primarySpeakerName,
        reachable: false,
        speakerVerified: false,
        actualSpeaker: null,
        speakerCount: 0,
        error: null,
        ready: false,
        nextSteps: [],
    };

    try {
        const speakers = await voicevoxClient.listSpeakers();
        report.reachable = true;
        report.speakerCount = Array.isArray(speakers) ? speakers.length : 0;
        const actualSpeaker = findSpeakerByStyleId(speakers, releaseAudio.primarySpeakerId);
        report.actualSpeaker = actualSpeaker;
        report.speakerVerified = Boolean(actualSpeaker && actualSpeaker.speakerName === releaseAudio.primarySpeakerName);

        if (!actualSpeaker) {
            report.error = `Pinned speaker id ${releaseAudio.primarySpeakerId} was not found in the current VOICEVOX engine.`;
            report.nextSteps.push(`Install or enable the VOICEVOX Nemo voice set that exposes speaker id ${releaseAudio.primarySpeakerId} (${releaseAudio.primarySpeakerName}).`);
        } else if (!report.speakerVerified) {
            report.error = `Pinned speaker id ${releaseAudio.primarySpeakerId} resolved to ${actualSpeaker.label}, expected ${releaseAudio.primarySpeakerName}.`;
            report.nextSteps.push(`Align the release audio policy with the installed VOICEVOX Nemo speaker metadata, or install the expected Nemo voice set exposing ${releaseAudio.primarySpeakerName}.`);
        }
    } catch (error) {
        report.error = describeVoicevoxError(error, config.voicevoxEngineUrl);
        report.nextSteps.push("Run `npm run voicevox:status` and verify the local container maps host `50021` to Nemo container port `50121`.");
        report.nextSteps.push(`Run \`npm run voicevox:start\`; if it reports a missing port mapping, run \`npm run voicevox:start:fresh\` to recreate the container with \`-p 50021:50121\`.`);
        report.nextSteps.push("Run `npm run doctor:voicevox` again before generating governed audio.");
        report.nextSteps.push("Run `npm run voicevox:stop` when finished with governed audio work.");
    }

    if (report.reachable && report.speakerVerified) {
        report.ready = true;
        report.nextSteps.push(`VOICEVOX Nemo release voice is ready: speaker id ${report.expectedSpeakerId} resolves to ${report.actualSpeaker.label}.`);
    }

    return report;
}

function formatVoicevoxDoctorReport(report) {
    const lines = [];
    lines.push("Japanese Kanji Builder VOICEVOX Doctor");
    lines.push("");
    lines.push(`Engine URL: ${report.engineUrl}`);
    lines.push(`Release source: ${report.primarySourceId}`);
    lines.push(`Pinned release speaker: ${report.expectedSpeakerName} (style id ${report.expectedSpeakerId})`);
    lines.push(`Engine reachable: ${report.reachable ? "yes" : "no"}`);

    if (typeof report.speakerCount === "number" && report.reachable) {
        lines.push(`Speakers returned: ${report.speakerCount}`);
    }

    if (report.actualSpeaker) {
        lines.push(`Resolved speaker id ${report.expectedSpeakerId}: ${report.actualSpeaker.label}`);
    }

    lines.push(`Release voice ready: ${report.ready ? "yes" : "no"}`);

    if (report.error) {
        lines.push("");
        lines.push(`Issue: ${report.error}`);
    }

    if (Array.isArray(report.nextSteps) && report.nextSteps.length > 0) {
        lines.push("");
        lines.push("Next steps:");
        for (const step of report.nextSteps) {
            lines.push(`- ${step}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildVoicevoxDoctorReport,
    describeVoicevoxError,
    findSpeakerByStyleId,
    formatVoicevoxDoctorReport,
};
