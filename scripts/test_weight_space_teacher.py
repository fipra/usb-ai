import unittest
from weight_space_teacher import extract_json, propose

class TeacherTests(unittest.TestCase):
    def test_objective_reaches_teacher(self):
        name = 'model.layers.0.mlp.down_proj.weight'
        plan = '{"operations":[{"type":"scale_columns","tensor":"' + name + '","columns":[0],"factor":1.0}]}'
        prompts = []
        propose([], [], lambda prompt: prompts.append(prompt) or plan, {name: [2, 3]}, 'Riduci le risposte inventate')
        self.assertIn('Riduci le risposte inventate', prompts[0])
        with self.assertRaises(ValueError):
            propose([], [], lambda _: plan, {name: [2, 3]}, 'x' * 4001)

    def test_json_plan_is_validated_and_code_is_rejected(self):
        name='model.layers.0.mlp.down_proj.weight'
        valid='{"operations":[{"type":"scale_columns","tensor":"'+name+'","columns":[1],"factor":0.9}]}'
        self.assertEqual(propose([], [], lambda _: valid, {name:[2,3]})['operations'][0]['columns'], [1])
        self.assertEqual(extract_json('```json\n'+valid+'\n```'),valid)
        with self.assertRaises(ValueError): propose([], [], lambda _: '__import__("os")', {name:[2,3]})
        with self.assertRaises(ValueError): propose([], [], lambda _: valid, {name:[2,1]})

if __name__ == '__main__': unittest.main()
