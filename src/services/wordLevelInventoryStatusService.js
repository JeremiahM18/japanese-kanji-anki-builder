const CERTIFICATION_LANES = Object.freeze(["silver", "gold", "sapphire", "platinum", "obsidian"]);

function normalizeText(value = "") {
    return String(value || "").normalize("NFC").trim();
}

function buildWordIdentity(word = "", reading = "") {
    return `${normalizeText(word)}|${normalizeText(reading)}`;
}

function parseWordIdentity(value = "") {
    const [word = "", ...readingParts] = String(value || "").split("|");
    return buildWordIdentity(word, readingParts.join("|"));
}

function firstIncludesValue(entry = {}, fieldName = "") {
    const values = entry[fieldName];
    return Array.isArray(values) ? values[0] : "";
}

function buildGeneratedIdentitySet(rows = []) {
    return new Set(rows.map((row) => buildWordIdentity(row.word, row.reading)).filter((identity) => identity !== "|"));
}

function buildReviewIdentitySet(entries = []) {
    return new Set(entries.map((entry) => buildWordIdentity(entry.word, firstIncludesValue(entry, "readingIncludes"))).filter((identity) => identity !== "|"));
}

function buildProofIdentitySet(entries = []) {
    return new Set(entries.map((entry) => buildWordIdentity(entry.target?.written, entry.target?.reading)).filter((identity) => identity !== "|"));
}

function countGeneratedIntersection(generated = new Set(), reviewed = new Set()) {
    let count = 0;
    for (const identity of generated) {
        if (reviewed.has(identity)) {
            count += 1;
        }
    }
    return count;
}

function countRawTriageDecisions({ level, triageDecisionsByLevelSource = {}, generated = new Set() } = {}) {
    const levelKey = `N${level}`;
    const sources = triageDecisionsByLevelSource[levelKey] || {};
    const bySource = {};
    const totals = buildTriageDecisionCounts();

    for (const [sourceId, sourceRows] of Object.entries(sources)) {
        const sourceCounts = buildTriageDecisionCounts();

        for (const [identity, decisionRow] of Object.entries(sourceRows || {})) {
            applyTriageDecisionCount(sourceCounts, decisionRow?.decision);
            applyTriageDecisionCount(totals, decisionRow?.decision);

            if (decisionRow?.decision === "keep_candidate") {
                const normalizedIdentity = parseWordIdentity(identity);
                if (generated.has(normalizedIdentity)) {
                    sourceCounts.keepAlreadySilver += 1;
                    totals.keepAlreadySilver += 1;
                } else {
                    sourceCounts.keepStillPreSilver += 1;
                    totals.keepStillPreSilver += 1;
                }
            }
        }

        bySource[sourceId] = sourceCounts;
    }

    return {
        totals,
        bySource,
    };
}

function buildTriageDecisionCounts() {
    return {
        reviewed: 0,
        keep: 0,
        keepAlreadySilver: 0,
        keepStillPreSilver: 0,
        move: 0,
        defer: 0,
        reject: 0,
        other: 0,
    };
}

function applyTriageDecisionCount(counts, decision = "") {
    counts.reviewed += 1;
    if (decision === "keep_candidate") {
        counts.keep += 1;
    } else if (decision === "move_candidate") {
        counts.move += 1;
    } else if (decision === "defer_candidate") {
        counts.defer += 1;
    } else if (decision === "reject_candidate") {
        counts.reject += 1;
    } else {
        counts.other += 1;
    }
}

function buildCertificationBuckets({ generated, gold, sapphire, platinum, proof } = {}) {
    let silverOnly = 0;
    let goldOnly = 0;
    let sapphireOnly = 0;
    let platinumNeedsObsidian = 0;
    let obsidianCertified = 0;
    let proofWithoutPlatinum = 0;

    for (const identity of generated) {
        const hasGold = gold.has(identity);
        const hasSapphire = sapphire.has(identity);
        const hasPlatinum = platinum.has(identity);
        const hasProof = proof.has(identity);

        if (!hasGold) {
            silverOnly += 1;
        } else if (!hasSapphire) {
            goldOnly += 1;
        } else if (!hasPlatinum) {
            sapphireOnly += 1;
        } else if (!hasProof) {
            platinumNeedsObsidian += 1;
        } else {
            obsidianCertified += 1;
        }

        if (hasProof && !hasPlatinum) {
            proofWithoutPlatinum += 1;
        }
    }

    return {
        silverOnly,
        goldOnly,
        sapphireOnly,
        platinumNeedsObsidian,
        obsidianCertified,
        proofWithoutPlatinum,
    };
}

function normalizeGovernedPreSilverStatus(level, governedPreSilverByLevel = {}) {
    const status = governedPreSilverByLevel[level] || {};
    if (!status.available) {
        return {
            available: false,
            source: "",
            eligibleKeepBeforeCap: null,
            activeWindowRows: null,
            readyRows: null,
            blockedRows: null,
            cappedRows: null,
            reviewableRowsBeforeFilter: null,
            auditOnlyRowsBeforeFilter: null,
        };
    }

    const eligibleKeepBeforeCap = Number(status.eligibleKeepBeforeCap || 0);

    return {
        available: true,
        source: status.source || "",
        eligibleKeepBeforeCap,
        activeWindowRows: Number(status.activeWindowRows || 0),
        readyRows: Number(status.readyRows || 0),
        blockedRows: Number(status.blockedRows || 0),
        cappedRows: Number(status.cappedRows || 0),
        reviewableRowsBeforeFilter: Number(status.reviewableRowsBeforeFilter || 0),
        auditOnlyRowsBeforeFilter: Number(status.auditOnlyRowsBeforeFilter || 0),
    };
}

function buildWordLevelInventoryStatusReport({
    levels = [5, 4, 3, 2, 1],
    generatedRowsByLevel = {},
    goldReviewSetsByLevel = {},
    sapphireReviewSetsByLevel = {},
    platinumReviewSetsByLevel = {},
    proofEventsByLevel = {},
    triageDecisionsByLevelSource = {},
    governedPreSilverByLevel = {},
} = {}) {
    const levelReports = levels.map((level) => {
        const generated = buildGeneratedIdentitySet(generatedRowsByLevel[level] || []);
        const gold = buildReviewIdentitySet(goldReviewSetsByLevel[level] || []);
        const sapphire = buildReviewIdentitySet(sapphireReviewSetsByLevel[level] || []);
        const platinum = buildReviewIdentitySet(platinumReviewSetsByLevel[level] || []);
        const proof = buildProofIdentitySet(proofEventsByLevel[level] || []);
        const buckets = buildCertificationBuckets({ generated, gold, sapphire, platinum, proof });
        const rawTriage = countRawTriageDecisions({
            level,
            triageDecisionsByLevelSource,
            generated,
        });
        const governedPreSilver = normalizeGovernedPreSilverStatus(level, governedPreSilverByLevel);

        return {
            level,
            levelLabel: `N${level}`,
            certification: {
                denominator: generated.size,
                lanes: {
                    silver: generated.size,
                    gold: countGeneratedIntersection(generated, gold),
                    sapphire: countGeneratedIntersection(generated, sapphire),
                    platinum: countGeneratedIntersection(generated, platinum),
                    obsidian: buckets.obsidianCertified,
                },
                exclusiveBuckets: buckets,
                missing: {
                    gold: generated.size - countGeneratedIntersection(generated, gold),
                    sapphire: generated.size - countGeneratedIntersection(generated, sapphire),
                    platinum: generated.size - countGeneratedIntersection(generated, platinum),
                    obsidian: generated.size - buckets.obsidianCertified,
                },
            },
            triage: {
                raw: rawTriage,
                governedPreSilver,
                rawKeptOutsideGovernedEligible: governedPreSilver.available
                    ? Math.max(0, rawTriage.totals.keepStillPreSilver - governedPreSilver.eligibleKeepBeforeCap)
                    : null,
            },
        };
    });

    return {
        deckKind: "word",
        boundary: [
            "Read-only status report.",
            "Pre-Silver triage is not Silver.",
            "Gold, Sapphire, Platinum, and Obsidian remain separate certification lanes.",
            "Obsidian requires Platinum plus separate proof; Platinum is not proof.",
        ].join(" "),
        certificationLaneOrder: CERTIFICATION_LANES,
        levelReports,
        totals: summarizeTotals(levelReports),
    };
}

function summarizeTotals(levelReports = []) {
    const totals = {
        generated: 0,
        gold: 0,
        sapphire: 0,
        platinum: 0,
        obsidian: 0,
        silverOnly: 0,
        goldOnly: 0,
        sapphireOnly: 0,
        platinumNeedsObsidian: 0,
        rawKeepStillPreSilver: 0,
        governedEligibleKeepPreSilver: 0,
    };

    for (const report of levelReports) {
        totals.generated += report.certification.denominator;
        totals.gold += report.certification.lanes.gold;
        totals.sapphire += report.certification.lanes.sapphire;
        totals.platinum += report.certification.lanes.platinum;
        totals.obsidian += report.certification.lanes.obsidian;
        totals.silverOnly += report.certification.exclusiveBuckets.silverOnly;
        totals.goldOnly += report.certification.exclusiveBuckets.goldOnly;
        totals.sapphireOnly += report.certification.exclusiveBuckets.sapphireOnly;
        totals.platinumNeedsObsidian += report.certification.exclusiveBuckets.platinumNeedsObsidian;
        totals.rawKeepStillPreSilver += report.triage.raw.totals.keepStillPreSilver;
        totals.governedEligibleKeepPreSilver += report.triage.governedPreSilver.eligibleKeepBeforeCap || 0;
    }

    return totals;
}

function formatWordLevelInventoryStatusReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Word Level Inventory Status",
        "",
        report.boundary,
        "",
        "Certification lanes:",
        "| Level | Silver/generated | Gold | Sapphire | Platinum | Obsidian proof | Silver only | Gold only | Sapphire only | Platinum needs Obsidian |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const levelReport of report.levelReports || []) {
        const certification = levelReport.certification;
        const buckets = certification.exclusiveBuckets;
        lines.push([
            `| ${levelReport.levelLabel}`,
            certification.denominator,
            certification.lanes.gold,
            certification.lanes.sapphire,
            certification.lanes.platinum,
            certification.lanes.obsidian,
            buckets.silverOnly,
            buckets.goldOnly,
            buckets.sapphireOnly,
            buckets.platinumNeedsObsidian,
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Pre-Silver searched/kept inventory:",
        "| Level | Reviewed decisions | Raw keep decisions | Raw keep already Silver | Raw keep still pre-Silver | Governed eligible keep pre-Silver | Active selector window | Ready in window | Blocked in window | Raw kept outside governed eligible |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    );

    for (const levelReport of report.levelReports || []) {
        const raw = levelReport.triage.raw.totals;
        const governed = levelReport.triage.governedPreSilver;
        lines.push([
            `| ${levelReport.levelLabel}`,
            raw.reviewed,
            raw.keep,
            raw.keepAlreadySilver,
            raw.keepStillPreSilver,
            formatOptionalCount(governed.eligibleKeepBeforeCap),
            formatOptionalCount(governed.activeWindowRows),
            formatOptionalCount(governed.readyRows),
            formatOptionalCount(governed.blockedRows),
            formatOptionalCount(levelReport.triage.rawKeptOutsideGovernedEligible),
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Triage decision totals:",
        "| Level | Move | Defer | Reject | Other |",
        "| --- | ---: | ---: | ---: | ---: |"
    );

    for (const levelReport of report.levelReports || []) {
        const raw = levelReport.triage.raw.totals;
        lines.push([
            `| ${levelReport.levelLabel}`,
            raw.move,
            raw.defer,
            raw.reject,
            raw.other,
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Notes:",
        "- Raw keep decisions are every tracked keep_candidate under that level's triage file.",
        "- Raw keep still pre-Silver subtracts identities that already exist in the current generated/Silver rows.",
        "- Governed eligible keep pre-Silver is the current common-pool Silver selector count before the 200-row active window cap; run with --include-governed-selector to load this slower view.",
        "- Active selector window/ready/blocked describe what the current selector is showing now; they are not the full searched backlog.",
        "- No row becomes Silver, Gold, Sapphire, Platinum, or Obsidian from this report."
    );

    return `${lines.join("\n")}\n`;
}

function formatWordPreSilverInventoryStatusReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Word Pre-Silver Keep Status",
        "",
        "Read-only status report. These are tracked triage decisions only; pre-Silver keep does not promote cards, change generated denominators, or certify Silver/Gold/Sapphire/Platinum/Obsidian.",
        "",
        "| Level | Reviewed decisions | Previously kept for Silver review | Already sent to Silver | Still waiting for Silver | Move | Defer | Reject |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const levelReport of report.levelReports || []) {
        const raw = levelReport.triage.raw.totals;
        lines.push([
            `| ${levelReport.levelLabel}`,
            raw.reviewed,
            raw.keep,
            raw.keepAlreadySilver,
            raw.keepStillPreSilver,
            raw.move,
            raw.defer,
            raw.reject,
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Definitions:",
        "- Previously kept for Silver review = tracked keep_candidate decisions in word_inventory_expansion_triage.json.",
        "- Already sent to Silver = kept identities already present in jlpt_word_level_contract.json for that N level.",
        "- Still waiting for Silver = kept identities not yet present in that N level's word contract.",
        "- This report intentionally does not load Gold, Sapphire, Platinum, Obsidian, generated TSVs, or the governed selector."
    );

    return `${lines.join("\n")}\n`;
}

function formatOptionalCount(value) {
    return Number.isFinite(value) ? value : "-";
}

module.exports = {
    buildCertificationBuckets,
    buildGeneratedIdentitySet,
    buildProofIdentitySet,
    buildReviewIdentitySet,
    buildWordIdentity,
    buildWordLevelInventoryStatusReport,
    countRawTriageDecisions,
    formatWordPreSilverInventoryStatusReport,
    formatWordLevelInventoryStatusReport,
    parseWordIdentity,
};
