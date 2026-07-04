const test = require("node:test");
const assert = require("node:assert/strict");

const { compilePolicyRegexList, loadDeckEditorialPolicy } = require("../src/datasets/deckEditorialPolicy");

test("tracked deck editorial policy carries phrase and noisy-meaning patterns", () => {
    const policy = loadDeckEditorialPolicy();

    assert.equal(policy.schemaVersion, 1);
    assert.ok(policy.wordDeck.excludedWordCardTags.includes("phrase"));
    assert.equal(policy.wordDeck.excludedWordCardTags.includes("duplicate-variant"), false);
    assert.ok(policy.wordDeck.phraseEndingPatterns.length >= 4);
    assert.ok(policy.wordDeck.lexicalizedUsageSuffixPatterns.length >= 1);
    assert.ok(policy.wordDeck.adjectiveNounPhrasePatterns.length >= 1);
    assert.ok(policy.kanjiDeck.noisyMeaningPatterns.length >= 4);
});

test("tracked deck editorial policy regexes preserve current phrase and meaning decisions", () => {
    const policy = loadDeckEditorialPolicy();
    const phraseEndingPatterns = compilePolicyRegexList(policy.wordDeck.phraseEndingPatterns);
    const lexicalizedUsageSuffixPatterns = compilePolicyRegexList(policy.wordDeck.lexicalizedUsageSuffixPatterns);
    const adjectiveNounPhrasePatterns = compilePolicyRegexList(policy.wordDeck.adjectiveNounPhrasePatterns);
    const noisyMeaningPatterns = compilePolicyRegexList(policy.kanjiDeck.noisyMeaningPatterns);

    assert.equal(phraseEndingPatterns.some((regex) => regex.test("川の近く")), true);
    assert.equal(lexicalizedUsageSuffixPatterns.some((regex) => regex.test("使い方")), true);
    assert.equal(lexicalizedUsageSuffixPatterns.some((regex) => regex.test("思い出")), true);
    assert.equal(adjectiveNounPhrasePatterns.some((regex) => regex.test("高い山")), true);
    assert.equal(noisyMeaningPatterns.some((regex) => regex.test("two radical (no. 7)")), true);
    assert.equal(noisyMeaningPatterns.some((regex) => regex.test("rape")), true);
    assert.equal(noisyMeaningPatterns.some((regex) => regex.test("river")), false);
});
