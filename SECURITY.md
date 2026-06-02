# Security Policy

## Supported Scope

Security reports are in scope when they affect repository code, scripts, generated Anki card content, local HTTP routes, media import, source normalization, packaging, dependency use, or release artifacts.

This project is a local deck-build tool, not a hosted public service. The main branch is the supported security baseline.

## Threat Model

- The Express server is a local development surface. It has no authentication layer and is not designed for internet or untrusted LAN exposure.
- `SERVER_HOST` defaults to `127.0.0.1`. Set `SERVER_HOST=0.0.0.0` only for a deliberate, temporary, trusted-network workflow.
- The governed VOICEVOX Docker helper should bind host `127.0.0.1:50021` to container port `50121` and run with explicit runtime hardening: `no-new-privileges`, `cap-drop ALL` with only `SETUID` and `SETGID` restored for the image entrypoint's `gosu` user switch, `--restart no`, Docker `--init`, and bounded memory, CPU, and process counts. Broad host-port publishing or missing hardening is treated as stale container shape.
- Files under ignored workspace directories such as `data/`, `downloads/`, and `out/` are local inputs or generated outputs. Treat externally sourced dictionaries, sentence corpora, media, and audio as untrusted until their import path, parser behavior, provenance, and generated surfaces have been reviewed.
- Anki note fields render HTML. Exporters must escape text from external or semi-trusted sources and preserve only the known exporter-owned markup needed for ruby, pitch contours, audio, and stroke-order media.
- Do not commit `.env`, local datasets, generated media, model bundles, credentials, or private source files.
- Run `npm run security:secrets` before committing changes that add credentials-adjacent configuration, scripts, fixtures, docs, or workflow content. This tracked-file scanner catches high-confidence token and private-key patterns; it complements GitHub secret scanning and push protection, which should be enabled in repository settings.
- Run `npm run security:licenses` before committing dependency, lockfile, release-bundle, or supply-chain workflow changes so dependency license expressions stay allowlisted or covered by current reviewed exceptions. Tagged release bundles write the dependency-license summary with `npm run security:licenses:write`.
- Run `npm run security:sbom` before committing dependency, lockfile, release-bundle, or supply-chain workflow changes so the lockfile-derived CycloneDX SBOM remains valid. Tagged release bundles write the SBOM with `npm run security:sbom:write`.
- Treat CodeQL alerts from the protected JavaScript/TypeScript and GitHub Actions analysis checks as release blockers until triaged, fixed, or explicitly accepted with documented rationale.
- Treat missing or unverifiable release-bundle provenance or SBOM attestations as release blockers for tagged artifacts.

## Reporting A Vulnerability

Do not post exploit details, private data, or proof-of-concept payloads in a public issue.

Preferred channels:

1. Use GitHub private vulnerability reporting for this repository if it is enabled.
2. If private reporting is unavailable, contact the repository owner through an already trusted private channel.
3. If no private channel exists, open a minimal public issue asking for a private security contact. Do not include exploit details in that issue.

Useful reports include:

- affected command, route, script, or generated artifact
- exact reproduction steps
- expected and actual behavior
- impact and whether the issue needs local files, network access, or a generated Anki import
- relevant environment details such as OS, Node version, Docker status, and whether local data overlays were used

## Maintainer Handling

Security fixes should be verified from live repository evidence, kept focused, documented when behavior changes, and covered by regression tests where practical. Standard validation is:

```bash
git diff --check
npm run lint
npm run typecheck
npm run security:licenses
npm run security:requirements
npm run security:sdlc-metrics
npm run security:secrets
npm run security:sbom
npm test
```

Run additional deck, media, source, release, or NLP governance gates when the affected area requires them.
