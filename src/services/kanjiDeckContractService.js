const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");

const KANJI_FIELD_NAMES = loadAnkiNoteSchema("kanji").fieldNames;

function parseKanjiExportTsv(tsv) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
        return [];
    }

    const header = lines[0].split("\t");
    return lines.slice(1).map((line, index) => {
        const cols = line.split("\t");
        const row = {};
        for (let fieldIndex = 0; fieldIndex < header.length; fieldIndex += 1) {
            row[header[fieldIndex]] = cols[fieldIndex] || "";
        }
        return {
            lineNumber: index + 2,
            row,
        };
    });
}

function buildViolation({ level, lineNumber, kanji, field, code, message }) {
    return {
        level,
        lineNumber,
        kanji,
        field,
        code,
        message,
    };
}

function buildKanjiDeckContractReport({ tsv, level = null, filePath = "" } = {}) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    const header = lines.length > 0 ? lines[0].split("\t") : [];
    const violations = [];

    if (header.length > 0 && header.join("\t") !== KANJI_FIELD_NAMES.join("\t")) {
        violations.push(buildViolation({
            level,
            lineNumber: 1,
            kanji: "",
            field: "header",
            code: "schema_mismatch",
            message: "Kanji TSV header does not match the kanji note schema.",
        }));
    }

    for (const { lineNumber, row } of parseKanjiExportTsv(tsv)) {
        const kanji = String(row.Kanji || "").trim();
        const displayWord = String(row.DisplayWord || "").trim();
        const primaryReading = String(row.PrimaryReading || "").trim();
        const studyWordKanji = String(row.StudyWordKanji || "").trim();

        if (!kanji) {
            violations.push(buildViolation({
                level,
                lineNumber,
                kanji,
                field: "Kanji",
                code: "missing_kanji",
                message: "Kanji field is required.",
            }));
        }

        if (displayWord !== kanji) {
            violations.push(buildViolation({
                level,
                lineNumber,
                kanji,
                field: "DisplayWord",
                code: "compound_anchor",
                message: `Kanji deck DisplayWord must equal the target kanji; got "${displayWord}".`,
            }));
        }

        if (!primaryReading) {
            violations.push(buildViolation({
                level,
                lineNumber,
                kanji,
                field: "PrimaryReading",
                code: "missing_primary_reading",
                message: "Kanji deck PrimaryReading is required.",
            }));
        }

        if (studyWordKanji) {
            violations.push(buildViolation({
                level,
                lineNumber,
                kanji,
                field: "StudyWordKanji",
                code: "kanji_card_study_word_labels",
                message: "Kanji deck StudyWordKanji must stay blank because the card target is the individual kanji.",
            }));
        }
    }

    return {
        valid: violations.length === 0,
        level,
        filePath,
        rowCount: Math.max(0, lines.length - 1),
        violations,
    };
}

function formatKanjiDeckContractReport(report) {
    const lines = [];
    const levelLabel = Number.isInteger(report?.level) ? `N${report.level}` : "kanji";
    lines.push(`Kanji deck contract failed for ${levelLabel}.`);
    lines.push("Kanji cards must teach the individual target kanji; compounds belong in notes, examples, and word decks.");

    for (const violation of (report?.violations || []).slice(0, 20)) {
        const location = [
            Number.isInteger(violation.level) ? `N${violation.level}` : "",
            violation.lineNumber ? `line ${violation.lineNumber}` : "",
            violation.kanji ? `kanji ${violation.kanji}` : "",
            violation.field || "",
        ].filter(Boolean).join(", ");
        lines.push(`- ${location}: ${violation.message}`);
    }

    if ((report?.violations || []).length > 20) {
        lines.push(`- ${report.violations.length - 20} more violation(s) omitted.`);
    }

    return lines.join("\n");
}

function assertKanjiDeckContract(report) {
    if (!report?.valid) {
        throw new Error(formatKanjiDeckContractReport(report));
    }
}

module.exports = {
    assertKanjiDeckContract,
    buildKanjiDeckContractReport,
    formatKanjiDeckContractReport,
};
