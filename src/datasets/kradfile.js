const fs = require('fs');
const { loadKanjiComponentMap } = require("./kanjiComponentContract");

function loadKradMap(kradfilePath) {
    const txt = fs.readFileSync(kradfilePath, 'utf-8');
    const map = new Map();

    for (const line of txt.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue; // skip empty lines and comments

        const parts = trimmed.split(":");
        if (parts.length < 2) continue; // skip malformed lines
        
        const kanji = parts[0].trim();
        const comps = parts[1].trim().split(/\s+/).filter(Boolean);

        if (kanji && comps.length) map.set(kanji, comps);
    }

    return map;
}

function pickMainComponent(components) {
    if (!components || components.length === 0) return "";
    return components.filter(Boolean).join(" / ");
}

function loadGovernedComponentMap({ kanjiComponentContractPath = "", kradfilePath = "" } = {}) {
    if (kanjiComponentContractPath && fs.existsSync(kanjiComponentContractPath)) {
        return loadKanjiComponentMap(kanjiComponentContractPath);
    }

    if (kradfilePath && fs.existsSync(kradfilePath)) {
        return loadKradMap(kradfilePath);
    }

    throw new Error(`Missing kanji component contract at ${kanjiComponentContractPath || "(not configured)"} and KRADFILE at ${kradfilePath || "(not configured)"}`);
}

module.exports = {
    loadGovernedComponentMap,
    loadKradMap,
    pickMainComponent,
};
