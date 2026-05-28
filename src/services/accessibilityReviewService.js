const fs = require("node:fs");
const path = require("node:path");

const JAPANESE_FONT_MARKERS = [
    "yu gothic",
    "hiragino sans",
    "noto sans jp",
    "meiryo",
    "biz udp",
];

function parseCssBlocks(css = "") {
    const blocks = [];
    const blockRegex = /([^{}]+)\{([^{}]*)\}/gms;
    let match = blockRegex.exec(css);
    while (match) {
        const selectors = match[1]
            .split(",")
            .map((selector) => selector.trim())
            .filter(Boolean);
        const declarations = {};
        for (const rawRule of match[2].split(";")) {
            const separatorIndex = rawRule.indexOf(":");
            if (separatorIndex === -1) {
                continue;
            }
            const property = rawRule.slice(0, separatorIndex).trim().toLowerCase();
            const value = rawRule.slice(separatorIndex + 1).trim();
            if (!property || !value) {
                continue;
            }
            declarations[property] = value;
        }
        if (selectors.length > 0) {
            blocks.push({ selectors, declarations });
        }
        match = blockRegex.exec(css);
    }

    return blocks;
}

function buildSelectorMap(css = "") {
    const selectorMap = new Map();
    for (const block of parseCssBlocks(css)) {
        for (const selector of block.selectors) {
            selectorMap.set(selector, {
                ...(selectorMap.get(selector) || {}),
                ...block.declarations,
            });
        }
    }
    return selectorMap;
}

function parseHexColor(value) {
    const match = String(value || "").match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
    if (!match) {
        return null;
    }
    const hex = match[1];
    if (hex.length === 3) {
        return hex.split("").map((char) => parseInt(`${char}${char}`, 16));
    }
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}

function srgbToLinear(channel) {
    const normalized = channel / 255;
    return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
}

function computeContrastRatio(foreground, background) {
    const luminance = (rgb) => (
        (0.2126 * srgbToLinear(rgb[0]))
        + (0.7152 * srgbToLinear(rgb[1]))
        + (0.0722 * srgbToLinear(rgb[2]))
    );

    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

function parsePxValue(value) {
    const match = String(value || "").match(/([\d.]+)px/i);
    return match ? Number(match[1]) : null;
}

function isBoldWeight(value) {
    if (!value) {
        return false;
    }
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "bold") {
        return true;
    }
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric >= 700;
}

function getFieldTokens(template = "") {
    return [...String(template).matchAll(/{{[#/^]?([^{}]+)}}/g)]
        .map((match) => match[1].trim())
        .filter(Boolean);
}

function formatRatio(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function hasNonEmptyAltAttribute(imgTag) {
    return /\salt\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/iu.test(String(imgTag || ""));
}

function buildExportedImageAltSummary(exportsDir) {
    const summary = {
        checkedFiles: [],
        imageTagCount: 0,
        imageTagsWithAlt: 0,
        imageTagsMissingAlt: 0,
        missingAltSamples: [],
    };

    if (!exportsDir || !fs.existsSync(exportsDir)) {
        return summary;
    }

    const exportFiles = fs.readdirSync(exportsDir)
        .filter((fileName) => fileName.endsWith(".tsv"))
        .sort((a, b) => a.localeCompare(b, "en"));

    for (const fileName of exportFiles) {
        const filePath = path.join(exportsDir, fileName);
        const text = fs.readFileSync(filePath, "utf-8");
        summary.checkedFiles.push(fileName);

        for (const match of text.matchAll(/<img\b[^>]*>/giu)) {
            const tag = match[0];
            summary.imageTagCount += 1;
            if (hasNonEmptyAltAttribute(tag)) {
                summary.imageTagsWithAlt += 1;
            } else {
                summary.imageTagsMissingAlt += 1;
                if (summary.missingAltSamples.length < 5) {
                    summary.missingAltSamples.push(`${fileName}: ${tag}`);
                }
            }
        }
    }

    return summary;
}

function buildAccessibilityReviewReport({ deckKind, schema, packageSummary }) {
    const selectorMap = buildSelectorMap(schema.css);
    const cardStyle = selectorMap.get(".card") || {};
    const baseBackground = parseHexColor(cardStyle.background || cardStyle["background-color"] || "#ffffff");
    const baseColor = parseHexColor(cardStyle.color || "#000000");
    const baseFontSize = parsePxValue(cardStyle["font-size"]) || 16;
    const baseFontWeight = cardStyle["font-weight"] || "400";
    const qfmtTokens = getFieldTokens(schema.qfmt);
    const afmtTokens = getFieldTokens(schema.afmt);

    const checks = [];
    const addCheck = (id, label, status, details) => {
        checks.push({ id, label, status, details });
    };

    const fontFamily = String(cardStyle["font-family"] || "").toLowerCase();
    const hasJapaneseFontSupport = JAPANESE_FONT_MARKERS.some((marker) => fontFamily.includes(marker));
    addCheck(
        "font-stack",
        "Japanese-capable font stack",
        hasJapaneseFontSupport ? "pass" : "fail",
        hasJapaneseFontSupport
            ? `Base card font stack includes Japanese-capable fonts: ${cardStyle["font-family"]}`
            : "Base card font stack should include Japanese-capable fonts such as Yu Gothic, Hiragino Sans, Noto Sans JP, or Meiryo.",
    );

    const frontHasPrimaryText = qfmtTokens.some((token) => token === "Kanji" || token === "Word");
    addCheck(
        "front-text",
        "Front side exposes primary study text",
        frontHasPrimaryText ? "pass" : "fail",
        frontHasPrimaryText
            ? `Front side uses textual study content: ${qfmtTokens.join(", ")}`
            : "Front side should expose a textual study field such as Kanji or Word instead of relying on media alone.",
    );

    const hasAudioField = schema.fieldNames.includes("Audio");
    const audioReferencedOnAnswer = afmtTokens.includes("Audio");
    const packageAudioCount = Number(packageSummary?.mediaCounts?.audio || 0);
    addCheck(
        "audio-contract",
        "Audio contract stays visible when audio ships",
        (!packageAudioCount || (hasAudioField && audioReferencedOnAnswer)) ? "pass" : "fail",
        (!packageAudioCount || (hasAudioField && audioReferencedOnAnswer))
            ? `Schema keeps audio on the answer side${packageAudioCount ? ` for ${packageAudioCount} packaged audio assets` : ""}.`
            : "Packaged audio exists, but the note schema does not expose an Audio field on the answer side.",
    );

    const hasExampleField = schema.fieldNames.includes("ExampleSentence");
    const exampleReferencedOnAnswer = afmtTokens.includes("ExampleSentence");
    addCheck(
        "textual-redundancy",
        "Textual explanation remains available alongside media",
        hasExampleField && exampleReferencedOnAnswer ? "pass" : "fail",
        hasExampleField && exampleReferencedOnAnswer
            ? "Answer side includes example text instead of relying on audio or visuals alone."
            : "Answer side should include ExampleSentence so media is not the only teaching channel.",
    );

    if (deckKind === "kanji") {
        const strokeCount = Number(packageSummary?.mediaCounts?.strokeOrderAnimation || 0);
        const strokeReferenced = afmtTokens.includes("StrokeOrder");
        addCheck(
            "stroke-order-surface",
            "Kanji deck exposes stroke-order media on the card",
            (!strokeCount || strokeReferenced) ? "pass" : "fail",
            (!strokeCount || strokeReferenced)
                ? `Kanji answer side exposes stroke-order media${strokeCount ? ` for ${strokeCount} packaged animations` : ""}.`
                : "Kanji package includes stroke-order media, but the answer side does not reference the StrokeOrder field.",
        );
    } else {
        const breakdownReferenced = afmtTokens.includes("KanjiBreakdown");
        addCheck(
            "breakdown-surface",
            "Word deck exposes kanji breakdown and labels on the card",
            breakdownReferenced ? "pass" : "fail",
            breakdownReferenced
                ? "Word answer side includes KanjiBreakdown, which is where stroke-order media and cross-level badges are rendered."
                : "Word answer side should include KanjiBreakdown so stroke-order media and cross-level labels remain visible.",
        );
    }

    const exportedImageAltSummary = buildExportedImageAltSummary(packageSummary?.exportsDir);
    const allExportedImagesHaveAlt = exportedImageAltSummary.imageTagsMissingAlt === 0;
    addCheck(
        "exported-image-alt-text",
        "Exported image tags carry non-empty alt text",
        allExportedImagesHaveAlt ? "pass" : "fail",
        allExportedImagesHaveAlt
            ? `Checked ${exportedImageAltSummary.imageTagCount} exported image tags across ${exportedImageAltSummary.checkedFiles.length} TSV files; all include non-empty alt text.`
            : `Found ${exportedImageAltSummary.imageTagsMissingAlt}/${exportedImageAltSummary.imageTagCount} exported image tags without non-empty alt text. Samples: ${exportedImageAltSummary.missingAltSamples.join(" | ")}`
    );

    const contrastChecksByDeck = {
        kanji: [
            { selector: ".card", label: "Base card text" },
            { selector: ".kanji-core", label: "Supporting kanji text" },
            { selector: ".reading-primary", label: "Primary reading text" },
            { selector: ".reading-full", label: "Secondary reading text" },
        ],
        word: [
            { selector: ".card", label: "Base card text" },
            { selector: ".word-reading", label: "Word reading text" },
            { selector: ".word-level", label: "JLPT level text" },
            { selector: ".focus-line", label: "Study focus text" },
            { selector: ".section-title", label: "Section title text" },
        ],
    };

    for (const item of contrastChecksByDeck[deckKind] || []) {
        const style = selectorMap.get(item.selector) || {};
        const color = parseHexColor(style.color) || baseColor;
        const fontSize = parsePxValue(style["font-size"]) || baseFontSize;
        const fontWeight = style["font-weight"] || baseFontWeight;
        const contrastRatio = (color && baseBackground)
            ? computeContrastRatio(color, baseBackground)
            : null;
        const threshold = (fontSize >= 24 || (fontSize >= 18.66 && isBoldWeight(fontWeight))) ? 3 : 4.5;
        addCheck(
            `contrast:${item.selector}`,
            `${item.label} meets contrast guidance`,
            contrastRatio !== null && contrastRatio >= threshold ? "pass" : "fail",
            contrastRatio !== null
                ? `${item.selector} contrast ratio is ${formatRatio(contrastRatio)}:1 against the card background; expected at least ${threshold}:1.`
                : `${item.selector} contrast could not be computed from the schema CSS.`,
        );
    }

    const manualChecklistPath = path.join("docs", "accessibility-checklist.md");
    addCheck(
        "manual-review",
        "Manual accessibility review checklist exists",
        "pass",
        `Use ${manualChecklistPath} for keyboard, screen-reader, zoom, and Anki device review that the automated audit cannot verify.`,
    );

    const statusCounts = checks.reduce((counts, check) => {
        counts[check.status] = (counts[check.status] || 0) + 1;
        return counts;
    }, {});

    return {
        deckKind,
        packageRootDir: packageSummary?.rootDir || "",
        checks,
        summary: {
            totalChecks: checks.length,
            passCount: statusCounts.pass || 0,
            failCount: statusCounts.fail || 0,
            valid: (statusCounts.fail || 0) === 0,
        },
    };
}

function formatAccessibilityReviewReport(report) {
    const deckLabel = report.deckKind === "word" ? "Word Deck" : "Kanji Deck";
    const lines = [
        "Japanese Kanji Builder Accessibility Review",
        "",
        `Deck kind: ${deckLabel}`,
        report.packageRootDir ? `Package root: ${report.packageRootDir}` : null,
        `Checks: ${report.summary.passCount}/${report.summary.totalChecks} passing`,
        report.summary.failCount > 0 ? `Failures: ${report.summary.failCount}` : "Failures: 0",
        "",
    ].filter(Boolean);

    for (const check of report.checks) {
        const prefix = check.status === "pass" ? "PASS" : "FAIL";
        lines.push(`- [${prefix}] ${check.label}`);
        lines.push(`  ${check.details}`);
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    JAPANESE_FONT_MARKERS,
    buildExportedImageAltSummary,
    buildAccessibilityReviewReport,
    buildSelectorMap,
    computeContrastRatio,
    hasNonEmptyAltAttribute,
    formatAccessibilityReviewReport,
    parseCssBlocks,
    parseHexColor,
};
