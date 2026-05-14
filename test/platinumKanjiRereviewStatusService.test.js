const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumKanjiReviewService");
const {
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    buildPlatinumKanjiRereviewStatusReport,
    buildPlatinumKanjiRereviewStatusSummary,
    entryHasSubstantiveCurrentStandardRereviewProof,
    formatPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_KANJI_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildRow(overrides = {}) {
    const kanji = overrides.kanji || "日";
    const primaryReading = overrides.primaryReading || "ひ";

    return {
        kanji,
        levelLabel: "N5",
        displayWord: kanji,
        meaningJP: overrides.meaningJP || "day",
        primaryReading,
        kanjiMeanings: overrides.kanjiMeanings || "day / sun",
        studyWordKanji: "",
        onReading: "On: ニチ、 ジツ",
        kunReading: `Kun: ${primaryReading}`,
        strokeOrder: `<img src="${kanji}-stroke-order.gif" />`,
        audio: `[sound:${kanji}-kanji-reading-${kanji}-${primaryReading}.wav]`,
        radical: "",
        notes: overrides.notes || `${kanji} - ${overrides.meaningJP || "day"} ／ 日本 - Japan`,
        exampleSentence: overrides.exampleSentence || "雨の日です。 ／ あめのひです。 ／ It is a rainy day.",
    };
}

function buildSourceEvidence({ kanji = "日", reading = "ひ", meaning = "day", broader = ["day", "sun"] } = {}) {
    return REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES.map((type) => ({
        type,
        source: "Kanjipedia https://www.kanjipedia.jp/",
        detail: `Kanjipedia verified ${kanji} primary reading ${reading}, primary meaning ${meaning}, and broader meanings ${broader.join(" and ")}.`,
    }));
}

function buildInternalChecks({ kanji = "日", reading = "ひ", meaning = "day", broader = "day / sun", example = "雨の日です。" } = {}) {
    const exactAudio = `kanji-reading-${kanji}-${reading}`;
    const details = {
        "generated-surface": `Generated card surface inspected for ${kanji}: single-kanji anchor, primary reading ${reading}, meaning ${meaning}, KanjiMeanings ${broader}, notes, example ${example}, audio, and stroke-order fields.`,
        "golden-regression": `Separate golden regression gate checked ${kanji}; this regression gate protects generated field expectations but is not source truth and not source evidence.`,
        "media-audit": `Managed media provenance audit checked ${kanji} exact audio media fragment ${exactAudio} and stroke-order media source policy.`,
        "audio-review": `Audio review checked ${kanji} exact asset fragment ${exactAudio}.`,
        "stroke-order-review": `Visual stroke-order review checked target ${kanji} against source-policy governed media source.`,
    };

    return REQUIRED_KANJI_INTERNAL_CHECK_TYPES.map((type) => ({
        type,
        source: "test fixture source",
        detail: details[type],
    }));
}

function buildReviewEvidence({
    kanji = "日",
    reading = "ひ",
    meaning = "day",
    broader = ["day", "sun"],
    notes = ["日", "日本"],
    example = "雨の日です。",
    exampleReading = "あめのひです。",
    exampleTranslation = "It is a rainy day.",
    substantiveProof = false,
} = {}) {
    const exactAudio = `kanji-reading-${kanji}-${reading}`;
    const proof = substantiveProof
        ? "Substantive post-v3 human rereview; not mechanically migrated."
        : "";

    return REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES.map((type) => {
        if (type === "manual-review") {
            return {
                type,
                source: "manual kanji product review fixture",
                detail: `${proof} Manual review judged ${kanji} as an individual-kanji learner card.`,
            };
        }

        return {
            type,
            source: `${proof} current-standard fixture review`,
            detail: [
                proof,
                `Current-standard review revalidated ${kanji}|${reading} with separated evidence lanes, generated surface, Japanese-source evidence, PrimaryReading ${reading}, MeaningJP ${meaning}, KanjiMeanings ${broader.join(" and ")}, example sentence ${example}, reading ${exampleReading}, translation ${exampleTranslation}, notes/support surface ${notes.join(" and ")}, audio ${exactAudio}, stroke-order media, release-quality support-only example usage, learner-friendly, useful, level-appropriate, natural sentence review, and verification limitations with no active limitations present.`,
            ].filter(Boolean).join(" "),
        };
    });
}

function buildEntry({
    kanji = "日",
    reading = "ひ",
    meaning = "day",
    broader = ["day", "sun"],
    notes = ["日", "日本"],
    example = "雨の日です。",
    exampleReading = "あめのひです。",
    exampleTranslation = "It is a rainy day.",
    substantiveProof = false,
    overrides = {},
} = {}) {
    return {
        kanji,
        status: "platinum",
        readingIncludes: [reading],
        meaningIncludes: [meaning],
        kanjiMeaningsIncludes: broader,
        levelIncludes: ["N5"],
        notesIncludes: notes,
        exampleIncludes: [example],
        primaryReadingRationale: `Uses ${reading} as the learner-facing individual-kanji reading for ${kanji}.`,
        reviewedAt: "2026-05-12",
        reviewer: "content-review",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        sourceEvidence: buildSourceEvidence({ kanji, reading, meaning, broader }),
        internalChecks: buildInternalChecks({
            kanji,
            reading,
            meaning,
            broader: broader.join(" / "),
            example,
        }),
        reviewEvidence: buildReviewEvidence({
            kanji,
            reading,
            meaning,
            broader,
            notes,
            example,
            exampleReading,
            exampleTranslation,
            substantiveProof,
        }),
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

test("rereview status separates structural v3 pass from substantive rereview proof", () => {
    const moonRow = buildRow({
        kanji: "月",
        primaryReading: "つき",
        meaningJP: "moon",
        kanjiMeanings: "moon / month",
        notes: "月 - moon ／ 今月 - this month",
        exampleSentence: "月が見えます。 ／ つきがみえます。 ／ I can see the moon.",
    });
    const report = buildPlatinumKanjiRereviewStatusReport({
        rows: [buildRow(), moonRow],
        entries: [
            buildEntry(),
            buildEntry({
                kanji: "月",
                reading: "つき",
                meaning: "moon",
                broader: ["moon", "month"],
                notes: ["月", "今月"],
                example: "月が見えます。",
                exampleReading: "つきがみえます。",
                exampleTranslation: "I can see the moon.",
                substantiveProof: true,
            }),
        ],
        level: 5,
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.current_v3_structural_pass, 2);
    assert.equal(report.counts.substantive_current_standard_review_proven, 1);
    assert.equal(report.counts.needs_substantive_rereview, 1);
    assert.equal(report.counts.blocked_or_failing, 0);
    assert.equal(report.cards.find((card) => card.kanji === "日").status, "needs_substantive_rereview");
    assert.match(report.cards.find((card) => card.kanji === "日").reasons.join("\n"), new RegExp(MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER));
    assert.equal(report.cards.find((card) => card.kanji === "月").status, "substantive_current_standard_review_proven");
});

test("rereview status does not infer substantive proof from revalidatedAt or v3 lane text", () => {
    const entry = buildEntry();

    assert.equal(entry.revalidatedAt, "2026-05-13");
    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), false);
});

test("rereview status reports dirty evidence lanes as blocked or failing", () => {
    const dirtyEntry = buildEntry({
        overrides: {
            internalChecks: buildInternalChecks().filter((entry) => entry.type !== "audio-review"),
        },
    });
    const report = buildPlatinumKanjiRereviewStatusReport({
        rows: [buildRow()],
        entries: [dirtyEntry],
        level: 5,
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });

    assert.equal(report.passed, false);
    assert.equal(report.counts.current_v3_structural_pass, 0);
    assert.equal(report.counts.blocked_or_failing, 1);
    assert.match(report.cards[0].reasons.join("\n"), /internalChecks must include evidence type: audio-review/);
});

test("formatted rereview report is clear and read-only", () => {
    const report = buildPlatinumKanjiRereviewStatusReport({
        rows: [buildRow()],
        entries: [buildEntry()],
        level: 5,
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });
    const summary = buildPlatinumKanjiRereviewStatusSummary([report]);
    const formatted = formatPlatinumKanjiRereviewStatusReport(summary);

    assert.match(formatted, /Platinum Kanji Rereview Status/);
    assert.match(formatted, /Structural v3 gate pass \(not proof\)/);
    assert.match(formatted, /Generated deck rows are the rereview-program denominator/);
    assert.match(formatted, /Structural-only entries needing rereview/);
    assert.match(formatted, new RegExp(MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER));
    assert.match(formatted, /This report is read-only/);
});
