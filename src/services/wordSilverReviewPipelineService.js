"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { z } = require("zod");

const {
  buildJlptWordLevelContract,
} = require("../datasets/jlptWordLevelContract");
const {
  buildWordStudyEntryKey,
  normalizeWordStudyEntry,
  wordStudyEntrySchema,
} = require("../datasets/wordStudyData");
const { ensureDir, writeFileAtomicSync } = require("../utils/fs");

const WORD_SILVER_PACKET_SCHEMA_VERSION = "word-silver-review-packet.v1";
const WORD_SILVER_DECISION_MANIFEST_SCHEMA_VERSION =
  "word-silver-decision-manifest.v1";

const WORD_SILVER_PACKET_AUTHORITY = Object.freeze({
  certifiesCards: false,
  writesTrackedTemplates: false,
  claimsReleaseReadiness: false,
  certifiesSourceTruth: false,
  certifiesJlptLevel: false,
  requiredNextAuthority: "codex_editorial_decision_manifest",
  boundary:
    "Packets aggregate selector/source/corpus/NLP support for editorial review only. They are not Silver rows, card approval, source proof, or release evidence.",
});

const WORD_SILVER_MANIFEST_AUTHORITY = Object.freeze({
  reviewerKind: "codex_editorial_review",
  certifiesObsidianProof: false,
  claimsNativeHumanReview: false,
  writesTrackedTemplatesOnlyThroughApplicator: true,
  boundary:
    "A decision manifest records governed editorial decisions. Keep/fix decisions may be applied to Silver starter templates only after schema validation.",
});

const WORD_SILVER_DECISIONS = Object.freeze([
  "keep",
  "fix",
  "defer",
  "reject",
  "remove",
  "reroute",
]);

const APPLY_DECISIONS = new Set(["keep", "fix"]);
const NON_APPLY_DECISIONS = new Set(["defer", "reject", "remove", "reroute"]);
const JLPT_LEVELS = new Set([1, 2, 3, 4, 5]);

const FORBIDDEN_PLACEHOLDER_PATTERN =
  /\b(?:TODO|TBD|FIXME|NEEDS_HUMAN|NEEDS_REVIEW|PLACEHOLDER)\b/i;

const reviewEvidenceSchema = z
  .object({
    sourceEvidenceReviewed: z.string().min(12),
    learnerFitReviewed: z.string().min(12),
    duplicateRiskReviewed: z.string().min(12),
    productRiskReviewed: z.string().min(12),
  })
  .strict();

const reviewerSchema = z
  .object({
    kind: z.literal(WORD_SILVER_MANIFEST_AUTHORITY.reviewerKind),
    name: z.string().min(1),
    reviewedAt: z.string().min(1).optional(),
  })
  .strict();

const manifestDecisionRowSchema = z
  .object({
    identity: z.string().min(3),
    written: z.string().min(1),
    reading: z.string().min(1),
    level: z.number().int().min(1).max(5),
    sourceId: z.string().min(1).optional(),
    sourcePoolLabel: z.string().min(1).optional(),
    sourceLevelClaimLabel: z.string().min(1).optional(),
    decision: z.enum(WORD_SILVER_DECISIONS),
    rationale: z.string().min(12),
    decisionEvidence: reviewEvidenceSchema,
    targetLevel: z.number().int().min(1).max(5).optional(),
    blockedReasons: z.array(z.string().min(3)).optional(),
    card: wordStudyEntrySchema.optional(),
  })
  .strict();

const decisionManifestSchema = z
  .object({
    schemaVersion: z.literal(WORD_SILVER_DECISION_MANIFEST_SCHEMA_VERSION),
    authority: z
      .object({
        reviewerKind: z.literal(WORD_SILVER_MANIFEST_AUTHORITY.reviewerKind),
        certifiesObsidianProof: z.literal(false),
        claimsNativeHumanReview: z.literal(false),
        writesTrackedTemplatesOnlyThroughApplicator: z.literal(true),
      })
      .strict(),
    batchId: z.string().min(1),
    levels: z.array(z.number().int().min(1).max(5)).min(1),
    reviewer: reviewerSchema,
    sourcePacket: z
      .object({
        path: z.string().min(1).optional(),
        batchId: z.string().min(1).optional(),
        schemaVersion: z.literal(WORD_SILVER_PACKET_SCHEMA_VERSION).optional(),
      })
      .strict()
      .optional(),
    decisions: z.array(manifestDecisionRowSchema).min(1),
  })
  .strict();

function uniq(values) {
  return Array.from(new Set(values));
}

function buildWordIdentity(written, reading) {
  return `${written}|${reading}`;
}

function sortLevels(levels) {
  return uniq(levels).sort((a, b) => b - a);
}

function normalizeLevel(value, label = "level") {
  const level = Number(value);
  if (!Number.isInteger(level) || !JLPT_LEVELS.has(level)) {
    throw new Error(`${label} must be one of 1, 2, 3, 4, or 5.`);
  }
  return level;
}

function assertNoForbiddenPlaceholders(value, pathLabel, errors) {
  if (typeof value === "string") {
    if (FORBIDDEN_PLACEHOLDER_PATTERN.test(value)) {
      errors.push(`${pathLabel} contains a forbidden placeholder token.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoForbiddenPlaceholders(item, `${pathLabel}[${index}]`, errors);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      assertNoForbiddenPlaceholders(child, `${pathLabel}.${key}`, errors);
    });
  }
}

function normalizeMaybeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function pickString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function rowNeedsDictionaryCommonLabels(row) {
  const joined = [
    row.sourceId,
    row.sourcePoolLabel,
    row.sourceLevelClaimLabel,
    row.sourceLaneLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    joined.includes("dictionary-common-pool") ||
    joined.includes("dictionary common pool")
  );
}

function buildPacketRow({ row, level, index, levelReport }) {
  const identity = buildWordIdentity(row.written, row.reading);
  const sourceUniverse = levelReport.sourceUniverse || {};

  return {
    packetRowId: `word-silver-n${level}-${String(index + 1).padStart(3, "0")}`,
    level,
    identity,
    written: row.written,
    reading: row.reading,
    selectorStatus: row.selectorStatus,
    sourceDisposition: row.sourceDisposition,
    currentTriageDecision: row.triageDecision || null,
    source: {
      sourceId: pickString(row.sourceId, sourceUniverse.sourceId),
      sourceName: pickString(row.sourceName, sourceUniverse.sourceName),
      sourceLaneLabel: row.sourceLaneLabel || null,
      sourcePoolLabel: row.sourcePoolLabel || null,
      sourceLevelClaimLabel: row.sourceLevelClaimLabel || null,
      sourceLevelClaimStatus: row.sourceLevelClaimStatus || null,
    },
    supportSignals: {
      dictionaryVerified: Boolean(row.dictionaryVerified),
      commonnessSupported: Boolean(row.commonnessSupported),
      frequencySupported: Boolean(row.frequencySupported),
      sentenceSupported: Boolean(row.sentenceSupported),
      pitchSupported: Boolean(row.pitchSupported),
      cleanIdentity: Boolean(row.cleanIdentity),
      learnerValueBucket: row.learnerValueBucket || null,
      learnerUtility: row.learnerUtility || null,
      frequencyEvidence: row.frequencyEvidence || null,
    },
    reviewRisks: {
      sameWrittenConflicts: row.sameWrittenConflicts || [],
      supportLabelNeeds: row.supportLabelNeeds || [],
      learnerFitRisks: row.learnerFitRisks || [],
      identityRisks: row.identityRisks || [],
      nextRequiredEvidence: row.nextRequiredEvidence || [],
    },
    editorialChecklist: [
      "Verify exact written+reading identity; do not collapse variants without product review.",
      "Verify learner-useful meaning, natural example, reading, and translation.",
      "Verify source/license/provenance posture and keep source-claim labels honest.",
      "Verify commonness/usefulness, N-level fit, support role, and product value.",
      "Verify duplicate/variant risk, kanji support labels, notes, pitch, and audio implications.",
      "Use keep/fix only for genuinely useful, supported, learner-appropriate, product-good rows.",
    ],
    allowedDecisions: WORD_SILVER_DECISIONS,
  };
}

function buildWordSilverReviewPacketArtifact({
  selectorReport,
  batchId,
  generatedAt = new Date().toISOString(),
  limit = 25,
  queueMode,
  placementMode,
  source,
  reviewerKind = WORD_SILVER_MANIFEST_AUTHORITY.reviewerKind,
} = {}) {
  if (!selectorReport || !Array.isArray(selectorReport.levelReports)) {
    throw new Error("selectorReport.levelReports is required.");
  }

  const levelPackets = selectorReport.levelReports.map((levelReport) => {
    const level = normalizeLevel(levelReport.level, "selector report level");
    const sourceRows = Array.isArray(levelReport.shownRows)
      ? levelReport.shownRows
      : [];
    const rows = sourceRows.slice(0, limit).map((row, index) =>
      buildPacketRow({ row, level, index, levelReport }),
    );

    return {
      level,
      levelLabel: `N${level}`,
      sourceId: levelReport.sourceUniverse?.sourceId || source || null,
      queueMode: queueMode || selectorReport.queueMode || null,
      placementMode: placementMode || selectorReport.placementMode || null,
      rowCount: rows.length,
      selectorTotals: levelReport.totals || null,
      rows,
    };
  });

  const rows = levelPackets.flatMap((levelPacket) => levelPacket.rows);

  return {
    schemaVersion: WORD_SILVER_PACKET_SCHEMA_VERSION,
    artifactType: "word_silver_review_packet_batch",
    batchId: batchId || "word-silver-review-packet",
    generatedAt,
    authority: WORD_SILVER_PACKET_AUTHORITY,
    reviewerExpectation: {
      reviewerKind,
      decisionsAreRequiredBeforeApply: true,
      decisionManifestSchemaVersion: WORD_SILVER_DECISION_MANIFEST_SCHEMA_VERSION,
    },
    selectorContext: {
      source: source || null,
      queueMode: queueMode || selectorReport.queueMode || null,
      placementMode: placementMode || selectorReport.placementMode || null,
      limit,
    },
    supportCommands: [
      "npm run deck:words:vocab-expansion -- --source=common-pool --queue=silver --placement-mode=vocabulary-level",
      "npm run deck:words:expansion-support -- --levels=<level>",
      "npm run deck:words:completion:n<level>",
      "npm run deck:words:gap-plan:n<level> -- --limit=50",
    ],
    levelPackets,
    totals: {
      levels: levelPackets.length,
      rows: rows.length,
      applyReadyRows: 0,
      note:
        "Packet rows are not apply-ready. Apply readiness exists only in a validated decision manifest.",
    },
  };
}

function formatWordSilverReviewPacketMarkdown(packet) {
  const lines = [];
  lines.push(`# Word Silver Review Packet: ${packet.batchId}`);
  lines.push("");
  lines.push(`Schema: ${packet.schemaVersion}`);
  lines.push(`Rows: ${packet.totals.rows}`);
  lines.push("");
  lines.push("## Authority");
  lines.push("");
  lines.push(`- Writes tracked templates: ${packet.authority.writesTrackedTemplates}`);
  lines.push(`- Certifies cards: ${packet.authority.certifiesCards}`);
  lines.push(`- Release evidence: ${packet.authority.claimsReleaseReadiness}`);
  lines.push(`- Boundary: ${packet.authority.boundary}`);
  lines.push("");

  packet.levelPackets.forEach((levelPacket) => {
    lines.push(`## ${levelPacket.levelLabel}`);
    lines.push("");
    lines.push(
      `Source: ${levelPacket.sourceId || "unknown"} | Queue: ${
        levelPacket.queueMode || "unknown"
      } | Rows: ${levelPacket.rowCount}`,
    );
    lines.push("");

    levelPacket.rows.forEach((row, index) => {
      lines.push(
        `${index + 1}. ${row.written} (${row.reading}) - ${row.selectorStatus}`,
      );
      lines.push(`   - Identity: ${row.identity}`);
      lines.push(`   - Source pool: ${row.source.sourcePoolLabel || "n/a"}`);
      lines.push(
        `   - Source claim: ${row.source.sourceLevelClaimLabel || "n/a"}`,
      );
      lines.push(
        `   - Learner utility: ${
          row.supportSignals.learnerUtility?.score ?? "n/a"
        }`,
      );
      lines.push(
        `   - Risks: ${
          [
            ...normalizeMaybeArray(row.reviewRisks.sameWrittenConflicts),
            ...normalizeMaybeArray(row.reviewRisks.learnerFitRisks),
            ...normalizeMaybeArray(row.reviewRisks.nextRequiredEvidence),
          ].join("; ") || "none surfaced by selector"
        }`,
      );
    });
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function writeWordSilverReviewPacketArtifact({
  packet,
  outPath,
  markdownPath,
  writeMarkdown = false,
}) {
  if (!outPath) {
    throw new Error("outPath is required.");
  }

  ensureDir(path.dirname(outPath));
  writeFileAtomicSync(outPath, `${JSON.stringify(packet, null, 2)}\n`);

  if (writeMarkdown) {
    const resolvedMarkdownPath =
      markdownPath || outPath.replace(/\.json$/i, ".md");
    ensureDir(path.dirname(resolvedMarkdownPath));
    writeFileAtomicSync(
      resolvedMarkdownPath,
      formatWordSilverReviewPacketMarkdown(packet),
    );
    return {
      outPath,
      markdownPath: resolvedMarkdownPath,
    };
  }

  return {
    outPath,
    markdownPath: null,
  };
}

function validateDecisionRow(row, index, manifestLevels, errors) {
  const label = `decisions[${index}]`;
  const expectedIdentity = buildWordIdentity(row.written, row.reading);

  if (row.identity !== expectedIdentity) {
    errors.push(
      `${label}.identity must equal exact written+reading identity ${expectedIdentity}.`,
    );
  }

  if (!manifestLevels.has(row.level)) {
    errors.push(`${label}.level is not listed in manifest.levels.`);
  }

  if (row.decision === "reroute") {
    if (!row.targetLevel) {
      errors.push(`${label}.targetLevel is required for reroute decisions.`);
    } else if (row.targetLevel === row.level) {
      errors.push(`${label}.targetLevel must differ from row.level.`);
    }
  } else if (row.targetLevel) {
    errors.push(`${label}.targetLevel is only allowed for reroute decisions.`);
  }

  if (NON_APPLY_DECISIONS.has(row.decision) && row.card) {
    errors.push(`${label}.card is only allowed for keep/fix decisions.`);
  }

  if (!APPLY_DECISIONS.has(row.decision)) {
    if (!row.blockedReasons || row.blockedReasons.length === 0) {
      errors.push(
        `${label}.blockedReasons is required for defer/reject/remove/reroute decisions.`,
      );
    }
    return;
  }

  if (!row.card) {
    errors.push(`${label}.card is required for keep/fix decisions.`);
    return;
  }

  const cardIdentity = buildWordStudyEntryKey(row.card);
  if (cardIdentity !== row.identity) {
    errors.push(`${label}.card identity must equal ${row.identity}.`);
  }

  if (row.card.jlpt !== row.level) {
    errors.push(`${label}.card.jlpt must equal ${row.level}.`);
  }

  if (!row.card.exampleSentence) {
    errors.push(`${label}.card.exampleSentence is required.`);
  } else {
    ["japanese", "reading", "english"].forEach((field) => {
      if (!row.card.exampleSentence[field]) {
        errors.push(`${label}.card.exampleSentence.${field} is required.`);
      }
    });
  }

  if (!row.card.readingBreakdown?.includes("<ruby>")) {
    errors.push(`${label}.card.readingBreakdown must include ruby markup.`);
  }

  if (!row.card.coverage?.role) {
    errors.push(`${label}.card.coverage.role is required.`);
  }

  if (!Array.isArray(row.card.coverage?.focusKanji)) {
    errors.push(`${label}.card.coverage.focusKanji is required.`);
  } else if (row.card.coverage.focusKanji.length === 0) {
    errors.push(`${label}.card.coverage.focusKanji must not be empty.`);
  }

  if (
    !row.card.coverage?.coversReadings ||
    Object.keys(row.card.coverage.coversReadings).length === 0
  ) {
    errors.push(`${label}.card.coverage.coversReadings is required.`);
  }

  if (!row.card.levelPlacement?.mode || !row.card.levelPlacement?.reason) {
    errors.push(`${label}.card.levelPlacement.mode and reason are required.`);
  }

  if (!row.card.source) {
    errors.push(`${label}.card.source is required.`);
  }

  if (!Array.isArray(row.card.tags) || row.card.tags.length === 0) {
    errors.push(`${label}.card.tags are required.`);
  } else if (!row.card.tags.includes(`n${row.level}`)) {
    errors.push(`${label}.card.tags must include n${row.level}.`);
  }

  const cardText = [
    row.card.notes,
    row.card.levelPlacement?.reason,
    row.card.source,
    ...(Array.isArray(row.card.tags) ? row.card.tags : []),
  ]
    .filter(Boolean)
    .join(" ");

  if (rowNeedsDictionaryCommonLabels(row)) {
    if (!cardText.includes("DICTIONARY COMMON POOL")) {
      errors.push(
        `${label}.card must preserve DICTIONARY COMMON POOL labeling for common-pool rows.`,
      );
    }
    if (!cardText.includes("Source level claim unverified")) {
      errors.push(
        `${label}.card must preserve Source level claim unverified labeling for common-pool rows.`,
      );
    }
  }

  assertNoForbiddenPlaceholders(row.card, `${label}.card`, errors);
  assertNoForbiddenPlaceholders(
    row.decisionEvidence,
    `${label}.decisionEvidence`,
    errors,
  );
}

function parseWordSilverDecisionManifest(manifest) {
  const parsed = decisionManifestSchema.safeParse(manifest);
  const errors = [];

  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      errors.push(`${issue.path.join(".") || "manifest"}: ${issue.message}`);
    });
    return {
      ok: false,
      manifest: null,
      errors,
      summary: null,
    };
  }

  const value = parsed.data;
  const manifestLevels = new Set(value.levels.map((level) => normalizeLevel(level)));

  value.decisions.forEach((row, index) => {
    validateDecisionRow(row, index, manifestLevels, errors);
  });

  assertNoForbiddenPlaceholders(value.reviewer, "reviewer", errors);

  const duplicateIdentities = value.decisions
    .map((row) => row.identity)
    .filter((identity, index, identities) => identities.indexOf(identity) !== index);
  uniq(duplicateIdentities).forEach((identity) => {
    errors.push(`Duplicate decision identity in manifest: ${identity}.`);
  });

  const summary = buildDecisionSummary(value.decisions);

  return {
    ok: errors.length === 0,
    manifest: value,
    errors,
    summary,
  };
}

function loadWordSilverDecisionManifest(manifestPath) {
  if (!manifestPath) {
    throw new Error("manifestPath is required.");
  }

  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsedJson = JSON.parse(raw);
  return parseWordSilverDecisionManifest(parsedJson);
}

function buildDecisionSummary(decisions) {
  const byDecision = Object.fromEntries(
    WORD_SILVER_DECISIONS.map((decision) => [decision, 0]),
  );
  const byLevel = {};

  decisions.forEach((row) => {
    byDecision[row.decision] += 1;
    byLevel[`N${row.level}`] ||= Object.fromEntries(
      WORD_SILVER_DECISIONS.map((decision) => [decision, 0]),
    );
    byLevel[`N${row.level}`][row.decision] += 1;
  });

  const keepLike = byDecision.keep + byDecision.fix;
  const denominator = decisions.length || 1;

  return {
    total: decisions.length,
    byDecision,
    byLevel,
    applyReady: keepLike,
    keepRate: keepLike / denominator,
  };
}

function formatWordSilverDecisionManifestReport(validation) {
  const lines = [];
  lines.push("Word Silver decision manifest validation");
  lines.push(`Status: ${validation.ok ? "PASS" : "FAIL"}`);

  if (validation.summary) {
    lines.push(`Rows: ${validation.summary.total}`);
    lines.push(`Apply-ready keep/fix rows: ${validation.summary.applyReady}`);
    lines.push(
      `Keep/fix rate: ${(validation.summary.keepRate * 100).toFixed(1)}%`,
    );
    Object.entries(validation.summary.byLevel).forEach(([level, counts]) => {
      lines.push(
        `${level}: keep ${counts.keep}, fix ${counts.fix}, defer ${counts.defer}, reject ${counts.reject}, remove ${counts.remove}, reroute ${counts.reroute}`,
      );
    });
  }

  if (validation.errors.length > 0) {
    lines.push("Errors:");
    validation.errors.forEach((error) => {
      lines.push(`- ${error}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function starterPathForLevel(rootDir, level) {
  return path.join(rootDir, "templates", `starter_word_study_data_n${level}.json`);
}

function contractPath(rootDir) {
  return path.join(rootDir, "templates", "jlpt_word_level_contract.json");
}

function buildPostApplyCommands(levels) {
  const sortedLevels = sortLevels(levels);
  const commands = [];

  sortedLevels.forEach((level) => {
    commands.push(`npm run deck:words:completion:n${level}`);
    commands.push(`npm run deck:words:gap-plan:n${level} -- --limit=50`);
    commands.push(`npm run deck:words:review:n${level}`);
    commands.push(`npm run deck:words:sapphire:n${level}`);
    commands.push(`npm run deck:words:platinum:n${level}`);
  });

  return [
    "npm run words:init -- --merge",
    ...commands,
    "npm run docs:status-audit",
    "git diff --check",
  ];
}

function applyWordSilverDecisionManifest({
  manifestPath,
  rootDir = process.cwd(),
  write = false,
} = {}) {
  const validation = loadWordSilverDecisionManifest(manifestPath);
  if (!validation.ok) {
    const error = new Error("Word Silver decision manifest validation failed.");
    error.validation = validation;
    throw error;
  }

  const manifest = validation.manifest;
  const applyRows = manifest.decisions.filter((row) =>
    APPLY_DECISIONS.has(row.decision),
  );
  const skippedRows = manifest.decisions.filter((row) =>
    NON_APPLY_DECISIONS.has(row.decision),
  );

  const startersByLevel = new Map();
  const changedFiles = new Set();
  const appliedRows = [];
  const errors = [];
  const root = path.resolve(rootDir);

  const wordContractPath = contractPath(root);
  const contract = readJsonIfExists(wordContractPath, {
    version: 1,
    wordLevels: {},
    excludedWordLevels: {},
    inventory: { countsByLevel: {}, total: 0 },
  });

  applyRows.forEach((row) => {
    const level = row.level;
    const starterPath = starterPathForLevel(root, level);
    if (!startersByLevel.has(level)) {
      startersByLevel.set(level, {
        path: starterPath,
        data: readJsonIfExists(starterPath, {}),
      });
    }

    const starter = startersByLevel.get(level);
    const entry = normalizeWordStudyEntry(row.card);
    const identity = buildWordStudyEntryKey(entry);
    const existsInStarter = Object.prototype.hasOwnProperty.call(
      starter.data,
      identity,
    );
    const existsInContract = Object.prototype.hasOwnProperty.call(
      contract.wordLevels,
      identity,
    );
    const existingContract = contract.wordLevels[identity];
    if (existingContract && existingContract.jlpt !== level) {
      errors.push(
        `${identity} already exists as N${existingContract.jlpt}; use reroute review before changing level placement.`,
      );
      return;
    }

    if (row.decision === "keep" && (existsInStarter || existsInContract)) {
      errors.push(
        `${identity} already exists; use fix only for governed updates to existing rows.`,
      );
      return;
    }

    starter.data[identity] = entry;
    contract.wordLevels[identity] = {
      written: entry.written,
      reading: entry.reading,
      jlpt: level,
    };
    changedFiles.add(starter.path);
    changedFiles.add(wordContractPath);
    appliedRows.push({
      identity,
      level,
      decision: row.decision,
      starterPath: starter.path,
    });
  });

  if (errors.length > 0) {
    const error = new Error("Word Silver decision manifest apply failed.");
    error.errors = errors;
    throw error;
  }

  const rebuiltContract = buildJlptWordLevelContract({
    version: contract.version,
    wordLevels: contract.wordLevels,
    excludedWordLevels: contract.excludedWordLevels || {},
  });

  if (write) {
    startersByLevel.forEach((starter) => {
      ensureDir(path.dirname(starter.path));
      writeFileAtomicSync(starter.path, `${JSON.stringify(starter.data, null, 2)}\n`);
    });
    ensureDir(path.dirname(wordContractPath));
    writeFileAtomicSync(
      wordContractPath,
      `${JSON.stringify(rebuiltContract, null, 2)}\n`,
    );
  }

  return {
    mode: write ? "write" : "dry-run",
    manifestPath,
    batchId: manifest.batchId,
    validation,
    appliedRows,
    skippedRows: skippedRows.map((row) => ({
      identity: row.identity,
      level: row.level,
      decision: row.decision,
    })),
    changedFiles: Array.from(changedFiles).sort(),
    postApplyCommands: buildPostApplyCommands(appliedRows.map((row) => row.level)),
  };
}

function formatWordSilverApplyReport(report) {
  const lines = [];
  lines.push("Word Silver decision manifest apply");
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Batch: ${report.batchId}`);
  lines.push(`Applied rows: ${report.appliedRows.length}`);
  lines.push(`Skipped non-apply rows: ${report.skippedRows.length}`);

  if (report.appliedRows.length > 0) {
    lines.push("Applied identities:");
    report.appliedRows.forEach((row) => {
      lines.push(`- N${row.level} ${row.identity} (${row.decision})`);
    });
  }

  if (report.changedFiles.length > 0) {
    lines.push("Changed files:");
    report.changedFiles.forEach((filePath) => {
      lines.push(`- ${filePath}`);
    });
  }

  lines.push("Required follow-up verification:");
  report.postApplyCommands.forEach((command) => {
    lines.push(`- ${command}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  WORD_SILVER_DECISION_MANIFEST_SCHEMA_VERSION,
  WORD_SILVER_DECISIONS,
  WORD_SILVER_MANIFEST_AUTHORITY,
  WORD_SILVER_PACKET_AUTHORITY,
  WORD_SILVER_PACKET_SCHEMA_VERSION,
  applyWordSilverDecisionManifest,
  buildDecisionSummary,
  buildWordSilverReviewPacketArtifact,
  formatWordSilverApplyReport,
  formatWordSilverDecisionManifestReport,
  formatWordSilverReviewPacketMarkdown,
  loadWordSilverDecisionManifest,
  parseWordSilverDecisionManifest,
  writeWordSilverReviewPacketArtifact,
};
