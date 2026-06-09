---
title: "turbovec and TurboQuant for compressed RAG retrieval"
slug: turbovec-turboquant-rag
tags: [vector-search, rag, quantization, ai-infra, local-retrieval]
created: 2026-06-07
updated: 2026-06-07
sources:
  - raw/2026-06-07-turbovec-turboquant-rag.md
  - raw/2026-06-07-turbovec-turboquant-rag-github-readme.md
related: []
confidence: provisional
---

# turbovec and TurboQuant for compressed RAG retrieval

## Summary
turbovec is a Rust vector index with Python bindings built on Google Research's TurboQuant quantization algorithm. The LinkedIn source frames it as a practical local-RAG lever: a 10M-document corpus that would require about 31 GB as float32 can reportedly fit in about 4 GB, while supporting online inserts without a codebook-training or full-rebuild phase.

## Detail
The key claim is that compression is no longer just a storage optimization; it can change the architecture of local and privacy-sensitive retrieval systems. turbovec stores vectors with TurboQuant-style data-oblivious quantization, so new vectors can be added directly rather than waiting for a train step or index rebuild. The project exposes both Python (`TurboQuantIndex`, `IdMapIndex`) and Rust APIs, persistent index files, stable external ids, deletes, and search-time allowlists for hybrid retrieval flows where SQL, BM25, ACL, tenancy, or time-window filters produce the candidate set.

The README's benchmark claims are strong enough to merit a local evaluation before adoption: memory drops from 31 GB float32 to 4 GB for a 10M-document corpus; ARM kernels beat FAISS FastScan by 12–20%; x86 4-bit configs beat FAISS by 1–6%; and recall is close to or better than FAISS `IndexPQ` on OpenAI d=1536/d=3072 embeddings, with weaker behavior on low-dimensional GloVe at 2-bit. Load-bearing evaluation questions are: whether these claims hold on our hardware and embedding distributions, how recall behaves for filtered/hybrid retrieval, whether online inserts avoid operational rebuild costs in practice, and whether the Python integration is mature enough for harness use.

The project is at `https://github.com/RyanCodrai/turbovec`; the LinkedIn post by André Lindenberg links the attention spike to the 31GB→4GB local-RAG story and notes rapid GitHub-star growth. Treat the current entry as provisional until we benchmark against FAISS or the harness's current retrieval baseline.

## See Also
