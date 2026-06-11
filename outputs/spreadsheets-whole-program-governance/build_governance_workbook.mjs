import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, "outputs", "spreadsheets-whole-program-governance");
const workbookPath = path.join(outputDir, "jkb_whole_program_governance.xlsx");
const previewDir = path.join(outputDir, "previews");

const lanes = ["silver", "gold", "sapphire", "platinum"];
const laneLabels = {
  silver: "Silver",
  gold: "Gold",
  sapphire: "Sapphire",
  platinum: "Platinum",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  });
  const parsed = options.json ? parseJson(result.stdout) : null;
  return {
    label: options.label ?? [command, ...args].join(" "),
    command: [command, ...args].join(" "),
    status: result.status,
    ok: result.status === 0,
    expectedFailure: Boolean(options.expectedFailure),
    stdout: result.stdout,
    stderr: result.stderr,
    data: parsed,
    parseOk: options.json ? parsed !== null : true,
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runNodeScript(script, args, options = {}) {
  return run(process.execPath, [script, ...args], {
    ...options,
    label: `node ${script} ${args.join(" ")}`.trim(),
  });
}

function assertJson(result) {
  if (!result.data) {
    throw new Error(`Failed to parse JSON for ${result.label}\nstatus=${result.status}\nstderr=${result.stderr.slice(0, 500)}`);
  }
  return result.data;
}

function toColName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function rangeA1(startRow, startCol, rowCount, colCount) {
  const start = `${toColName(startCol)}${startRow + 1}`;
  const end = `${toColName(startCol + colCount - 1)}${startRow + rowCount}`;
  return `${start}:${end}`;
}

function sheetRef(name, cell) {
  return `'${name.replace(/'/g, "''")}'!${cell}`;
}

function safeFormulaString(value) {
  return String(value ?? "").replace(/"/g, '""');
}

function surfaceLabel(row) {
  return `${row.levelLabel} ${row.deckKind === "kanji" ? "Kanji" : "Word"}`;
}

function classifyCommand(result, expectedFailure = false) {
  if (result.ok && result.parseOk) return "pass";
  if (expectedFailure && result.data) return "expected fail-closed";
  return "fail";
}

function compactError(result) {
  const text = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  return text ? text.slice(0, 220) : "";
}

const commandResults = [];
function record(result, expectedFailure = false, note = "") {
  commandResults.push({
    command: result.label,
    status: classifyCommand(result, expectedFailure),
    exit_code: result.status ?? 0,
    parsed_json: result.parseOk ? "yes" : "no",
    note: note || compactError(result),
  });
  return result;
}

record(run("git", ["status", "--short", "--branch"], { label: "git status --short --branch" }));
const gitTrackedStatus = record(run("git", ["status", "--short", "--branch", "--", ".", ":(exclude)outputs"], { label: "git status --short --branch -- . \":(exclude)outputs\"" }));
const gitLog = record(run("git", ["log", "-1", "--oneline", "--decorate"], { label: "git log -1 --oneline --decorate" }));
const gitRemoteFirst = run("git", ["ls-remote", "--heads", "origin"], { label: "git ls-remote --heads origin" });
let gitRemote = record(gitRemoteFirst, false, gitRemoteFirst.ok ? "" : "First remote-head attempt failed; retrying once.");
if (!gitRemoteFirst.ok) {
  gitRemote = record(run("git", ["ls-remote", "--heads", "origin"], { label: "git ls-remote --heads origin (retry)" }));
}

const closeout = assertJson(record(runNodeScript("scripts/reportDeckCloseoutStatus.js", ["--levels=5,4,3,2,1", "--json"], { json: true })));
const kanjiReview = assertJson(record(runNodeScript("scripts/reportKanjiDeckReviewStatus.js", ["--json"], { json: true })));
const perfMemory = assertJson(record(runNodeScript("scripts/reportPerformanceMemoryAuditMatrix.js", ["--json"], { json: true })));
const proofValidate = assertJson(record(runNodeScript("scripts/validateObsidianProofLedger.js", ["--json"], { json: true })));
const kanjiReconcile = assertJson(record(runNodeScript("scripts/reconcileObsidianProofLedger.js", ["--levels=5,4,3,2", "--json"], { json: true })));
const wordReconcile = assertJson(record(runNodeScript("scripts/reconcileObsidianProofLedger.js", ["--deck-kind=word", "--levels=5,4", "--json"], { json: true })));
const kanjiCertify = assertJson(record(runNodeScript("scripts/reportObsidianKanjiCertificationStatus.js", ["--levels=5,4,3,2", "--json"], { json: true })));
const wordCertify = assertJson(record(runNodeScript("scripts/reportObsidianWordCertificationStatus.js", ["--levels=5,4", "--json"], { json: true })));
const nlpGate = assertJson(record(runNodeScript("scripts/runNlpGovernanceGate.js", ["--json"], { json: true })));
const releaseTrustResult = runNodeScript("scripts/reportSdlcMetrics.js", ["--release-trust", "--json"], { json: true, expectedFailure: true });
const releaseTrust = assertJson(record(releaseTrustResult, true, "Expected fail-closed when release-trust blockers remain open."));

const wordCompletion = [5, 4, 3, 2, 1].map((level) => {
  const result = record(runNodeScript("scripts/reportWordDeckCompletion.js", [`--level=${level}`, "--json"], { json: true }));
  return assertJson(result);
});

const gateCounts = closeout.expectedGates.reduce((acc, gate) => {
  acc[gate.classification] = (acc[gate.classification] ?? 0) + 1;
  return acc;
}, {});

const gateBySurface = new Map();
for (const gate of closeout.expectedGates) {
  const key = `${gate.deckKind}:${gate.level}`;
  if (!gateBySurface.has(key)) gateBySurface.set(key, []);
  gateBySurface.get(key).push(gate.classification);
}

const productRows = closeout.laneRows.map((row) => {
  const key = `${row.deckKind}:${row.level}`;
  const classifications = [...new Set(gateBySurface.get(key) ?? [])].join("; ");
  return [
    surfaceLabel(row),
    row.deckKind,
    row.levelLabel,
    row.denominator,
    row.lanes.silver.count,
    row.lanes.gold.count,
    row.lanes.sapphire.count,
    row.lanes.platinum.count,
    null,
    classifications,
  ];
});

const laneRows = [];
for (const row of closeout.laneRows) {
  for (const lane of lanes) {
    const laneData = row.lanes[lane];
    laneRows.push([
      surfaceLabel(row),
      row.deckKind,
      row.levelLabel,
      laneLabels[lane],
      laneData.count,
      laneData.denominator,
      null,
      null,
      null,
    ]);
  }
}

const wordRows = wordCompletion.map((report) => {
  const coverage = report.readingCoverage;
  const triage = report.triage;
  const inventory = report.inventory;
  return [
    coverage.levelLabel,
    report.level,
    inventory.canonicalInventoryCount,
    inventory.builtEligibleCount,
    coverage.totalReadings,
    coverage.coveredReadings,
    null,
    coverage.missingWordCardReadings,
    coverage.missingExampleReadings,
    coverage.variantGapReadings,
    coverage.distinctGapReadings,
    triage.totalItems,
    triage.highPriorityItems,
    triage.mediumPriorityItems,
    triage.lowPriorityItems,
    report.readiness.status,
  ];
});

const releaseBlockers =
  (releaseTrust.releaseTrust?.highCriticalReleaseBlockerRisks ?? 0) +
  (releaseTrust.releaseTrust?.unimplementedReleaseBlockerRequirements ?? 0);
const remoteHeadLines = gitRemote.stdout.trim().split(/\r?\n/u).filter(Boolean);
const closeoutRemoteNote = closeout.git.remoteHeads.ok
  ? "Closeout subprocess verified remote heads."
  : gitRemote.ok
    ? "Closeout subprocess could not connect to GitHub; direct git ls-remote succeeded in this build."
    : "Closeout subprocess and direct git ls-remote both failed in this build; preserve as remote reachability limitation.";

const proofRows = [
  ["SDLC release trust", "release governance", releaseTrust.releaseTrust?.passed ? "passed" : "fail-closed blocker", 3, releaseBlockers, "SEC-P0-004, PROD-REL-001, and SEC-REQ-007 remain release-trust blockers."],
  ["Closeout remoteHeads subcheck", "git", closeout.git.remoteHeads.ok ? "passed" : "subcheck failed", 0, closeout.git.remoteHeads.ok ? 0 : 1, closeoutRemoteNote],
  ["Direct remote heads verification", "git", gitRemote.ok ? "passed" : "failed", remoteHeadLines.length, gitRemote.ok ? 0 : 1, gitRemote.ok ? `Remote heads: ${remoteHeadLines.map((line) => line.split(/\s+/u).at(-1)).join(", ")}` : compactError(gitRemote)],
  ["Kanji review status", "kanji structure", kanjiReview.passed ? "passed" : "failed", kanjiReview.rows?.length ?? 0, kanjiReview.structuralIssues?.length ?? 0, `Suppressed duplicate claims: ${kanjiReview.duplicateAdditionalClaims?.suppressedDuplicateClaimCount ?? 0}; unresolved duplicates: ${kanjiReview.duplicateAdditionalClaims?.unresolvedDuplicateKanjiCount ?? 0}.`],
  ["Obsidian proof ledger validate", "proof ledger", proofValidate.passed ? "passed" : "failed", proofValidate.counts.totalEvents, proofValidate.failures?.length ?? 0, "Canonical JSONL proof ledger validation; no proof writes performed."],
  ["Kanji proof reconcile N5-N2", "proof ledger", kanjiReconcile.passed ? "passed" : "failed", kanjiReconcile.totals.ledgerProofs, kanjiReconcile.totals.proofMismatches, "Scoped to current completed kanji proof surfaces."],
  ["Word proof reconcile N5-N4", "proof ledger", wordReconcile.passed ? "passed" : "failed", wordReconcile.totals.ledgerProofs, wordReconcile.totals.proofMismatches, `Source entries: ${wordReconcile.totals.sourceEntries}.`],
  ["Kanji Obsidian certify status N5-N2", "certification status", kanjiCertify.passed ? "passed" : "failed", kanjiCertify.totals.generatedRows, kanjiCertify.failureCount, "Status report only; this workbook does not certify cards."],
  ["Word Obsidian certify status N5-N4", "certification status", wordCertify.passed ? "passed" : "failed", wordCertify.totals.generatedRows, wordCertify.failureCount, "Status report only; this workbook does not certify cards."],
  ["NLP governance gate", "NLP support", nlpGate.passed ? "passed" : "failed", nlpGate.checks.length, nlpGate.errors.length, "Support-only: no certification, no tracked template writes, no release-readiness claim."],
  ["Performance memory matrix", "performance/memory", perfMemory.passed ? "passed" : "failed", perfMemory.counts.lanes, perfMemory.failures?.length ?? 0, `Timing budgets present: ${perfMemory.counts.timingBudgetsPresent}; memory sampling present: ${perfMemory.counts.memorySamplingPresent}.`],
];

const performanceRows = perfMemory.lanes.map((lane) => [
  lane.id,
  lane.productArea,
  lane.benchmarkClass,
  lane.ciPolicy,
  lane.timingBudget?.status ?? "missing",
  lane.memorySampling?.status ?? "missing",
  lane.passed ? "yes" : "no",
  lane.releaseBoundary,
]);

const gateRows = closeout.expectedGates.map((gate) => [
  `${gate.levelLabel} ${gate.deckKind === "kanji" ? "Kanji" : "Word"}`,
  gate.deckKind,
  gate.levelLabel,
  laneLabels[gate.lane] ?? gate.lane,
  gate.classification,
  gate.missing,
  gate.ratio,
  gate.command,
]);

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const productSheet = workbook.worksheets.add("Product Surfaces");
const laneSheet = workbook.worksheets.add("Lane Progress");
const wordSheet = workbook.worksheets.add("Word Reading");
const proofSheet = workbook.worksheets.add("Proof & Governance");
const perfSheet = workbook.worksheets.add("Performance Matrix");
const gatesSheet = workbook.worksheets.add("Gate Classifications");
const chartSheet = workbook.worksheets.add("Chart Data");
const sourcesSheet = workbook.worksheets.add("Source Commands");

const theme = {
  navy: "#17324D",
  blue: "#2563EB",
  teal: "#0F766E",
  green: "#15803D",
  amber: "#B45309",
  red: "#B91C1C",
  gray900: "#111827",
  gray700: "#374151",
  gray200: "#E5E7EB",
  gray100: "#F3F4F6",
  gray50: "#F9FAFB",
  white: "#FFFFFF",
};

function setSheetDefaults(sheet) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
}

for (const sheet of [dashboard, productSheet, laneSheet, wordSheet, proofSheet, perfSheet, gatesSheet, chartSheet, sourcesSheet]) {
  setSheetDefaults(sheet);
}

function writeMatrix(sheet, startRow, startCol, matrix) {
  const range = sheet.getRangeByIndexes(startRow, startCol, matrix.length, matrix[0].length);
  range.values = matrix;
  return range;
}

function styleTitle(sheet, range, title, subtitle) {
  range.merge();
  range.values = [[title]];
  range.format = {
    fill: theme.navy,
    font: { bold: true, color: theme.white, size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  range.format.rowHeightPx = 38;
  if (subtitle) {
    const sub = sheet.getRangeByIndexes(1, 0, 1, 8);
    sub.merge();
    sub.values = [[subtitle]];
    sub.format = {
      fill: theme.gray100,
      font: { color: theme.gray700, italic: true },
      wrapText: true,
      verticalAlignment: "center",
    };
    sub.format.rowHeightPx = 30;
  }
}

function styleHeader(range, fill = theme.teal) {
  range.format = {
    fill,
    font: { bold: true, color: theme.white },
    borders: { preset: "all", style: "thin", color: theme.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  range.format.rowHeightPx = 28;
}

function styleBody(range) {
  range.format = {
    fill: theme.white,
    font: { color: theme.gray900 },
    borders: { preset: "all", style: "thin", color: theme.gray200 },
    verticalAlignment: "top",
    wrapText: true,
  };
}

function setWidths(sheet, widths) {
  widths.forEach((widthPx, index) => {
    sheet.getRangeByIndexes(0, index, 200, 1).format.columnWidthPx = widthPx;
  });
}

function addTable(sheet, startRow, startCol, headers, rows, tableName, widths = []) {
  writeMatrix(sheet, startRow, startCol, [headers, ...rows]);
  const fullRange = sheet.getRangeByIndexes(startRow, startCol, rows.length + 1, headers.length);
  const headerRange = sheet.getRangeByIndexes(startRow, startCol, 1, headers.length);
  const bodyRange = sheet.getRangeByIndexes(startRow + 1, startCol, rows.length, headers.length);
  styleHeader(headerRange);
  styleBody(bodyRange);
  sheet.tables.add(rangeA1(startRow, startCol, rows.length + 1, headers.length), true, tableName);
  if (widths.length) setWidths(sheet, widths);
  return { fullRange, headerRange, bodyRange };
}

styleTitle(
  dashboard,
  dashboard.getRange("A1:M1"),
  "Japanese Kanji Builder Whole-Program Governance Workbook",
  "Read-only spreadsheet export from live repository commands. This is reporting support only: no card certification, no proof writes, no deck data edits.",
);
setWidths(dashboard, [170, 110, 210, 24, 150, 150, 150, 150, 150, 150, 150, 150, 150]);

dashboard.getRange("A4:C4").values = [["Control", "Value", "Evidence"]];
styleHeader(dashboard.getRange("A4:C4"), theme.blue);
dashboard.getRange("A5:C10").values = [
  ["Tracked source branch", gitTrackedStatus.stdout.trim(), "git status --short --branch -- . \":(exclude)outputs\""],
  ["Latest commit", gitLog.stdout.trim(), "git log -1 --oneline --decorate"],
  ["Direct remote heads", gitRemote.ok && remoteHeadLines.length === 1 ? "only main" : gitRemote.ok ? `${remoteHeadLines.length} heads` : "remote check failed", gitRemoteFirst.ok ? "git ls-remote --heads origin" : "git ls-remote --heads origin; retry if first failed"],
  ["Closeout remoteHeads", closeout.git.remoteHeads.ok ? "passed" : "subcheck failed", closeout.git.remoteHeads.ok ? "verified inside closeout" : closeout.git.remoteHeads.error],
  ["Artifact output", "outputs/spreadsheets-whole-program-governance", "Generated workbook artifacts are intentionally separated from tracked source status."],
  ["Release-trust mode", releaseTrust.releaseTrust?.passed ? "passed" : "fail-closed", "security release-trust blockers remain visible"],
];
styleBody(dashboard.getRange("A5:C10"));

dashboard.getRange("A11:C11").values = [["Metric", "Value", "Definition"]];
styleHeader(dashboard.getRange("A11:C11"), theme.teal);
dashboard.getRange("A12:A20").values = [
  ["Complete lane checks"],
  ["Total lane checks"],
  ["Lane completion rate"],
  ["Forward backlog entries"],
  ["Expected coverage failures"],
  ["Proof events"],
  ["Release-trust blockers"],
  ["NLP checks passed"],
  ["Performance lanes passing"],
];
dashboard.getRange("B12:B20").formulas = [
  ["=SUM('Lane Progress'!H2:H41)"],
  ["=COUNTA('Lane Progress'!A2:A41)"],
  ["=IF(B13=0,0,B12/B13)"],
  ["=SUM('Product Surfaces'!I2:I11)"],
  ["=COUNTIF('Gate Classifications'!E2:E31,\"expected-fail-coverage\")"],
  ["=SUMIF('Proof & Governance'!A2:A12,\"Obsidian proof ledger validate\",'Proof & Governance'!D2:D12)"],
  ["=SUMIF('Proof & Governance'!A2:A12,\"SDLC release trust\",'Proof & Governance'!E2:E12)"],
  ["=SUMIF('Proof & Governance'!A2:A12,\"NLP governance gate\",'Proof & Governance'!D2:D12)"],
  ["=SUMIF('Proof & Governance'!A2:A12,\"Performance memory matrix\",'Proof & Governance'!D2:D12)"],
];
dashboard.getRange("C12:C20").values = [
  ["Lane count equals denominator."],
  ["Kanji + word N5-N1 times four lanes."],
  ["Complete lane checks divided by total checks."],
  ["Missing Gold + Sapphire + Platinum entries."],
  ["Expected fail-closed coverage gates while backlog remains."],
  ["Canonical proof ledger events validated read-only."],
  ["Release-trust high/critical risk + unimplemented requirement blockers."],
  ["Governance checks, support-only boundary."],
  ["Tracked performance/memory governance lanes."],
];
styleBody(dashboard.getRange("A12:C20"));
dashboard.getRange("B12:B13").format.numberFormat = "0";
dashboard.getRange("B14").format.numberFormat = "0.0%";
dashboard.getRange("B15:B20").format.numberFormat = "#,##0";

const productHeaders = ["Surface", "Deck Kind", "Level", "Denominator", "Silver", "Gold", "Sapphire", "Platinum", "Forward Backlog", "Gate Posture"];
addTable(productSheet, 0, 0, productHeaders, productRows, "ProductSurfacesTable", [130, 95, 70, 95, 75, 75, 90, 90, 120, 360]);
productSheet.getRange("I2:I11").formulas = productRows.map((_, i) => {
  const row = i + 2;
  return [`=(D${row}-F${row})+(D${row}-G${row})+(D${row}-H${row})`];
});
productSheet.getRange("D2:I11").format.numberFormat = "#,##0";

const laneHeaders = ["Surface", "Deck Kind", "Level", "Lane", "Count", "Denominator", "Missing", "Complete Flag", "Completion Rate"];
addTable(laneSheet, 0, 0, laneHeaders, laneRows, "LaneProgressTable", [130, 95, 70, 90, 80, 95, 80, 105, 115]);
laneSheet.getRange("G2:I41").formulas = laneRows.map((_, i) => {
  const row = i + 2;
  return [`=F${row}-E${row}`, `=IF(G${row}=0,1,0)`, `=IF(F${row}=0,0,E${row}/F${row})`];
});
laneSheet.getRange("E2:H41").format.numberFormat = "#,##0";
laneSheet.getRange("I2:I41").format.numberFormat = "0.0%";

const wordHeaders = [
  "Level",
  "Level Number",
  "Canonical Inventory",
  "Built Eligible",
  "Total Readings",
  "Covered Readings",
  "Reading Coverage",
  "Missing Word Cards",
  "Missing Examples",
  "Variant Gaps",
  "Distinct Gaps",
  "Triage Total",
  "High",
  "Medium",
  "Low",
  "Readiness",
];
addTable(wordSheet, 0, 0, wordHeaders, wordRows, "WordReadingTable", [70, 90, 130, 105, 110, 115, 115, 125, 120, 105, 105, 100, 80, 80, 80, 210]);
wordSheet.getRange("G2:G6").formulas = wordRows.map((_, i) => {
  const row = i + 2;
  return [`=IF(E${row}=0,0,F${row}/E${row})`];
});
wordSheet.getRange("B2:F6").format.numberFormat = "#,##0";
wordSheet.getRange("G2:G6").format.numberFormat = "0.0%";
wordSheet.getRange("H2:O6").format.numberFormat = "#,##0";

const proofHeaders = ["Check", "Domain", "Status", "Records", "Blockers", "Notes"];
addTable(proofSheet, 0, 0, proofHeaders, proofRows, "ProofGovernanceTable", [245, 140, 135, 90, 90, 500]);
proofSheet.getRange("D2:E12").format.numberFormat = "#,##0";

const perfHeaders = ["Lane ID", "Product Area", "Benchmark Class", "CI Policy", "Timing Budget", "Memory Sampling", "Passed", "Release Boundary"];
addTable(perfSheet, 0, 0, perfHeaders, performanceRows, "PerformanceMatrixTable", [190, 210, 140, 105, 120, 135, 80, 520]);

const gateHeaders = ["Surface", "Deck Kind", "Level", "Lane", "Classification", "Missing", "Ratio", "Command"];
addTable(gatesSheet, 0, 0, gateHeaders, gateRows, "GateClassificationsTable", [130, 90, 70, 90, 210, 85, 85, 280]);
gatesSheet.getRange("F2:F31").format.numberFormat = "#,##0";

const sourceHeaders = ["Command", "Status", "Exit Code", "Parsed JSON", "Note"];
addTable(sourcesSheet, 0, 0, sourceHeaders, commandResults.map((row) => [row.command, row.status, row.exit_code, row.parsed_json, row.note]), "SourceCommandsTable", [460, 150, 80, 95, 520]);

styleTitle(
  chartSheet,
  chartSheet.getRange("A1:H1"),
  "Chart Data",
  "Formula-backed helper ranges for the Dashboard charts. Source detail remains in the workbook tables.",
);
setWidths(chartSheet, [150, 120, 30, 150, 90, 90, 90, 90, 30, 80, 130]);
chartSheet.getRange("A4:B4").values = [["Surface", "Forward Backlog"]];
styleHeader(chartSheet.getRange("A4:B4"), theme.blue);
chartSheet.getRange("A5:B14").formulas = productRows.map((_, i) => {
  const sourceRow = i + 2;
  return [`=${sheetRef("Product Surfaces", `A${sourceRow}`)}`, `=${sheetRef("Product Surfaces", `I${sourceRow}`)}`];
});
styleBody(chartSheet.getRange("A5:B14"));
chartSheet.getRange("B5:B14").format.numberFormat = "#,##0";

chartSheet.getRange("D4:H4").values = [["Surface", "Silver", "Gold", "Sapphire", "Platinum"]];
styleHeader(chartSheet.getRange("D4:H4"), theme.teal);
chartSheet.getRange("D5:H14").formulas = productRows.map((_, i) => {
  const productRow = i + 2;
  return [
    `=${sheetRef("Product Surfaces", `A${productRow}`)}`,
    `=${sheetRef("Product Surfaces", `E${productRow}`)}/${sheetRef("Product Surfaces", `D${productRow}`)}`,
    `=${sheetRef("Product Surfaces", `F${productRow}`)}/${sheetRef("Product Surfaces", `D${productRow}`)}`,
    `=${sheetRef("Product Surfaces", `G${productRow}`)}/${sheetRef("Product Surfaces", `D${productRow}`)}`,
    `=${sheetRef("Product Surfaces", `H${productRow}`)}/${sheetRef("Product Surfaces", `D${productRow}`)}`,
  ];
});
styleBody(chartSheet.getRange("D5:H14"));
chartSheet.getRange("E5:H14").format.numberFormat = "0.0%";

chartSheet.getRange("J4:K4").values = [["Level", "Reading Coverage"]];
styleHeader(chartSheet.getRange("J4:K4"), theme.amber);
chartSheet.getRange("J5:K9").formulas = wordRows.map((_, i) => {
  const sourceRow = i + 2;
  return [`=${sheetRef("Word Reading", `A${sourceRow}`)}`, `=${sheetRef("Word Reading", `G${sourceRow}`)}`];
});
styleBody(chartSheet.getRange("J5:K9"));
chartSheet.getRange("K5:K9").format.numberFormat = "0.0%";

const backlogChart = dashboard.charts.add("bar", chartSheet.getRange("A4:B14"));
backlogChart.title = "Forward-Lane Backlog by Product Surface";
backlogChart.hasLegend = false;
backlogChart.xAxis = { axisType: "textAxis" };
backlogChart.yAxis = { numberFormatCode: "#,##0" };
backlogChart.setPosition("E4", "M20");

const laneChart = dashboard.charts.add("bar", chartSheet.getRange("D4:H14"));
laneChart.title = "Lane Completion by Surface and Lane";
laneChart.hasLegend = true;
laneChart.xAxis = { axisType: "textAxis" };
laneChart.yAxis = { numberFormatCode: "0%" };
laneChart.setPosition("E22", "M38");

const readingChart = dashboard.charts.add("bar", chartSheet.getRange("J4:K9"));
readingChart.title = "Word Reading Coverage by JLPT Level";
readingChart.hasLegend = false;
readingChart.xAxis = { axisType: "textAxis" };
readingChart.yAxis = { numberFormatCode: "0%" };
readingChart.setPosition("A23", "D38");

dashboard.getRange("A22:D22").values = [["Word Reading Coverage"]];
styleHeader(dashboard.getRange("A22:D22"), theme.amber);
dashboard.getRange("A40:M43").merge();
dashboard.getRange("A40:M43").values = [[
  `Boundary: This workbook is an export/reporting contract only. It does not replace lane gates, does not shrink denominators, does not treat expected coverage failures as regressions, and did not write Obsidian proof. Release-trust blockers remain explicit: ${safeFormulaString(proofRows[0][5])}`,
]];
dashboard.getRange("A40:M43").format = {
  fill: "#FFF7ED",
  font: { color: theme.amber, bold: true },
  borders: { preset: "outside", style: "thin", color: "#FDBA74" },
  wrapText: true,
  verticalAlignment: "center",
};

for (const sheet of [productSheet, laneSheet, wordSheet, proofSheet, perfSheet, gatesSheet, sourcesSheet, chartSheet]) {
  sheet.getRange("A1:Z1").format.verticalAlignment = "center";
}

proofSheet.getRange("C2:C12").conditionalFormats.add("containsText", {
  text: "fail",
  format: { fill: "#FEE2E2", font: { color: theme.red, bold: true } },
});
proofSheet.getRange("C2:C12").conditionalFormats.add("containsText", {
  text: "passed",
  format: { fill: "#DCFCE7", font: { color: theme.green, bold: true } },
});
gatesSheet.getRange("E2:E31").conditionalFormats.add("containsText", {
  text: "expected-fail-coverage",
  format: { fill: "#FEF3C7", font: { color: theme.amber, bold: true } },
});
sourcesSheet.getRange("B2:B30").conditionalFormats.add("containsText", {
  text: "expected fail-closed",
  format: { fill: "#FEF3C7", font: { color: theme.amber, bold: true } },
});
sourcesSheet.getRange("B2:B30").conditionalFormats.add("containsText", {
  text: "fail",
  format: { fill: "#FEE2E2", font: { color: theme.red, bold: true } },
});
sourcesSheet.getRange("B2:B30").conditionalFormats.add("containsText", {
  text: "pass",
  format: { fill: "#DCFCE7", font: { color: theme.green, bold: true } },
});

const inspectedDashboard = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A1:M43",
  include: "values,formulas",
  tableMaxRows: 43,
  tableMaxCols: 13,
  maxChars: 6000,
});
console.log("INSPECT_DASHBOARD");
console.log(inspectedDashboard.ndjson);

const inspectedProof = await workbook.inspect({
  kind: "table",
  range: "Proof & Governance!A1:F12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 6,
  maxChars: 5000,
});
console.log("INSPECT_PROOF_GOVERNANCE");
console.log(inspectedProof.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 5000,
});
console.log("FORMULA_ERROR_SCAN");
console.log(formulaErrors.ndjson);

await fs.mkdir(previewDir, { recursive: true });
for (const sheetName of [
  "Dashboard",
  "Product Surfaces",
  "Lane Progress",
  "Word Reading",
  "Proof & Governance",
  "Performance Matrix",
  "Gate Classifications",
  "Chart Data",
  "Source Commands",
]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  const fileName = `${sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  await fs.writeFile(path.join(previewDir, fileName), bytes);
}

await fs.mkdir(outputDir, { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(workbookPath);

console.log(JSON.stringify({
  workbookPath,
  previewDir,
  commandCount: commandResults.length,
  productSurfaces: productRows.length,
  laneRows: laneRows.length,
  wordReadingRows: wordRows.length,
  proofGovernanceRows: proofRows.length,
  performanceRows: performanceRows.length,
  expectedGateCounts: gateCounts,
}, null, 2));
