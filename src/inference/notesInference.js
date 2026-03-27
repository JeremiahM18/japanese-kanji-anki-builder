function normalizeNoteText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildNotesFromRankedCandidates(rankedCandidates, max = 3) {
    const out = [];
    const seenWrittenGloss = new Set();
    const seenText = new Set();

    for (const candidate of rankedCandidates) {
        if (out.length >= max) {
            break;
        }

        const noteText = normalizeNoteText(candidate.text);
        const dedupeKey = `${candidate.written}|${candidate.gloss}`;

        if (!noteText || seenWrittenGloss.has(dedupeKey) || seenText.has(noteText)) {
            continue;
        }

        seenWrittenGloss.add(dedupeKey);
        seenText.add(noteText);
        out.push(noteText);
    }

    return out.join(" ／ ");
}

function inferNotes({ rankedCandidates, maxExamples = 3 }) {
    return {
        notes: buildNotesFromRankedCandidates(rankedCandidates, maxExamples),
    };
}

module.exports = {
    buildNotesFromRankedCandidates,
    inferNotes,
    normalizeNoteText,
};
