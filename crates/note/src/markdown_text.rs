use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use serde_yaml::Value;

const BOM: char = '\u{FEFF}';
const ZERO_WIDTH_SPACE: char = '\u{200B}';

pub fn format_preview_text(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }

    let cleaned = strip_hidden_chars(raw);
    let cleaned = strip_frontmatter(&cleaned);
    let cleaned = strip_html_block_lines(&cleaned);
    let cleaned = strip_markdown_tables(&cleaned);
    if cleaned.trim().is_empty() {
        return String::new();
    }

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(&cleaned, options);
    let mut output = String::new();
    let mut skip_depth = 0usize;
    let mut list_stack: Vec<ListState> = Vec::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::CodeBlock(_) | Tag::BlockQuote(_) => {
                    skip_depth = skip_depth.saturating_add(1);
                }
                Tag::Table(_) => {
                    skip_depth = skip_depth.saturating_add(1);
                }
                Tag::Image { .. } => {
                    skip_depth = skip_depth.saturating_add(1);
                }
                Tag::List(start) => {
                    let ordered = start.is_some();
                    let next_index = start.unwrap_or(1);
                    list_stack.push(ListState {
                        ordered,
                        next_index,
                    });
                }
                Tag::Item => {
                    if skip_depth == 0 {
                        if let Some(list_state) = list_stack.last_mut() {
                            if list_state.ordered {
                                ensure_space(&mut output);
                                output.push_str(&format!("{}.", list_state.next_index));
                                output.push(' ');
                                list_state.next_index += 1;
                            }
                        }
                    }
                }
                _ => {}
            },
            Event::End(tag_end) => match tag_end {
                TagEnd::CodeBlock | TagEnd::BlockQuote(_) | TagEnd::Table | TagEnd::Image => {
                    if skip_depth > 0 {
                        skip_depth -= 1;
                    }
                }
                TagEnd::List(_) => {
                    list_stack.pop();
                }
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::Item => {
                    if skip_depth == 0 {
                        ensure_space(&mut output);
                    }
                }
                _ => {}
            },
            Event::Text(text) | Event::Code(text) => {
                if skip_depth == 0 {
                    output.push_str(&text);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if skip_depth == 0 {
                    ensure_space(&mut output);
                }
            }
            Event::Html(_) | Event::InlineHtml(_) => {}
            Event::InlineMath(_) | Event::DisplayMath(_) => {}
            Event::FootnoteReference(_) => {}
            Event::Rule => {}
            Event::TaskListMarker(_) => {}
        }
    }

    let collapsed = collapse_whitespace(&output);
    strip_reference_links(&collapsed)
}

pub fn format_indexing_text(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }

    let cleaned = strip_hidden_chars(raw);
    let (frontmatter, body) = split_frontmatter(&cleaned);
    let mut parts = Vec::new();

    if let Some(frontmatter) = frontmatter {
        let values = extract_frontmatter_values(frontmatter);
        if !values.is_empty() {
            parts.push(values.join("\n"));
        }
    }

    let body = body.trim();
    if !body.is_empty() {
        parts.push(body.to_string());
    }

    parts.join("\n\n")
}

fn strip_hidden_chars(raw: &str) -> String {
    raw.chars()
        .filter(|ch| *ch != BOM && *ch != ZERO_WIDTH_SPACE)
        .collect()
}

fn strip_html_block_lines(raw: &str) -> String {
    raw.lines()
        .filter(|line| !line.trim_start().starts_with('<'))
        .collect::<Vec<_>>()
        .join("\n")
}

fn strip_markdown_tables(raw: &str) -> String {
    let lines: Vec<&str> = raw.lines().collect();
    let mut kept: Vec<&str> = Vec::with_capacity(lines.len());
    let mut i = 0usize;

    while i < lines.len() {
        if i + 1 < lines.len() && is_table_header(lines[i], lines[i + 1]) {
            i += 2;
            while i < lines.len() {
                let line = lines[i];
                if line.trim().is_empty() {
                    kept.push(line);
                    i += 1;
                    break;
                }
                if line.contains('|') {
                    i += 1;
                    continue;
                }
                break;
            }
            continue;
        }

        kept.push(lines[i]);
        i += 1;
    }

    kept.join("\n")
}

fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        return (None, raw);
    }

    let Some(rest_index) = frontmatter_rest_index(trimmed) else {
        return (None, raw);
    };

    let leading_ws_len = raw.len() - trimmed.len();
    let frontmatter_end = leading_ws_len + rest_index;
    let frontmatter = &raw[leading_ws_len..frontmatter_end];
    let body = &raw[frontmatter_end..];

    (Some(frontmatter), body)
}

fn strip_frontmatter(raw: &str) -> String {
    let (_, body) = split_frontmatter(raw);
    body.to_string()
}

fn frontmatter_rest_index(input: &str) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut line_start = 0usize;
    let mut i = 0usize;
    let mut line_no = 0usize;
    let mut has_yaml_hint = false;

    loop {
        if i == bytes.len() || bytes[i] == b'\n' {
            let line = &input[line_start..i];
            let line_trimmed = line.trim_end_matches('\r');
            if line_no == 0 {
                if !is_frontmatter_delimiter(line_trimmed) {
                    return None;
                }
            } else {
                if line_trimmed.contains(':') || line_trimmed.trim_start().starts_with("- ") {
                    has_yaml_hint = true;
                }
                if is_frontmatter_delimiter(line_trimmed) && (has_yaml_hint || line_no == 1) {
                    let rest_start = if i < bytes.len() { i + 1 } else { i };
                    return Some(rest_start);
                }
            }

            line_no += 1;
            if i == bytes.len() {
                break;
            }
            line_start = i + 1;
        }
        i += 1;
    }

    None
}

fn is_frontmatter_delimiter(line: &str) -> bool {
    line.trim() == "---"
}

fn extract_frontmatter_values(frontmatter: &str) -> Vec<String> {
    let payload = frontmatter_payload(frontmatter);
    match serde_yaml::from_str::<Value>(&payload) {
        Ok(value) => {
            let mut scalars = Vec::new();
            collect_yaml_scalar_values(&value, &mut scalars);
            scalars
        }
        Err(_) => Vec::new(),
    }
}

fn frontmatter_payload(frontmatter: &str) -> String {
    let lines: Vec<&str> = frontmatter.lines().collect();
    if lines.len() >= 2 && lines[0].trim() == "---" {
        let last = lines.len() - 1;
        if lines[last].trim() == "---" {
            return lines[1..last].join("\n");
        }
    }

    frontmatter.to_string()
}

fn collect_yaml_scalar_values(value: &Value, output: &mut Vec<String>) {
    match value {
        Value::Null => {}
        Value::Bool(value) => output.push(value.to_string()),
        Value::Number(value) => output.push(value.to_string()),
        Value::String(value) => {
            if !value.trim().is_empty() {
                output.push(value.clone());
            }
        }
        Value::Sequence(items) => {
            for item in items {
                collect_yaml_scalar_values(item, output);
            }
        }
        Value::Mapping(map) => {
            for (_, item) in map {
                collect_yaml_scalar_values(item, output);
            }
        }
        Value::Tagged(tagged) => {
            collect_yaml_scalar_values(&tagged.value, output);
        }
    }
}

fn is_table_header(line: &str, next_line: &str) -> bool {
    line.contains('|') && is_table_separator(next_line)
}

fn is_table_separator(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.contains('|') || !trimmed.contains('-') {
        return false;
    }

    trimmed
        .chars()
        .all(|ch| ch == '|' || ch == '-' || ch == ':' || ch == ' ' || ch == '\t')
}

fn ensure_space(output: &mut String) {
    if output
        .chars()
        .last()
        .map_or(false, |ch| !ch.is_whitespace())
    {
        output.push(' ');
    }
}

fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_reference_links(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut cursor = 0;

    while let Some(open_rel) = input[cursor..].find('[') {
        let open = cursor + open_rel;
        result.push_str(&input[cursor..open]);

        if let Some(close1_rel) = input[open + 1..].find(']') {
            let close1 = open + 1 + close1_rel;
            let next = close1 + 1;
            if input[next..].starts_with('[') {
                if let Some(close2_rel) = input[next + 1..].find(']') {
                    let close2 = next + 1 + close2_rel;
                    result.push_str(&input[open + 1..close1]);
                    cursor = close2 + 1;
                    continue;
                }
            }
        }

        result.push('[');
        cursor = open + 1;
    }

    if cursor < input.len() {
        result.push_str(&input[cursor..]);
    }

    result
}

struct ListState {
    ordered: bool,
    next_index: u64,
}

#[cfg(test)]
mod tests {
    use super::{format_indexing_text, format_preview_text};

    #[test]
    fn strips_heading_hashes_and_appends_next_line_as_body() {
        let raw = "#   Hello World  \nBody text";
        assert_eq!(format_preview_text(raw), "Hello World Body text");
    }

    #[test]
    fn uses_first_meaningful_line_and_appends_following_heading() {
        let raw = "   Plain title with leading spaces   \n# Another heading";
        assert_eq!(
            format_preview_text(raw),
            "Plain title with leading spaces Another heading"
        );
    }

    #[test]
    fn removes_inline_markdown_while_keeping_text() {
        let raw = "**bold** _italic_ ~~strike~~ `code`";
        assert_eq!(format_preview_text(raw), "bold italic strike code");
    }

    #[test]
    fn keeps_inline_emphasis_at_start_instead_of_treating_it_like_a_bullet() {
        let raw = "*italic* text";
        assert_eq!(format_preview_text(raw), "italic text");
    }

    #[test]
    fn keeps_link_text_and_drops_wrappers() {
        let raw = "[Click here](https://example.com) plus [Ref][id]";
        assert_eq!(format_preview_text(raw), "Click here plus Ref");
    }

    #[test]
    fn skips_blocks_and_cleans_inline() {
        let raw = [
            "![img](img.png)",
            "> quoted",
            "```",
            "code line",
            "```",
            "<table>",
            "<tr><td>cell</td></tr>",
            "</table>",
            "| h | h |",
            "| --- | --- |",
            "Final line with [link](https://example.com) and ~~strike~~",
        ]
        .join("\n");

        assert_eq!(format_preview_text(&raw), "Final line with link and strike");
    }

    #[test]
    fn handles_setext_underline_by_keeping_title_line() {
        let raw = ["Title Line", "=====", "Body"].join("\n");
        assert_eq!(format_preview_text(&raw), "Title Line Body");
    }

    #[test]
    fn unescapes_escaped_punctuation_like_numbered_lists() {
        let raw = ["---", "1. abc", "---", "1\\."].join("\n");
        assert_eq!(format_preview_text(&raw), "1. abc 1.");
    }

    #[test]
    fn skips_yaml_frontmatter_at_start() {
        let raw = [
            "---",
            "title: Hello",
            "tags: [one, two]",
            "---",
            "# Heading",
            "Body",
        ]
        .join("\n");
        assert_eq!(format_preview_text(&raw), "Heading Body");
    }

    #[test]
    fn keeps_delimiters_when_frontmatter_is_not_closed() {
        let raw = ["---", "title: Hello", "# Heading"].join("\n");
        assert_eq!(format_preview_text(&raw), "title: Hello Heading");
    }

    #[test]
    fn keeps_frontmatter_like_block_when_not_at_start() {
        let raw = ["# Title", "---", "key: value", "---", "Body"].join("\n");
        assert_eq!(format_preview_text(&raw), "Title key: value Body");
    }

    #[test]
    fn given_frontmatter_values_when_formatting_for_indexing_then_keeps_only_values() {
        let raw = [
            "---",
            "title: Hello World",
            "tags:",
            "  - rust",
            "  - tauri",
            "meta:",
            "  priority: 2",
            "  pinned: true",
            "---",
            "# Body",
            "Some **markdown** text.",
        ]
        .join("\n");

        let indexed = format_indexing_text(&raw);

        assert!(indexed.contains("Hello World"));
        assert!(indexed.contains("rust"));
        assert!(indexed.contains("tauri"));
        assert!(indexed.contains("2"));
        assert!(indexed.contains("true"));
        assert!(!indexed.contains("title:"));
        assert!(!indexed.contains("tags:"));
        assert!(!indexed.contains("priority:"));
        assert!(indexed.contains("# Body"));
        assert!(indexed.contains("Some **markdown** text."));
    }

    #[test]
    fn given_invalid_frontmatter_when_formatting_for_indexing_then_ignores_frontmatter() {
        let raw = ["---", "title: [unterminated", "---", "Body text"].join("\n");

        let indexed = format_indexing_text(&raw);

        assert!(!indexed.contains("title"));
        assert_eq!(indexed, "Body text");
    }

    #[test]
    fn given_no_frontmatter_when_formatting_for_indexing_then_keeps_almost_raw_markdown() {
        let raw = "# Heading\n\n- [x] Task\n`code` and [link](https://example.com)";

        let indexed = format_indexing_text(raw);

        assert_eq!(indexed, raw);
    }
}
