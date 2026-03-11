function buildNotesFromRankedCandidates(rankedCandidates, max = 3) {
    const out = [];
    const seen = new Set();

    for (const candidate of rankedCandidates) {
        if (out.length >= max) {
            break;
        }

        const dedupeKey = `${candidate.written}|${candidate.pron}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        out.push(candidate.text);
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
};
