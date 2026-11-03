import test from 'node:test';
import assert from 'node:assert/strict';
import { relevantMemories, memoryContext, memoryMarkdown, parseMemoryMarkdown, rememberRequest, memoryCommand, identityMemoryNotes } from '../memory.js';

test('memory uses only relevant confirmed notes and keeps the prompt short', () => {
  const notes = [
    { id:'a', text:'For project Atlas, reports use Swiss francs.', updated:1 },
    { id:'b', text:'The cat is called Luna.', updated:2 },
    { id:'c', text:'Atlas dates use day-month-year format.', updated:3 },
  ];
  assert.deepEqual(relevantMemories('Prepare an Atlas report', notes).map(item => item.id), ['c', 'a']);
  assert.match(memoryContext('Prepare an Atlas report', notes), /Swiss francs/);
  assert.doesNotMatch(memoryContext('Prepare an Atlas report', notes), /Luna/);
  assert.equal(memoryContext('Unrelated question', notes), '');
  assert.match(memoryMarkdown(notes), /^# LlamaNest memory/m);
  assert.deepEqual(parseMemoryMarkdown(memoryMarkdown(notes)), notes.map(note => note.text));
});

test('explicit remember requests open a note instead of reaching the model', () => {
  assert.equal(rememberRequest('Il gatto si chiama Luna, ricorda questa cosa'), 'Il gatto si chiama Luna');
  assert.equal(rememberRequest('Remember that the cat is called Luna.'), 'the cat is called Luna');
  assert.equal(rememberRequest('Le chat s’appelle Luna, retiens ceci.'), 'Le chat s’appelle Luna');
  assert.equal(rememberRequest('Die Katze heißt Luna, merke dir das.'), 'Die Katze heißt Luna');
  assert.equal(rememberRequest('El gato se llama Luna, recuerda esto.'), 'El gato se llama Luna');
  assert.equal(rememberRequest('Come si chiama il gatto?'), null);
  assert.equal(rememberRequest('Ricorda questa cosa'), null);
});

test('slash memory command works in every interface language', () => {
  assert.equal(memoryCommand('/salva Il gatto si chiama Luna'), 'Il gatto si chiama Luna');
  assert.equal(memoryCommand('Il gatto si chiama Luna /salva'), 'Il gatto si chiama Luna');
  assert.equal(memoryCommand('/salva'), '');
  assert.equal(memoryCommand('/save The cat is called Luna'), 'The cat is called Luna');
  assert.equal(memoryCommand('The cat is called Luna /save'), 'The cat is called Luna');
  assert.equal(memoryCommand('/salvare qualcosa'), null);
  assert.equal(memoryCommand('Come salvo una nota?'), null);
});

test('a saved fact is available when the follow-up names its subject', () => {
  const note = memoryCommand('Nora Rossi vive a Roma /salva');
  assert.match(memoryContext('Chi è Nora Rossi?', [{ id:'nora', text:note, updated:1 }]), /Nora Rossi vive a Roma/);
  assert.deepEqual(identityMemoryNotes('Chi è Nora Rossi?', [{ id:'nora', text:note, updated:1 }]).map(item => item.text), [note]);
  assert.deepEqual(identityMemoryNotes('Chi è Nora?', [{ id:'nora', text:note, updated:1 }]), []);
  assert.deepEqual(identityMemoryNotes('Chi è Luca Bianchi?', [{ id:'nora', text:note, updated:1 }]), []);
});


test('a longer corrected response is available in full and survives memory export', () => {
  const note = { id:'long', text: 'Atlas ' + 'a'.repeat(900) + ' correzione finale', updated:1 };
  assert.match(memoryContext('Atlas', [note], 16000), /correzione finale/);
  assert.doesNotMatch(memoryContext('Atlas', [note]), /correzione finale/);
  assert.deepEqual(parseMemoryMarkdown(memoryMarkdown([note]), 16000), [note.text]);
  assert.deepEqual(parseMemoryMarkdown(memoryMarkdown([note])), []);
});
