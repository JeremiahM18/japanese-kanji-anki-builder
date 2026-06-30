# System Architecture

Japanese Kanji Anki Builder is a governed data pipeline and release-controlled content generation system. Anki cards are the distribution artifact; the architecture is the input normalization, policy enforcement, deterministic generation, lane gating, proof storage, and scoped release process around them.

This document maps how the system turns governed inputs into deck exports, review gates, proof ledgers, and release artifacts. It is a technical orientation, not a certification source. Live commands and tracked contracts own current truth.

## System Identity

```mermaid
flowchart LR
    Inputs["Governed inputs<br/>contracts, curated data, media policy, source evidence"] --> Normalize["Normalization<br/>stable card identities + level scope"]
    Normalize --> Generate["Content generation<br/>deterministic card rows + package inputs"]
    Generate --> Validate["Lower-lane validation<br/>Gold, Sapphire, Platinum"]
    Validate --> Prove["Proof + natural-language certification<br/>Obsidian JSONL, reconciliation, scoped locks"]
    Prove --> Artifacts["Distribution artifacts<br/>TSV/APKG + audit reports"]
```

## Architecture Summary

```mermaid
flowchart LR
    subgraph Inputs["Tracked And Local Inputs"]
        Contracts["JLPT contracts<br/>kanji + word level contracts"]
        Curated["Curated study data<br/>examples + meanings + notes"]
        Source["Source manifests<br/>card-field + taxonomy evidence"]
        Media["Media policy + manifests<br/>audio + stroke order + pitch"]
        NLP["NLP artifacts<br/>support-only packets"]
    end

    subgraph Normalize["Normalization And Policy"]
        Loaders["Dataset loaders"]
        Canon["Canonical identities<br/>kanji or word|reading"]
        Scope["Level + product scoping"]
        Guardrails["Source/media/security guardrails"]
    end

    subgraph Build["Generated Surfaces"]
        KanjiRows["Kanji Silver rows"]
        WordRows["Word Silver rows"]
        TSV["Deterministic TSV exports"]
        APKG["Optional APKG package"]
    end

    subgraph Review["Review Lanes"]
        Gold["Gold regression"]
        Sapphire["Sapphire structural gate"]
        Platinum["Platinum card-surface inspection"]
        Obsidian["Obsidian proof ledger<br/>canonical JSONL"]
    end

    subgraph Release["Release And Audit"]
        Closeout["Closeout orientation"]
        Proof["Proof validation + reconciliation"]
        QA["Release QA evidence"]
        Lock["Scoped release lock"]
    end

    Contracts --> Loaders
    Curated --> Loaders
    Source --> Guardrails
    Media --> Guardrails
    NLP --> Guardrails
    Loaders --> Canon
    Guardrails --> Scope
    Canon --> Scope
    Scope --> KanjiRows
    Scope --> WordRows
    KanjiRows --> TSV
    WordRows --> TSV
    TSV --> APKG
    KanjiRows --> Gold
    WordRows --> Gold
    Gold --> Sapphire
    Sapphire --> Platinum
    Platinum --> Obsidian
    Obsidian --> Proof
    Proof --> Lock
    APKG --> QA
    QA --> Lock
    Gold --> Closeout
    Sapphire --> Closeout
    Platinum --> Closeout
```

## Product Surfaces

```mermaid
flowchart TD
    Product["Japanese Kanji Anki Builder"] --> Kanji["Kanji product"]
    Product --> Word["Word product"]

    Kanji --> KId["Identity: one target kanji"]
    Kanji --> KFields["Fields: primary reading, meaning, broader meanings,<br/>example, notes, audio, stroke-order media"]
    Kanji --> KGates["Gates: deck:review, deck:sapphire,<br/>deck:platinum, deck:kanji:obsidian"]

    Word --> WId["Identity: exact written form + reading"]
    Word --> WFields["Fields: meaning, example, reading breakdown,<br/>pitch accent, word audio, support labels"]
    Word --> WGates["Gates: deck:words:review, deck:words:sapphire,<br/>deck:words:platinum, deck:words:obsidian"]
```

Kanji and word products can share source material, generated media, and infrastructure. They do not share certification authority. Each card identity must pass its own lane sequence.

## Lane Model

```mermaid
flowchart LR
    Candidate["Candidate / source rows<br/>pre-trust inputs"] --> Silver["Silver<br/>generated surface exists"]
    Silver --> Gold["Gold<br/>regression fixture protects output"]
    Gold --> Sapphire["Sapphire<br/>structural certification"]
    Sapphire --> Platinum["Platinum<br/>card-surface inspection"]
    Platinum --> Obsidian["Obsidian<br/>explicit proof-ledger certification"]

    NLP["NLP support"] -. assists .-> Silver
    NLP -. assists .-> Sapphire
    NLP -. assists .-> Platinum
    NLP -. assists .-> Obsidian

    Ready["Deck/APKG readiness"] -. mechanical artifact state .-> Silver
    Ready -. does not certify .-> Gold
    Ready -. does not certify .-> Obsidian
```

Rules:

- Every forward lane consumes the lane below it as a precondition.
- A missing downstream lane is expected backlog, not proof that the generated card is bad.
- NLP support can surface risks, prioritize review, and generate packets; it cannot certify cards or write tracked templates.
- Package readiness proves artifact mechanics, not content trust.

## Scale Snapshot

The architecture is product- and level-agnostic. The current repo snapshot proves the same machinery across completed release scope and unfinished visible backlog:

| Product surface | Generated denominator | Obsidian-certified denominator | Boundary |
| --- | ---: | ---: | --- |
| Core kanji | 2212 | 982 | The scoped release lock covers the completed N5-N2 denominator. Remaining generated rows are not Obsidian-certified. |
| Words | 2506 | 1008 | The scoped release lock covers the 308-row N5 and 700-row N4 Obsidian-certified subsets. Current N5 Gold-only rows and N4 word v2 Silver additions are generated-ready but not Obsidian-certified. |

Obsidian counts for completed scopes are verified by fail-closed certification gates:

- Kanji locked scope: `982/982` Obsidian certified.
- Word locked scope: `1008/1308` Obsidian certified for current N5/N4 generated rows; the 281 current N5 Gold rows and 19 current N4 word v2 Silver additions are not Obsidian-certified.
- Proof ledger validation: `1990` events across 6 JSONL files.

## Expansion Workflow Pattern

This pattern applies to whichever product, level, and lane is deliberately selected. The architecture does not make that selection for the reviewer.

```mermaid
flowchart TD
    Audit["Gap or quality audit<br/>find uncovered, stale, or incomplete identities"] --> Plan["Ranked work queue<br/>fast paths, research paths, blockers"]
    Plan --> Evidence["Tracked source or curation update<br/>no generated-only trust"]
    Evidence --> Normalize["Normalize identity<br/>kanji or word|reading"]
    Normalize --> Generate["Generate current card surface"]
    Generate --> Gate["Run the selected lane gate"]
    Gate --> Record["Record pass, defer, block, or fix decision"]
    Record --> Boundary["Stop at the selected lane boundary"]
```

The same pattern handles expansion, structural review, card-surface inspection, and proof work, but the lane authority changes. Silver can add generated rows. Gold can protect regression expectations. Sapphire can certify structure. Platinum can inspect the card surface. Obsidian can record proof only after the required upstream lanes exist for the exact card identity.

## Proof And Query Storage

```mermaid
flowchart LR
    Ledger["Tracked canonical JSONL<br/>templates/obsidian_proof_ledger/*.jsonl"] --> Validate["data:obsidian:proof:validate"]
    Ledger --> Reconcile["data:obsidian:proof:reconcile"]
    Ledger --> Provider["Proof provider"]
    Ledger --> SQLite["Generated SQLite mirror<br/>out/obsidian-proof/sqlite"]
    Provider --> Status["Obsidian status/certification commands"]
    SQLite --> Query["Local query/reporting only"]
```

The JSONL proof ledger is canonical. SQLite is useful for local inspection and reporting, but it is generated output and must not become source truth without a deliberate migration.

## Validation Layers

| Layer | Examples | Authority boundary |
| --- | --- | --- |
| Dataset normalization | `src/datasets/*`, starter data, level contracts | Produces normalized inputs; does not certify review lanes. |
| Generated deck checks | `deck:ready`, `deck:words:completion`, TSV/APKG package checks | Proves generated artifact mechanics and field presence. |
| Review gates | `deck:review:*`, `deck:sapphire:*`, `deck:platinum:*` | Proves only the named lane for the exact card identity. |
| Proof ledger | `data:obsidian:proof:validate`, `data:obsidian:proof:reconcile` | Proves proof structure and binding, not package QA or source taxonomy completion. |
| NLP governance | `nlp:governance-gate` | Proves assistive artifacts are healthy; does not certify cards. |
| Release lock | `docs/releases/v0.2.0-scoped-obsidian-lock.md` | Freezes one scoped release state; future work belongs to the next version. |

## Verification Commands

Use these commands to refresh this architecture snapshot:

```bash
git status --short --branch
git log -1 --oneline --decorate
git ls-remote --heads origin
npm run deck:closeout -- --levels=5,4,3,2,1
npm run deck:kanji:obsidian:certify-status -- --levels=5,4,3,2
npm run deck:words:obsidian:certify-status -- --levels=5,4
npm run data:obsidian:proof:validate
npm run nlp:governance-gate
```

If any command changes a count or status, update this document from the live output or remove the stale claim.
