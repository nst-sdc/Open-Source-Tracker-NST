//! Read-only tool registry, ported from lib/agent-tools.ts.
//!
//! Same rules as the TypeScript registry: every tool validates its own args
//! and returns a plain-text summary (never an error the loop could leak),
//! every GitHub-sourced string passes sanitize_field, every summary is
//! capped at 2000 chars, and network calls only hit api.github.com.
//! `site_help` is upgraded here: instead of six canned answers, the
//! `search_site_docs` tool runs the BM25 index over the real site docs.

use crate::guard::{sanitize_field, truncate_chars, MAX_SUMMARY_CHARS};
use crate::kv::KvReader;
use crate::rag::Bm25Index;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

const MAX_PR_NUMBER: i64 = 10_000_000;
const GITHUB_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct ToolCtx {
    pub username: Option<String>,
    pub github_token: Option<String>,
    pub http: reqwest::Client,
    pub kv: KvReader,
    pub index: Arc<Bm25Index>,
}

pub const TOOL_NAMES: &[&str] = &[
    "get_my_standing",
    "explain_flag",
    "find_good_first_issues",
    "lookup_contributor",
    "compare_contributors",
    "search_site_docs",
];

pub fn needs_login(name: &str) -> bool {
    name == "get_my_standing"
}

pub fn is_known(name: &str) -> bool {
    TOOL_NAMES.contains(&name)
}

/// OpenAI-format function schemas for the caller's tier.
pub fn schemas(logged_in: bool) -> Vec<Value> {
    let mut out = Vec::new();
    if logged_in {
        out.push(json!({
            "type": "function",
            "function": {
                "name": "get_my_standing",
                "description": "Look up the signed-in caller on the leaderboard roster: tracked status, year/campus, and links to their profile and work-checker pages. Requires login.",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": false}
            }
        }));
    }
    out.push(json!({
        "type": "function",
        "function": {
            "name": "explain_flag",
            "description": "Check whether a PR \"<owner>/<repo>#<number>\" was flagged by admins and report the reason (fake, self_pr, low_quality) plus any admin note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Repo as \"<owner>/<repo>\"."},
                    "number": {"type": "integer", "description": "PR number, positive integer."}
                },
                "required": ["repo", "number"],
                "additionalProperties": false
            }
        }
    }));
    out.push(json!({
        "type": "function",
        "function": {
            "name": "find_good_first_issues",
            "description": "Search GitHub for open good-first-issues (one Search API call). Optional language filter and limit (max 5 results returned).",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {"type": "string", "description": "Optional programming language filter."},
                    "limit": {"type": "integer", "minimum": 1, "description": "Optional max results; capped at 5."}
                },
                "additionalProperties": false
            }
        }
    }));
    out.push(json!({
        "type": "function",
        "function": {
            "name": "lookup_contributor",
            "description": "Look up one GitHub user by username: whether they are tracked on this leaderboard (with year/campus and profile links) plus their public GitHub stats (public_repos, followers). Use this whenever someone asks about a single GitHub account, including their own.",
            "parameters": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "The GitHub username to look up."}
                },
                "required": ["username"],
                "additionalProperties": false
            }
        }
    }));
    out.push(json!({
        "type": "function",
        "function": {
            "name": "compare_contributors",
            "description": "Compare 2-3 GitHub users: whether each is tracked on the leaderboard plus public_repos and followers counts. No private data is ever returned.",
            "parameters": {
                "type": "object",
                "properties": {
                    "usernames": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 2,
                        "maxItems": 3,
                        "description": "2-3 GitHub usernames to compare."
                    }
                },
                "required": ["usernames"],
                "additionalProperties": false
            }
        }
    }));
    out.push(json!({
        "type": "function",
        "function": {
            "name": "search_site_docs",
            "description": "Full-text search over this site's own documentation (how the leaderboard, joining, login, refresh, flagging and contributing work, plus architecture and local setup). Returns the most relevant doc sections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to look up, in plain words."}
                },
                "required": ["query"],
                "additionalProperties": false
            }
        }
    }));
    out
}

fn cap(summary: String) -> String {
    truncate_chars(&summary, MAX_SUMMARY_CHARS)
}

/// Dispatch one validated-by-name call. Always returns a summary string;
/// internal failures become safe "try again later" text, never panics/Err.
pub async fn dispatch(name: &str, args: &Value, ctx: &ToolCtx) -> String {
    let summary = match name {
        "get_my_standing" => get_my_standing(ctx).await,
        "explain_flag" => explain_flag(args, ctx).await,
        "find_good_first_issues" => find_good_first_issues(args, ctx).await,
        "lookup_contributor" => lookup_contributor(args, ctx).await,
        "compare_contributors" => compare_contributors(args, ctx).await,
        "search_site_docs" => search_site_docs(args, ctx),
        _ => "Unknown tool - ignored.".to_string(),
    };
    cap(summary)
}

// ---- validators (ported regexes, implemented as char checks) ----

fn is_valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let ok = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
    };
    ok(owner) && ok(name)
}

fn is_valid_username(name: &str) -> bool {
    let len = name.chars().count();
    (1..=39).contains(&len) && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn is_valid_language(lang: &str) -> bool {
    let len = lang.chars().count();
    (1..=20).contains(&len)
        && lang
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '#' || c == '-')
}

// ---- tools ----

async fn roster(ctx: &ToolCtx) -> Option<Vec<Value>> {
    let students = ctx.kv.get("students_list").await?;
    students.as_array().cloned()
}

async fn get_my_standing(ctx: &ToolCtx) -> String {
    let Some(username) = ctx.username.as_deref().map(str::trim).filter(|u| !u.is_empty()) else {
        return "Sign in with GitHub to see your standing. Guests cannot use this tool.".into();
    };
    let Some(students) = roster(ctx).await else {
        return "Could not load roster data right now. Try again later.".into();
    };
    let tracked = students.iter().find(|s| {
        s.get("github")
            .and_then(|g| g.as_str())
            .is_some_and(|g| g.eq_ignore_ascii_case(username))
    });
    match tracked {
        None => format!(
            "@{} is not currently tracked on the leaderboard. Request to be added on /join.",
            sanitize_field(username, 40)
        ),
        Some(s) => {
            let login = sanitize_field(s.get("github").and_then(|v| v.as_str()).unwrap_or(username), 40);
            let extra: Vec<String> = ["year", "campus"]
                .iter()
                .filter_map(|k| s.get(*k).and_then(|v| v.as_str()))
                .map(|v| sanitize_field(v, 20))
                .filter(|v| !v.is_empty())
                .collect();
            let suffix = if extra.is_empty() {
                String::new()
            } else {
                format!(" ({})", extra.join(", "))
            };
            format!(
                "@{login} is tracked on the leaderboard{suffix}. Profile: /contributors/{login}. Work checker: /check-work/{login}."
            )
        }
    }
}

async fn explain_flag(args: &Value, ctx: &ToolCtx) -> String {
    let repo = args.get("repo").and_then(|v| v.as_str());
    let number = args.get("number").and_then(|v| v.as_i64());
    let Some(repo) = repo.filter(|r| is_valid_repo(r)) else {
        return "Invalid repo: expected \"<owner>/<repo>\" using letters, numbers, \".\", \"_\" or \"-\".".into();
    };
    let Some(number) = number.filter(|n| (1..MAX_PR_NUMBER).contains(n)) else {
        return format!("Invalid number: expected a positive integer below {MAX_PR_NUMBER}.");
    };
    let id = format!("{repo}#{number}");
    let Some(flags) = ctx.kv.get("flagged_prs").await.and_then(|v| v.as_array().cloned()) else {
        return "Could not look up flag data right now. Try again later.".into();
    };
    let matched = flags.iter().find(|f| {
        f.get("id")
            .and_then(|v| v.as_str())
            .is_some_and(|fid| fid.eq_ignore_ascii_case(&id))
    });
    let Some(flag) = matched else {
        return format!("PR {} is not flagged.", sanitize_field(&id, 100));
    };
    let field = |k: &str, max: usize| {
        flag.get(k)
            .and_then(|v| v.as_str())
            .map(|v| sanitize_field(v, max))
            .unwrap_or_default()
    };
    let (reason, note, title, author) = (field("reason", 20), field("note", 500), field("title", 160), field("author", 40));
    let mut out = format!(
        "PR {} is flagged (reason: {})",
        sanitize_field(&id, 100),
        if reason.is_empty() { "unknown" } else { &reason }
    );
    if !author.is_empty() {
        out.push_str(&format!("; author: @{author}"));
    }
    if !title.is_empty() {
        out.push_str(&format!("; title: \"{title}\""));
    }
    if note.is_empty() {
        out.push('.');
    } else {
        out.push_str(&format!(". Note: {note}"));
    }
    out
}

fn github_request(ctx: &ToolCtx, url: &str) -> reqwest::RequestBuilder {
    let mut req = ctx
        .http
        .get(url)
        .timeout(GITHUB_TIMEOUT)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "oss-tracker-agent-rs");
    if let Some(token) = ctx.github_token.as_deref().filter(|t| !t.is_empty()) {
        req = req.bearer_auth(token);
    }
    req
}

async fn find_good_first_issues(args: &Value, ctx: &ToolCtx) -> String {
    let language = match args.get("language") {
        None | Some(Value::Null) => None,
        Some(Value::String(l)) if is_valid_language(l) => Some(l.clone()),
        _ => {
            return "Invalid language: use up to 20 chars of letters, numbers, \"+\", \"#\" or \"-\".".into()
        }
    };
    let limit = match args.get("limit") {
        None | Some(Value::Null) => 5,
        Some(Value::Number(n)) => match n.as_i64() {
            Some(l) if (1..=100).contains(&l) => l.min(5) as usize,
            _ => return "Invalid limit: expected an integer between 1 and 100.".into(),
        },
        _ => return "Invalid limit: expected an integer between 1 and 100.".into(),
    };
    let mut q = String::from("is:issue state:open label:\"good first issue\"");
    if let Some(lang) = &language {
        q.push_str(&format!(" language:{lang}"));
    }
    let url = format!(
        "https://api.github.com/search/issues?q={}&sort=created&order=desc&per_page={limit}",
        urlencode(&q)
    );
    let res = match github_request(ctx, &url).send().await {
        Ok(res) => res,
        Err(_) => return "Could not search GitHub right now. Try again later.".into(),
    };
    match res.status().as_u16() {
        403 | 429 => return "GitHub Search rate limit is exhausted right now. Try again later.".into(),
        200 => {}
        status => return format!("GitHub Search failed (status {status}). Try again later."),
    }
    let Ok(body) = res.json::<Value>().await else {
        return "Could not search GitHub right now. Try again later.".into();
    };
    let items = body.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if items.is_empty() {
        return match language {
            Some(lang) => format!(
                "No open good-first-issues found for language \"{}\".",
                sanitize_field(&lang, 20)
            ),
            None => "No open good-first-issues found.".into(),
        };
    }
    items
        .iter()
        .take(limit)
        .enumerate()
        .map(|(i, item)| {
            let title = item.get("title").and_then(|v| v.as_str()).map(|t| sanitize_field(t, 160));
            let title = title.filter(|t| !t.is_empty()).unwrap_or_else(|| "(untitled)".into());
            let url = item.get("html_url").and_then(|v| v.as_str()).map(|u| sanitize_field(u, 300)).unwrap_or_default();
            let repo = item
                .get("repository_url")
                .and_then(|v| v.as_str())
                .map(|r| sanitize_field(r.trim_start_matches("https://api.github.com/repos/"), 100))
                .filter(|r| !r.is_empty())
                .unwrap_or_else(|| "unknown repo".into());
            format!("{}. {title} ({repo}) - {url}", i + 1)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

async fn lookup_contributor(args: &Value, ctx: &ToolCtx) -> String {
    let Some(name) = args.get("username").and_then(|v| v.as_str()).map(str::trim) else {
        return "Invalid username: expected a GitHub username string.".into();
    };
    if !is_valid_username(name) {
        return "Invalid username: 1-39 chars of letters, numbers or hyphens.".into();
    }

    // Roster status first: it is local and always answerable.
    let roster_line = match roster(ctx).await {
        None => "Leaderboard status: unavailable right now.".to_string(),
        Some(students) => {
            let entry = students.iter().find(|s| {
                s.get("github")
                    .and_then(|g| g.as_str())
                    .is_some_and(|g| g.eq_ignore_ascii_case(name))
            });
            match entry {
                None => format!(
                    "@{} is not tracked on this leaderboard (they can request adding on /join).",
                    sanitize_field(name, 40)
                ),
                Some(s) => {
                    let login = sanitize_field(
                        s.get("github").and_then(|v| v.as_str()).unwrap_or(name),
                        40,
                    );
                    let extra: Vec<String> = ["year", "campus"]
                        .iter()
                        .filter_map(|k| s.get(*k).and_then(|v| v.as_str()))
                        .map(|v| sanitize_field(v, 20))
                        .filter(|v| !v.is_empty())
                        .collect();
                    let suffix = if extra.is_empty() {
                        String::new()
                    } else {
                        format!(" ({})", extra.join(", "))
                    };
                    format!(
                        "@{login} is tracked on this leaderboard{suffix}. Profile: /contributors/{login}. Work checker: /check-work/{login}."
                    )
                }
            }
        }
    };

    // Public GitHub stats second; failure keeps the roster verdict useful.
    let mut stats_line = "Public GitHub stats: unavailable right now.".to_string();
    let url = format!("https://api.github.com/users/{}", urlencode(name));
    if let Ok(res) = github_request(ctx, &url).send().await {
        if res.status().as_u16() == 404 {
            stats_line = format!(
                "No GitHub account named @{} exists.",
                sanitize_field(name, 40)
            );
        } else if res.status().is_success() {
            if let Ok(data) = res.json::<Value>().await {
                // Only public fields are ever read - emails and private
                // data are ignored.
                let login = data
                    .get("login")
                    .and_then(|v| v.as_str())
                    .map(|l| sanitize_field(l, 40))
                    .filter(|l| !l.is_empty())
                    .unwrap_or_else(|| name.to_string());
                let text = |k: &str, max: usize| {
                    data.get(k)
                        .and_then(|v| v.as_str())
                        .map(|v| sanitize_field(v, max))
                        .unwrap_or_default()
                };
                let num = |k: &str| {
                    data.get(k)
                        .and_then(|v| v.as_i64())
                        .map(|n| n.to_string())
                        .unwrap_or_else(|| "?".into())
                };
                let (bio, company) = (text("bio", 160), text("company", 60));
                let mut line = format!(
                    "Public GitHub stats for @{login}: public_repos={}, followers={}, following={}",
                    num("public_repos"),
                    num("followers"),
                    num("following")
                );
                if !company.is_empty() {
                    line.push_str(&format!(", company=\"{company}\""));
                }
                if !bio.is_empty() {
                    line.push_str(&format!(". Bio: \"{bio}\""));
                }
                line.push_str(&format!(". https://github.com/{login}"));
                stats_line = line;
            }
        }
    }

    format!("{roster_line}\n{stats_line}")
}

async fn compare_contributors(args: &Value, ctx: &ToolCtx) -> String {
    let names: Option<Vec<String>> = args.get("usernames").and_then(|v| v.as_array()).map(|list| {
        list.iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    });
    let valid = names
        .as_ref()
        .is_some_and(|n| {
            (2..=3).contains(&n.len())
                && n.len() == args.get("usernames").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
                && n.iter().all(|u| is_valid_username(u))
        });
    if !valid {
        return "Invalid usernames: pass an array of 2-3 GitHub usernames (1-39 chars, letters, numbers, hyphens).".into();
    }
    let names = names.unwrap();
    let tracked_set: Vec<String> = roster(ctx)
        .await
        .unwrap_or_default()
        .iter()
        .filter_map(|s| s.get("github").and_then(|v| v.as_str()).map(|g| g.to_lowercase()))
        .collect();

    let mut lines = Vec::new();
    for name in &names {
        let tracked = tracked_set.contains(&name.to_lowercase());
        let mut stats = String::from("GitHub stats unavailable");
        let url = format!("https://api.github.com/users/{}", urlencode(name));
        if let Ok(res) = github_request(ctx, &url).send().await {
            if res.status().as_u16() == 404 {
                stats = "GitHub user not found".into();
            } else if res.status().is_success() {
                if let Ok(data) = res.json::<Value>().await {
                    // Only public fields are ever read - emails and private
                    // data are ignored.
                    let login = data.get("login").and_then(|v| v.as_str()).map(|l| sanitize_field(l, 40));
                    let login = login.filter(|l| !l.is_empty()).unwrap_or_else(|| name.clone());
                    let num = |k: &str| {
                        data.get(k)
                            .and_then(|v| v.as_i64())
                            .map(|n| n.to_string())
                            .unwrap_or_else(|| "?".into())
                    };
                    stats = format!(
                        "@{login}: public_repos={}, followers={}",
                        num("public_repos"),
                        num("followers")
                    );
                }
            }
        }
        lines.push(format!(
            "@{}: {}; {stats}.",
            sanitize_field(name, 40),
            if tracked { "tracked" } else { "not tracked" }
        ));
    }
    lines.join("\n")
}

fn search_site_docs(args: &Value, ctx: &ToolCtx) -> String {
    let Some(query) = args.get("query").and_then(|v| v.as_str()) else {
        return "Invalid query: expected a non-empty string.".into();
    };
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 {
        return "Invalid query: expected 1-200 characters of plain text.".into();
    }
    let hits = ctx.index.search(query, 3);
    if hits.is_empty() {
        return "No matching site documentation found for that query.".into();
    }
    hits.iter()
        .map(|hit| {
            format!(
                "[{} / {}]\n{}",
                hit.chunk.file,
                sanitize_field(&hit.chunk.heading, 80),
                truncate_chars(hit.chunk.text.trim(), 600)
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rag::Bm25Index;
    use std::path::Path;

    fn ctx() -> ToolCtx {
        ToolCtx {
            username: None,
            github_token: None,
            http: reqwest::Client::new(),
            kv: KvReader {
                data_dir: Path::new("/nonexistent").to_path_buf(),
                rest_url: None,
                rest_token: None,
                http: reqwest::Client::new(),
            },
            index: Arc::new(Bm25Index::build(&[(
                "HOW_IT_WORKS.md".into(),
                "# Leaderboard\nRanks students by merged PRs weighted by repo quality.".into(),
            )])),
        }
    }

    #[tokio::test]
    async fn guest_gets_signin_refusal_from_standing() {
        let out = dispatch("get_my_standing", &json!({}), &ctx()).await;
        assert!(out.contains("Sign in"));
    }

    #[tokio::test]
    async fn explain_flag_rejects_bad_args_before_io() {
        for args in [
            json!({}),
            json!({"repo": "justrepo", "number": 1}),
            json!({"repo": "../../etc/passwd", "number": 1}),
            json!({"repo": "owner/repo", "number": 0}),
            json!({"repo": "owner/repo", "number": 10_000_000}),
            json!({"repo": "owner/repo", "number": "1"}),
        ] {
            let out = dispatch("explain_flag", &args, &ctx()).await;
            assert!(out.starts_with("Invalid"), "args {args} gave: {out}");
        }
    }

    #[tokio::test]
    async fn issue_search_rejects_bad_language_and_limit_before_io() {
        for args in [
            json!({"language": "type script"}),
            json!({"language": "js\""}),
            json!({"language": "x".repeat(21)}),
            json!({"limit": 0}),
            json!({"limit": 101}),
            json!({"limit": "5"}),
        ] {
            let out = dispatch("find_good_first_issues", &args, &ctx()).await;
            assert!(out.starts_with("Invalid"), "args {args} gave: {out}");
        }
    }

    #[tokio::test]
    async fn lookup_rejects_bad_usernames_before_io() {
        for args in [
            json!({}),
            json!({"username": ""}),
            json!({"username": "bad/name"}),
            json!({"username": "x".repeat(40)}),
            json!({"username": 42}),
        ] {
            let out = dispatch("lookup_contributor", &args, &ctx()).await;
            assert!(out.starts_with("Invalid"), "args {args} gave: {out}");
        }
    }

    #[tokio::test]
    async fn compare_rejects_bad_username_lists_before_io() {
        for args in [
            json!({}),
            json!({"usernames": ["one"]}),
            json!({"usernames": ["a", "b", "c", "d"]}),
            json!({"usernames": ["ok", ""]}),
            json!({"usernames": ["ok", "bad/name"]}),
            json!({"usernames": ["ok", 5]}),
            json!({"usernames": "octocat"}),
        ] {
            let out = dispatch("compare_contributors", &args, &ctx()).await;
            assert!(out.starts_with("Invalid"), "args {args} gave: {out}");
        }
    }

    #[tokio::test]
    async fn docs_search_answers_from_the_index() {
        let out = dispatch("search_site_docs", &json!({"query": "leaderboard ranking"}), &ctx()).await;
        assert!(out.contains("HOW_IT_WORKS.md"));
        assert!(out.contains("repo quality"));
        let bad = dispatch("search_site_docs", &json!({"query": ""}), &ctx()).await;
        assert!(bad.starts_with("Invalid"));
    }

    #[test]
    fn guest_schemas_hide_login_tools() {
        let names: Vec<String> = schemas(false)
            .iter()
            .map(|s| s["function"]["name"].as_str().unwrap().to_string())
            .collect();
        assert!(!names.contains(&"get_my_standing".to_string()));
        assert_eq!(names.len(), TOOL_NAMES.len() - 1);
        let all: Vec<String> = schemas(true)
            .iter()
            .map(|s| s["function"]["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(all.len(), TOOL_NAMES.len());
    }

    #[test]
    fn validators_match_the_typescript_rules() {
        assert!(is_valid_repo("owner/repo.name-x_1"));
        assert!(!is_valid_repo("owner/repo/extra"));
        assert!(!is_valid_repo("owner"));
        assert!(is_valid_username("octo-cat1"));
        assert!(!is_valid_username(&"x".repeat(40)));
        assert!(is_valid_language("c++"));
        assert!(is_valid_language("c#"));
        assert!(!is_valid_language("java script"));
        assert_eq!(urlencode("c++ lang"), "c%2B%2B%20lang");
    }
}
