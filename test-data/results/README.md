# Evaluation results

`scripts/eval.ts` writes one JSON file per run here: `<ISO timestamp>.json`, or `<timestamp>-dry-run.json` for dry runs.

Each live run records:

- `timestamp`, `baseUrl`, `options`, `datasetSize`
- `results[]`: per case: `id`, `expected`, `actual`, `verdictCorrect`, `scamTypeCorrect`, `responseMs`, `error`, `warnings`, and the event types received
- `metrics`: accuracy, false positives, missed scams, scamType accuracy, latency, and per-category and per-language breakdowns
- `video`: either `{ status: "skipped", reason }` or real video metrics

Rules:

- **Only numbers from a live run against the real app go on Slide 4.**
- Dry-run files contain no metrics.
- As of 2026-11-07 there are **no live results yet**.
