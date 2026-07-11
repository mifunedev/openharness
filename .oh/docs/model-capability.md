# Gauging coding-model capability

When a new coding model is released, Open Harness currently uses the public
[DeepSWE leaderboard](https://deepswe.datacurve.ai/) as its external reference
for an initial capability comparison. DeepSWE measures frontier coding agents on
original, long-horizon software engineering tasks. Its leaderboard also exposes
operational context such as cost, output tokens, and agent steps; its public
[source and data](https://github.com/datacurve-ai/deep-swe) and the site's **Run
DeepSWE** flow make the benchmark inspectable and reproducible outside Open
Harness.

DeepSWE is an independent DataCurve project. Open Harness does not own or operate
it, and a leaderboard position is not, by itself, a release gate or sufficient
reason to change a default model. Results are a point-in-time external signal:
the task set, submissions, models, and rankings can change.

For a model-default decision, combine the current DeepSWE signal with:

- provider and region availability;
- cost and observed latency;
- tool-calling and coding-harness compatibility; and
- harness-specific evaluation on the workflows the model will actually run.

## Keep the evaluation layers separate

DeepSWE answers an external question: how do released coding agents compare on
its long-horizon software engineering workload? It complements, but does not
replace, either repository-local instrument:

- [The deterministic `/eval` probes](../evals/README.md) are the regression
  **floor** for known Open Harness invariants.
- [The local capability benchmark](../evals/capability/README.md) is the
  progress **ceiling** for what this harness can deliver end to end.

Use all three as evidence for their stated scopes. Do not interpret an external
leaderboard result as proof that Open Harness remains regression-free or that a
model performs best under local tools, prompts, budgets, and workflows.
