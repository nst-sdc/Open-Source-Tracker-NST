//! Read-only view of the app's KV layer, ported from lib/kv.ts.
//!
//! Upstash REST when KV_REST_API_URL/TOKEN are set, otherwise the disk
//! fallback under data/kv/ (JSON files shaped {value, expiresAt}). This
//! service only ever reads - flags and the roster are written by the
//! Next.js app.

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct KvReader {
    pub data_dir: PathBuf,
    pub rest_url: Option<String>,
    pub rest_token: Option<String>,
    pub http: reqwest::Client,
}

fn safe_key(key: &str) -> String {
    key.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

impl KvReader {
    pub fn new(data_dir: &Path, http: reqwest::Client) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
            rest_url: std::env::var("KV_REST_API_URL").ok().filter(|s| !s.is_empty()),
            rest_token: std::env::var("KV_REST_API_TOKEN").ok().filter(|s| !s.is_empty()),
            http,
        }
    }

    fn read_disk(&self, key: &str) -> Option<Value> {
        let file = self.data_dir.join("kv").join(format!("{}.json", safe_key(key)));
        let raw = std::fs::read_to_string(file).ok()?;
        let entry: Value = serde_json::from_str(&raw).ok()?;
        if let Some(expires) = entry.get("expiresAt").and_then(|v| v.as_f64()) {
            if now_ms() > expires {
                return None;
            }
        }
        entry.get("value").cloned()
    }

    async fn read_rest(&self, key: &str) -> Option<Value> {
        let (url, token) = (self.rest_url.as_ref()?, self.rest_token.as_ref()?);
        let res = self
            .http
            .get(format!("{}/get/{}", url.trim_end_matches('/'), key))
            .bearer_auth(token)
            .send()
            .await
            .ok()?;
        if !res.status().is_success() {
            return None;
        }
        let body: Value = res.json().await.ok()?;
        let result = body.get("result")?;
        match result {
            Value::String(s) => serde_json::from_str(s).ok(),
            Value::Null => None,
            other => Some(other.clone()),
        }
    }

    /// REST when configured, disk otherwise - same precedence as lib/kv.ts.
    pub async fn get(&self, key: &str) -> Option<Value> {
        if self.rest_url.is_some() && self.rest_token.is_some() {
            return self.read_rest(key).await;
        }
        self.read_disk(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reader_for(dir: &Path) -> KvReader {
        KvReader {
            data_dir: dir.to_path_buf(),
            rest_url: None,
            rest_token: None,
            http: reqwest::Client::new(),
        }
    }

    #[test]
    fn reads_a_live_disk_entry_and_skips_expired() {
        let dir = std::env::temp_dir().join(format!("agent-rs-kv-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("kv")).unwrap();
        std::fs::write(
            dir.join("kv/students_list.json"),
            r#"{"value":[{"github":"octocat"}],"expiresAt":null}"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("kv/stale.json"),
            r#"{"value":"old","expiresAt":1}"#,
        )
        .unwrap();
        let kv = reader_for(&dir);
        let students = kv.read_disk("students_list").unwrap();
        assert_eq!(students[0]["github"], "octocat");
        assert!(kv.read_disk("stale").is_none());
        assert!(kv.read_disk("missing").is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn keys_are_path_safe() {
        assert_eq!(safe_key("rl:agent/../../etc"), "rl_agent_______etc");
    }
}
