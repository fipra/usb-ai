"""Compare two GGUF models on a fixed, locally supplied factual test set.

Exact-match scoring is deliberately narrow and requires human-authored accepted
answers. It is not a general hallucination or intelligence benchmark.
"""
import argparse
import json
import re
import subprocess
import unicodedata
from pathlib import Path


def normalize(text):
    text = unicodedata.normalize('NFKC', text).casefold().strip()
    return re.sub(r'\s+', ' ', text).strip(' \t\r\n.,!?;:')


def read_cases(path):
    cases = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(cases, list) or not 1 <= len(cases) <= 100:
        raise ValueError('Provide 1–100 labeled questions')
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get('question'), str) or not case['question'].strip() or len(case['question']) > 2000:
            raise ValueError('Invalid question')
        answers = case.get('answers')
        if not isinstance(answers, list) or not 1 <= len(answers) <= 10 or any(not isinstance(a, str) or not normalize(a) or len(a) > 500 for a in answers):
            raise ValueError('Each question needs accepted answers')
    return cases


def compare(cases, generate):
    rows = []
    for case in cases:
        responses = [generate(version, case['question']) for version in ('original', 'candidate')]
        accepted = {normalize(a) for a in case['answers']}
        rows.append({'question': case['question'], 'answers': case['answers'],
                     'original': responses[0], 'candidate': responses[1],
                     'original_correct': normalize(responses[0]) in accepted,
                     'candidate_correct': normalize(responses[1]) in accepted})
    return {'cases': rows, 'original_correct': sum(row['original_correct'] for row in rows),
            'candidate_correct': sum(row['candidate_correct'] for row in rows), 'total': len(rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--cases', required=True)
    parser.add_argument('--llama-cli', default='llama-cli')
    args = parser.parse_args()
    paths = {'original': args.original, 'candidate': args.candidate}
    def generate(version, question):
        result = subprocess.run([args.llama_cli, '-m', paths[version], '--device', 'none', '-ngl', '0', '-p', question,
                                 '--temp', '0', '-n', '64', '--no-display-prompt',
                                 '--single-turn', '--simple-io'], capture_output=True,
                                text=True, encoding='utf-8', errors='replace', timeout=300, check=False)
        if result.returncode != 0:
            raise RuntimeError('Model inference failed; check the selected GGUF and runtime')
        return result.stdout.replace('[end of text]', '').strip()
    print(json.dumps(compare(read_cases(args.cases), generate), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
