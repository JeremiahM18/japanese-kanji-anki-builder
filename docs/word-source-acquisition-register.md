# JLPT Word Source Acquisition Register

This register governs source access and permitted evidence roles for JLPT word
source-origin work. It does not define the operational word-level contract,
approve cards, or certify Silver, Gold, Sapphire, Platinum, Obsidian, or release
readiness. Live schemas, manifests, pinned inputs, validators, and audit output
remain authoritative; counts below are a dated investigation snapshot.

## Policy Boundary

`level_universe_standard` requires all of the following for one exact
`written|reading` identity:

- the configured minimum independent JLPT-placement source families;
- the configured minimum independent placement-evidence lineages;
- the configured minimum Japanese-published or permissioned learner sources;
- no disputed level claim and no disagreement with the current operational
  contract;
- an explicit reviewed `dictionary-identity` support claim when required; and
- an explicit reviewed positive `commonness` support claim when required.

Dictionary and commonness support never count as JLPT-placement votes, source
families, evidence lineages, or learner-source placement evidence. A source's
allowed-use profile merely permits a claim; it is not evidence that a particular
identity has that claim. Frequency is not JLPT-placement truth, and dictionary
identity is not JLPT-placement truth.

When `--level` or `--levels` is supplied, the word-source audit uses every exact
identity in the selected operational-contract level as its denominator. It still
consumes cross-level claims for those identities, while reporting other contract
and comparable identities separately. It never removes mismatches, unevaluated
rows, or difficult identities to obtain a passing result.

## N4 Investigation Snapshot — 2026-08-23

The live selected-contract audit checked `1,034` duplicate-free N4 identities:

| N4 bucket | Count |
| --- | ---: |
| Sole Tanos claim is N4 | 191 |
| Sole Tanos claim is N5 | 183 |
| Sole Tanos claim is N3 | 139 |
| Sole Tanos claim is N2 | 89 |
| Sole Tanos claim is N1 | 97 |
| No reviewed comparable placement claim | 335 |
| Total | 1,034 |

All five Tanos level files share `independenceGroup=tanos` and
`evidenceLineage=tanos-vocab-list`. They are one family and one lineage. The N4
posture is therefore `699` single-source-family and `335` source-origin-not-
evaluated, with `508` current-contract/sole-source mismatches and no N4 disputes.
Rerun the owning audit before using these snapshot counts.

## Current Source Decisions

| Source | Current governance | Permitted evidence role | Explicit non-authority / blocker |
| --- | --- | --- | --- |
| Tanos N1–N5 vocabulary | Active, approved, attributed under the [Tanos sharing terms](https://www.tanos.co.uk/jlpt/sharing/) | Candidate discovery, weak source-level hint, reviewed exact assignment | The five files are not independent; not official or complete JLPT truth; not dictionary/commonness proof |
| JMdict | Active, approved under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html); support-fact storage only | Exact reviewed `written\|reading` dictionary identity support | Not a JLPT-placement vote or learner-facing meaning verification; placement assignments remain prohibited; meaning correctness requires a separate governed field-level comparison/evidence surface; derived support facts retain CC BY-SA 4.0 obligations and must satisfy the pinned freshness procedure |
| JMdict priority | Active, approved under the EDRDG licence; positive support-fact storage only | Positive commonness support only when an exact reviewed priority fact is present for the written-reading pair | Absence of priority is not positive evidence; not a placement vote; same EDRDG lineage as JMdict and not an independent source |
| TubeLex | Active, approved under its commit-pinned [BSD 3-Clause licence](https://github.com/naist-nlp/tubelex/blob/7cb5fb36add76b83a266d1967536e1a1d3faa513/LICENSE); positive support-fact storage only | Positive frequency/commonness support for an exact reviewed match to the published aggregate list | Corpus frequency is not JLPT placement, dictionary identity, reading, meaning, learner-source evidence, or card approval; raw subtitle text must not be scraped, reconstructed, stored, or redistributed |
| JLPTStudy N4/N5 | In review; licence needs review | Candidate discovery only after exact access and use review | No stored or voting assignments under the current registry |
| JLPT Sensei | Blocked under current terms | None | The [published terms](https://jlptsensei.com/terms-and-conditions/) do not authorize the required copying/redistribution posture |
| jpdb | Blocked under current posture | None | No automated extraction, storage, or placement voting |
| Kanjium | Active, approved, pitch-only | Pitch-accent support | Not placement, dictionary identity, or commonness evidence |
| Core-deck and textbook placeholders | Registered; no current exact permitted surface | None until access is reviewed | Do not manufacture assignments from placeholders |
| Official JLPT samples | Copyright-controlled positive occurrence for the exact sampled item only | Sample-specific verification after terms review | The [official FAQ](https://www.jlpt.jp/e/faq/) says vocabulary/kanji/grammar specifications are not published after 2010; samples are not a complete N4 list |

Publisher pages such as [ASK TRY! N4](https://ask-books.com/jlpt-try/),
[3A N4 Vocabulary](https://www.3anet.co.jp/np/books/3636/), and
[3A N4 Important 1000](https://www.3anet.co.jp/np/books/3666/) may identify
future bounded learner-source surfaces. Public availability is not storage,
derivation, or redistribution permission. The [3A copyright policy](https://www.3anet.co.jp/en/copyright.html)
must be honored. Do not purchase material, accept terms, contact publishers, or
import these sources without repository-owner authorization and a completed
source-access review.

## Pinned Support Sources And Licence Boundary

The licence decision permits the narrow support use below. It does not prove
that an identity has support and does not authorize a placement assignment.
`canStoreWordAssignments` remains false for all three entries. A support fact
is eligible for governed storage only when the source separately declares
`canStoreSupportFacts=true`, the exact `supportEvidenceKinds`, a pinned upstream
snapshot, matching normalized local integrity, and an exact reviewed
`written|reading` row with a citation and evidence reference.

### JMdict and JMdict priority

The reviewed upstream snapshot is the official English JMdict gzip at
`https://www.edrdg.org/pub/Nihongo/JMdict_e.gz`:

- header/version: `JMdict created: 2026-08-23`;
- retrieved and checked: `2026-08-23`;
- SHA-256: `11c3fb43a82ae775269e6832d117c4f52152f4d8cf49f44c16a0ed619aa98a6a`;
- byte size: `10,556,309`.

The ignored normalized exact-identity TSV is pinned independently:

- SHA-256: `814197ad14b2b52236b5e007b6d15ad18ad82e7aff40329346bdaf94ec2e3606`;
- byte size: `58,452,932`;
- data rows: `258,874`.

EDRDG states that JMdict and data files derived from it are CC BY-SA 4.0,
permits commercial use when the licence conditions are met, requires source
acknowledgement and licence access, prohibits claiming copyright over JMdict
material, and requires a procedure for regular updates from the most recent
version. The repository therefore uses a maximum snapshot age of `31` days.
Before a support-fact write or strict audit relies on an older snapshot, refresh
from the official current gzip; verify the gzip SHA-256, byte size, and creation
header; regenerate the ignored TSV; reconcile its SHA-256, byte size, row count,
and columns; update both tracked manifests together; and rerun the owning
validators. A failed download, invalid header, checksum mismatch, row-count
drift without review, or overdue snapshot is a blocking prerequisite, not
permission to reuse stale facts.

JMdict identity support and JMdict priority support share
`independenceGroup=edrdg` and `evidenceLineage=edrdg-jmdict`. Priority markers
may apply to a particular written-reading pair. Only an explicit positive
marker may create a commonness fact; an empty marker is not negative or positive
commonness evidence.

### TubeLex Japanese frequency

The reviewed upstream snapshot is the published aggregate Japanese UniDic
3.1.0 lemma/POS frequency file at TubeLex commit
`7cb5fb36add76b83a266d1967536e1a1d3faa513`:

- upstream file: `frequencies/tubelex-ja-310-lemma-pos.tsv.xz`;
- retrieved and checked: `2026-08-23`;
- SHA-256: `39d4edb2ccac4405b47d0f93e9ec7b11678b3b305d1a37c877dd76588817c8e9`;
- byte size: `3,658,276`.

The ignored derived exact-identity TSV is pinned independently:

- SHA-256: `94e2a07b3ada7eab306e8e3823730a38d0ab5572eb80ff809c4daaa2f3f2f2e7`;
- byte size: `24,661,425`;
- data rows: `65,663`.

TubeLex places its published repository and aggregate frequency lists under BSD
3-Clause. Preserve the copyright notice, conditions, disclaimer, and
non-endorsement boundary in `NOTICE.md` and redistributed materials. TubeLex
does not publish the full subtitle corpus because of source copyright; this
project uses only the published aggregate frequency file. There is no
licence-mandated update cadence, so the immutable commit pin is the reproducible
authority until an explicit reviewed repin. Any repin must repeat licence,
checksum, normalizer, derived-JMdict lineage, and exact-match review.

The derived TubeLex TSV is joined through the pinned JMdict identity surface,
so its provenance retains both the TubeLex BSD conditions and the applicable
JMdict CC BY-SA 4.0 derived-data obligations. A written-form hit alone cannot
choose a reading. Ambiguous, restriction-incompatible, or unmatched forms must
not create exact support facts. Only a positive exact match may create
`commonness`; a missing corpus hit is not negative evidence.

## Governed Import Requirements

Before any new placement assignment or support fact is written:

1. Register the exact source, family, lineage, status, licence evidence, allowed
   and prohibited uses, and the separate placement-assignment and support-fact
   storage permissions.
2. Complete an exact source-access packet; marketing pages, grammar/can-do
   summaries, example-only pages, and vague vocabulary claims are not evidence.
3. Create and pin an ignored review worksheet. Every reviewed row requires an
   exact `written|reading`, citation, and evidence reference.
4. Use a JLPT level only for placement evidence. A support-only input must set
   `evidenceMode=support`, `importMode=replace-contract-scope`, an exact
   `contractLevels` scope, `requireLevel=false`, and one narrow
   `supportProfile`. Source-wide `defaultSupportClaims` and default evidence
   references are prohibited. Every reviewed row must carry its own typed
   claim, evidence kind, snapshot version, normalized-source hash, and positive
   predicate fields. `commonness` may be asserted only for rows carrying a
   positive priority or exact non-poor frequency fact.
5. Run strict preflight, dry-run merge, write the worksheet only through the
   governed merge command, dry-run import, then use the transactional import
   write. The selected assignment or support-record file and evidence manifest
   commit atomically and are reloaded for post-write reconciliation.
6. Rerun the selected-level audit and reconcile every bucket. Never promote
   dictionary, commonness, or learner-fit support into an independent placement
   vote.

## Remaining N4 Queue And Resume Gate

Before any governed support-fact import, the 2026-08-23 baseline remaining
selected-contract queue was:

- `335` identities with no reviewed comparable placement evidence;
- `699` identities with only one placement family and one lineage;
- `508` identities whose sole Tanos claim points to another level;
- `1,034` identities without tracked explicit dictionary-identity support claims;
- `1,034` identities without tracked explicit positive commonness support claims;
- `0` current N4 disputed rows.

Resume source acquisition only when there is a specific newly permitted exact
source surface, explicit publisher permission, or a completed access packet for
an already registered surface. Even then, import only exact covered rows and
leave the audit failing until the full selected denominator genuinely satisfies
the policy.

After the governed 2026-08-23 typed support imports, the exact current queue is:

- `335` identities still have no reviewed comparable JLPT-placement evidence;
- `699` identities still have only the single Tanos family and lineage;
- `508` identities still disagree with their sole Tanos level claim;
- `0` identities lack exact typed JMdict dictionary identity support;
- `7` identities lack an explicit positive commonness fact:
  `映え|ばえ`, `屋|や`, `会わせる|あわせる`, `究める|きわめる`,
  `魚料理|さかなりょうり`, `肉料理|にくりょうり`, and
  `病み付き|やみつき`;
- `0` identities meet `level_universe_standard`, and `0` are disputed.

The access blocker is external evidence, not engineering: there is no currently
permitted, attributable exact N4 placement surface that supplies the missing
independent families, independent lineages, and Japanese-published or
permissioned learner-source coverage across the full `1,034`-identity contract.
JMdict and TubeLex cannot substitute for placement. Official JLPT does not
publish a complete post-2010 vocabulary specification, blocked/restricted
websites cannot be copied, and registered textbook/publisher surfaces require
explicit authorized access and a completed licence/source-access review. Do not
spend money, accept terms, contact publishers, scrape, infer levels from
frequency, or relabel the contract to advance this queue.
