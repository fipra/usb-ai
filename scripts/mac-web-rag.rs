// Web RAG v4 (experimental). Appended to src/main.rs by prepare-mac-rag.py.
const WEB_PLAN_MARKER: &str = "LLAMANEST_WEB_RAG_PLAN";
// Must match PLAN_GRAMMAR in web/usb-ai-web/web-rag.js.
const WEB_PLAN_GRAMMAR: &str = r#"root ::= "{\"queries\":[" q ("," q){0,2} "],\"recent\":" ("true" | "false") "}"
q ::= "\"" c{3,90} "\""
c ::= [^"\\\x00-\x1f]"#;

fn constrain_web_plan(prompt: &str, body: &mut Value) {
    if prompt != WEB_PLAN_MARKER {
        return;
    }
    body["grammar"] = json!(WEB_PLAN_GRAMMAR);
    body["temperature"] = json!(0);
    body["n_predict"] = json!(160);
}

// Wikipedia search: fixed hosts, five languages, bounded query.
fn wiki_search(data: &Value) -> Result<Vec<u8>, String> {
    let query = data["query"].as_str().ok_or("Invalid query")?.trim();
    if query.is_empty() || query.len() > 200 || query.chars().any(char::is_control) {
        return Err("Invalid query".into());
    }
    let lang = match data["lang"].as_str().unwrap_or("en") {
        "it" => "it",
        "fr" => "fr",
        "de" => "de",
        "es" => "es",
        _ => "en",
    };
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
            "--user-agent",
            "LlamaNest/4 (local research assistant)",
            "--get",
            "--data-urlencode",
            "action=query",
            "--data-urlencode",
            "list=search",
            "--data-urlencode",
            "format=json",
            "--data-urlencode",
            "srlimit=3",
            "--data-urlencode",
            "utf8=1",
            "--data-urlencode",
            "srprop=snippet",
            "--data-urlencode",
            &format!("srsearch={query}"),
            &format!("https://{lang}.wikipedia.org/w/api.php"),
        ])
        .output()
        .map_err(|_| "Search unavailable")?;
    if !output.status.success() || output.stdout.len() > 1_048_576 {
        return Err("Search unavailable".into());
    }
    Ok(output.stdout)
}

// Same normalisation as web-rag.js: drop thousands separators, comma -> dot.
fn web_numbers(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.' || chars[i] == ',') {
            i += 1;
        }
        let mut token: Vec<char> = chars[start..i].to_vec();
        while token.last().is_some_and(|c| *c == '.' || *c == ',') {
            token.pop();
        }
        let mut out = String::new();
        for (k, c) in token.iter().enumerate() {
            let thousands = (*c == '.' || *c == ',')
                && k + 4 <= token.len()
                && token[k + 1..k + 4].iter().all(char::is_ascii_digit)
                && (k + 4 == token.len() || !token[k + 4].is_ascii_digit());
            if !thousands {
                out.push(if *c == ',' { '.' } else { *c });
            }
        }
        found.push(out);
    }
    found
}

fn strip_citations(text: &str) -> (String, Vec<usize>) {
    let mut clean = String::new();
    let mut refs = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find('[') {
        let after = &rest[open + 1..];
        match after.find(']') {
            Some(close) if close <= 2 && close > 0 && after[..close].chars().all(|c| c.is_ascii_digit()) => {
                clean.push_str(&rest[..open]);
                refs.push(after[..close].parse().unwrap_or(0));
                rest = &after[close + 1..];
            }
            _ => {
                clean.push_str(&rest[..open + 1]);
                rest = after;
            }
        }
    }
    clean.push_str(rest);
    (clean, refs)
}

// Generic answer check: invalid citations are removed; numbers absent from all
// sources (and from the question) and missing citations are flagged.
fn verify_web_answer(answer: &str, sources: &[Source], question: &str, lang: &str) -> String {
    let visible = final_answer_only(answer);
    let (bare, refs) = strip_citations(&visible);
    let mut text = answer.trim().to_owned();
    for r in refs.iter().filter(|r| **r == 0 || **r > sources.len()) {
        text = text.replace(&format!("[{r}]"), "");
    }
    let known: std::collections::HashSet<String> = sources
        .iter()
        .flat_map(|s| web_numbers(&format!("{} {}", s.name, s.text)))
        .chain(web_numbers(question))
        .collect();
    let mut unsupported: Vec<String> = Vec::new();
    for n in web_numbers(&bare) {
        let trimmed = n.trim_end_matches(".0").to_owned();
        if !known.contains(&n) && !known.contains(&trimmed) && !unsupported.contains(&n) {
            unsupported.push(n);
        }
    }
    let valid_refs = refs.iter().any(|r| *r >= 1 && *r <= sources.len());
    let words = match lang {
        "it" => ["Verifica:", "questi numeri non compaiono nelle fonti", "la risposta non cita le fonti"],
        "fr" => ["Vérification :", "ces nombres n’apparaissent pas dans les sources", "la réponse ne cite aucune source"],
        "de" => ["Prüfung:", "diese Zahlen stehen nicht in den Quellen", "die Antwort nennt keine Quellen"],
        "es" => ["Verificación:", "estos números no aparecen en las fuentes", "la respuesta no cita fuentes"],
        _ => ["Check:", "these numbers do not appear in the sources", "the answer has no source citations"],
    };
    let mut notes = Vec::new();
    if !unsupported.is_empty() {
        unsupported.truncate(6);
        notes.push(format!("{}: {}", words[1], unsupported.join(", ")));
    }
    if !valid_refs {
        notes.push(words[2].to_owned());
    }
    if !notes.is_empty() {
        text.push_str(&format!("\n\n> ⚠️ {} {}.", words[0], notes.join("; ")));
    }
    text
}

#[cfg(test)]
mod web_rag_tests {
    use super::*;
    fn source(text: &str) -> Source {
        Source { page: None, name: "Fixture".into(), text: text.into(), doc_id: "web:https://en.wikipedia.org/wiki/X".into() }
    }
    #[test]
    fn numbers_normalise_thousands_and_decimals() {
        assert_eq!(web_numbers("4,478 m and 4.478 m, 3,5% in 2025."), vec!["4478", "4478", "3.5", "2025"]);
    }
    #[test]
    fn flags_invented_numbers_and_removes_unknown_citations() {
        let sources = vec![source("The Matterhorn is 4,478 metres high.")];
        let ok = verify_web_answer("Il Cervino è alto 4.478 metri [1].", &sources, "Quanto è alto il Cervino?", "it");
        assert!(!ok.contains("⚠️"));
        let bad = verify_web_answer("Il Cervino è alto 4.810 metri [1][7].", &sources, "Quanto è alto?", "it");
        assert!(bad.contains("4810"));
        assert!(!bad.contains("[7]"));
        let uncited = verify_web_answer("Il Cervino è molto alto.", &sources, "", "it");
        assert!(uncited.contains("non cita"));
    }
    #[test]
    fn plan_grammar_only_for_marker() {
        let mut body = json!({"temperature":0.7});
        constrain_web_plan("hello", &mut body);
        assert!(body.get("grammar").is_none());
        constrain_web_plan(WEB_PLAN_MARKER, &mut body);
        assert!(body["grammar"].as_str().unwrap().starts_with("root ::="));
        assert_eq!(body["temperature"], 0);
    }
    #[test]
    fn wiki_search_rejects_bad_queries_before_network() {
        assert!(wiki_search(&json!({"query":""})).is_err());
        assert!(wiki_search(&json!({"query":"a\u{0}b"})).is_err());
        assert!(wiki_search(&json!({"query":"x".repeat(201)})).is_err());
    }
}
