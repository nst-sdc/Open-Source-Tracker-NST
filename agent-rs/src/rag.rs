//! In-memory BM25 retrieval over the site's markdown docs.
//!
//! The corpus is tiny (a few hundred lines of markdown), so the whole index
//! lives in RAM and is built once at startup; a query is a few hash lookups
//! and a partial sort - microseconds, no vector DB, no embedding API (Groq
//! offers none), no network on the retrieval path at all.

use std::collections::HashMap;
use std::path::Path;

const K1: f32 = 1.2;
const B: f32 = 0.75;
/// Sections longer than this are split on paragraph boundaries.
const MAX_CHUNK_CHARS: usize = 1400;

const STOPWORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "how", "in", "is",
    "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "which", "who",
    "will", "with", "you", "your", "do", "does", "can", "not", "we", "our", "their", "they",
];

pub struct Chunk {
    pub file: String,
    pub heading: String,
    pub text: String,
    tf: HashMap<String, f32>,
    len: f32,
}

pub struct Bm25Index {
    chunks: Vec<Chunk>,
    df: HashMap<String, f32>,
    avgdl: f32,
}

pub struct Hit<'a> {
    pub score: f32,
    pub chunk: &'a Chunk,
}

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut cur = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            cur.extend(ch.to_lowercase());
        } else if !cur.is_empty() {
            tokens.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        tokens.push(cur);
    }
    tokens
        .into_iter()
        .filter(|t| t.len() >= 2 && !STOPWORDS.contains(&t.as_str()))
        .collect()
}

/// Split one markdown file into heading-scoped chunks; oversized sections are
/// re-split on blank lines so no chunk drowns the model in context.
fn chunk_markdown(file: &str, body: &str) -> Vec<(String, String, String)> {
    let mut sections: Vec<(String, String)> = Vec::new(); // (heading, text)
    let mut heading = String::from("(intro)");
    let mut buf = String::new();
    for line in body.lines() {
        if line.starts_with('#') {
            if !buf.trim().is_empty() {
                sections.push((heading.clone(), buf.trim().to_string()));
            }
            heading = line.trim_start_matches('#').trim().to_string();
            buf.clear();
        } else {
            buf.push_str(line);
            buf.push('\n');
        }
    }
    if !buf.trim().is_empty() {
        sections.push((heading, buf.trim().to_string()));
    }

    let mut out = Vec::new();
    for (heading, text) in sections {
        if text.chars().count() <= MAX_CHUNK_CHARS {
            out.push((file.to_string(), heading, text));
            continue;
        }
        let mut piece = String::new();
        for para in text.split("\n\n") {
            if !piece.is_empty() && piece.chars().count() + para.chars().count() > MAX_CHUNK_CHARS {
                out.push((file.to_string(), heading.clone(), piece.trim().to_string()));
                piece = String::new();
            }
            piece.push_str(para);
            piece.push_str("\n\n");
        }
        if !piece.trim().is_empty() {
            out.push((file.to_string(), heading.clone(), piece.trim().to_string()));
        }
    }
    out
}

impl Bm25Index {
    pub fn build(docs: &[(String, String)]) -> Self {
        let mut chunks = Vec::new();
        for (file, body) in docs {
            for (file, heading, text) in chunk_markdown(file, body) {
                let tokens = tokenize(&format!("{heading}\n{text}"));
                let len = tokens.len() as f32;
                let mut tf: HashMap<String, f32> = HashMap::new();
                for tok in tokens {
                    *tf.entry(tok).or_insert(0.0) += 1.0;
                }
                chunks.push(Chunk {
                    file: file.clone(),
                    heading,
                    text,
                    tf,
                    len,
                });
            }
        }
        let mut df: HashMap<String, f32> = HashMap::new();
        for chunk in &chunks {
            for term in chunk.tf.keys() {
                *df.entry(term.clone()).or_insert(0.0) += 1.0;
            }
        }
        let avgdl = if chunks.is_empty() {
            1.0
        } else {
            chunks.iter().map(|c| c.len).sum::<f32>() / chunks.len() as f32
        };
        Self { chunks, df, avgdl }
    }

    /// Load every corpus file that exists; missing files are skipped quietly
    /// so the service still boots on a partial checkout.
    pub fn from_dir(root: &Path, files: &[&str]) -> Self {
        let mut docs = Vec::new();
        for rel in files {
            let path = root.join(rel);
            if let Ok(body) = std::fs::read_to_string(&path) {
                docs.push((rel.to_string(), body));
            }
        }
        Self::build(&docs)
    }

    pub fn len(&self) -> usize {
        self.chunks.len()
    }

    pub fn search(&self, query: &str, k: usize) -> Vec<Hit<'_>> {
        let n = self.chunks.len() as f32;
        if n == 0.0 {
            return Vec::new();
        }
        let terms = tokenize(query);
        let mut scored: Vec<Hit<'_>> = self
            .chunks
            .iter()
            .map(|chunk| {
                let mut score = 0.0;
                for term in &terms {
                    let Some(tf) = chunk.tf.get(term) else { continue };
                    let df = self.df.get(term).copied().unwrap_or(0.0);
                    let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();
                    score += idf * (tf * (K1 + 1.0))
                        / (tf + K1 * (1.0 - B + B * chunk.len / self.avgdl));
                }
                Hit { score, chunk }
            })
            .filter(|h| h.score > 0.0)
            .collect();
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(k);
        scored
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Bm25Index {
        Bm25Index::build(&[
            (
                "HOW_IT_WORKS.md".into(),
                "# Leaderboard\nThe leaderboard ranks students by merged pull requests weighted by repo quality.\n\n# Joining\nSubmit your GitHub username on the join page and wait for admin approval.\n".into(),
            ),
            (
                "README.md".into(),
                "# Setup\nRun npm install and npm run dev to start the tracker locally.\n".into(),
            ),
        ])
    }

    #[test]
    fn ranks_the_relevant_section_first() {
        let index = sample();
        let hits = index.search("how does the leaderboard ranking work", 3);
        assert!(!hits.is_empty());
        assert_eq!(hits[0].chunk.heading, "Leaderboard");
    }

    #[test]
    fn finds_setup_instructions() {
        let index = sample();
        let hits = index.search("npm install local setup", 3);
        assert_eq!(hits[0].chunk.file, "README.md");
    }

    #[test]
    fn empty_query_and_garbage_return_nothing() {
        let index = sample();
        assert!(index.search("", 3).is_empty());
        assert!(index.search("zzzql qqqq", 3).is_empty());
    }

    #[test]
    fn oversized_sections_are_split() {
        let long = format!("# Big\n{}", "word paragraph text here.\n\n".repeat(200));
        let index = Bm25Index::build(&[("big.md".into(), long)]);
        assert!(index.len() > 1);
    }
}
