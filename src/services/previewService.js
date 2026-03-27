function formatMediaState(value) {
    return value ? "present" : "missing";
}

function formatPreviewCard(card) {
    const lines = [];
    lines.push(`${card.kanji} (${card.levelLabel})`);

    if (card.error) {
        lines.push(`Preview error: ${card.error}`);
        return lines.join("\n");
    }

    lines.push(`Meaning: ${card.meaningJP || "n/a"}`);
    lines.push(`Reading: ${card.reading || "n/a"}`);
    lines.push(`Radical: ${card.radical || "n/a"}`);
    lines.push(`Stroke order: ${formatMediaState(card.media.strokeOrderPath)}`);
    lines.push(`Stroke-order image: ${formatMediaState(card.media.strokeOrderImagePath)}`);
    lines.push(`Stroke-order animation: ${formatMediaState(card.media.strokeOrderAnimationPath)}`);
    lines.push(`Audio: ${formatMediaState(card.media.audioPath)}`);
    lines.push(`Notes: ${card.notes || "n/a"}`);
    lines.push(`Example: ${card.exampleSentence || "n/a"}`);
    return lines.join("\n");
}

function formatPreviewReport({ cards, scope }) {
    const lines = [];
    const previewErrors = cards.filter((card) => card.error).length;
    lines.push("Japanese Kanji Builder Preview");
    lines.push("");
    lines.push(`Cards previewed: ${cards.length}`);
    lines.push(`Preview errors: ${previewErrors}`);
    lines.push(`Scope: ${scope}`);

    if (cards.length === 0) {
        lines.push("");
        lines.push("No cards matched the requested scope.");
        return `${lines.join("\n")}\n`;
    }

    for (const card of cards) {
        lines.push("");
        lines.push(formatPreviewCard(card));
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    formatPreviewCard,
    formatPreviewReport,
};
