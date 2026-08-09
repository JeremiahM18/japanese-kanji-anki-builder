const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
    REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumReviewService");
const {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireWordReviewService");
const {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    buildPlatinumWordRereviewStatusReport,
    buildPlatinumWordRereviewStatusSummary,
    entryHasSubstantiveCurrentStandardRereviewProof,
    formatPlatinumWordRereviewStatusReport,
    hasWordSentenceQualityReviewProof,
    wordRereviewEvidenceChecklistPasses,
} = require("../src/services/platinumWordRereviewStatusService");
const {
    hasBaseStructuredRereviewProvenance,
} = require("../src/services/platinumWordObsidianProofService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_WORD_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildWordPitchAccentData(overrides = {}) {
    const { ["今日|きょう"]: todayOverride = {}, ["日本|にほん"]: japanOverride = {}, ...extraEntries } = overrides;
    return {
        sources: {
            "kanjium-cc-by-sa-4.0": {
                name: "Kanjium pitch accent database",
                license: "CC BY-SA 4.0",
            },
        },
        entries: {
            "今日|きょう": {
                pattern: "0 [heiban]",
                sourceId: "kanjium-cc-by-sa-4.0",
                sourceWord: "今日",
                sourceReading: "きょう",
                sourceAccent: "0",
                ...todayOverride,
            },
            "日本|にほん": {
                pattern: "2 [nakadaka]",
                sourceId: "kanjium-cc-by-sa-4.0",
                sourceWord: "日本",
                sourceReading: "にほん",
                sourceAccent: "2",
                ...japanOverride,
            },
            ...extraEntries,
        },
    };
}

function buildKanjiLevelData() {
    return {
        今: { jlpt: 5 },
        日: { jlpt: 5 },
        本: { jlpt: 5 },
    };
}

function buildRow(overrides = {}) {
    const word = overrides.word || "今日";
    const reading = overrides.reading || "きょう";
    const pitch = overrides.pitchAccent || (
        word === "日本"
            ? "<span aria-label=\"Pitch 1: 2\">にほん: Nakadaka</span>"
            : "<span aria-label=\"Pitch 1: 0\">きょう: Heiban</span>"
    );

    return {
        word,
        reading,
        readingBreakdown: overrides.readingBreakdown || `<ruby>${word}<rt>${reading}</rt></ruby>`,
        audio: overrides.audio || `[sound:${word}-word-reading-${word}-${reading}.wav]`,
        pitchAccent: pitch,
        meaning: overrides.meaning || (word === "日本" ? "Japan" : "today"),
        jlptLevel: overrides.jlptLevel || "JLPT N5",
        coverageRole: overrides.coverageRole || "JLPT core + reading coverage",
        focusKanji: overrides.focusKanji || (word === "日本" ? "日、本" : "今、日"),
        coversReading: overrides.coversReading || (word === "日本" ? "日: に ／ 本: ほん" : "今: いま ／ 日: ひ"),
        kanjiBreakdown: overrides.kanjiBreakdown || (word === "日本"
            ? "日 （に） ／ day / sun ... 本 （ほん） ／ book / origin"
            : "今 （いま） ／ now ... 日 （ひ） ／ day / sun"),
        exampleSentence: overrides.exampleSentence || (word === "日本" ? "日本へ行きます。" : "今日は図書館へ行きます。"),
        notes: overrides.notes || (word === "日本" ? "Common country name." : "Common N5 word."),
    };
}

function buildSourceEvidence({
    word = "今日",
    reading = "きょう",
    meaning = "today",
    example = "今日は図書館へ行きます。",
} = {}) {
    const details = {
        "japanese-source": `JMdict dictionary source verified ${word}|${reading}, reading ${reading}, learner meaning ${meaning}, and example ${example}.`,
    };

    return REQUIRED_WORD_SOURCE_EVIDENCE_TYPES.map((type) => ({
        type,
        source: "test fixture source",
        detail: details[type],
    }));
}

function buildInternalChecks({
    word = "今日",
    reading = "きょう",
    meaning = "today",
    example = "今日は図書館へ行きます。",
    pitchLabel = "Pitch 1: 0",
    pitchPattern = "0 [heiban]",
    focus = "今 and 日",
    covers = "今: いま and 日: ひ",
} = {}) {
    const details = {
        "generated-surface": `Generated word-card surface inspected for ${word}|${reading}: word, reading, meaning ${meaning}, example ${example}, audio, and pitch accent fields.`,
        "golden-regression": `Separate golden regression gate checked ${word}|${reading}; this regression gate protects generated field expectations but is not source truth and not source evidence.`,
        "level-contract": `templates/jlpt_word_level_contract.json lists ${word}|${reading} for JLPT N5.`,
        "media-audit": `Managed media provenance audit checked ${word}|${reading} exact asset fragment word-reading-${word}-${reading} in tracked media.`,
        "audio-review": `Audio review checked ${word}|${reading} exact asset fragment word-reading-${word}-${reading}.`,
        "pitch-accent-review": `Pitch accent review checked ${word}|${reading} source kanjium-cc-by-sa-4.0 pattern ${pitchPattern} and rendered label ${pitchLabel}.`,
        "label-review": `Label review checked ${word}|${reading} JLPT N5, JLPT core, focus ${focus}, and covered readings ${covers}.`,
    };

    return REQUIRED_WORD_INTERNAL_CHECK_TYPES.map((type) => ({
        type,
        source: "test fixture source",
        detail: details[type],
    }));
}

function buildReviewEvidence({
    word = "今日",
    reading = "きょう",
    meaning = "today",
    example = "今日は図書館へ行きます。",
    notes = "Common N5 word.",
    breakdown = ["今 （いま）", "日 （ひ）"],
    focus = ["今", "日"],
    covers = ["今: いま", "日: ひ"],
    pitchLabel = "Pitch 1: 0",
    pitchPattern = "0 [heiban]",
    substantiveProof = false,
} = {}) {
    const proof = substantiveProof
        ? "Substantive post-v3 Obsidian rereview; not mechanically migrated."
        : "";
    const currentStandardDetail = [
        proof,
        `Current-standard whole-card revalidation for ${word}|${reading} checked separated evidence lanes, generated surface, Japanese-source evidence, example sentence ${example}, notes/support surface ${notes}, reading breakdown ${breakdown.join(" and ")}, meaning ${meaning}, labels JLPT N5, JLPT core, focus ${focus.join(" and ")}, covers ${covers.join(" and ")}, audio word-reading-${word}-${reading}, pitch accent source kanjium-cc-by-sa-4.0 pattern ${pitchPattern} rendered ${pitchLabel}, media provenance, release judgment common useful learner-friendly level-appropriate natural, and verification limitations no active limitations.`,
    ].filter(Boolean).join(" ");

    const details = {
        "example-review": `Example review checked ${word}|${reading}, reading ${reading}, and sentence ${example}. Natural, useful, learner-friendly, and level-appropriate.`,
        "manual-review": `${proof} Manual review judged ${word}|${reading} common and learner-friendly.`,
        "current-standard-review": currentStandardDetail,
    };

    return REQUIRED_WORD_REVIEW_EVIDENCE_TYPES.map((type) => ({
        type,
        source: "manual word product review fixture",
        detail: details[type],
    }));
}

function buildRereviewProvenance({
    word = "今日",
    reading = "きょう",
    meaning = "today",
    example = "今日は図書館へ行きます。",
    notes = "Common N5 word.",
    breakdown = ["今 （いま）", "日 （ひ）"],
    focus = ["今", "日"],
    covers = ["今: いま", "日: ひ"],
    pitchLabel = "Pitch 1: 0",
    pitchPattern = "0 [heiban]",
    includeEvidenceChecklist = true,
    includeSentenceQualityReview = true,
    includeSentenceAudioReview = true,
} = {}) {
    return {
        type: "substantive current standard rereview",
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        obsidianStandardVersion: CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
        reviewedAt: "2026-05-14",
        reviewer: "content-review",
        reviewedAfterStandard: true,
        mechanicalMigration: false,
        batchId: "test-word-platinum-rereview-batch-001",
        scope: "full word-card rereview from square zero",
        cardReviewed: `${word}|${reading}`,
        ...(includeEvidenceChecklist ? {
            evidenceChecked: [
                `live generated word surface for ${word}|${reading}`,
                `governed Japanese-source word evidence for ${word}|${reading}`,
                `learner-facing meaning ${meaning}`,
                `example sentence ${example} and exported reading/translation fit`,
                `notes/support surface ${notes}`,
                `reading breakdown ${breakdown.join(" and ")}; kanji breakdown checked`,
                `JLPT level, coverage role, focus ${focus.join(" and ")}, and covers ${covers.join(" and ")}`,
                `exact word-reading audio identity word-reading-${word}-${reading}`,
                `exact example sentence audio identity word-example-sentence-${word}-${reading}`,
                `pitch accent source pattern ${pitchPattern} and rendered label ${pitchLabel}`,
                "managed media provenance and no silent fallback",
                "golden regression as internal regression only, not source truth",
                "word vocabulary deck placement and product fit considered; learner useful",
                "verification limitations considered; no active core-card limitations recorded",
            ],
        } : {}),
        ...(includeSentenceQualityReview ? {
            sentenceQualityReview: {
                japaneseSentence: example,
                reading,
                translation: "fixture translation",
                naturalJapanese: true,
                learnerUseful: true,
                levelAppropriate: true,
                releaseQuality: true,
            },
        } : {}),
        ...(includeSentenceAudioReview ? {
            sentenceAudioReview: {
                category: "word-example-sentence",
                source: "voicevox-nemo",
                voice: "女声1 / ノーマル",
                locale: "ja-JP",
                assetPath: `audio/${word}-word-example-sentence-0123456789abcdef.wav`,
                identityHash: "0123456789abcdef",
                example,
                reading,
                translation: "fixture translation",
                exactExampleText: true,
                exactExampleReading: true,
                policyCompliant: true,
                readyToReview: true,
                reviewerJudgment: "Fixture sentence audio is exact, policy-compliant, and ready for card-level review.",
            },
        } : {}),
    };
}

function buildEntry(overrides = {}) {
    const word = overrides.word || "今日";
    const reading = overrides.reading || "きょう";
    const meaning = overrides.meaning || (word === "日本" ? "Japan" : "today");
    const example = overrides.example || (word === "日本" ? "日本へ行きます。" : "今日は図書館へ行きます。");
    const notes = overrides.notes || (word === "日本" ? "Common country name." : "Common N5 word.");
    const breakdown = overrides.breakdown || (word === "日本" ? ["日 （に）", "本 （ほん）"] : ["今 （いま）", "日 （ひ）"]);
    const focus = overrides.focus || (word === "日本" ? ["日", "本"] : ["今", "日"]);
    const covers = overrides.covers || (word === "日本" ? ["日: に", "本: ほん"] : ["今: いま", "日: ひ"]);
    const pitchLabel = overrides.pitchLabel || (word === "日本" ? "Pitch 1: 2" : "Pitch 1: 0");
    const pitchPattern = overrides.pitchPattern || (word === "日本" ? "2 [nakadaka]" : "0 [heiban]");

    return {
        word,
        status: "platinum",
        readingIncludes: [reading],
        meaningIncludes: [meaning],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core"],
        focusIncludes: focus,
        coversReadingIncludes: covers,
        breakdownIncludes: breakdown,
        exampleIncludes: [example],
        pitchAccentIncludes: [pitchLabel],
        notesIncludes: [notes],
        selectionRationale: `${word}|${reading} is common, useful, and belongs in the word deck.`,
        reviewedAt: "2026-05-02",
        reviewer: "content-review",
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        sourceEvidence: buildSourceEvidence({ word, reading, meaning, example }),
        internalChecks: buildInternalChecks({
            word,
            reading,
            meaning,
            example,
            pitchLabel,
            pitchPattern,
            focus: focus.join(" and "),
            covers: covers.join(" and "),
        }),
        reviewEvidence: buildReviewEvidence({
            word,
            reading,
            meaning,
            example,
            notes,
            breakdown,
            focus,
            covers,
            pitchLabel,
            pitchPattern,
            substantiveProof: overrides.substantiveProof,
        }),
        ...(overrides.substantiveProof ? {
            rereviewProvenance: buildRereviewProvenance({
                word,
                reading,
                meaning,
                example,
                notes,
                breakdown,
                focus,
                covers,
                pitchLabel,
                pitchPattern,
            }),
        } : {}),
        qualityGates: buildQualityGates(),
        ...overrides.entryOverrides,
    };
}

function buildGoldExpectationFromEntry(entry = buildEntry()) {
    return {
        word: entry.word,
        readingIncludes: entry.readingIncludes,
        meaningIncludes: entry.meaningIncludes,
        jlptLevelIncludes: entry.jlptLevelIncludes,
        coverageRoleIncludes: entry.coverageRoleIncludes,
        focusIncludes: entry.focusIncludes,
        coversReadingIncludes: entry.coversReadingIncludes,
        breakdownIncludes: entry.breakdownIncludes,
        exampleIncludes: entry.exampleIncludes,
        notesIncludes: entry.notesIncludes,
    };
}

function buildSapphireEntryFromEntry(entry = buildEntry()) {
    return {
        word: entry.word,
        status: "sapphire",
        readingIncludes: entry.readingIncludes,
        reviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    };
}

function buildSapphireResultFromEntry(entry = buildEntry()) {
    const reading = (Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [])[0] || "";
    return {
        identity: `${entry.word}|${reading}`,
        passed: true,
    };
}

function buildReport(options = {}) {
    const {
        entries = [],
        goldenExpectations,
        sapphireEntries,
        sapphireResults,
        requireLanePreconditions = true,
        ...rest
    } = options;
    const priorLaneEntries = entries.length > 0 ? entries : [buildEntry()];

    return buildPlatinumWordRereviewStatusReport({
        wordPitchAccentData: buildWordPitchAccentData(),
        kanjiLevelData: buildKanjiLevelData(),
        ...rest,
        entries,
        goldenExpectations: goldenExpectations || priorLaneEntries.map(buildGoldExpectationFromEntry),
        sapphireEntries: sapphireEntries || priorLaneEntries.map(buildSapphireEntryFromEntry),
        sapphireResults: sapphireResults || priorLaneEntries.map(buildSapphireResultFromEntry),
        requireLanePreconditions,
    });
}

test("word rereview status separates Platinum pass from substantive rereview proof", () => {
    const todayRow = buildRow();
    const japanRow = buildRow({ word: "日本", reading: "にほん" });
    const report = buildReport({
        rows: [todayRow, japanRow],
        entries: [
            buildEntry(),
            buildEntry({
                word: "日本",
                reading: "にほん",
                substantiveProof: true,
            }),
        ],
        level: 5,
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.current_v3_platinum_pass, 2);
    assert.equal(report.counts.substantive_current_standard_review_proven, 1);
    assert.equal(report.counts.needs_substantive_rereview, 1);
    assert.equal(report.counts.blocked_or_failing, 0);
    assert.equal(report.cards.find((card) => card.identity === "今日|きょう").status, "needs_substantive_rereview");
    assert.equal(report.cards.find((card) => card.identity === "今日|きょう").currentObsidianProofObserved, false);
    assert.match(report.cards.find((card) => card.identity === "今日|きょう").reasons.join("\n"), new RegExp(MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER));
    assert.equal(report.cards.find((card) => card.identity === "日本|にほん").status, "substantive_current_standard_review_proven");
});

test("word rereview status does not infer substantive proof from revalidatedAt or v3 lane text", () => {
    const entry = buildEntry();

    assert.equal(entry.revalidatedAt, "2026-05-13");
    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), false);
});

test("word rereview status does not accept loose textual proof without structured card-bound provenance", () => {
    const entry = buildEntry({ substantiveProof: true });
    const looseTextOnly = {
        ...entry,
        rereviewProvenance: undefined,
    };

    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(looseTextOnly), false);
});

test("word rereview status does not count base provenance without full word evidence proof", () => {
    const entry = buildEntry({
        entryOverrides: {
            rereviewProvenance: buildRereviewProvenance({
                includeEvidenceChecklist: false,
            }),
        },
    });
    const report = buildReport({
        rows: [buildRow()],
        entries: [entry],
        level: 5,
    });

    assert.equal(wordRereviewEvidenceChecklistPasses(entry), false);
    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), false);
    assert.equal(report.counts.substantive_current_standard_review_proven, 0);
    assert.equal(report.cards[0].status, "needs_substantive_rereview");
    assert.equal(report.cards[0].currentObsidianProofObserved, true);
    assert.match(report.cards[0].reasons.join("\n"), /full word-card evidence checklist/);
});

test("word rereview status keeps legacy proof history in current-version backlog", () => {
    const legacyProof = buildRereviewProvenance();
    delete legacyProof.obsidianStandardVersion;
    const report = buildReport({
        rows: [buildRow()],
        entries: [buildEntry({
            entryOverrides: {
                rereviewProvenance: legacyProof,
            },
        })],
        level: 5,
    });

    assert.equal(report.cards[0].status, "needs_substantive_rereview");
    assert.equal(report.cards[0].currentObsidianProofObserved, false);
    assert.match(report.cards[0].reasons.join("\n"), /legacy or missing Obsidian standard version/);
});

test("word rereview status exposes malformed base metadata when current-version proof is observed", () => {
    const malformedCurrentProof = buildRereviewProvenance();
    malformedCurrentProof.type = "invalid current proof type";
    const entry = buildEntry({
        entryOverrides: {
            rereviewProvenance: malformedCurrentProof,
        },
    });
    const report = buildReport({
        rows: [buildRow()],
        entries: [entry],
        level: 5,
    });

    assert.equal(hasBaseStructuredRereviewProvenance(entry), false);
    assert.equal(report.cards[0].status, "needs_substantive_rereview");
    assert.equal(report.cards[0].currentObsidianProofObserved, true);
    assert.match(report.cards[0].reasons.join("\n"), /requires explicit non-mechanical/);
});

test("word rereview status accepts structured sentence-quality evidence bound to the exact word card", () => {
    const entry = buildEntry({
        entryOverrides: {
            rereviewProvenance: buildRereviewProvenance({
                includeSentenceQualityReview: true,
            }),
        },
    });

    assert.equal(wordRereviewEvidenceChecklistPasses(entry), true);
    assert.equal(hasWordSentenceQualityReviewProof(entry), true);
    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), true);
});

test("word rereview status requires exact sentence-audio proof for v2.5", () => {
    const entry = buildEntry({
        entryOverrides: {
            rereviewProvenance: buildRereviewProvenance({
                includeSentenceAudioReview: false,
            }),
        },
    });
    const report = buildReport({
        rows: [buildRow()],
        entries: [entry],
        level: 5,
    });

    assert.equal(entryHasSubstantiveCurrentStandardRereviewProof(entry), false);
    assert.equal(report.counts.substantive_current_standard_review_proven, 0);
    assert.equal(report.cards[0].status, "needs_substantive_rereview");
    assert.match(report.cards[0].reasons.join("\n"), /exact example sentence audio review proof/);
});

test("word rereview status reports dirty evidence lanes as blocked or failing", () => {
    const dirtyEntry = buildEntry({
        entryOverrides: {
            internalChecks: buildInternalChecks().filter((entry) => entry.type !== "audio-review"),
        },
    });
    const report = buildReport({
        rows: [buildRow()],
        entries: [dirtyEntry],
        level: 5,
    });

    assert.equal(report.passed, false);
    assert.equal(report.counts.current_v3_platinum_pass, 0);
    assert.equal(report.counts.blocked_or_failing, 1);
    assert.match(report.cards[0].reasons.join("\n"), /internalChecks must include evidence type: audio-review/);
});

test("word rereview status reports generated rows without current-standard entries as blocked or failing", () => {
    const report = buildReport({
        rows: [
            buildRow(),
            buildRow({ word: "明日", reading: "あした" }),
        ],
        entries: [buildEntry()],
        level: 5,
    });

    assert.equal(report.passed, false);
    assert.equal(report.counts.current_v3_platinum_pass, 1);
    assert.equal(report.counts.blocked_or_failing, 1);
    assert.match(report.cards.find((card) => card.identity === "明日|あした").reasons.join("\n"), /missing active platinum entry/);
});

test("formatted word rereview report is clear and read-only", () => {
    const report = buildReport({
        rows: [buildRow()],
        entries: [buildEntry()],
        level: 5,
    });
    const summary = buildPlatinumWordRereviewStatusSummary([report]);
    const formatted = formatPlatinumWordRereviewStatusReport(summary);

    assert.match(formatted, /Word Obsidian Proof Status/);
    assert.match(formatted, /\| Scope \| Generated deck rows \| Platinum \|/);
    assert.match(formatted, /Generated deck rows are the certification denominator/);
    assert.match(formatted, /Platinum entries needing Obsidian/);
    assert.match(formatted, /Obsidian = explicit non-mechanical current-version certification proof/);
    assert.match(formatted, /exact word-reading card identity binding/);
    assert.match(formatted, /full word-card evidence checklist/);
    assert.match(formatted, new RegExp(MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER));
    assert.match(formatted, /This report is read-only/);
});
