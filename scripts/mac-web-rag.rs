// Web RAG v4 (experimental). Appended to src/main.rs by prepare-mac-rag.py.
const WEB_PLAN_MARKER: &str = "LLAMANEST_WEB_RAG_PLAN";
// Must match ENGLISH_QUERY_GRAMMAR in web/usb-ai-web/web-rag.js.
const WEB_PLAN_GRAMMAR: &str = r#"root ::= "{\"q\":\"" c{3,80} "\"}"
c ::= [^"\\\x00-\x1f]"#;

fn constrain_web_plan(prompt: &str, body: &mut Value) {
    if prompt != WEB_PLAN_MARKER {
        return;
    }
    body["grammar"] = json!(WEB_PLAN_GRAMMAR);
    body["temperature"] = json!(0);
    body["n_predict"] = json!(40);
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

fn web_host(url: &str) -> String {
    url.trim_start_matches("web:")
        .split("://")
        .nth(1)
        .unwrap_or("")
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_lowercase()
}

// Lines with links to hosts that are not among the sources are removed.
fn remove_invented_links(text: &str, sources: &[Source]) -> String {
    let hosts: Vec<String> = sources.iter().map(|s| web_host(&s.doc_id)).collect();
    text.lines()
        .filter(|line| {
            line.split_whitespace()
                .filter(|w| w.contains("http://") || w.contains("https://"))
                .all(|w| {
                    let url = &w[w.find("http").unwrap_or(0)..];
                    let host = web_host(url.trim_end_matches(|c: char| ")]>\"'.,".contains(c)));
                    !host.is_empty() && hosts.contains(&host)
                })
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// Capitalised words inside a sentence that appear nowhere in the sources,
// the question or the user's earlier messages, grouped into phrases.
fn unsupported_names(text: &str, known: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for sentence in text.split(|c| c == '.' || c == '!' || c == '?' || c == '\n') {
        let words: Vec<&str> = sentence.split_whitespace().collect();
        let first = words.iter().position(|w| w.chars().any(char::is_alphabetic));
        let mut phrase: Vec<String> = Vec::new();
        let mut unknown = false;
        let mut flush = |phrase: &mut Vec<String>, unknown: &mut bool, names: &mut Vec<String>| {
            let joined = phrase.join(" ");
            if *unknown && !joined.is_empty() && !names.contains(&joined) {
                names.push(joined);
            }
            phrase.clear();
            *unknown = false;
        };
        for (index, raw) in words.iter().enumerate() {
            let tail = raw.rsplit(['\'', '’']).next().unwrap_or(raw);
            let word: String = tail.trim_matches(|c: char| !c.is_alphabetic()).to_owned();
            let label = raw.trim_end_matches('*').ends_with(':');
            let mut chars = word.chars();
            let capital = Some(index) > first
                && !label
                && word.chars().count() >= 3
                && chars.next().is_some_and(char::is_uppercase)
                && word.chars().all(|c| c.is_alphabetic() || c == '-')
                && !word.chars().all(char::is_uppercase);
            if !capital {
                flush(&mut phrase, &mut unknown, &mut names);
                continue;
            }
            if word.chars().count() >= 4 && !known.contains(&word.to_lowercase()) {
                unknown = true;
            }
            phrase.push(word);
            if raw.ends_with(|c: char| !c.is_alphabetic()) {
                flush(&mut phrase, &mut unknown, &mut names);
            }
        }
        flush(&mut phrase, &mut unknown, &mut names);
    }
    names
}

// Generic answer check, same rules as finalizeAnswer in web-rag.js: invalid
// citations and invented links are removed; numbers and names missing from
// the sources are flagged; ages computed from today's year are accepted.
fn verify_web_answer(answer: &str, sources: &[Source], question: &str, lang: &str, today: &str, user_text: &str, all_text: &str) -> String {
    let mut text = remove_invented_links(answer.trim(), sources);
    let visible = final_answer_only(&text);
    let (bare, refs) = strip_citations(&visible);
    for r in refs.iter().filter(|r| **r == 0 || **r > sources.len()) {
        text = text.replace(&format!("[{r}]"), "");
    }
    let source_text = sources.iter().map(|s| format!("{} {} {}", s.name, s.doc_id, s.text)).collect::<Vec<_>>().join(" ");
    let mut known: std::collections::HashSet<String> = web_numbers(&source_text)
        .into_iter()
        .chain(web_numbers(question))
        .chain(web_numbers(today))
        .collect();
    let now: i64 = today.get(..4).and_then(|y| y.parse().ok()).unwrap_or(0);
    if now > 0 {
        for n in web_numbers(&format!("{source_text} {all_text}")) {
            if let Ok(year) = n.parse::<i64>() {
                if (1800..now).contains(&year) && now - year <= 150 {
                    known.insert((now - year).to_string());
                    known.insert((now - year - 1).to_string());
                }
            }
        }
    }
    let mut unsupported: Vec<String> = Vec::new();
    for n in web_numbers(&bare) {
        let trimmed = n.trim_end_matches(".0").to_owned();
        if !known.contains(&n) && !known.contains(&trimmed) && !unsupported.contains(&n) {
            unsupported.push(n);
        }
    }
    let names = unsupported_names(&bare, &format!("{source_text} {question} {user_text}").to_lowercase());
    let words = match lang {
        "it" => ["Da verificare:", "questi numeri non sono nelle fonti", "questi nomi non sono nelle fonti"],
        "fr" => ["À vérifier :", "ces nombres ne figurent pas dans les sources", "ces noms ne figurent pas dans les sources"],
        "de" => ["Bitte prüfen:", "diese Zahlen stehen nicht in den Quellen", "diese Namen stehen nicht in den Quellen"],
        "es" => ["Por verificar:", "estos números no están en las fuentes", "estos nombres no están en las fuentes"],
        _ => ["To check:", "these numbers are not in the sources", "these names are not in the sources"],
    };
    let mut notes = Vec::new();
    if !unsupported.is_empty() {
        unsupported.truncate(6);
        notes.push(format!("{}: {}", words[1], unsupported.join(", ")));
    }
    if !names.is_empty() {
        notes.push(format!("{}: {}", words[2], names.iter().take(6).cloned().collect::<Vec<_>>().join(", ")));
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
    fn flags_invented_numbers_and_names_and_removes_unknown_citations() {
        let sources = vec![source("The Matterhorn is 4,478 metres high.")];
        let ok = verify_web_answer("Il Cervino è alto 4.478 metri [1].", &sources, "Quanto è alto il Cervino?", "it", "2026-11-07", "", "");
        assert!(!ok.contains("⚠️"), "{ok}");
        let bad = verify_web_answer("Il Cervino è alto 4.810 metri [1][7].", &sources, "Quanto è alto il Cervino?", "it", "2026-11-07", "", "");
        assert!(bad.contains("4810"));
        assert!(!bad.contains("[7]"));
        let names = verify_web_answer("Il Cervino è stato scalato dal Club Alpino Francese.", &sources, "Quanto è alto il Cervino?", "it", "2026-11-07", "", "");
        assert!(names.contains("Club Alpino Francese"), "{names}");
        let uncited = verify_web_answer("Il Cervino è molto alto.", &sources, "Quanto è alto il Cervino?", "it", "2026-11-07", "", "");
        assert!(!uncited.contains("⚠️"));
    }
    #[test]
    fn ages_from_today_and_invented_links() {
        let sources = vec![source("Giorgia Meloni (Roma, 15 gennaio 1977) è una politica italiana.")];
        let age = verify_web_answer("Ha 49 anni [1].", &sources, "quanti anni ha", "it", "2026-11-07", "chi è giorgia meloni", "");
        assert!(!age.contains("⚠️"), "{age}");
        let wrong = verify_web_answer("Ha 47 anni [1].", &sources, "quanti anni ha", "it", "2026-11-07", "chi è giorgia meloni", "");
        assert!(wrong.contains("47"));
        let links = verify_web_answer("Studi [1].\n- Sito: https://www.camcom.it/tema/2003/\n- Fonte: https://en.wikipedia.org/wiki/X", &sources, "", "it", "2026-11-07", "", "");
        assert!(!links.contains("camcom") && links.contains("wikipedia"), "{links}");
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
