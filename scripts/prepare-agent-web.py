#!/usr/bin/env python3
"""Add a one-search model-directed experiment to the isolated web build."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
helpers = Path(__file__).resolve().parent

def replace(path, old, new):
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f'Missing expected text in {path}: {old[:90]}')
    path.write_text(text.replace(old, new, 1))

rust = root / 'src/main.rs'
replace(rust, '    fn send(&mut self, data: Value) -> Result<Value, String> {', '''    fn plan_agent_web(&mut self, data: Value, generation: &ActiveGeneration) -> Result<Value, String> {
        let chat_id = data["chatId"].as_str().ok_or("Chat missing")?;
        let text = data["text"].as_str().ok_or("Message missing")?.trim();
        if text.is_empty() || text.len() > 12000 { return Err("Invalid message".into()); }
        let chat = self.db.chats.iter().find(|chat| chat.id == chat_id).ok_or("Chat not found")?;
        let end = match data.get("editIndex") {
            None | Some(Value::Null) => chat.messages.len(),
            Some(value) => {
                let index = value.as_u64().and_then(|v| usize::try_from(v).ok()).ok_or("Invalid index")?;
                if chat.messages.get(index).is_none_or(|message| message.role != "user") { return Err("Invalid index".into()); }
                index
            }
        };
        let history: Vec<Message> = chat.messages[..end].iter().rev().take(8).cloned().collect();
        let system = r#"You have one optional tool for web search. Search only when it would help answer the user; otherwise respond normally. Tool-use must be at the end of your response using exactly this format:
<use_mcp_tool>
<server_name>web</server_name>
<tool_name>google_search</tool_name>
<arguments>{"query":"search terms"}</arguments>
</use_mcp_tool>
The query must be a short string. Use conversation context to resolve follow-up questions. Never invent search results."#;
        let messages = conversation_messages(system, &history, text, 8);
        let model = self.selected.as_ref().ok_or("Select a model")?;
        let path = self.model_path(model)?;
        let old_limit = self.db.output_limit;
        self.db.output_limit = if old_limit == 0 { 1024 } else { old_limit.min(1024) };
        let result = self.infer_stream(&path, system, Some(text), Some(&messages), &mut |_| Ok(()), generation);
        self.db.output_limit = old_limit;
        let (output, _) = result?;
        if generation.cancelled.load(Ordering::SeqCst) { return Err("Cancelled".into()); }
        Ok(json!({"output": output}))
    }
    fn send(&mut self, data: Value) -> Result<Value, String> {''')
replace(rust, '''                    app.lock().unwrap().send_with_updates(
                        data,
                        &mut |delta| {''', '''                    if data["agentPlan"].as_bool() == Some(true) {
                        return app.lock().unwrap().plan_agent_web(data, &generation);
                    }
                    app.lock().unwrap().send_with_updates(
                        data,
                        &mut |delta| {''')

html = root / 'web/index.html'
agent_js = (helpers / 'agent-web-search.js').read_text()
replace(html, '    function newRequestId(){', agent_js + '''
for (const [lang, values] of Object.entries({
 en:{webSearchPrivacy:'The model may send a search query based on your question and chat to Purili, which can see your IP address. Search results can be inaccurate.',webSearchSearching:'The model is deciding whether to search…'},
 it:{webSearchPrivacy:'Il modello può inviare a Purili una ricerca basata sulla domanda e sulla chat. Purili può vedere il tuo indirizzo IP. I risultati possono essere inesatti.',webSearchSearching:'Il modello decide se cercare sul web…'},
 fr:{webSearchPrivacy:'Le modèle peut envoyer à Purili une recherche basée sur la question et la conversation. Purili peut voir votre adresse IP.',webSearchSearching:'Le modèle décide s’il doit chercher…'},
 de:{webSearchPrivacy:'Das Modell kann eine Suchanfrage aus Frage und Chat an Purili senden. Purili kann deine IP-Adresse sehen.',webSearchSearching:'Das Modell entscheidet über die Suche…'},
 es:{webSearchPrivacy:'El modelo puede enviar a Purili una búsqueda basada en la pregunta y la conversación. Purili puede ver tu dirección IP.',webSearchSearching:'El modelo decide si busca…'}
})) Object.assign(window.USB_AI_I18N[lang], values);
    function newRequestId(){''')
replace(html, '''if(text.length>600||text.trim().split(/\\s+/).length>75)throw Error(tr('webSearchLong'));showWait(tr('webSearchSearching'));webSearchController=new AbortController();try{webSources=await searchWeb(webSearchQuery(text,webHistory),webSearchController.signal)}catch(error){if(error.name==='AbortError')throw error;throw Error(error.message==='WEB_SEARCH_LIMIT'?tr('webSearchLimit'):tr('webSearchError'))}finally{webSearchController=null}if(!webSources.length)throw Error(tr('webSearchEmpty'))''', '''showWait(tr('webSearchSearching'));const plan=await callStream({chatId,requestId,text,editIndex:edit?.index,agentPlan:true},()=>{});const query=agentWebQuery(plan.output);if(/<use_mcp_tool>/i.test(plan.output)&&!query)throw Error('Invalid or unsupported search request from model');if(query){webSearchController=new AbortController();try{webSources=await searchWeb(query,webSearchController.signal)}catch(error){if(error.name==='AbortError')throw error;throw Error(error.message==='WEB_SEARCH_LIMIT'?tr('webSearchLimit'):tr('webSearchError'))}finally{webSearchController=null}if(!webSources.length)throw Error(tr('webSearchEmpty'))}''')
print(root)
