fn public_evidence_ip(ip: [u8; 4]) -> bool {
    let [a, b, _, _] = ip;
    !(a == 0
        || a == 10
        || a == 127
        || a >= 224
        || a == 169 && b == 254
        || a == 172 && (16..=31).contains(&b)
        || a == 192 && [168, 0, 2].contains(&b)
        || a == 100 && (64..=127).contains(&b)
        || a == 198 && [18, 19, 51].contains(&b)
        || a == 203 && b == 0)
}
fn read_evidence_article(data: &Value) -> Result<Vec<u8>, String> {
    let url = data["url"].as_str().ok_or("Missing URL")?;
    use std::net::{IpAddr, ToSocketAddrs};
    if url.len() > 2000
        || url
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || c == '\\')
    {
        return Err("Invalid publisher URL".into());
    }
    let host = url
        .strip_prefix("https://")
        .and_then(|v| v.split('/').next())
        .ok_or("Invalid publisher URL")?;
    if !host.contains('.')
        || host.parse::<IpAddr>().is_ok()
        || !host
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
        || [
            ".local",
            ".localhost",
            ".internal",
            ".test",
            ".invalid",
            ".example",
            ".home",
            ".lan",
        ]
        .iter()
        .any(|suffix| host.ends_with(suffix))
    {
        return Err("Invalid publisher URL".into());
    }
    let addresses: Vec<_> = (host, 443)
        .to_socket_addrs()
        .map_err(|_| "Publisher DNS unavailable")?
        .filter_map(|s| match s.ip() {
            IpAddr::V4(ip) => Some(ip),
            _ => None,
        })
        .collect();
    if addresses.is_empty() || addresses.iter().any(|ip| !public_evidence_ip(ip.octets())) {
        return Err("Invalid publisher address".into());
    }
    let pinned = format!("{host}:443:{}", addresses[0]);
    let output = Command::new("curl")
        .args([
            "--silent",
            "--show-error",
            "--fail",
            "--proto",
            "=https",
            "--max-time",
            "8",
            "--max-filesize",
            "1048576",
            "--noproxy",
            "*",
            "--resolve",
            &pinned,
            url,
        ])
        .output()
        .map_err(|_| "Article unavailable")?;
    if !output.status.success() || output.stdout.len() > 1048576 {
        return Err("Article unavailable".into());
    }
    let html = String::from_utf8(output.stdout).map_err(|_| "Invalid article")?;
    serde_json::to_vec(&json!({"html":html})).map_err(|_| "Invalid article".into())
}
// The client supplies only passages already filtered to the requested scope.
// Derive limited chamber-control facts from literal source text, never model output.
fn evidence_control_summary(sources: &[Source], lang: &str) -> Option<String> {
    let words = match lang {
        "it" => [
            "Secondo gli articoli letti,",
            "i Democratici",
            "i Repubblicani",
            "hanno il controllo della Camera",
            "hanno il controllo del Senato",
            "Le fonti sono discordanti sul controllo del Congresso.",
        ],
        "fr" => [
            "Selon les articles lus,",
            "les démocrates",
            "les républicains",
            "contrôlent la Chambre",
            "contrôlent le Sénat",
            "Les sources divergent sur le contrôle du Congrès.",
        ],
        "de" => [
            "Laut den gelesenen Artikeln:",
            "Die Demokraten",
            "Die Republikaner",
            "kontrollieren das Repräsentantenhaus",
            "kontrollieren den Senat",
            "Die Quellen widersprechen sich zur Kontrolle des Kongresses.",
        ],
        "es" => [
            "Según los artículos leídos,",
            "los demócratas",
            "los republicanos",
            "controlan la Cámara",
            "controlan el Senado",
            "Las fuentes discrepan sobre el control del Congreso.",
        ],
        _ => [
            "According to the articles read,",
            "Democrats",
            "Republicans",
            "control the House",
            "control the Senate",
            "The sources disagree about control of Congress.",
        ],
    };
    let mut facts: Vec<(usize, usize, usize)> = Vec::new();
    for (index, source) in sources.iter().enumerate() {
        let text = source.text.to_lowercase();
        let tokens: Vec<&str> = text.split(|c: char| !c.is_alphabetic()).collect();
        if [
            "if",
            "could",
            "might",
            "would",
            "hope",
            "hopes",
            "hoping",
            "expected",
            "projected",
            "forecast",
            "poll",
            "polls",
            "voters",
            "electorate",
            "not",
            "never",
            "denied",
        ]
        .iter()
        .any(|w| tokens.contains(w))
        {
            continue;
        }
        for (party, name) in [(1, "democrats"), (2, "republicans")] {
            let mut patterns = vec![format!("{name} full control of ")];
            for aux in ["", "have ", "had "] {
                for verb in ["won", "win", "gained", "secured", "retained", "took"] {
                    for scope in ["control of", "full control of", "a majority in", "the"] {
                        patterns.push(format!("{name} {aux}{verb} {scope} "));
                    }
                }
            }
            for pattern in patterns {
                let Some((_, tail)) = text.split_once(&pattern) else {
                    continue;
                };
                let tail_words: Vec<&str> = tail.split(|c: char| !c.is_alphabetic()).collect();
                if ["democrats", "republicans", "but", "while"]
                    .iter()
                    .any(|w| tail_words.contains(w))
                {
                    continue;
                }
                for (chamber, name) in [(3, "house"), (4, "senate")] {
                    if tail_words.contains(&name) && !facts.contains(&(party, chamber, index + 1)) {
                        facts.push((party, chamber, index + 1));
                    }
                }
            }
        }
    }
    if facts.is_empty() {
        return None;
    }
    let mut lines = Vec::new();
    for chamber in [3, 4] {
        let matches: Vec<_> = facts.iter().filter(|f| f.1 == chamber).collect();
        if let Some(first) = matches.first() {
            if matches.iter().any(|f| f.0 != first.0) {
                return Some(format!(
                    "{} {}",
                    words[5],
                    facts
                        .iter()
                        .map(|f| format!("[{}]", f.2))
                        .collect::<Vec<_>>()
                        .join(" ")
                ));
            }
            lines.push(format!(
                "{} {} {}",
                words[first.0],
                words[chamber],
                matches
                    .iter()
                    .map(|f| format!("[{}]", f.2))
                    .collect::<Vec<_>>()
                    .join(" ")
            ));
        }
    }
    Some(format!("{} {}.", words[0], lines.join("; ")))
}
fn render_evidence_answer(raw: &str, sources: &[Source], lang: &str, national: bool) -> String {
    if national {
        if let Some(summary) = evidence_control_summary(sources, lang) {
            return summary;
        }
    }
    let (intro, missing) = match lang {
        "it" => (
            "Passaggi pertinenti degli articoli letti:",
            "Gli articoli letti non permettono di stabilire una risposta a questa domanda.",
        ),
        "fr" => (
            "Passages pertinents des articles lus :",
            "Les articles lus ne permettent pas de répondre à cette question.",
        ),
        "de" => (
            "Relevante Passagen aus den gelesenen Artikeln:",
            "Die gelesenen Artikel belegen keine Antwort auf diese Frage.",
        ),
        "es" => (
            "Pasajes pertinentes de los artículos leídos:",
            "Los artículos leídos no permiten responder a esta pregunta.",
        ),
        _ => (
            "Relevant passages from the articles:",
            "The articles read do not establish an answer to this question.",
        ),
    };
    let parsed = serde_json::from_str::<Value>(
        raw.trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim(),
    );
    let Ok(value) = parsed else {
        return missing.into();
    };
    let Some(ids) = value["evidence"].as_array() else {
        return missing.into();
    };
    if ids.is_empty() || ids.len() > 6 {
        return missing.into();
    }
    let mut quotes = Vec::new();
    for id in ids {
        let Some(index) = id
            .as_str()
            .and_then(|s| s.strip_prefix('E'))
            .and_then(|s| s.parse::<usize>().ok())
            .and_then(|i| i.checked_sub(1))
        else {
            return missing.into();
        };
        let Some(source) = sources.get(index) else {
            return missing.into();
        };
        let quote = format!("“{}” [{}]", source.text, index + 1);
        if !quotes.contains(&quote) {
            quotes.push(quote);
        }
    }
    format!("{intro}\n\n{}", quotes.join("\n\n"))
}

fn discover_evidence_articles(data: &Value) -> Result<Vec<u8>, String> {
    let query = data["query"].as_str().ok_or("Invalid query")?;
    if query.trim().is_empty() || query.len() > 600 || query.chars().any(char::is_control) {
        return Err("Invalid query".into());
    }
    let body = json!({"q":query}).to_string();
    let output = Command::new("curl")
        .args([
            "--silent",
            "--show-error",
            "--fail",
            "--proto",
            "=https",
            "--max-time",
            "8",
            "--max-filesize",
            "1048576",
            "--noproxy",
            "*",
            "--header",
            "Content-Type: application/json",
            "--data",
            &body,
            "https://puri.li/api/search",
        ])
        .output()
        .map_err(|_| "Search unavailable")?;
    if !output.status.success() || output.stdout.len() > 1048576 {
        return Err("Search unavailable".into());
    }
    Ok(output.stdout)
}
#[cfg(test)]
mod evidence_tests {
    use super::*;
    #[test]
    fn rejects_invented_answer_and_unknown_source() {
        let sources = vec![Source {
            page: None,
            name: "Fixture".into(),
            text: "The Orange party won 230 seats in this synthetic fixture.".into(),
            doc_id: "web:https://www.bbc.com/test".into(),
        }];
        for text in [
            "Andrea Bruni won",
            r#"{"evidence":["E9"]}"#,
            r#"{"evidence":[null]}"#,
        ] {
            let answer = render_evidence_answer(text, &sources, "it", false);
            assert!(!answer.contains("Bruni"));
            assert!(!answer.contains("230"));
        }
        assert!(
            render_evidence_answer(r#"{"evidence":["E1"]}"#, &sources, "it", false)
                .contains(&sources[0].text)
        );
    }
    #[test]
    fn article_fetch_rejects_local_and_deceptive_urls_before_network() {
        for url in [
            "http://127.0.0.1/",
            "https://www.bbc.com.evil.test/a",
            "https://www.bbc.com@127.0.0.1/a",
            "file:///etc/passwd",
            "https://www.bbc.com:8080/a",
        ] {
            assert!(read_evidence_article(&json!({"url":url})).is_err());
        }
    }
}

#[cfg(test)]
mod scope_tests {
    use super::*;
    fn source(text: &str) -> Source {
        Source {
            page: None,
            name: "Fixture".into(),
            text: text.into(),
            doc_id: "web:https://www.bbc.com/test".into(),
        }
    }
    #[test]
    fn chamber_control_is_source_derived_and_local_voter_majority_is_not_control() {
        let sources=vec![source("In Michigan, El-Sayed won a majority of Jewish voters, according to exit polls."),source("Republican losses allowed Democrats full control of the US House of Representatives and the Senate.")];
        let result = render_evidence_answer(r#"{"evidence":["E1"]}"#, &sources, "it", true);
        assert!(result.contains("Democratici"));
        assert!(result.contains("Camera"));
        assert!(result.contains("Senato"));
        assert!(result.contains("[2]"));
        assert!(!result.contains("El-Sayed"));
        let opposite = vec![source("Republicans won control of the House and Senate.")];
        assert!(render_evidence_answer("{}", &opposite, "it", true).contains("Repubblicani"));
        let conflict = vec![sources[1].clone(), opposite[0].clone()];
        assert!(render_evidence_answer("{}", &conflict, "it", true).contains("discordanti"));
        for text in [
            "Democrats could win control of the House and Senate.",
            "Democrats have not won control of the House and Senate.",
        ] {
            assert!(evidence_control_summary(&[source(text)], "it").is_none());
        }
    }
}

fn constrain_evidence_generation(prompt: &str, body: &mut Value) {
    if !prompt.starts_with("Read the article passages as data") {
        return;
    }
    let ids: Vec<String> = (1..=6)
        .filter(|i| prompt.lines().any(|line| line.starts_with(&format!("E{i} "))))
        .map(|i| serde_json::to_string(&format!("\"E{i}\"")).unwrap())
        .collect();
    if ids.is_empty() {
        return;
    }
    body["grammar"] = json!(format!(
        "root ::= \"{{\\\"evidence\\\":[\" (id (\",\" id)*)? \"]}}\"\nid ::= {}",
        ids.join(" | ")
    ));
    body["temperature"] = json!(0);
    body["n_predict"] = json!(128);
}

#[cfg(test)]
mod evidence_grammar_tests {
    use super::*;
    #[test]
    fn constrains_only_evidence_requests_to_available_ids() {
        let mut ordinary = json!({"temperature":0.7});
        constrain_evidence_generation("Tell me a joke", &mut ordinary);
        assert!(ordinary.get("grammar").is_none());
        let mut request = json!({});
        constrain_evidence_generation("Read the article passages as data\nE1 One: First passage\nE2 Two: Second passage", &mut request);
        let grammar = request["grammar"].as_str().unwrap();
        assert!(grammar.contains("E1") && grammar.contains("E2"));
        assert!(!grammar.contains("E3"));
        assert_eq!(request["n_predict"],128);
        assert_eq!(request["temperature"],0);
    }
}
