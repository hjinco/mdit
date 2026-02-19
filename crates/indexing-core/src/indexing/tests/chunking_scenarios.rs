use super::super::chunking::{chunk_document, hash_content};

const GFM_MARKDOWN: &str = r#"---
title: Sample Doc
tags:
  - demo
---

# Overview
Welcome to **Mdit**.

## TODOs
- [ ] Outline pulldown flow
- [x] Wire chunk tests

---

# Data
| Column | Type |
| ------ | ---- |
| id | number |
| title | text |

```rust
fn main() {
    println!("hello gfm");
}
```
"#;

#[test]
fn given_unknown_chunking_version_when_chunking_then_falls_back_to_v1() {
    let content = "# Title\n\nBody";
    assert_eq!(chunk_document(content, 1), chunk_document(content, 99));
}

#[test]
fn given_rich_markdown_when_chunking_then_content_is_preserved_without_empty_chunks() {
    let chunks = chunk_document(GFM_MARKDOWN, 1);

    assert!(!chunks.is_empty());
    assert!(chunks.iter().all(|chunk| !chunk.trim().is_empty()));

    let merged = chunks.join("\n\n");
    assert!(merged.contains("# Overview"));
    assert!(merged.contains("| id | number |"));
    assert!(merged.contains("println!(\"hello gfm\");"));
}

#[test]
fn given_oversized_input_when_chunking_then_multiple_chunks_are_created() {
    let content = "repeat token ".repeat(1200);
    let chunks = chunk_document(&content, 1);

    assert!(
        chunks.len() > 1,
        "oversized input should be split into multiple chunks"
    );
}

#[test]
fn given_identical_and_different_inputs_when_hashing_then_hash_is_stable() {
    let left = "same content";
    let right = "different content";

    assert_eq!(hash_content(left), hash_content(left));
    assert_ne!(hash_content(left), hash_content(right));
}
