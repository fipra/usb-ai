import unittest
from weight_space_experiment import validate_sets

class DataSeparationTests(unittest.TestCase):
    def test_test_questions_are_not_used_for_teacher_calibration(self):
        validate_sets([{'question':'Question one'}],[{'question':'Question two'}])
        with self.assertRaises(ValueError):
            validate_sets([{'question':'  Question ONE. '}],[{'question':'question one'}])

class OrchestrationTests(unittest.TestCase):
    def test_workflow_keeps_test_questions_out_of_teacher_prompt(self):
        import json
        import sys
        import tempfile
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import patch
        import weight_space_experiment as experiment
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('small.gguf', 'large.gguf'):
                (root / name).write_bytes(b'GGUFfixture')
            (root / 'cal.json').write_text(json.dumps([{'question':'calibration', 'answers':['ok']}]))
            (root / 'test.json').write_text(json.dumps([{'question':'unseen secret', 'answers':['ok']}]))
            teacher_prompts = []
            tensor = 'model.layers.0.mlp.down_proj.weight'
            plan = {'operations':[{'type':'scale_columns','tensor':tensor,'columns':[0],'factor':1.0}]}
            def fake_run(command, **kwargs):
                if '--output' in command and 'gguf_prepare.py' in command[1]: Path(command[command.index('--output')+1]).mkdir()
                if '--outfile' in command: Path(command[command.index('--outfile')+1]).write_bytes(b'GGUFfloat')
                if command[0] == 'quantizer': Path(command[2]).write_bytes(b'GGUFquant')
                return SimpleNamespace(returncode=0)
            def fake_cli(exe, model, prompt, gpu, tokens):
                if str(model).endswith('large.gguf'):
                    teacher_prompts.append(prompt)
                    return json.dumps(plan)
                return 'ok'
            argv = ['experiment', '--original',str(root/'small.gguf'), '--teacher',str(root/'large.gguf'), '--calibration',str(root/'cal.json'), '--test',str(root/'test.json'), '--output',str(root/'out'), '--converter','converter.py', '--quantize','quantizer']
            with patch.object(sys,'argv',argv), patch.object(experiment.subprocess,'run',side_effect=fake_run), patch.object(experiment,'run_cli',side_effect=fake_cli), patch.object(experiment,'tensor_summary',return_value=({tensor:[2,2]},[])), patch.object(experiment,'apply_edits',return_value={'edited_values':2}):
                experiment.main()
            self.assertNotIn('unseen secret', teacher_prompts[0])
            self.assertIn('calibration', teacher_prompts[0])
            self.assertEqual(json.loads((root/'out/report.json').read_text())['control_vs_candidate']['total'], 1)

if __name__ == '__main__': unittest.main()
