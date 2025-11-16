# Chunking Strategy

This document summarizes the Markdown chunking pipeline implemented in `chunking.rs`. The flow runs in four stages to balance semantic fidelity with embedding-friendly chunk sizes.

## 1. Major-heading split (`split_major_sections`)
- We parse the Markdown with `pulldown_cmark` and cut sections at `H1`–`H3` headings, thematic breaks, and block boundaries (tables, fenced code blocks, etc.).
- Tables and fenced code blocks are treated as “atomic blocks,” so accidental separators inside them do not slice the section.
- Tables are normalized row by row (e.g., `Header: value | …`) so that structured data becomes readable sentences before embedding.

## 2. Token-ceiling split (`split_section_by_tokens`)
- Each section is checked against `MAX_TOKENS_PER_CHUNK_V2` (512 tokens). Oversized sections are greedily built from paragraph units while staying under the ceiling.
- Blocks detected as code or tables skip paragraph-level splitting so they remain intact unless they still exceed the token budget.
- If a paragraph or atomic block alone is larger than the ceiling, `split_text_strict_by_tokens` falls back to token-level slicing to ensure no chunk exceeds the cap.

## 3. Minimum-token enforcement (`enforce_min_chunk_tokens`)
- After chunking, we enforce `MIN_TOKENS_PER_CHUNK_V2` (64 tokens). Any chunk below the floor is merged with its previous neighbor first; if that is insufficient, we retry with the next neighbor.
- The logic allows up to two consecutive merges per short chunk (e.g., previous then next) so that tiny sections are fully absorbed when possible.
- Edge chunks that only have a single neighbor merge in the available direction; repeated attempts continue until the floor is met or only one chunk remains.
- Chunks are concatenated with `"\n\n"` so paragraph boundaries remain visually clear after merging.

## 4. Token accounting
- All length checks rely on the `tiktoken` `cl100k_base` tokenizer, matching the embedding model’s tokenization closely so chunk limits reflect real context windows.

By combining structural parsing, token-aware splitting, and post-merge safeguards, this strategy keeps the document’s logical layout while reducing both overly long and overly short chunks before embedding.
