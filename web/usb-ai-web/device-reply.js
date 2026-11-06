// Exact, self-contained requests only: never swallow a news or document question.
export function deviceReply(text, language = 'en', now = new Date()) {
  const q = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[?!.¿¡,]/g, '').trim().replace(/\s+/g, ' ');
  const groups = {
    it: {date:['che giorno e oggi','che giorno e','che data e oggi','qual e la data di oggi','data di oggi','oggi che giorno e'],time:['che ore sono','che ora e','che ore sono adesso'],hello:['ciao','cao','salve','buongiorno','buonasera']},
    en: {date:['what day is it today','what day is it','what is todays date','whats todays date','what is the date today','todays date'],time:['what time is it','what time is it now'],hello:['hi','hello','hey']},
    fr: {date:['quel jour sommes nous','quel jour sommes-nous','quelle est la date daujourdhui','on est quel jour'],time:['quelle heure est-il','quelle heure est il'],hello:['bonjour','salut','bonsoir']},
    de: {date:['welcher tag ist heute','welches datum ist heute','was ist heute fur ein tag'],time:['wie spat ist es','wie viel uhr ist es'],hello:['hallo','guten tag','guten morgen']},
    es: {date:['que dia es hoy','cual es la fecha de hoy'],time:['que hora es'],hello:['hola','buenos dias','buenas tardes']}
  };
  let kind, lang;
  for (const [candidate, intents] of Object.entries(groups)) {
    for (const [intent, phrases] of Object.entries(intents)) if (phrases.includes(q)) {kind=intent;lang=candidate;}
  }
  if (!kind) return null;
  const labels = {
    en:['Hello! How can I help?','Today is {value}.','It is {value}.'],
    it:['Ciao! Come posso aiutarti?','Oggi è {value}.','Sono le {value}.'],
    fr:['Bonjour ! Comment puis-je vous aider ?','Nous sommes le {value}.','Il est {value}.'],
    de:['Hallo! Wie kann ich helfen?','Heute ist {value}.','Es ist {value}.'],
    es:['¡Hola! ¿Cómo puedo ayudarte?','Hoy es {value}.','Son las {value}.']
  };
  const locale = lang || (groups[language] ? language : 'en');
  if (kind === 'hello') return labels[locale][0];
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const options = kind === 'date' ? {weekday:'long',year:'numeric',month:'long',day:'numeric'} : {hour:'2-digit',minute:'2-digit',timeZoneName:'short'};
  return labels[locale][kind === 'date' ? 1 : 2].replace('{value}', new Intl.DateTimeFormat(locale, options).format(now));
}
