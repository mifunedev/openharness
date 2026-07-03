# Property-Based Testing Convention

## Convention

Property-based tests in this harness follow the `*.property.test.ts` naming convention and live alongside example tests in the same `__tests__/` directory as their source modules.

**File locations:**
- Cron runtime tests: `scripts/__tests__/cron-runtime.property.test.ts`
- Path guard tests: `.pi/extensions/__tests__/path-guard.property.test.ts`
- CLI tests: `.oh/cli/src/__tests__/cli.property.test.ts`

Vitest's include glob covers all property test files via the `*.test.ts` suffix:
```
include: [
  "scripts/__tests__/**/*.test.ts",
  ".pi/**/__tests__/**/*.test.ts",
  "packages/**/__tests__/**/*.test.ts",
]
```

Run all tests (example + property) with `npm test` (or `pnpm test`) from the repo root. The test suite discovers both `*.test.ts` and `*.property.test.ts` files automatically.

## Arbitrary Patterns

Property tests use **arbitraries** to generate random inputs. This harness uses [fast-check](https://fast-check.dev) — a property-based testing library for TypeScript/JavaScript.

**Common arbitraries:**

- `fc.string()` — arbitrary string (any Unicode)
- `fc.array(arb)` — arbitrary array of values from `arb`
- `fc.record({ key: arb, ... })` — arbitrary object with specified keys and value types
- `fc.stringMatching(regex)` — string matching a specific regex pattern (e.g., `fc.stringMatching(/^[a-z]+$/)` for lowercase letters)
- `fc.oneof(arb1, arb2, ...)` — union of multiple arbitraries
- `fc.constant(val)` — always produces the same value

**Constrained arbitraries:**

When testing parsers or structured inputs, constrain arbitraries to prevent structural characters from corrupting the test:

```typescript
// Good: constrained — no colons, newlines, or hash marks
fc.stringMatching(/^[^\n:#]+$/)

// Bad: unconstrained — can inject structural YAML characters
fc.string()
```

**Custom arbitraries:**

Write custom arbitraries when no built-in pattern fits. For example, generating valid cron expressions or DNS-safe paths. Inline them in the test file if they serve only one test; extract to a shared `test/arbitraries/` module only after 3+ test files reuse the same arbitrary.

For detailed reference on all available arbitraries and patterns, see the [fast-check documentation](https://fast-check.dev).

## numRuns

By default, property tests run **100 iterations** (the fast-check standard). Each iteration generates a new random input and asserts the property holds.

**When to tune:**

Leave `numRuns` at 100 unless a real regression slips through default testing. If you find a bug that the default misses, increase `numRuns` for that property test and document the change with a comment explaining why.

Example:
```typescript
// Increased from 100 to 500 — default missed a false-positive on deeply nested paths (regression in PR #XYZ)
fc.assert(fc.property(...), { numRuns: 500 })
```

Tuning is rare in v1. The property tests in this harness assert invariants that already hold in current source code; they exist to prevent future regressions, not to find bugs.

## Decision Tree

When should you write a property test instead of an example test?

**Use a property test if:**
- You want to assert a general invariant that holds for *any* input in a class (e.g., "this function never throws on any string").
- The invariant is hard to express as a small set of examples (e.g., "parsing remains valid when unknown keys are appended").
- You want regression prevention against future refactors that might break the invariant.

**Use an example test if:**
- You have a specific input and a known expected output (e.g., `parseCronFile("...", "test.md")` returns a specific `CronEntry`).
- The test is documenting a narrow edge case or a bug fix.
- You want to pin behavior at a moment in time without generating new inputs.

**In practice:** example tests document the *what*; property tests document the *why* (the invariant). Use both. This harness pairs example tests (existing `*.test.ts` files) with property tests (`*.property.test.ts` files) on the same surfaces.

## Surface Ledger

The following TypeScript surfaces have property tests in v1:

| Surface | Property Name | PR |
|---------|---------------|-----|
| `scripts/cron-runtime.ts` (`parseCronFile`) | never-throw | #355 |
| `scripts/cron-runtime.ts` (`parseCronFile`) | forward-compat (unknown keys) | #355 |
| `scripts/cron-runtime.ts` (`loadCrons`) | ordering-stability | #355 |
| `.pi/extensions/path-guard.ts` (`isSensitivePath`) | no-false-positives | #355 |
| `.oh/cli/src/cli.ts` (`isHelpFlag`, `isVersionFlag`) | determinism + no-throw | #355 |
