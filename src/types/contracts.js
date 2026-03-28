/**
 * Shared JSDoc contracts for the highest-value runtime boundaries in this repo.
 * These contracts are intentionally focused on media, inference, and build artifacts.
 */

/**
 * @typedef {object} MediaAsset
 * @property {"image"|"animation"|"audio"} kind
 * @property {string} path
 * @property {string} mimeType
 * @property {string} source
 * @property {string=} checksum
 * @property {number=} width
 * @property {number=} height
 * @property {number=} durationMs
 * @property {"kanji-reading"|"word-reading"|"sentence"=} category
 * @property {string=} text
 * @property {string=} reading
 * @property {string=} voice
 * @property {string=} locale
 * @property {string=} notes
 */

/**
 * @typedef {object} MediaManifest
 * @property {string} kanji
 * @property {1} version
 * @property {string} updatedAt
 * @property {{strokeOrderImage: MediaAsset|null, strokeOrderAnimation: MediaAsset|null, audio: MediaAsset[]}} assets
 */

/**
 * @typedef {object} ProviderAsset
 * @property {string=} absolutePath
 * @property {string} fileName
 * @property {string} mimeType
 * @property {string} checksum
 * @property {number} sizeBytes
 * @property {Buffer} content
 * @property {string} extension
 * @property {string} source
 * @property {string=} url
 */

/**
 * @typedef {object} ProviderMetric
 * @property {number} requests
 * @property {number} hits
 * @property {number} misses
 * @property {number} errors
 * @property {string|null} lastSuccessAt
 * @property {string|null} lastErrorAt
 * @property {string|null} lastErrorMessage
 */

/**
 * @typedef {object} ProviderAttempt
 * @property {string} provider
 * @property {"hit"|"miss"|"error"} status
 * @property {string=} error
 */

/**
 * @typedef {object} ProviderLookupResult
 * @property {ProviderAsset|null} asset
 * @property {ProviderAttempt[]} attempts
 */

/**
 * @typedef {object} ScoreBreakdownItem
 * @property {string} key
 * @property {number} value
 * @property {string} reason
 */

/**
 * @typedef {object} ScoreBreakdown
 * @property {ScoreBreakdownItem[]} heuristic
 * @property {ScoreBreakdownItem[]} corpusSupport
 * @property {{heuristicScore: number, corpusSupportScore: number, finalScore: number}} totals
 */

/**
 * @typedef {object} RankedCandidate
 * @property {string} written
 * @property {string} pron
 * @property {string} gloss
 * @property {string} text
 * @property {number} score
 * @property {number} corpusSupportScore
 * @property {ScoreBreakdown} scoreBreakdown
 */

/**
 * @typedef {object} SentenceCandidate
 * @property {string} type
 * @property {string} japanese
 * @property {string} reading
 * @property {string} english
 * @property {string} sourceWord
 * @property {number} score
 * @property {string} source
 * @property {string[]=} tags
 * @property {string=} register
 * @property {number=} frequencyRank
 * @property {number=} jlpt
 */

/**
 * @typedef {object} CuratedInferenceInfo
 * @property {boolean} hasOverride
 * @property {string=} source
 * @property {string[]=} tags
 * @property {number|null=} jlpt
 * @property {string[]=} preferredWords
 * @property {string[]=} blockedWords
 * @property {string[]=} blockedSentencePhrases
 * @property {string[]=} alternativeNotes
 * @property {boolean=} hasCustomNotes
 * @property {boolean=} hasCustomExampleSentence
 * @property {boolean=} hasCustomMeaning
 * @property {boolean=} hasCustomDisplayWord
 */

/**
 * @typedef {object} InferenceResult
 * @property {string} kanji
 * @property {string[]} kanjiMeanings
 * @property {RankedCandidate[]} candidates
 * @property {RankedCandidate|null} bestWord
 * @property {RankedCandidate|null} displayWord
 * @property {string} primaryReading
 * @property {string} englishMeaning
 * @property {string} meaningJP
 * @property {string} notes
 * @property {SentenceCandidate[]} sentenceCandidates
 * @property {CuratedInferenceInfo} curated
 */

/**
 * @typedef {object} DatasetNormalizationSummary
 * @property {string} name
 * @property {string} inputPath
 * @property {string} outputPath
 * @property {number} inputEntries
 * @property {number} outputEntries
 * @property {boolean} changed
 * @property {string} mode
 * @property {boolean} missingInput
 * @property {string|null=} normalizedText
 */

/**
 * @typedef {object} BuildExportArtifact
 * @property {number} level
 * @property {string} filePath
 * @property {number} rows
 */

/**
 * @typedef {object} AnkiPackageSummary
 * @property {string|null} filePath
 * @property {boolean} skipped
 * @property {string} skipReason
 * @property {number} noteCount
 * @property {number} deckCount
 * @property {number} mediaFileCount
 */

/**
 * @typedef {object} BuildSummary
 * @property {string} generatedAt
 * @property {string} outDir
 * @property {number[]} levels
 * @property {number|null} limit
 * @property {number} concurrency
 * @property {BuildExportArtifact[]} exports
 * @property {{rootDir: string, exportsDir: string, mediaDir: string, readmePath: string, exportCount: number, mediaAssetCount: number, mediaCounts: {strokeOrder: number, strokeOrderImage: number, strokeOrderAnimation: number, trueStrokeOrderAnimation: number, svgStrokeOrderAnimationFallback: number, audio: number}, ankiPackage: AnkiPackageSummary}} package
 * @property {{sentenceCorpus: Omit<DatasetNormalizationSummary, "name"|"mode"|"normalizedText">, curatedStudyData: Omit<DatasetNormalizationSummary, "name"|"mode"|"normalizedText">}} normalization
 * @property {{sentenceCoveragePath: string, curatedCoveragePath: string, mediaCoveragePath: string, sentenceNormalizationPath: string, curatedNormalizationPath: string, mediaSyncPath: string}} reports
 * @property {{sentenceCorpus: number, curatedStudyData: number, strokeOrder: number, trueAnimation: number, audio: number, fullMedia: number}} coverage
 * @property {{skipped: boolean, totalKanji: number, errors: number}} mediaSync
 */

module.exports = {};
