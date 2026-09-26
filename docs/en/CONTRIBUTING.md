# Contributing

[简体中文](../zh-CN/CONTRIBUTING.md)

New formats, fixes, clearer guides and platform adapters are welcome. You can also help without writing code: tell us which setup step confused you or how to reproduce a play problem. Include your system, version, steps and relevant error.

Game features live in `examples/whitebridge/`; guides and setup tools live in `docs/` and `scripts/`. The following checks apply when submitting code changes.

Run `npm ci`, `npm test` and `npm run docs:check`, then reproduce the relevant local experience. Explain the observable change, synthetic inputs, verification and remaining limitations. Do not include real viewer data or credentials.

Preserve authority: rendering presents state, the server owns damage/ownership/receipts, and models return bounded validated actions. New platform adapters need duplicate-event, wrong-room and reconnection tests; personal browser data is not a substitute for authorization.

Provide authors, sources, licenses and modification notes for new assets. Observe visual changes in the actual game. Review new public files before updating the allowlist with `python3 scripts/release.py manifest`, then scan and package.

For translations, follow [language status](../LANGUAGES.md). Keep capability limitations, commands and safety boundaries aligned. A translated guide does not mean the game UI or a regional platform has been implemented. Do not mark a language complete after translating only the landing page.

Explain the changed behavior and how to try it in the Pull Request. For visual changes, a short clip using test identities helps reviewers understand the result.
