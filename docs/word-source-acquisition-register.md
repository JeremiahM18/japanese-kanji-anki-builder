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
| JMdict | Active, approved under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html) | Dictionary, reading, and meaning verification after exact reviewed attribution | Not a JLPT-placement vote; the word-source evidence registry does not currently authorize stored assignments |
| JMdict priority | Active, approved under the EDRDG licence | Positive commonness support only when an exact reviewed priority fact is present | Absence of priority is not positive evidence; not a placement vote; stored assignments are not currently authorized |
| TubeLex | Active, approved under its [repository licence](https://github.com/naist-nlp/tubelex/blob/main/LICENSE) | Positive frequency/commonness support for an exact reviewed match | Corpus frequency is not JLPT placement, dictionary identity, or card approval; stored assignments are not currently authorized |
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

## Governed Import Requirements

Before any new source assignment is written:

1. Register the exact source, family, lineage, status, licence evidence, allowed
   and prohibited uses, and storage permission.
2. Complete an exact source-access packet; marketing pages, grammar/can-do
   summaries, example-only pages, and vague vocabulary claims are not evidence.
3. Create and pin an ignored review worksheet. Every reviewed row requires an
   exact `written|reading`, citation, and evidence reference.
4. Use a JLPT level only for placement evidence. A support-only input must set
   `requireLevel=false` and declare an explicit `defaultSupportClaims` value.
   `commonness` may be asserted only for rows carrying a positive priority or
   frequency fact.
5. Run strict preflight, dry-run merge, write the worksheet only through the
   governed merge command, dry-run import, then use the transactional import
   write. The assignment file and evidence manifest commit atomically and are
   reloaded for post-write reconciliation.
6. Rerun the selected-level audit and reconcile every bucket. Never promote
   dictionary, commonness, or learner-fit support into an independent placement
   vote.

## Remaining N4 Queue And Resume Gate

No new source evidence was added in the 2026-08-23 investigation. The exact
remaining selected-contract queue is:

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
