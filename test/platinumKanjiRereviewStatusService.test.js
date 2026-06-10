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
    hasKanjiSentenceQualityReviewProof,
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
        ? "Substantive post-v3 Obsidian rereview; not mechanically migrated."
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

function buildRereviewProvenance({
    kanji = "日",
    reading = "ひ",
    meaning = "day",
    broader = ["day", "sun"],
    example = "雨の日です。",
    exampleReading = "あめのひです。",
    exampleTranslation = "It is a rainy day.",
    includeSentenceQualityProof = true,
} = {}) {
    return {
        type: "substantive current standard rereview",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        batchId: "test-kanji-platinum-rereview-batch-001",
        reviewedAt: "2026-05-14",
        reviewer: "content-review",
        reviewedAfterStandard: true,
        mechanicalMigration: false,
        result: "approved_for_current_standard_platinum",
        scope: "full kanji card rereview from square zero",
        cardReviewed: `${kanji}|${reading}`,
        evidenceChecked: [
            `generated surface: Kanji and DisplayWord are ${kanji}, StudyWordKanji is blank, PrimaryReading is ${reading}`,
            `primary field review: MeaningJP ${meaning}; KanjiMeanings ${broader.join(" / ")}`,
            includeSentenceQualityProof
                ? `example review: ${example} / ${exampleReading} / ${exampleTranslation}; checked as learner-useful, level-appropriate, natural enough, and support-only by best-effort reviewer judgment`
                : "",
            "evidence lanes checked separately",
            "verification limitations actively considered",
        ].filter(Boolean),
        limitationDecision: "no active non-core verification limitations recorded after this batch review",
    };
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
        ...(substantiveProof ? {
            rereviewProvenance: buildRereviewProvenance({
                kanji,
                reading,
                meaning,
                broader,
                example,
                exampleReading,
                exampleTranslation,
            }),
        } : {}),
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

test("rereview status separates Platinum pass from substantive rereview proof", () => {
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
    assert.equal(report.counts.current_v3_platinum_pass, 2);
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

test("rereview status does not count base provenance without actual sentence quality proof", () => {
    const entry = buildEntry({
        overrides: {
            rereviewProvenance: buildRereviewProvenance({ includeSentenceQualityProof: false }),
        },
    });
    const report = buildPlatinumKanjiRereviewStatusReport({
        rows: [buildRow()],
        entries: [entry],
        level: 5,
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });

    assert.equal(hasKanjiSentenceQualityReviewProof(entry), false);
    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), false);
    assert.equal(report.counts.substantive_current_standard_review_proven, 0);
    assert.equal(report.cards[0].status, "needs_substantive_rereview");
    assert.match(report.cards[0].reasons.join("\n"), /actual example sentence quality review proof/);
});

test("rereview status accepts structured sentence-quality evidence bound to the card", () => {
    const entry = buildEntry({
        overrides: {
            rereviewProvenance: {
                ...buildRereviewProvenance({ includeSentenceQualityProof: false }),
                sentenceQualityReview: {
                    japaneseSentence: "雨の日です。",
                    reading: "あめのひです。",
                    translation: "It is a rainy day.",
                    naturalJapanese: true,
                    learnerUseful: true,
                    levelAppropriate: true,
                    supportOnly: true,
                },
            },
        },
    });

    assert.equal(hasKanjiSentenceQualityReviewProof(entry), true);
    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), true);
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
    assert.equal(report.counts.current_v3_platinum_pass, 0);
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

    assert.match(formatted, /Kanji Obsidian Proof Status/);
    assert.match(formatted, /\| Scope \| Generated deck rows \| Platinum \|/);
    assert.match(formatted, /Generated deck rows are the certification denominator/);
    assert.match(formatted, /Platinum entries needing Obsidian/);
    assert.match(formatted, /Obsidian = explicit non-mechanical current-version certification proof/);
    assert.match(formatted, new RegExp(MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER));
    assert.match(formatted, /This report is read-only/);
});
