import tempfile
import importlib.util
import unittest
from pathlib import Path
from weight_space_edit import apply_edits, validate_plan, parse_model_plan

class WeightEditTests(unittest.TestCase):
    def test_model_output_is_data_and_not_code(self):
        with self.assertRaises(ValueError):
            parse_model_plan("__import__(\"os\").system(\"echo bad\")", {})

    def test_rejects_unbounded_or_untrusted_plans(self):
        shape = {'model.layers.0.mlp.down_proj.weight': [4, 6]}
        op = {'type':'scale_columns','tensor':next(iter(shape)),'columns':[1], 'factor':1.1}
        self.assertEqual(validate_plan({'operations':[op]}, shape), 4)
        for change in ({'factor':float('nan')}, {'factor':3}, {'columns':[6]}, {'type':'execute'}, {'tensor':'model.embed.weight'}):
            with self.assertRaises(ValueError):
                validate_plan({'operations':[{**op, **change}]}, shape)

    @unittest.skipUnless(importlib.util.find_spec("torch") and importlib.util.find_spec("safetensors"), "requires PyTorch and safetensors")
    def test_projection_removes_only_the_chosen_direction_and_columns(self):
        import torch
        from safetensors.torch import save_file, load_file
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'source'; source.mkdir()
            name = 'model.layers.0.mlp.down_proj.weight'
            original = torch.tensor([[2., 3.], [4., 5.]])
            save_file({name: original}, str(source / 'model.safetensors'))
            plan = {'operations':[{'type':'remove_projection','tensor':name,'columns':[0], 'direction':[1., 0.], 'strength':1.}]}
            apply_edits(source, root / 'out', plan)
            result = load_file(str(root / 'out/model.safetensors'))[name]
            self.assertTrue(torch.equal(result, torch.tensor([[0., 3.], [4., 5.]])))
            self.assertTrue(torch.equal(load_file(str(source / 'model.safetensors'))[name], original))

    @unittest.skipUnless(importlib.util.find_spec("torch") and importlib.util.find_spec("safetensors"), "requires PyTorch and safetensors")
    def test_edits_a_new_copy_without_touching_source(self):
        import torch
        from safetensors.torch import save_file, load_file
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'source'; source.mkdir()
            name='model.layers.0.mlp.down_proj.weight'
            original=torch.arange(24,dtype=torch.float32).reshape(4,6)
            save_file({name:original}, str(source/'model.safetensors'))
            (source/'config.json').write_text('{}')
            plan={'operations':[{'type':'scale_columns','tensor':name,'columns':[1,3],'factor':0.5}]}
            self.assertEqual(apply_edits(source, root/'result', plan)['edited_values'], 8)
            self.assertTrue(torch.equal(load_file(str(source/'model.safetensors'))[name],original))
            expected=original.clone(); expected[:,[1,3]] *= 0.5
            self.assertTrue(torch.equal(load_file(str(root/'result/model.safetensors'))[name],expected))
            with self.assertRaises(ValueError): apply_edits(source, root/'result', plan)

if __name__ == '__main__': unittest.main()
