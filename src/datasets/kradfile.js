const fs = require('fs');

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
    // Deterministic: first component in KRADFILE line
    if (!components || components.length === 0) return "";
    return components[0];
}

module.exports = {
    loadKradMap,
    pickMainComponent,
};