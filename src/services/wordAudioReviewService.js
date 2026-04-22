const { buildPolicyIssues, normalizeReading } = require("./audioReviewService");
const { buildWordAudioScope, findManagedWordAudioAsset } = require("./wordAudioService");

function classifyWordAudioReviewStatus({ asset, expectedReading, actualReading, policyIssues }) {
    if (!asset) {
        return "missing_audio";
    }
    if (policyIssues.length > 0) {
        return "policy_mismatch";
    }
    if (!actualReading) {
        return "missing_generated_reading";
    }
    if (!expectedReading) {
        return "missing_expected_reading";
    }
    if (normalizeReading(actualReading) !== normalizeReading(expectedReading)) {
        return "reading_mismatch";
    }
    return "ready_to_review";
}

function compareWordAudioReviewRows(a, b) {
    const priority = {
        policy_mismatch: 0,
        reading_mismatch: 1,
        missing_generated_reading: 2,
        missing_expected_reading: 3,
        missing_audio: 4,
        ready_to_review: 5,
    };

    const byPriority = (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
    if (byPriority !== 0) {
        return byPriority;
    }

    return a.word.localeCompare(b.word) || a.reading.localeCompare(b.reading);
}

async function buildWordAudioReviewReport({
    wordTsv = "",
    audioSourcePolicy,
    audioService = null,
    mediaRootDir = "",
    limit = null,
    words = [],
}) {
    const releaseAudio = audioSourcePolicy.releaseAudio;
    const scope = buildWordAudioScope({ wordTsv, limit, words });
    const rows = await Promise.all(scope.map(async (entry) => {
        const { kanji, asset } = await findManagedWordAudioAsset({
            written: entry.written,
            reading: entry.reading,
            focusKanji: entry.focusKanji,
            audioService,
            mediaRootDir,
        });
        const actualReading = String(asset?.reading || "").trim();
        const policyIssues = buildPolicyIssues({ asset, releaseAudio });
        const status = classifyWordAudioReviewStatus({
            asset,
            expectedReading: entry.reading,
            actualReading,
            policyIssues,
        });

        return {
            word: entry.written,
            reading: entry.reading,
            hostKanji: entry.hostKanji,
            jlptLevel: entry.jlptLevel,
            resolvedKanji: kanji,
            status,
            policyIssues,
            audioPath: String(asset?.path || "").trim(),
            voice: String(asset?.voice || "").trim(),
            source: String(asset?.source || "").trim(),
            locale: String(asset?.locale || "").trim(),
            category: String(asset?.category || "").trim(),
            actualReading,
        };
    }));

    rows.sort(compareWordAudioReviewRows);

    const summary = {
        totalWords: rows.length,
        readyToReview: rows.filter((row) => row.status === "ready_to_review").length,
        missingAudio: rows.filter((row) => row.status === "missing_audio").length,
        missingExpectedReading: rows.filter((row) => row.status === "missing_expected_reading").length,
        missingGeneratedReading: rows.filter((row) => row.status === "missing_generated_reading").length,
        readingMismatch: rows.filter((row) => row.status === "reading_mismatch").length,
        policyMismatch: rows.filter((row) => row.status === "policy_mismatch").length,
    };

    return {
        mediaRootDir,
        requestedWords: Array.isArray(words) ? words.filter(Boolean) : [],
        summary,
        rows,
    };
}

function formatWordAudioReviewReport(report, policy) {
    const lines = [];
    lines.push("Japanese Kanji Builder Word Audio Review");
    lines.push("");
    lines.push(`Managed media root: ${report.mediaRootDir}`);
    lines.push(`Word rows in scope: ${report.summary.totalWords}`);
    lines.push(`Ready to review: ${report.summary.readyToReview}`);
    lines.push(`Missing audio: ${report.summary.missingAudio}`);
    lines.push(`Reading mismatches: ${report.summary.readingMismatch}`);
    lines.push(`Missing generated reading: ${report.summary.missingGeneratedReading}`);
    lines.push(`Missing expected reading: ${report.summary.missingExpectedReading}`);
    lines.push(`Policy mismatches: ${report.summary.policyMismatch}`);
    lines.push(`Required release voice: ${policy.releaseAudio.primarySpeakerName} (style id ${policy.releaseAudio.primarySpeakerId})`);

    if ((report.rows || []).length === 0) {
        lines.push("");
        lines.push("No word rows matched this scope.");
        return `${lines.join("\n")}\n`;
    }

    lines.push("");
    lines.push("Review queue:");
    for (const row of report.rows.slice(0, 25)) {
        lines.push(`- ${row.word} (${row.reading}): ${row.status}`);
        lines.push(`  Host kanji: ${row.hostKanji || "n/a"}`);
        lines.push(`  Resolved kanji: ${row.resolvedKanji || "n/a"}`);
        lines.push(`  Managed reading: ${row.actualReading || "n/a"}`);
        lines.push(`  Voice: ${row.voice || "n/a"}`);
        lines.push(`  Source: ${row.source || "n/a"}`);
        lines.push(`  Asset: ${row.audioPath || "n/a"}`);
        if (row.policyIssues.length > 0) {
            lines.push(`  Policy issues: ${row.policyIssues.join(", ")}`);
        }
    }

    if (report.rows.length > 25) {
        lines.push("");
        lines.push(`Showing 25 of ${report.rows.length} rows. Increase --limit or scope by --word for a smaller listening batch.`);
    }

    lines.push("");
    lines.push("Next step: listen to the ready word rows in Anki or a media player, and treat any non-ready rows as generation or policy follow-up before widening the batch.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildWordAudioReviewReport,
    classifyWordAudioReviewStatus,
    compareWordAudioReviewRows,
    formatWordAudioReviewReport,
};
