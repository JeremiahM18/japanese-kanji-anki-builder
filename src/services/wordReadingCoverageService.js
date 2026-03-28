function katakanaToHiragana(text) {
  return Array.from(String(text || '')).map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) {
      return String.fromCharCode(code - 0x60);
    }
    return char;
  }).join('');
}

function normalizeReadingToken(value) {
  return katakanaToHiragana(String(value || ''))
    .replace(/^おん:/, '')
    .replace(/^くん:/, '')
    .replace(/[\s・･]/g, '')
    .replace(/[.\-]/g, '')
    .replace(/…/g, '')
    .trim();
}

function parseDelimitedReadingField(fieldValue, prefix) {
  const raw = String(fieldValue || '').trim();
  if (!raw || !raw.startsWith(prefix)) {
    return [];
  }

  return [...new Set(raw.slice(prefix.length)
    .split('、')
    .map((entry) => normalizeReadingToken(entry))
    .filter(Boolean))];
}

function parseKanjiTsv(tsv) {
  const lines = String(tsv || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = cols[index] || '';
    }
    return row;
  });
}

function parseWordTsv(tsv) {
  const lines = String(tsv || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = cols[index] || '';
    }
    return row;
  });
}

function parseExampleEntries(notes) {
  return String(notes || '')
    .split(' ／ ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(?<word>.+?)\s*（(?<reading>[^）]+)）\s*-\s*(?<meaning>.+)$/u);
      if (!match || !match.groups) {
        return null;
      }
      return {
        written: match.groups.word.trim(),
        reading: String(match.groups.reading || '').trim(),
        normalizedReading: normalizeReadingToken(match.groups.reading || ''),
        meaning: match.groups.meaning.trim(),
        source: 'notes',
      };
    })
    .filter(Boolean);
}

function buildCuratedExamplesForKanji(row) {
  const examples = [];
  const displayWord = String(row.DisplayWord || '').trim();
  const primaryReading = String(row.PrimaryReading || '').trim();

  if (displayWord && primaryReading) {
    examples.push({
      written: displayWord,
      reading: primaryReading,
      normalizedReading: normalizeReadingToken(primaryReading),
      meaning: String(row.MeaningJP || '').trim(),
      source: 'display',
    });
  }

  examples.push(...parseExampleEntries(row.Notes));

  const deduped = new Map();
  for (const example of examples) {
    const key = `${example.written}|${example.reading}`;
    if (!deduped.has(key)) {
      deduped.set(key, example);
    }
  }

  return [...deduped.values()];
}

function readingMatchesExample(targetReading, exampleReading) {
  const target = normalizeReadingToken(targetReading);
  const example = normalizeReadingToken(exampleReading);

  if (!target || !example) {
    return false;
  }

  return example === target
    || example.startsWith(target)
    || example.endsWith(target)
    || (target.length >= 2 && example.includes(target));
}

function buildWordDeckIndex(wordRows) {
  return wordRows.map((row) => ({
    written: String(row.Word || '').trim(),
    reading: String(row.Reading || '').trim(),
    normalizedReading: normalizeReadingToken(String(row.Reading || '').trim()),
  }));
}

function buildReadingCoverageForKanji(row, wordDeckIndex) {
  const kanji = String(row.Kanji || '').trim();
  const examples = buildCuratedExamplesForKanji(row).filter((example) => example.written.includes(kanji));
  const onReadings = parseDelimitedReadingField(row.OnReading, 'オン:');
  const kunReadings = parseDelimitedReadingField(row.KunReading, 'くん:');

  const evaluateReading = (reading) => {
    const matchingExamples = examples.filter((example) => readingMatchesExample(reading, example.normalizedReading));
    const deckExamples = wordDeckIndex
      .filter((deckEntry) => deckEntry.written.includes(kanji)
        && matchingExamples.some((example) => readingMatchesExample(example.normalizedReading, deckEntry.normalizedReading)))
      .map((deckEntry) => ({
        written: deckEntry.written,
        reading: deckEntry.reading,
        normalizedReading: deckEntry.normalizedReading,
        meaning: '',
        source: 'deck',
      }));

    let status = 'missing_example';
    if (deckExamples.length > 0) {
      status = 'covered';
    } else if (matchingExamples.length > 0) {
      status = 'missing_word_card';
    }

    return {
      reading,
      status,
      matchingExamples,
      deckExamples,
    };
  };

  const onCoverage = onReadings.map(evaluateReading);
  const kunCoverage = kunReadings.map(evaluateReading);

  return {
    kanji,
    displayWord: String(row.DisplayWord || '').trim(),
    examples,
    onCoverage,
    kunCoverage,
  };
}

function buildWordReadingCoverageReport({ kanjiRows, wordRows, levelLabel = 'N5' }) {
  const wordDeckIndex = buildWordDeckIndex(wordRows);
  const coverage = kanjiRows.map((row) => buildReadingCoverageForKanji(row, wordDeckIndex));
  const allReadings = coverage.flatMap((entry) => [...entry.onCoverage, ...entry.kunCoverage]);

  const summary = {
    levelLabel,
    kanjiCount: coverage.length,
    totalReadings: allReadings.length,
    coveredReadings: allReadings.filter((entry) => entry.status === 'covered').length,
    missingWordCardReadings: allReadings.filter((entry) => entry.status === 'missing_word_card').length,
    missingExampleReadings: allReadings.filter((entry) => entry.status === 'missing_example').length,
  };

  return {
    summary,
    kanji: coverage,
  };
}

function formatCoverageBucket(label, entries) {
  if (entries.length === 0) {
    return `  - ${label}: none`;
  }
  return `  - ${label}: ` + entries.map((entry) => {
    const examples = (entry.deckExamples.length > 0 ? entry.deckExamples : entry.matchingExamples)
      .map((example) => `${example.written} (${example.reading})`)
      .join(', ');
    return `${entry.reading} [${entry.status}]${examples ? ` -> ${examples}` : ''}`;
  }).join(' | ');
}

function formatWordReadingCoverageReport(report, { maxKanji = 50 } = {}) {
  const lines = [];
  lines.push(`Japanese Kanji Builder Word Reading Coverage Audit (${report.summary.levelLabel})`);
  lines.push('');
  lines.push(`Kanji audited: ${report.summary.kanjiCount}`);
  lines.push(`Readings audited: ${report.summary.totalReadings}`);
  lines.push(`Covered by word deck: ${report.summary.coveredReadings}`);
  lines.push(`Curated example exists but missing from word deck: ${report.summary.missingWordCardReadings}`);
  lines.push(`No curated example yet: ${report.summary.missingExampleReadings}`);
  lines.push('');

  const focus = report.kanji
    .filter((entry) => [...entry.onCoverage, ...entry.kunCoverage].some((reading) => reading.status !== 'covered'))
    .sort((a, b) => {
      const aMissing = [...a.onCoverage, ...a.kunCoverage].filter((reading) => reading.status !== 'covered').length;
      const bMissing = [...b.onCoverage, ...b.kunCoverage].filter((reading) => reading.status !== 'covered').length;
      return bMissing - aMissing || a.kanji.localeCompare(b.kanji, 'ja');
    })
    .slice(0, maxKanji);

  if (focus.length === 0) {
    lines.push('All curated N5 readings currently have at least one supporting word card.');
    return lines.join('\n') + '\n';
  }

  lines.push('Kanji with remaining reading gaps:');
  for (const entry of focus) {
    const missing = [...entry.onCoverage, ...entry.kunCoverage].filter((reading) => reading.status !== 'covered').length;
    lines.push(`- ${entry.kanji} (${entry.displayWord || entry.kanji}) - ${missing} uncovered reading(s)`);
    lines.push(formatCoverageBucket('On-yomi', entry.onCoverage));
    lines.push(formatCoverageBucket('Kun-yomi', entry.kunCoverage));
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  buildCuratedExamplesForKanji,
  buildReadingCoverageForKanji,
  buildWordDeckIndex,
  buildWordReadingCoverageReport,
  formatWordReadingCoverageReport,
  normalizeReadingToken,
  parseDelimitedReadingField,
  parseExampleEntries,
  parseKanjiTsv,
  parseWordTsv,
  readingMatchesExample,
};
