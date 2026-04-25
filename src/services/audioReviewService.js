const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");
const { readManifestIfExists } = require("./mediaStore");
const { selectBestAudioAsset } = require("./audioService");
const { parseKanjiTsv } = require("./wordReadingCoverageService");

function cleanString(value) {
    const normalized = String(value || "").trim();
    return normalized || "";
}

function normalizeReading(value) {
    return cleanString(value)
        .replace(/[.・]/g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim();
}

function parseLevelsArgument(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.filter((level) => Number.isInteger(level) && level >= 1 && level <= 5))];
    }

    return String(value || "")
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5)
        .filter((level, index, list) => list.indexOf(level) === index);
}

function buildKanjiScope({ jlptOnlyJson = {}, levels = [5], kanji = [], limit = null }) {
    const explicitKanji = Array.isArray(kanji) ? kanji.filter(Boolean) : [];
    if (explicitKanji.length > 0) {
        return explicitKanji.map((item) => ({
            kanji: item,
            level: Number.isInteger(jlptOnlyJson?.[item]?.jlpt) ? jlptOnlyJson[item].jlpt : null,
        }));
    }

    const buckets = buildJlptBuckets(jlptOnlyJson);
    const targetLevels = parseLevelsArgument(levels);
    const scoped = targetLevels.flatMap((level) => (buckets.get(level) || []).map((item) => ({ kanji: item, level })));

    if (!Number.isFinite(limit)) {
        return scoped;
    }

    return scoped.slice(0, Math.max(1, limit));
}

function buildPolicyIssues({ asset, releaseAudio }) {
    if (!asset) {
        return [];
    }

    const issues = [];
    const source = cleanString(asset.source);
    const voice = cleanString(asset.voice);
    const locale = cleanString(asset.locale);
    const category = cleanString(asset.category);
    const allowedSources = new Set(releaseAudio.allowedSourceIds || []);
    const requiredSpeakerName = cleanString(releaseAudio.primarySpeakerName);
    const requiredLocale = cleanString(releaseAudio.requiredLocale);
    const allowedCategories = new Set(releaseAudio.allowedCategories || []);

    if (!allowedSources.has(source)) {
        issues.push("disallowed-source");
    }
    if (releaseAudio.requireVoiceMetadata && !voice) {
        issues.push("missing-voice");
    } else if (requiredSpeakerName && voice && !voice.startsWith(`${requiredSpeakerName} /`) && voice !== requiredSpeakerName) {
        issues.push("wrong-speaker");
    }
    if (requiredLocale && locale !== requiredLocale) {
        issues.push("wrong-locale");
    }
    if (!allowedCategories.has(category)) {
        issues.push("disallowed-category");
    }

    return issues;
}

function classifyReviewStatus({ asset, expectedReading, actualReading, policyIssues }) {
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

function compareReviewRows(a, b) {
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

    const levelA = Number.isInteger(a.level) ? a.level : Number.MAX_SAFE_INTEGER;
    const levelB = Number.isInteger(b.level) ? b.level : Number.MAX_SAFE_INTEGER;
    if (levelA !== levelB) {
        return levelA - levelB;
    }

    return a.kanji.localeCompare(b.kanji);
}

async function buildAudioReviewReport({
    jlptOnlyJson = {},
    curatedStudyData = {},
    kanjiTsv = "",
    mediaRootDir,
    audioSourcePolicy,
    levels = [5],
    kanji = [],
    limit = null,
}) {
    const releaseAudio = audioSourcePolicy.releaseAudio;
    const scope = buildKanjiScope({ jlptOnlyJson, levels, kanji, limit });
    const kanjiExportRows = parseKanjiTsv(kanjiTsv);
    const exportRowByKanji = new Map(
        kanjiExportRows.map((row) => [cleanString(row?.Kanji || row?.kanji), row])
    );
    const rows = await Promise.all(scope.map(async ({ kanji: targetKanji, level }) => {
        const curatedEntry = curatedStudyData?.[targetKanji] || null;
        const exportRow = exportRowByKanji.get(targetKanji) || null;
        const expectedReading = cleanString(curatedEntry?.displayWord?.pron)
            || cleanString(exportRow?.PrimaryReading || exportRow?.primaryReading);
        const displayWord = cleanString(curatedEntry?.displayWord?.written)
            || cleanString(exportRow?.DisplayWord || exportRow?.displayWord)
            || targetKanji;
        const manifest = await readManifestIfExists(mediaRootDir, targetKanji);
        const asset = selectBestAudioAsset(manifest?.assets?.audio || [], {
            category: "kanji-reading",
            text: targetKanji,
            reading: expectedReading,
        });
        const actualReading = cleanString(asset?.reading);
        const policyIssues = buildPolicyIssues({ asset, releaseAudio });
        const status = classifyReviewStatus({ asset, expectedReading, actualReading, policyIssues });

        return {
            kanji: targetKanji,
            level,
            displayWord,
            expectedReading,
            actualReading,
            status,
            policyIssues,
            audioPath: cleanString(asset?.path),
            voice: cleanString(asset?.voice),
            source: cleanString(asset?.source),
            locale: cleanString(asset?.locale),
            category: cleanString(asset?.category),
        };
    }));

    rows.sort(compareReviewRows);

    const summary = {
        totalKanji: rows.length,
        readyToReview: rows.filter((row) => row.status === "ready_to_review").length,
        missingAudio: rows.filter((row) => row.status === "missing_audio").length,
        missingExpectedReading: rows.filter((row) => row.status === "missing_expected_reading").length,
        missingGeneratedReading: rows.filter((row) => row.status === "missing_generated_reading").length,
        readingMismatch: rows.filter((row) => row.status === "reading_mismatch").length,
        policyMismatch: rows.filter((row) => row.status === "policy_mismatch").length,
    };

    return {
        mediaRootDir,
        levels: parseLevelsArgument(levels),
        requestedKanji: Array.isArray(kanji) ? kanji.filter(Boolean) : [],
        summary,
        rows,
    };
}

function formatAudioReviewReport(report, policy) {
    const lines = [];
    lines.push("Japanese Kanji Builder Audio Review");
    lines.push("");
    lines.push(`Managed media root: ${report.mediaRootDir}`);
    lines.push(`Target levels: ${(report.levels || []).map((level) => `N${level}`).join(", ") || "custom kanji"}`);
    lines.push(`Kanji in scope: ${report.summary.totalKanji}`);
    lines.push(`Ready to review: ${report.summary.readyToReview}`);
    lines.push(`Missing audio: ${report.summary.missingAudio}`);
    lines.push(`Reading mismatches: ${report.summary.readingMismatch}`);
    lines.push(`Missing generated reading: ${report.summary.missingGeneratedReading}`);
    lines.push(`Missing expected reading: ${report.summary.missingExpectedReading}`);
    lines.push(`Policy mismatches: ${report.summary.policyMismatch}`);
    lines.push(`Required release voice: ${policy.releaseAudio.primarySpeakerName} (style id ${policy.releaseAudio.primarySpeakerId})`);

    if ((report.rows || []).length === 0) {
        lines.push("");
        lines.push("No kanji matched this scope.");
        return `${lines.join("\n")}\n`;
    }

    lines.push("");
    lines.push("Review queue:");
    for (const row of report.rows.slice(0, 25)) {
        lines.push(`- ${row.kanji}${Number.isInteger(row.level) ? ` (N${row.level})` : ""}: ${row.status}`);
        lines.push(`  Study form: ${row.displayWord}`);
        lines.push(`  Expected reading: ${row.expectedReading || "n/a"}`);
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
        lines.push(`Showing 25 of ${report.rows.length} rows. Increase --limit or scope by --kanji for a smaller listening batch.`);
    }

    lines.push("");
    lines.push("Next step: listen to the ready rows in Anki or a media player, and treat any non-ready rows as generation or policy follow-up before widening the batch.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildAudioReviewReport,
    buildKanjiScope,
    buildPolicyIssues,
    classifyReviewStatus,
    compareReviewRows,
    formatAudioReviewReport,
    normalizeReading,
    parseLevelsArgument,
};
