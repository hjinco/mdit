use serde_json::{Map, Value as JsonValue};
use serde_yaml::Value as YamlValue;
use std::fs;
use std::path::Path;

fn extract_frontmatter(source: &str) -> Option<String> {
    let trimmed = source
        .trim_start_matches(['\u{FEFF}', '\u{200B}'])
        .trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }

    let mut lines = trimmed.lines();
    let first = lines.next()?;
    if !is_frontmatter_delimiter(first) {
        return None;
    }

    let mut yaml_lines: Vec<&str> = Vec::new();
    for line in lines {
        if is_frontmatter_delimiter(line) {
            return Some(yaml_lines.join("\n"));
        }
        yaml_lines.push(line);
    }

    None
}

fn is_frontmatter_delimiter(line: &str) -> bool {
    line.trim() == "---"
}

fn yaml_to_json(value: YamlValue) -> JsonValue {
    match value {
        YamlValue::Null => JsonValue::Null,
        YamlValue::Bool(v) => JsonValue::Bool(v),
        YamlValue::Number(num) => yaml_number_to_json(num),
        YamlValue::String(v) => JsonValue::String(v),
        YamlValue::Sequence(items) => {
            JsonValue::Array(items.into_iter().map(yaml_to_json).collect())
        }
        YamlValue::Mapping(map) => {
            let mut object = Map::new();
            for (key, val) in map {
                let key_string = yaml_key_to_string(key);
                object.insert(key_string, yaml_to_json(val));
            }
            JsonValue::Object(object)
        }
        YamlValue::Tagged(tagged) => {
            let tagged_value = *tagged;
            yaml_to_json(tagged_value.value)
        }
    }
}

fn yaml_number_to_json(num: serde_yaml::Number) -> JsonValue {
    if let Some(value) = num.as_i64() {
        return JsonValue::Number(value.into());
    }
    if let Some(value) = num.as_u64() {
        return JsonValue::Number(value.into());
    }
    if let Some(value) = num.as_f64() {
        if let Some(number) = serde_json::Number::from_f64(value) {
            return JsonValue::Number(number);
        }
    }
    JsonValue::Null
}

fn yaml_key_to_string(value: YamlValue) -> String {
    match value {
        YamlValue::String(v) => v,
        YamlValue::Bool(v) => v.to_string(),
        YamlValue::Number(v) => v.to_string(),
        YamlValue::Null => "null".to_string(),
        other => match serde_yaml::to_string(&other) {
            Ok(s) => s.trim().to_string(),
            Err(_) => "<unserializable-key>".to_string(),
        },
    }
}

fn parse_frontmatter(source: &str) -> JsonValue {
    let Some(yaml_source) = extract_frontmatter(source) else {
        return JsonValue::Object(Map::new());
    };

    let parsed: YamlValue = match serde_yaml::from_str(&yaml_source) {
        Ok(value) => value,
        Err(e) => {
            eprintln!("Failed to parse frontmatter YAML: {}", e);
            return JsonValue::Object(Map::new());
        }
    };

    match parsed {
        YamlValue::Mapping(_) => yaml_to_json(parsed),
        _ => JsonValue::Object(Map::new()),
    }
}

pub fn read_frontmatter(path: &Path) -> Result<JsonValue, String> {
    let contents = fs::read(path).map_err(|error| format!("Failed to read file: {}", error))?;
    let contents = String::from_utf8_lossy(&contents);
    Ok(parse_frontmatter(contents.as_ref()))
}
