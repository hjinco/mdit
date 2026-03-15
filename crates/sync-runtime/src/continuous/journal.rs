use std::{collections::HashMap, time::Duration};
use tokio::time::Instant;

#[derive(Debug, Default)]
pub(crate) struct SuppressionJournal {
    exact_expirations: HashMap<String, Instant>,
    subtree_expirations: HashMap<String, Instant>,
}

impl SuppressionJournal {
    pub(crate) fn register_exact(&mut self, rel_path: &str, ttl: Duration, now: Instant) {
        register_path(&mut self.exact_expirations, rel_path, ttl, now);
    }

    pub(crate) fn register_subtree(&mut self, rel_path: &str, ttl: Duration, now: Instant) {
        register_path(&mut self.subtree_expirations, rel_path, ttl, now);
    }

    pub(crate) fn classify_rel_paths(&mut self, rel_paths: &[String], now: Instant) -> Vec<String> {
        self.prune(now);

        rel_paths
            .iter()
            .filter_map(|rel_path| {
                let normalized = normalize_rel_path(rel_path);
                if normalized.is_empty() {
                    return None;
                }
                if self.is_suppressed(&normalized, now) {
                    None
                } else {
                    Some(normalized)
                }
            })
            .collect()
    }

    pub(crate) fn clear_workspace(&mut self) {
        self.exact_expirations.clear();
        self.subtree_expirations.clear();
    }
    fn is_suppressed(&self, rel_path: &str, now: Instant) -> bool {
        if self
            .exact_expirations
            .get(rel_path)
            .is_some_and(|expires_at| *expires_at > now)
        {
            return true;
        }

        self.subtree_expirations.iter().any(|(prefix, expires_at)| {
            *expires_at > now
                && (rel_path == prefix
                    || rel_path
                        .strip_prefix(prefix)
                        .is_some_and(|suffix| suffix.starts_with('/')))
        })
    }

    fn prune(&mut self, now: Instant) {
        self.exact_expirations
            .retain(|_, expires_at| *expires_at > now);
        self.subtree_expirations
            .retain(|_, expires_at| *expires_at > now);
    }
}

fn register_path(
    target: &mut HashMap<String, Instant>,
    rel_path: &str,
    ttl: Duration,
    now: Instant,
) {
    let normalized = normalize_rel_path(rel_path);
    if normalized.is_empty() {
        return;
    }

    let expires_at = now + ttl;
    match target.get_mut(&normalized) {
        Some(existing) if *existing >= expires_at => {}
        Some(existing) => *existing = expires_at,
        None => {
            target.insert(normalized, expires_at);
        }
    }
}

fn normalize_rel_path(path: &str) -> String {
    let trimmed = path.trim().replace('\\', "/");
    let trimmed = trimmed.trim_start_matches("./");
    trimmed.trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use std::time::Duration;
    use tokio::time::Instant;

    use super::SuppressionJournal;

    #[test]
    fn classifies_exact_and_subtree_suppression() {
        let now = Instant::now();
        let mut journal = SuppressionJournal::default();
        journal.register_exact("notes/a.md", Duration::from_secs(1), now);
        journal.register_subtree("notes/archive", Duration::from_secs(1), now);

        let external = journal.classify_rel_paths(
            &[
                "notes/a.md".to_string(),
                "notes/b.md".to_string(),
                "notes/archive/c.md".to_string(),
            ],
            now,
        );

        assert_eq!(external, vec!["notes/b.md".to_string()]);
    }

    #[test]
    fn expires_old_suppression_entries() {
        let now = Instant::now();
        let later = now + Duration::from_secs(2);
        let mut journal = SuppressionJournal::default();
        journal.register_subtree("notes", Duration::from_secs(1), now);

        let external =
            journal.classify_rel_paths(&["notes/a.md".to_string(), "b.md".to_string()], later);

        assert_eq!(external, vec!["notes/a.md".to_string(), "b.md".to_string()]);
    }
}
