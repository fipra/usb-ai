(function () {
  'use strict';
  const labels = {
    en: ['Thinking', 'Input', 'Output', 'tokens/s', 'GPU layers'],
    it: ['Ragionamento', 'Input', 'Output', 'token/s', 'Layer GPU'],
    fr: ['Raisonnement', 'Entrée', 'Sortie', 'jetons/s', 'Couches GPU'],
    de: ['Gedankengang', 'Eingabe', 'Ausgabe', 'Token/s', 'GPU-Layer'],
    es: ['Razonamiento', 'Entrada', 'Salida', 'tokens/s', 'Capas GPU']
  };
  function splitThinking(text) {
    let value = String(text || '');
    const first = /<\/?think>/i.exec(value);
    if (first && /^<\/think>$/i.test(first[0])) value = '<think>' + value;
    const parts = value.split(/(<\/?think>)/gi);
    let inside = false, answer = '', thinking = '';
    for (const part of parts) {
      if (/^<think>$/i.test(part)) inside = true;
      else if (/^<\/think>$/i.test(part)) inside = false;
      else if (inside) thinking += part;
      else answer += part;
    }
    answer = answer.replace(/<t(?:h(?:i(?:n(?:k)?)?)?)?$/i, '').replace(/<$/,'');
    return { answer: answer.trim(), thinking: thinking.trim() };
  }
  function render(container, message, language, showThinking) {
    const [thinkLabel, inputLabel, outputLabel, speedLabel] = labels[language] || labels.en;
    const { answer, thinking } = splitThinking(message.text);
    container.replaceChildren();
    if (showThinking && thinking) {
      const detail = document.createElement('details');
      detail.className = 'thinking-detail';
      const summary = document.createElement('summary');
      summary.textContent = thinkLabel;
      const text = document.createElement('div');
      text.className = 'thinking-text';
      text.textContent = thinking;
      detail.append(summary, text);
      container.append(detail);
    }
    const body = document.createElement('div');
    body.className = 'message-body';
    window.USB_AI_CODE_VIEW.render(body, answer, language);
    container.append(body);
    const usage = message.usage;
    if (Number.isFinite(usage?.inputTokens) && Number.isFinite(usage?.outputTokens)) {
      const meta = document.createElement('div');
      meta.className = 'message-usage';
      const speed = Number.isFinite(usage.tokensPerSecond) ? ` · ${usage.tokensPerSecond.toFixed(1)} ${speedLabel}` : '';
      const gpu = usage.gpuLayers ? ` · ${labels[language]?.[4] || 'GPU layers'} ${usage.gpuLayers}` : '';
      meta.textContent = `${inputLabel} ${usage.inputTokens} · ${outputLabel} ${usage.outputTokens}${speed}${gpu}`;
      container.append(meta);
    }
  }
  function streamRenderer(container, message, language, showThinking, scrollContainer) {
    let frame = null;
    const paint = () => {
      frame = null;
      render(container, message, language, showThinking);
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };
    return {
      update() { if (frame === null) frame = requestAnimationFrame(paint); },
      flush() { if (frame !== null) cancelAnimationFrame(frame); paint(); }
    };
  }
  function correctionText(messages, index, language) {
    const answer = splitThinking(messages[index]?.text).answer;
    const question = messages.slice(0, index).reverse().find(message => message.role === 'user' && message.text?.trim())?.text.trim();
    if (!question) return answer;
    const labels = { en: ['Question', 'Corrected answer'], it: ['Domanda', 'Risposta corretta'], fr: ['Question', 'Réponse corrigée'], de: ['Frage', 'Korrigierte Antwort'], es: ['Pregunta', 'Respuesta corregida'] };
    const [questionLabel, answerLabel] = labels[language] || labels.en;
    return `${questionLabel}: ${question}\n\n${answerLabel}: ${answer}`;
  }
  window.USB_AI_RESPONSE_VIEW = { splitThinking, render, streamRenderer, correctionText };
})();
