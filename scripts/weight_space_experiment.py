"""Run a local, gradient-free weight-edit experiment on a copy of a GGUF.

CLI prototype only: caller supplies a compatible converter and two labeled,
disjoint datasets. It does not connect to the LlamaNest interface yet.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

from weight_space_edit import apply_edits
from weight_space_evaluate import compare, read_cases, normalize
from weight_space_teacher import tensor_summary, propose


def run_cli(executable, model, prompt, gpu_layers, tokens):
    device = ['--device', 'none'] if gpu_layers == 0 else []
    cmd = [executable, '-m', str(model), '-ngl', str(gpu_layers), *device, '-p', prompt,
           '--temp', '0', '-n', str(tokens), '--no-display-prompt',
           '--single-turn', '--simple-io']
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1200, check=False)
    if result.returncode != 0:
        raise RuntimeError('Model inference failed; check the selected GGUF and runtime')
    return result.stdout.replace('[end of text]', '').strip()


def validate_sets(calibration, test):
    overlap = {normalize(c['question']) for c in calibration} & {normalize(c['question']) for c in test}
    if overlap:
        raise ValueError('Calibration and test questions must be distinct')


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--objective', default='', help='Desired behavior for the teacher proposal')
    parser.add_argument('--original', required=True, help='Original small GGUF, never modified')
    parser.add_argument('--teacher', required=True, help='Large GGUF for proposing a plan')
    parser.add_argument('--calibration', required=True, help='JSON questions and accepted answers for proposing edits')
    parser.add_argument('--test', required=True, help='Separate JSON questions and accepted answers for evaluation')
    parser.add_argument('--output', required=True, help='New experiment directory')
    parser.add_argument('--converter', required=True, help='llama.cpp convert_hf_to_gguf.py')
    parser.add_argument('--llama-cli', default='llama-cli')
    parser.add_argument('--quantize', default='llama-quantize')
    parser.add_argument('--gpu-layers', type=int, default=999)
    args = parser.parse_args()
    original = Path(args.original).resolve(strict=True)
    teacher = Path(args.teacher).resolve(strict=True)
    output = Path(args.output).absolute()
    if not original.is_file() or not teacher.is_file() or original == teacher:
        raise ValueError('Choose two different GGUF files')
    for path in (original, teacher):
        with path.open('rb') as stream:
            if stream.read(4) != b'GGUF':
                raise ValueError('Both models must be GGUF files')
    calibration, tests = read_cases(args.calibration), read_cases(args.test)
    validate_sets(calibration, tests)
    output.mkdir(parents=True, exist_ok=False)
    env = dict(os.environ, USE_TF='0')
    base = output / 'original-weights'
    print('Preparing a separate copy of the small model...', flush=True)
    subprocess.run([sys.executable, str(Path(__file__).with_name('gguf_prepare.py')),
                    '--source', str(original), '--output', str(base)], check=True, env=env)
    print('Evaluating calibration questions...', flush=True)
    evidence = []
    for item in calibration:
        answer = run_cli(args.llama_cli, original, item['question'], args.gpu_layers, 64)
        evidence.append({'question':item['question'], 'answer':answer, 'accepted_answers':item['answers']})
    print('Collecting weight statistics and loading the analyst model...', flush=True)
    tensors, summary = tensor_summary(base)
    def save_response(attempt, response):
        (output / f'analyst-response-{attempt}.txt').write_text(response, encoding='utf-8')
    plan = propose(summary, evidence, lambda prompt: run_cli(args.llama_cli, teacher, prompt, args.gpu_layers, 2048), tensors, args.objective, save_response)
    (output / 'proposal.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Applying the validated proposal to a copy...', flush=True)
    edited = output / 'edited-weights'
    edit_info = apply_edits(base, edited, plan)
    def export(weights, label):
        f16, gguf = output / (label + '-f16.gguf'), output / (label + '-q4.gguf')
        subprocess.run([sys.executable, args.converter, str(weights), '--outfile', str(f16), '--outtype', 'f16'], check=True, env=env)
        subprocess.run([args.quantize, str(f16), str(gguf), 'Q4_K_M'], check=True)
        with gguf.open('rb') as stream:
            if stream.read(4) != b'GGUF':
                raise ValueError('Export did not produce a GGUF')
        return gguf
    # Both the unedited control and candidate undergo the same conversion. This
    # distinguishes a weight-edit effect from round-trip quantization changes.
    print('Creating control and candidate GGUF files...', flush=True)
    control = export(base, 'control')
    candidate = export(edited, 'candidate')
    print('Comparing models on held-out questions...', flush=True)
    results = compare(tests, lambda which, question: run_cli(args.llama_cli, control if which == 'original' else candidate, question, args.gpu_layers, 64))
    roundtrip = compare(tests, lambda which, question: run_cli(args.llama_cli, original if which == 'original' else control, question, args.gpu_layers, 64))
    report = {'objective':args.objective, 'original_sha256':digest(original), 'control_sha256':digest(control), 'candidate_sha256':digest(candidate),
              'edit':edit_info, 'control_vs_candidate':results, 'original_vs_control':roundtrip,
              'warning':'Exact-match scoring is limited; review every answer.'}
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
