import unittest
from weight_space_evaluate import compare, normalize

class EvaluationTests(unittest.TestCase):
    def test_exact_match_compares_same_question_for_each_model(self):
        calls=[]
        def generate(model, question):
            calls.append((model, question)); return ' Roma. ' if model == 'original' else 'Milano'
        report=compare([{'question':'Capitale?', 'answers':['Roma']}], generate)
        self.assertEqual(calls, [('original','Capitale?'), ('candidate','Capitale?')])
        self.assertEqual((report['original_correct'], report['candidate_correct'], report['total']), (1,0,1))
        self.assertEqual(normalize('  ROMA.  '), 'roma')

if __name__ == '__main__': unittest.main()
