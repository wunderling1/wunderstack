# Baseline re-record required — corpus v5

`GOLDEN_CORPUS_VERSION` is now **5** (base refusal fixtures expanded 3 → 10).

The committed [`baseline.json`](./baseline.json) still describes corpus **v4**. Absolute G2 floors still run; **relative regression checks and the fixture-hash guard skip** until a green run is re-recorded:

```sh
EVAL_WRITE_BASELINE=1 EVAL_JUDGE_SAMPLES=3 EVAL_GENERATION_SAMPLES=3 \
  pnpm --filter @wunderstack/agents test
```

Then inspect the written baseline, commit it with the measured values in the message (existing discipline — never auto-commit from CI).

Do **not** manually bump `corpusVersion` in `baseline.json` without a fresh measurement: that would re-enable the hash guard against a stale hash.
