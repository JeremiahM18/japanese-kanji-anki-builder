const {
    ACTIVE_PLATINUM_STATUSES,
    NON_SHIPPING_STATUSES,
    REVALIDATION_STATUSES,
    REVIEW_ONLY_STATUSES,
    isCurrentStandardPlatinumEntry,
    validateGeneratedKanjiRow,
} = require("./platinumKanjiReviewService");
const { katakanaToHiragana } = require("../utils/japanese");

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function stripMarkup(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gu, "$1$2")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeReadingEvidence(value) {
    return katakanaToHiragana(stripMarkup(value))
        .replace(/[「」『』（）()[\]{}]/g, "")
        .replace(/[、，,・.．\s:：/-]/g, "")
        .toLowerCase()
        .trim();
}

function countReadingOptions(value) {
    return normalizeText(value)
        .replace(/^(On|Kun):\s*/i, "")
        .split(/[、，,]/)
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .length;
}

function hasOnlyTargetKanji(value, kanji) {
    const chars = normalizeText(value).match(/\p{Script=Han}/gu) || [];
    return chars.length > 0 && chars.every((char) => char === kanji);
}

function describeCuratedReadingConflict(row = {}, curatedEntry = null) {
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const displayWord = curatedEntry?.displayWord || {};
    const breakdownWord = curatedEntry?.breakdownDisplayWord || {};
    const displayPron = normalizeText(displayWord.pron);
    const breakdownPron = normalizeText(breakdownWord.pron);

    if (!kanji || !displayPron || !breakdownPron || displayPron === breakdownPron) {
        return "";
    }
    if (!hasOnlyTargetKanji(displayWord.written, kanji) || !hasOnlyTargetKanji(breakdownWord.written, kanji)) {
        return "";
    }

    const selected = primaryReading
        ? ` exported PrimaryReading ${primaryReading}`
        : " exported PrimaryReading is blank";
    return `curated display reading ${displayPron} differs from word-breakdown reading ${breakdownPron};${selected} must be explicitly justified against Japanese source evidence before platinum`;
}

function buildEntryStateByKanji(entries = []) {
    const stateByKanji = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const kanji = normalizeText(entry.kanji);
        if (!kanji) {
            continue;
        }
        if (!stateByKanji.has(kanji)) {
            stateByKanji.set(kanji, {
                statuses: [],
                entries: [],
            });
        }
        const state = stateByKanji.get(kanji);
        state.statuses.push(normalizeText(entry.status) || "(blank)");
        state.entries.push(entry);
    }

    return stateByKanji;
}

function classifyReviewStatus(statuses = [], entries = []) {
    if ((Array.isArray(entries) ? entries : []).some(isCurrentStandardPlatinumEntry)) {
        return "active_platinum";
    }
    if (statuses.some((status) => ACTIVE_PLATINUM_STATUSES.includes(status) || REVALIDATION_STATUSES.includes(status))) {
        return "needs_revalidation";
    }
    if (statuses.some((status) => NON_SHIPPING_STATUSES.includes(status))) {
        return "non_shipping_decision";
    }
    if (statuses.some((status) => REVIEW_ONLY_STATUSES.includes(status))) {
        return "needs_review";
    }
    if (statuses.length > 0) {
        return "invalid_or_unknown";
    }
    return "missing_platinum";
}

function buildHardChecks(row = {}) {
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;

    return [
        {
            name: "Kanji is one target kanji",
            passed: SINGLE_KANJI_RE.test(kanji),
        },
        {
            name: "DisplayWord equals target kanji",
            passed: normalizeText(row.displayWord) === kanji,
        },
        {
            name: "StudyWordKanji is blank",
            passed: normalizeText(row.studyWordKanji) === "",
        },
        {
            name: "PrimaryReading is present",
            passed: primaryReading.length > 0,
        },
        {
            name: "MeaningJP is present",
            passed: normalizeText(row.meaningJP).length > 0,
        },
        {
            name: "KanjiMeanings is present",
            passed: normalizeText(row.kanjiMeanings).length > 0,
        },
        {
            name: "ExampleSentence is present",
            passed: normalizeText(row.exampleSentence).length > 0,
        },
        {
            name: "StrokeOrder field is present",
            passed: normalizeText(row.strokeOrder).length > 0,
        },
        {
            name: "Audio is exact target plus primary reading",
            passed: normalizeText(row.audio).includes(exactAudioFragment),
        },
        {
            name: "No generic offline fallback note",
            passed: !normalizeText(row.notes).includes("Offline preview built from local data only."),
        },
    ];
}

function buildRiskFlags(row = {}, { reviewStatus = "missing_platinum", statuses = [], curatedEntry = null } = {}) {
    const flags = [];
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const evidenceText = normalizeReadingEvidence([
        row.onReading,
        row.kunReading,
        row.notes,
        row.exampleSentence,
    ].join(" "));

    if (reviewStatus === "active_platinum") {
        flags.push("already has active platinum; re-review only if intentionally replacing prior evidence");
    } else if (reviewStatus === "needs_revalidation") {
        flags.push("existing legacy/unversioned review history does not count as platinum until current-standard revalidation");
    } else if (reviewStatus === "needs_review") {
        flags.push("existing needs_review entry blocks platinum until resolved");
    } else if (reviewStatus === "non_shipping_decision") {
        flags.push("existing deferred/removed decision conflicts with generated export if this card still appears");
    } else if (reviewStatus === "invalid_or_unknown") {
        flags.push(`existing platinum status is not recognized: ${statuses.join(", ")}`);
    }

    if (countReadingOptions(row.onReading) + countReadingOptions(row.kunReading) > 2) {
        flags.push("multiple readings listed; primary-reading rationale needs extra care");
    }
    const curatedConflict = describeCuratedReadingConflict(row, curatedEntry);
    if (curatedConflict) {
        flags.push(curatedConflict);
    }
    if (primaryReading && !evidenceText.includes(normalizeReadingEvidence(primaryReading))) {
        flags.push("primary reading is not plainly visible in reading evidence; verify against Japanese source before approval");
    }
    if (kanji && !stripMarkup(row.notes).includes(kanji)) {
        flags.push("notes do not visibly include the target kanji");
    }
    if (kanji && !stripMarkup(row.exampleSentence).includes(kanji)) {
        flags.push("example sentence does not visibly include the target kanji");
    }
    if (normalizeText(row.meaningJP).split(/\s+\/\s+/).length > 2) {
        flags.push("MeaningJP has several glosses; verify primary meaning is tied to the primary reading, not dictionary noise");
    }
    if (normalizeText(row.kanjiMeanings).split(/\s+\/\s+/).length > 6) {
        flags.push("KanjiMeanings is broad; check for low-value dictionary noise before platinum");
    }

    return flags;
}

function selectBatchRows({ rows = [], entries = [], kanji = [], limit = 12 } = {}) {
    const activeKanji = new Set((Array.isArray(entries) ? entries : [])
        .filter(isCurrentStandardPlatinumEntry)
        .map((entry) => normalizeText(entry.kanji)));

    if (Array.isArray(kanji) && kanji.length > 0) {
        return kanji
            .map((target) => rows.find((row) => row.kanji === target))
            .filter(Boolean);
    }

    return rows
        .filter((row) => !activeKanji.has(row.kanji))
        .slice(0, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 12));
}

function buildPlatinumKanjiBatchReport({ rows = [], entries = [], level, kanji = [], limit = 12, curatedStudyData = {} } = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const stateByKanji = buildEntryStateByKanji(reviewEntries);
    const selectedRows = selectBatchRows({ rows: generatedRows, entries: reviewEntries, kanji, limit });
    const activeCount = reviewEntries.filter(isCurrentStandardPlatinumEntry).length;
    const missingRows = generatedRows.filter((row) => {
        const state = stateByKanji.get(row.kanji) || { statuses: [], entries: [] };
        return classifyReviewStatus(state.statuses, state.entries) !== "active_platinum";
    });

    const cards = selectedRows.map((row) => {
        const state = stateByKanji.get(row.kanji) || { statuses: [], entries: [] };
        const statuses = state.statuses;
        const reviewStatus = classifyReviewStatus(statuses, state.entries);
        const hardChecks = buildHardChecks(row);
        const generatedFailures = validateGeneratedKanjiRow(row);
        const curatedEntry = curatedStudyData?.[row.kanji] || null;
        return {
            kanji: row.kanji,
            levelLabel: row.levelLabel || (Number.isInteger(level) ? `N${level}` : ""),
            reviewStatus,
            existingStatuses: statuses,
            surface: {
                displayWord: row.displayWord,
                primaryReading: row.primaryReading,
                meaningJP: row.meaningJP,
                kanjiMeanings: row.kanjiMeanings,
                notes: row.notes,
                exampleSentence: row.exampleSentence,
                audio: row.audio,
                strokeOrder: row.strokeOrder,
                studyWordKanji: row.studyWordKanji,
                onReading: row.onReading,
                kunReading: row.kunReading,
            },
            hardChecks,
            generatedFailures,
            hardChecksPassed: hardChecks.every((check) => check.passed) && generatedFailures.length === 0,
            riskFlags: buildRiskFlags(row, { reviewStatus, statuses, curatedEntry }),
        };
    });

    return {
        level,
        scope: Array.isArray(kanji) && kanji.length > 0 ? `kanji=${kanji.join(",")}` : `next-missing limit=${limit}`,
        summary: {
            generatedRows: generatedRows.length,
            activePlatinum: activeCount,
            remainingPlatinum: missingRows.length,
            selectedCards: cards.length,
        },
        nextMissingKanji: missingRows.map((row) => row.kanji),
        cards,
    };
}

function formatPlatinumKanjiBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Platinum ${levelLabel} Kanji Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        `Generated cards: ${summary.generatedRows || 0}`,
        `Active current-standard platinum: ${summary.activePlatinum || 0}`,
        `Remaining platinum: ${summary.remainingPlatinum || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];

    if (Array.isArray(report.nextMissingKanji) && report.nextMissingKanji.length > 0) {
        lines.push("", `Next missing queue (${Math.min(report.nextMissingKanji.length, 30)}/${report.nextMissingKanji.length}):`);
        lines.push(report.nextMissingKanji.slice(0, 30).join(", "));
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.kanji} [${card.reviewStatus}]`);
        lines.push(`  Surface: DisplayWord=${card.surface.displayWord || "(blank)"} | PrimaryReading=${card.surface.primaryReading || "(blank)"} | MeaningJP=${card.surface.meaningJP || "(blank)"}`);
        lines.push(`  KanjiMeanings: ${card.surface.kanjiMeanings || "(blank)"}`);
        lines.push(`  Example: ${stripMarkup(card.surface.exampleSentence) || "(blank)"}`);
        lines.push(`  Audio: ${card.surface.audio || "(blank)"}`);
        lines.push(`  Hard checks: ${card.hardChecksPassed ? "pass" : "fail"}`);
        for (const failure of card.generatedFailures || []) {
            lines.push(`    - ${failure}`);
        }
        for (const check of (card.hardChecks || []).filter((item) => !item.passed)) {
            lines.push(`    - ${check.name}`);
        }
        if (card.riskFlags?.length > 0) {
            lines.push("  Risk flags:");
            for (const flag of card.riskFlags) {
                lines.push(`    - ${flag}`);
            }
        } else {
            lines.push("  Risk flags: none");
        }
    }

    lines.push("", "This report is read-only. It prepares review; it does not create platinum entries or prove release readiness.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildHardChecks,
    buildPlatinumKanjiBatchReport,
    buildRiskFlags,
    classifyReviewStatus,
    describeCuratedReadingConflict,
    formatPlatinumKanjiBatchReport,
    normalizeReadingEvidence,
    selectBatchRows,
};
