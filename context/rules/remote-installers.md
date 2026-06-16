# Remote installer safety

When documenting or executing third-party remote shell installers (`curl ... | bash`, `wget ... | sh`, `bash <(curl ...)`), keep the direct upstream one-liner available when it is the vendor's documented path, but pair it with a review-first alternative nearby.

Acceptable alternatives:

- Download the installer to a file, review it in an editor or pager, then run `bash <file>`.
- Use an optional inspection wrapper such as [`vet`](https://github.com/vet-run/vet) when the operator already has it.

Do not make `vet` a required Open Harness dependency. The default Open Harness host requirement remains Docker (plus git for manual clone/install paths).
