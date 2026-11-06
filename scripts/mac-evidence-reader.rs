fn read_evidence_article(data: &Value) -> Result<Vec<u8>, String> {
    let url = data["url"].as_str().ok_or("Missing URL")?;
    let hosts = ["www.bbc.com", "www.bbc.co.uk", "www.theguardian.com", "www.ansa.it", "tg24.sky.it", "www.vaticannews.va", "www.ilpost.it", "apnews.com", "www.reuters.com"];
    if url.len() > 2000 || url.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') || !hosts.iter().any(|host| url.starts_with(&format!("https://{host}/"))) { return Err("Invalid publisher URL".into()); }
    let output = Command::new("curl").args(["--silent", "--show-error", "--fail", "--proto", "=https", "--max-time", "8", "--max-filesize", "1048576", "--noproxy", "*", url]).output().map_err(|_| "Article unavailable")?;
    if !output.status.success() || output.stdout.len() > 1048576 { return Err("Article unavailable".into()); }
    let html = String::from_utf8(output.stdout).map_err(|_| "Invalid article")?;
    serde_json::to_vec(&json!({"html":html})).map_err(|_| "Invalid article".into())
}
fn render_evidence_answer(raw: &str, sources: &[Source], lang: &str) -> String {
    let (intro, missing) = match lang {
        "it" => ("Passaggi pertinenti degli articoli letti:", "Gli articoli letti non permettono di stabilire una risposta a questa domanda."),
        "fr" => ("Passages pertinents des articles lus :", "Les articles lus ne permettent pas de répondre à cette question."),
        "de" => ("Relevante Passagen aus den gelesenen Artikeln:", "Die gelesenen Artikel belegen keine Antwort auf diese Frage."),
        "es" => ("Pasajes pertinentes de los artículos leídos:", "Los artículos leídos no permiten responder a esta pregunta."),
        _ => ("Relevant passages from the articles:", "The articles read do not establish an answer to this question."),
    };
    let parsed = serde_json::from_str::<Value>(raw.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim());
    let Ok(value) = parsed else { return missing.into(); };
    let Some(ids) = value["evidence"].as_array() else { return missing.into(); };
    if ids.is_empty() || ids.len() > 6 { return missing.into(); }
    let mut quotes = Vec::new();
    for id in ids {
        let Some(index) = id.as_str().and_then(|s| s.strip_prefix('E')).and_then(|s| s.parse::<usize>().ok()).and_then(|i| i.checked_sub(1)) else { return missing.into(); };
        let Some(source) = sources.get(index) else { return missing.into(); };
        let quote = format!("“{}” [{}]", source.text, index + 1);
        if !quotes.contains(&quote) { quotes.push(quote); }
    }
    format!("{intro}\n\n{}", quotes.join("\n\n"))
}

fn discover_evidence_articles(data: &Value) -> Result<Vec<u8>, String> {
    let query = data["query"].as_str().ok_or("Invalid query")?;
    if query.trim().is_empty() || query.len() > 600 || query.chars().any(char::is_control) { return Err("Invalid query".into()); }
    let body = json!({"q":query}).to_string();
    let output = Command::new("curl").args(["--silent", "--show-error", "--fail", "--proto", "=https", "--max-time", "8", "--max-filesize", "1048576", "--noproxy", "*", "--header", "Content-Type: application/json", "--data", &body, "https://puri.li/api/search"]).output().map_err(|_| "Search unavailable")?;
    if !output.status.success() || output.stdout.len() > 1048576 { return Err("Search unavailable".into()); }
    Ok(output.stdout)
}
#[cfg(test)]
mod evidence_tests {
    use super::*;
    #[test]
    fn rejects_invented_answer_and_unknown_source() {
        let sources = vec![Source {page:None,name:"Fixture".into(),text:"The Orange party won 230 seats in this synthetic fixture.".into(),doc_id:"web:https://www.bbc.com/test".into()}];
        for text in ["Andrea Bruni won", r#"{"evidence":["E9"]}"#, r#"{"evidence":[null]}"#] {
            let answer=render_evidence_answer(text,&sources,"it");
            assert!(!answer.contains("Bruni")); assert!(!answer.contains("230"));
        }
        assert!(render_evidence_answer(r#"{"evidence":["E1"]}"#,&sources,"it").contains(&sources[0].text));
    }
    #[test]
    fn article_fetch_rejects_local_and_deceptive_urls_before_network() {
        for url in ["http://127.0.0.1/", "https://www.bbc.com.evil.test/a", "https://www.bbc.com@127.0.0.1/a", "file:///etc/passwd", "https://www.bbc.com:8080/a"] {
            assert!(read_evidence_article(&json!({"url":url})).is_err());
        }
    }
}
