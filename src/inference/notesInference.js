const { isKatakanaOnly } = require("./meaningInference");

function normalizeNoteText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isUsableNoteCandidate(candidate) {
    return Boolean(
        candidate
        && normalizeNoteText(candidate.text)
        && String(candidate.written || "").trim()
        && String(candidate.gloss || "").trim()
    );
}

function isLearnerFriendlyNoteCandidate(candidate, kanji = "") {
    if (!candidate) {
        return false;
    }

    if (candidate.written === kanji && isKatakanaOnly(candidate.pron)) {
        return false;
    }

    return true;
}

function pickDiverseNoteCandidates(rankedCandidates, kanji, max) {
    const usable = (Array.isArray(rankedCandidates) ? rankedCandidates : [])
        .filter(isUsableNoteCandidate)
        .filter((candidate) => isLearnerFriendlyNoteCandidate(candidate, kanji));
    const selected = [];
    const seenWritten = new Set();

    const tryPush = (candidate) => {
        if (!candidate || selected.length >= max || seenWritten.has(candidate.written)) {
            return;
        }

        seenWritten.add(candidate.written);
        selected.push(candidate);
    };

    tryPush(usable.find((candidate) => candidate.written === kanji));
    tryPush(usable.find((candidate) => candidate.written !== kanji && String(candidate.written || "").includes(kanji)));

    for (const candidate of usable) {
        tryPush(candidate);
        if (selected.length >= max) {
            break;
        }
    }

    return selected;
}

function buildNotesFromRankedCandidates(rankedCandidates, max = 3, kanji = "") {
    const out = [];
    const seenText = new Set();
    const candidates = pickDiverseNoteCandidates(rankedCandidates, kanji, max);

    for (const candidate of candidates) {
        const noteText = normalizeNoteText(candidate.text);

        if (!noteText || seenText.has(noteText)) {
            continue;
        }

        seenText.add(noteText);
        out.push(noteText);
    }

    return out.join(" ／ ");
}

function inferNotes({ kanji, rankedCandidates, maxExamples = 3 }) {
    return {
        notes: buildNotesFromRankedCandidates(rankedCandidates, maxExamples, kanji),
    };
}

module.exports = {
    buildNotesFromRankedCandidates,
    inferNotes,
    isLearnerFriendlyNoteCandidate,
    isUsableNoteCandidate,
    normalizeNoteText,
    pickDiverseNoteCandidates,
};
