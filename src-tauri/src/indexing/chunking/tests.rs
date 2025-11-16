use super::{
    count_tokens, enforce_min_chunk_tokens, split_major_sections, split_section_by_tokens,
};

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

const RULE_IN_CODE_BLOCK: &str = r#"# Section

```
---
```

## After
Still content here
"#;

#[test]
fn splits_gfm_sections_with_headings_and_tables() {
    let chunks = split_major_sections(GFM_MARKDOWN);
    let expected = vec![
        "---\ntitle: Sample Doc\ntags:\n  - demo\n---",
        "# Overview\nWelcome to **Mdit**.",
        "## TODOs\n- [ ] Outline pulldown flow\n- [x] Wire chunk tests",
        "# Data",
        "Column: id | Type: number",
        "Column: title | Type: text",
        "```rust\nfn main() {\n    println!(\"hello gfm\");\n}\n```",
    ]
    .into_iter()
    .map(|section| section.to_string())
    .collect::<Vec<_>>();

    assert_eq!(chunks, expected);
}

#[test]
fn code_blocks_split_into_separate_sections_and_ignore_rules() {
    let chunks = split_major_sections(RULE_IN_CODE_BLOCK);
    assert_eq!(chunks.len(), 3);
    assert_eq!(chunks[0], "# Section");
    assert!(
        chunks[1].contains("```"),
        "code block section should contain fenced code block"
    );
    assert!(
        chunks[1].contains("---"),
        "code block section should keep literal dashes inside code block"
    );
    assert_eq!(chunks[2], "## After\nStill content here");
}

#[test]
fn splits_h3_headings_into_sections() {
    let markdown = r#"# Title

Intro

### Details
More data here

### Extra
Closing thoughts
"#;

    let chunks = split_major_sections(markdown);
    assert_eq!(chunks.len(), 3);
    assert_eq!(chunks[0], "# Title\n\nIntro");
    assert_eq!(chunks[1], "### Details\nMore data here");
    assert_eq!(chunks[2], "### Extra\nClosing thoughts");
}

#[test]
fn splits_long_sections_by_paragraph_before_tokens() {
    let section = "alpha beta gamma delta\n\nepsilon zeta eta theta\n\niota kappa lambda mu";
    let chunks = split_section_by_tokens(section, 7);

    assert_eq!(chunks.len(), 3, "paragraph boundaries should be respected");
    assert_eq!(chunks[0], "alpha beta gamma delta");
    assert_eq!(chunks[1], "epsilon zeta eta theta");
    assert_eq!(chunks[2], "iota kappa lambda mu");
}

#[test]
fn falls_back_to_token_split_for_single_large_paragraph() {
    let section = "Rep".repeat(60);
    let chunks = split_section_by_tokens(&section, 10);

    assert!(
        chunks.len() > 1,
        "single oversized paragraph should be token split"
    );
}

#[test]
fn keeps_tables_together_even_with_blank_lines() {
    let section = "| Column | Type |\n| ------ | ---- |\n\n| id | number |\n| title | text |";
    let chunks = split_section_by_tokens(section, 200);

    assert_eq!(chunks.len(), 1, "tables should remain atomic");
    assert!(chunks[0].contains("| Column | Type |"));
    assert!(chunks[0].contains("| title | text |"));
}

#[test]
fn merges_short_chunk_with_both_neighbors_when_needed() {
    let left = "# Intro\nContext that leads the document.";
    let short = "Short note";
    let right = "## Details\nThis paragraph adds enough body to satisfy the minimum requirements.";

    let min_tokens = count_tokens(&format!("{left}\n\n{short}")) + 1;
    let merged = enforce_min_chunk_tokens(
        vec![left.to_string(), short.to_string(), right.to_string()],
        min_tokens,
    );

    assert_eq!(merged.len(), 1, "short chunk should be absorbed by neighbors");
    let combined = &merged[0];
    assert!(combined.contains("Intro"));
    assert!(combined.contains("Short note"));
    assert!(combined.contains("Details"));
}

#[test]
fn merges_short_chunk_forward_when_only_next_neighbors_exist() {
    let first = "Tiny";
    let middle = "Still not enough";
    let tail = "Adding this chunk should push us past the threshold so the first entry can stand.";
    let trailing = "Final chunk that should remain unchanged";

    let min_tokens = count_tokens(&format!("{first}\n\n{middle}")) + 1;
    let merged = enforce_min_chunk_tokens(
        vec![
            first.to_string(),
            middle.to_string(),
            tail.to_string(),
            trailing.to_string(),
        ],
        min_tokens,
    );

    assert_eq!(
        merged.len(),
        2,
        "first three chunks should collapse into a single entry"
    );
    assert!(merged[0].contains(first));
    assert!(merged[0].contains(middle));
    assert!(merged[0].contains(tail));
    assert_eq!(merged[1], trailing);
}

#[test]
fn merges_short_chunk_backward_when_at_tail() {
    let intro = "Opening context that can absorb more text.";
    let middle = "Second chunk that is still too small after one merge.";
    let short = "tiny";

    let min_tokens = count_tokens(&format!("{middle}\n\n{short}")) + 1;
    let merged = enforce_min_chunk_tokens(
        vec![intro.to_string(), middle.to_string(), short.to_string()],
        min_tokens,
    );

    assert_eq!(
        merged.len(),
        1,
        "tail chunk should merge backward twice when needed"
    );
    let combined = &merged[0];
    assert!(combined.contains(intro));
    assert!(combined.contains(middle));
    assert!(combined.contains(short));
}
