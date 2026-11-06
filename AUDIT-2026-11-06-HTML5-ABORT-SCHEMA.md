# Rector TOC — HTML5, cancellation and schema audit (2026-11-06)

Repository: [Shelamkoff/rector-toc-plugin](https://github.com/Shelamkoff/rector-toc-plugin)
Checked against: Rector v2 branch `refactor/rector-v2-architecture`
Pre-audit TOC HEAD: `5c2b1c946491503848cf1735fc22a762b2389251`
Code checkpoint after repairs: `ce327794da2c8a38910fa44418a0cc64ea3e3053`

## Method

Used Rector's checked-in `modern-javascript-patterns` and `tdd` guidance: public behavioral test, confirm failing CI (red), minimal implementation fix, run focused tests and full Node + Chromium + packed-consumer jobs (green). Original failures were preserved in audit-branch histories, rather than weakening the test or suppressing real functionality.

## Confirmed defects

| Behavior | Red reproduction | Passing repair |
| --- | --- | --- |
| HTML5 entity names such as `&eacute;` and `&notin;` were displayed literally, and numeric C1 references were not interpreted per HTML5; inline token labels still need exactly-once decoding. | [8c29c88](https://github.com/Shelamkoff/rector-toc-plugin/commit/8c29c8899a6aa51b81867631a7a334d0b35d481b), failing [CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42222112282) | [ab81791](https://github.com/Shelamkoff/rector-toc-plugin/commit/ab81791de81f7bd94ea71cc9514e0c946844dced), passing [CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42222421951) |
| If the block's `AbortSignal` was aborted synchronously inside `source.subscribe()`, the unsubscribe listener was added too late. A later `destroy()` could also call the unsubscribe function twice. | [abd1624](https://github.com/Shelamkoff/rector-toc-plugin/commit/abd16248cebec4abed61825936aea7cca0288c16), failing [CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42222733292) | [2111e60](https://github.com/Shelamkoff/rector-toc-plugin/commit/2111e60cc21f869804426bd890a7170690221cba), passing [CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42222888742) |
| Explicit `null` in the versioned TOC schema was silently treated as a missing setting, instead of rejected. | [829ecd3](https://github.com/Shelamkoff/rector-toc-plugin/commit/829ecd36c00fe64398a075d1e4915b8de1f53515), failing [CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42223369933) | [ce32779](https://github.com/Shelamkoff/rector-toc-plugin/commit/ce327794da2c8a38910fa44418a0cc64ea3e3053), passing [CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42223477371) |

## Complete verification for the code checkpoint

The final source checkpoint completed four of four GitHub Actions jobs successfully:

- Node.js 20, 22, and 24: **26/26** unit tests each, zero failures.
- Chromium with real Rector v2 source: **40/40** browser assertions, including HTML5 entity decoding.
- TypeScript declarations checked against the actual Rector v2 public type contracts.
- **Clean npm consumer**: packed Rector and TOC tarballs installed together; JS exports, CSS export, TypeScript contracts passed.
- TOC source has no second document store or history authority; no changes to the Rector v2 core.

Reference: [full source checkpoint CI](https://github.com/Shelamkoff/rector-toc-plugin/actions/runs/42223477371).

## Remaining scope and risks

This report does **not** assert completed Firefox/Safari/WebKit native checks, screen-reader certification, large-document memory and performance benchmarking, or publication to npm. Untrusted callback behavior is constrained by the public extension contract; app/provider-specific network, authorization, and transport behavior is external. The newly added `entities@8.1.0` runtime dependency is pinned and supports the Node 20 minimum used by the project's CI. It adds a dependency compared with the previous standalone implementation, in exchange for full HTML5 entity correctness.

## Release decision

The three reproduced defects are closed, including regression tests and complete supported Chromium/Node verification. No unresolved *confirmed* release blocker was found in the executed test scope. Full cross-browser release acceptance and external npm publication remain separate activities.
