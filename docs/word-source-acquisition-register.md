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

## Program-Wide Investigation Snapshot — 2026-08-24

The live default audit now keeps the exact operational N5-N1 contract as its
denominator. Comparable source-only candidates are still measured and available
to candidate materialization, but are not silently unioned into the adequacy
denominator. The duplicate-free contract contains `2,820` exact identities:

| Level | Contract | Sole Tanos family | No placement evidence | Contract/Tanos mismatch | Disputed |
| --- | ---: | ---: | ---: | ---: | ---: |
| N5 | 588 | 333 | 255 | 160 | 0 |
| N4 | 1,034 | 699 | 335 | 508 | 0 |
| N3 | 1,099 | 784 | 315 | 357 | 0 |
| N2 | 61 | 57 | 4 | 37 | 0 |
| N1 | 38 | 33 | 5 | 14 | 0 |
| Total | 2,820 | 1,906 | 914 | 1,076 | 0 |

All five Tanos level files share `independenceGroup=tanos` and
`evidenceLineage=tanos-vocab-list`. They are one family and one lineage, not five
independent sources. Within N4, the sole claim distribution remains N4 `191`,
N5 `183`, N3 `139`, N2 `89`, N1 `97`, with `335` identities having no reviewed
placement claim. The same source-family rule is enforced across every level.
Rerun the owning audit before using these dated counts.

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
| Official JLPT samples | Copyright-controlled positive occurrence for the exact sampled item only | Sample-specific verification after terms review | The [official FAQ](https://www.jlpt.jp/e/faq/) says vocabulary/kanji/grammar specifications are not published after 2010; samples are not a complete level list |
| Open Anki JLPT / downstream Waller datasets | Licence and attribution may permit reuse, but the repositories explicitly identify Tanos/Waller as their placement origin | Candidate discovery or corrected Tanos-lineage maintenance only | Same `tanos-vocab-list` evidence lineage; an open-source wrapper cannot create independent placement evidence |
| Wiktionary JLPT appendices | Page text is CC BY-SA, but the appendix does not establish an independently researched placement origin | Candidate discovery pending an origin-lineage audit | Permissioned storage alone does not prove independent origin; do not count it as a new family or lineage |
| Tomoshi `vocab_jlpt` | CC BY-SA open-data surface labels the table as community estimates, but does not establish the estimate lineage | Candidate discovery pending a pinned release and origin-lineage audit | JMdict identity and open-data licensing do not make the JLPT estimates independent placement truth |
| 3A JLPT vocabulary and word-book series | Japanese-published, level-specific, professionally authored learner surfaces | High-value future exact placement review after authorized access and storage/use review | Public catalogue metadata proves the books exist, not permission to bulk store their headword assignments; purchases, account access, copying, or publisher contact require repository-owner authorization |

Publisher pages such as [ASK TRY!](https://ask-books.com/jlpt-try/),
[3A's catalogue](https://www.3anet.co.jp/en/catalogue.html), and the
[3A N4 Important 1000](https://www.3anet.co.jp/np/books/3666/) page identify
future bounded learner-source surfaces across multiple levels. Public
availability is not storage,
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

- header/version: `JMdict created: 2026-08-24`;
- retrieved and checked: `2026-08-24`;
- SHA-256: `fed341a919a537f74c769bc5c69a18c8f5b7fcf372c25b0bef07e69dc35a15d0`;
- byte size: `10,557,859`.

The ignored normalized exact-identity TSV is pinned independently:

- SHA-256: `fd43dc3a0c970f7a79d8028ec33eaf566a5bc4fcbf776eb11d30e3f8e396f22a`;
- byte size: `58,461,464`;
- data rows: `258,909`.

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

- rebuilt and checked against the current JMdict identity surface: `2026-08-24`;
- SHA-256: `6be7933b8c527c8c36d1d9eabe2b492ce06fe5085c6aeb207e550465ae17d4d2`;
- byte size: `24,662,220`;
- data rows: `65,664`.

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
   commit atomically and are reloaded for post-write reconciliation. When one
   refreshed upstream snapshot changes multiple support-source provenance
   contracts, import those sources with the explicit atomic `--sources` and
   `--source-access-packet-dir` scope so no partially migrated manifest can pass
   or remain behind.
6. Rerun the selected-level audit and reconcile every bucket. Never promote
   dictionary, commonness, or learner-fit support into an independent placement
   vote.

## Remaining Program-Wide Queue And Resume Gate

Before the 2026-08-24 program-wide support import, exact dictionary/commonness
gaps were N5 `588/588`, N4 `0/7`, N3 `1,099/1,099`, N2 `61/61`, and N1 `38/38`,
for totals of `1,786` missing dictionary identities and `1,793` missing positive
commonness facts. The governed all-level refresh imported `2,814` exact JMdict
identity facts, `2,682` positive JMdict-priority facts, and `1,708` positive
TubeLex facts. The support gaps are now:

| Level | Missing dictionary identity | Missing positive commonness |
| --- | ---: | ---: |
| N5 | 6 | 23 |
| N4 | 0 | 7 |
| N3 | 0 | 67 |
| N2 | 0 | 1 |
| N1 | 0 | 0 |
| Total | 6 | 98 |

The six exact dictionary-identity gaps are `一時半|いちじはん`,
`何ですか|なんですか`, `来ます|きます`, `生ビール|なまびーる`,
`行きます|いきます`, and `読みます|よみます`. They remain gaps because the
current exact JMdict written-reading surface does not bind those inflected,
phrase, or product-style contract identities. No looser lemma, spelling, or
reading join was used.

The placement queue did not move, because support evidence has no placement
authority:

- `914` identities have no reviewed comparable placement evidence;
- `1,906` identities have only the one Tanos family and one Tanos lineage;
- `1,076` identities disagree with their sole Tanos level claim;
- `0` identities meet `level_universe_standard`;
- `0` identities are disputed;
- all `2,820` operational identities remain source-depth incomplete.

The exact live queue is reproducible with
`npm.cmd run data:audit:jlpt:word-sources -- --governance-strict --json --limit=10000 --as-of=2026-08-24`.
The complete identities are in the report's `issues` arrays. As a compact
reconciliation guard, SHA-256 is calculated over each sorted identity list
joined by LF:

| Queue | Count | SHA-256 |
| --- | ---: | --- |
| `missingEvidence` | 914 | `c94b65f432e6c69fa28b89d5d4407791631398f8652621d23101b2f7a8945cf2` |
| `insufficientIndependentSources` | 1,906 | `13d044f97588e4f990e7cc52b52f756a3293b67e8fb50b57477227c2f59778ce` |
| `insufficientIndependentEvidenceLineages` | 1,906 | `13d044f97588e4f990e7cc52b52f756a3293b67e8fb50b57477227c2f59778ce` |
| `contractConsensusMismatches` | 1,076 | `ce9281259160b5f00b9ef0d74e7437d1d5ab1c114b1108af410a586e63c69048` |
| `missingDictionaryIdentitySupport` | 6 | `0a716adc45dc2b8579dabfe1fb8ab6f2e11aba28c3d5d835206f075ac11e5461` |
| `missingCommonnessSupport` | 98 | `30cef7acd829e5a546600d5740d471b12b8e31ef35239df2753407d4d99408d7` |
| `disputedLevelClaims` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The source-access sweep rejected duplicate or unproven lineage substitutions.
Open Anki and other Waller derivatives are Tanos-lineage data. Wiktionary is
permissioned but does not establish an independent origin for its JLPT appendix.
Tomoshi labels its table as community estimates without establishing their
placement lineage. None may be relabelled as independent corroboration. The
official JLPT does not publish a complete post-2010 vocabulary specification.

The highest-quality external opportunity is a Japanese-published, level-specific
learner vocabulary series such as the 3A materials, but catalogue availability
does not grant bulk storage or derivative-list permission. Access therefore
requires explicit repository-owner authority for the acquisition method and a
completed licence/source-access review. Do not spend money, create an account,
accept new terms, contact a publisher, scrape, bulk-copy, infer levels from
frequency, or relabel the operational contract to advance this queue. When a
permitted exact surface becomes available, import only its exact covered rows
and leave strict evidence depth failing until the complete denominator actually
meets every configured requirement.
