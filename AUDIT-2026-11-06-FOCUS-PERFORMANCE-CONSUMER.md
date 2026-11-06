# Rector TOC — follow-up audit: focus, malformed HTML and package consumer

Date: 2026-11-06
Repository: `Shelamkoff/rector-toc-plugin`
Production checkpoint: `8be4a3e0c58ef995ef836733d59f3fc9cc7f8081`

## Approach

Used the Rector repository's checked-in `modern-javascript-patterns` and `tdd` guidelines. Changes were checked at observable API and Chromium boundaries. Two new defects were reproduced on test-only commits before implementing fixes. Each fix was validated with the ordinary Node test matrix and a real Rector v2 Chromium integration run.

## Reproduced failures and repairs

| Issue | Red reproduction | Green repair |
|---|---|---|
| Editing an existing heading while its TOC link had keyboard focus removed the active link, dropping focus to the page. | [03c512b](https://github.com/Shelamkoff/rector-toc-plugin/commit/03c512b007e0b589d4f744466a4162715ee75a88), [failing Chromium](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42217172126) | [5b4ea17](https://github.com/Shelamkoff/rector-toc-plugin/commit/5b4ea173f0b0005b109ceac353f175578538d622), [green CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42217439958). Focus is preserved by stable block ID, with a nav fallback when the heading disappears. |
| Thousands of unterminated `<!--` sequences performed repeated end-of-suffix scans, causing quadratic processing. | [b038c9f](https://github.com/Shelamkoff/rector-toc-plugin/commit/b038c9ffd29e2c6bd08d1996523671d3107546a8), [failing Node tests](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42217672851) | [fd7e274](https://github.com/Shelamkoff/rector-toc-plugin/commit/fd7e27484e3407f88212e566715f7616300b0aae), [green CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42217768857). A failed terminator search is remembered for the remainder of the input; malformed text output is preserved. |

## Additional release verification

- [22e866d](https://github.com/Shelamkoff/rector-toc-plugin/commit/22e866d070f5a5b1a4a115118f5b057cfc3f592a) adds a clean packed-consumer test. It builds/packs the exact checked-out Rector v2 dependency and TOC, installs both tarballs into an isolated consumer directory, imports public JavaScript entries, checks CSS export resolution, and type-checks the installed declarations. The [first successful run](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42218574661) proves those artifacts can be consumed together.
- [8be4a3e](https://github.com/Shelamkoff/rector-toc-plugin/commit/8be4a3e0c58ef995ef836733d59f3fc9cc7f8081) adds a real Chromium regression for focus after deletion of the referenced heading (navigation container fallback).
- The [final source checkpoint CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42218786173) passes **four of four jobs**: Node 20, Node 22, Node 24 and the Rector integration/packed-consumer job.
- Observed exact counts on this checkpoint: **22/22 Node tests per runtime**, **39/39 Chromium assertions**, Rector v2 declaration check, packed-consumer JavaScript/CSS/type checks.

## Remaining exclusions

- Firefox/WebKit native editing and keyboard behavior have not been independently executed.
- Screen-reader behavior has not received a dedicated accessibility audit.
- Huge-document latency/allocation and memory retention measurements have not been benchmarked.
- HTML5 named-character-reference coverage remains partial in the pure `htmlToText` helper; numeric entities and explicitly mapped common names are covered.
- Publishing the package to the npm registry has not been done.

The confirmed fixes do not modify Rector core, change the v2 document envelope, add another history/selection engine, or remove working features.
