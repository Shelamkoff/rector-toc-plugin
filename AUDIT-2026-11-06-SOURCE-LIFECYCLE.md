# TOC v2 audit continuation — source lifecycle and reentrant notifications

Date: 2026-11-06  
Repository: \`Shelamkoff/rector-toc-plugin\`  
Production checkpoint before this report: \`4a40c7704cf06c1440402ad50874ad42ef440d27\`

## Audit approach

Reviewed the source/observer contract, registration rollback, teardown, callback reentry, renderer consistency, and existing Rector v2 browser integration. Applied \`modern-javascript-patterns\` and \`tdd\` from Rector's \`.agents/skills\`: test public behavior first, confirm the failure, implement the smallest repair, and run the full existing matrix.

## Confirmed issues and Red → Green results

| Issue | Reproducing test commit | Fixed commit | Validation |
|---|---|---|---|
| Destroying a source during the initial \`bindEditor()\` notification left two editor subscriptions on a dead source; another \`bindEditor()\` could also enter during that setup | [dde7561](https://github.com/Shelamkoff/rector-toc-plugin/commit/dde7561f5e3bee09f9982390c79ab2e35f637084) — failing CI | [80dde91](https://github.com/Shelamkoff/rector-toc-plugin/commit/80dde91547c4d5c05178bd4994b6546d850d946c) — [passing CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42214979121) | Claim binding before application callbacks, revoke and clean up if editor/source retires |
| When one consumer-provided unsubscriber threw, remaining cleanup was skipped and the source remained live; teardown could also rebind a new editor | [2b083b1](https://github.com/Shelamkoff/rector-toc-plugin/commit/2b083b1a6cec6121ab2055c406007084bc1b907e) — failing CI | [3f5ae3c](https://github.com/Shelamkoff/rector-toc-plugin/commit/3f5ae3c26e347bf24c3f75e5285b0dda3d080b4f) — [passing CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42215449465) | Revoke source before calling app code, attempt both independent unsubscribers, report errors via \`onError\` |
| A callback calling \`setDocument()\` recursively made later observers receive the same newer heading state twice, causing duplicated rendering | [2d90f77](https://github.com/Shelamkoff/rector-toc-plugin/commit/2d90f777af8919b7bdea262407eb9a16529f89b3) — failing CI | [4a40c77](https://github.com/Shelamkoff/rector-toc-plugin/commit/4a40c7704cf06c1440402ad50874ad42ef440d27) — [passing CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42215910766) | Suppress superseded broadcasts; deliver current immutable snapshot at most once per notification pass |

## Verification on 4a40c77

- Node.js **20, 22, 24**: 21/21 unit tests per runtime, no failures.
- Chromium + actual Rector v2: **35/35** browser integration assertions.
- Rector v2 TypeScript declaration compile: passed.
- \`npm pack --dry-run\`: passed.
- GitHub Actions: **four of four** jobs successful in run [42215910766](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42215910766).
- The three *test-only* red commits were deliberately left as reproducible historical evidence on their audit branches. No tests were weakened to achieve green.

## Boundaries and remaining risks

The passing result establishes compatibility within the exercised Chromium/runtime and source-event scenarios. It does **not** claim Firefox/WebKit behavior, screen-reader certification, a packed-package install in a clean downstream consumer, full HTML5 named-entity decoding, or large-document benchmark thresholds. No changes to Rector's core, canonical document version, or shared transaction/history model were needed.

The full older audit and its previous three fixes remain documented in [AUDIT-2026-11-06.md](./AUDIT-2026-11-06.md).
