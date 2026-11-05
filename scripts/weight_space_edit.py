"""Apply a bounded, gradient-free weight edit to a new safetensors checkpoint.

This worker accepts data-only plans; it never executes code supplied by a model.
The caller must validate paths and provide separate source and destination folders.
It does not generate a GGUF, run an evaluator, or claim an edit improves a model.
"""
import argparse
import json
import math
import os
import shutil
import tempfile
from pathlib import Path

MAX_EDITED_VALUES = 1_000_000
MAX_OPERATIONS = 16


def parse_model_plan(text, tensors):
    """Parse data only; a model response is never executed as code."""
    if not isinstance(text, str) or len(text.encode("utf-8")) > 1_000_000:
        raise ValueError("Invalid proposal size")
    try:
        plan = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("Proposal must be JSON") from exc
    validate_plan(plan, tensors)
    return plan


def validate_plan(plan, tensors):
    operations = plan.get('operations') if isinstance(plan, dict) else None
    if not isinstance(operations, list) or not 1 <= len(operations) <= MAX_OPERATIONS:
        raise ValueError('A plan must contain 1 to 16 operations')
    total = 0
    for op in operations:
        if not isinstance(op, dict) or op.get('type') not in ('scale_columns', 'remove_projection'):
            raise ValueError('Unsupported operation')
        name, columns, factor = op.get('tensor'), op.get('columns'), op.get('factor')
        if not isinstance(name, str) or name not in tensors or not name.endswith('.mlp.down_proj.weight'):
            raise ValueError('Choose an existing MLP down-projection weight')
        shape = tensors[name]
        if len(shape) != 2 or not isinstance(columns, list) or not columns:
            raise ValueError('A two-dimensional weight and nonempty column list are required')
        if any(type(index) is not int or index < 0 or index >= shape[1] for index in columns) or len(set(columns)) != len(columns):
            raise ValueError('Column indices must be distinct and in range')
        if op['type'] == 'scale_columns':
            if isinstance(factor, bool) or not isinstance(factor, (int, float)) or not math.isfinite(factor) or not 0.5 <= factor <= 1.5:
                raise ValueError('Scale must be finite and between 0.5 and 1.5')
        else:
            direction, strength = op.get('direction'), op.get('strength')
            if not isinstance(direction, list) or len(direction) != shape[0] or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or abs(x) > 1 for x in direction):
                raise ValueError('Direction must contain one finite bounded value per output dimension')
            if not any(direction) or isinstance(strength, bool) or not isinstance(strength, (int, float)) or not math.isfinite(strength) or not 0 <= strength <= 1:
                raise ValueError('Direction must be nonzero and strength between 0 and 1')
        total += shape[0] * len(columns)
    if total > MAX_EDITED_VALUES:
        raise ValueError('Plan edits too many values')
    return total


def apply_edits(source, destination, plan):
    import torch
    from safetensors import safe_open
    from safetensors.torch import save_file

    source = Path(source).resolve(strict=True)
    destination = Path(destination).absolute()
    if destination.parent.exists():
        destination = destination.parent.resolve(strict=True) / destination.name
    if not source.is_dir() or destination.exists() or source == destination or source in destination.parents:
        raise ValueError('Choose a new destination outside the original checkpoint')
    shards = sorted(source.glob('*.safetensors'))
    if not shards:
        raise ValueError('Source has no safetensors weights')
    if any(path.is_symlink() for path in source.iterdir()):
        raise ValueError('Symbolic links are not supported in source checkpoint')
    tensors, owners = {}, {}
    for shard in shards:
        with safe_open(shard, framework='pt', device='cpu') as reader:
            for name in reader.keys():
                if name in tensors:
                    raise ValueError('Duplicate tensor name across shards')
                tensors[name] = reader.get_slice(name).get_shape()
                owners[name] = shard.name
    count = validate_plan(plan, tensors)
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.weight-edit-', dir=destination.parent))
    try:
        for source_file in source.iterdir():
            if source_file.is_file() and source_file.suffix != '.safetensors':
                shutil.copy2(source_file, stage / source_file.name)
        for shard in shards:
            relevant = [op for op in plan['operations'] if owners[op['tensor']] == shard.name]
            if not relevant:
                shutil.copy2(shard, stage / shard.name)
                continue
            with safe_open(shard, framework='pt', device='cpu') as reader:
                metadata = reader.metadata()
                values = {name: reader.get_tensor(name).clone() for name in reader.keys()}
            with torch.no_grad():
                for op in relevant:
                    tensor = values[op['tensor']]
                    if not tensor.is_floating_point():
                        raise ValueError('Only floating-point weights can be edited')
                    if op['type'] == 'scale_columns':
                        tensor[:, op['columns']] *= float(op['factor'])
                    else:
                        direction = torch.tensor(op['direction'], dtype=torch.float32)
                        direction /= torch.linalg.vector_norm(direction)
                        block = tensor[:, op['columns']].float()
                        block -= float(op['strength']) * direction[:, None] * (direction @ block)[None, :]
                        tensor[:, op['columns']] = block.to(tensor.dtype)
                    if not torch.isfinite(tensor).all():
                        raise ValueError('Edit produced non-finite values')
            save_file(values, str(stage / shard.name), metadata=metadata)
        (stage / 'weight-edit-plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
        # Reserve the name atomically, so an existing result is never replaced.
        destination.mkdir(exist_ok=False)
        for artifact in stage.iterdir():
            os.rename(artifact, destination / artifact.name)
        stage.rmdir()
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return {'edited_values': count, 'operations': len(plan['operations'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--destination', required=True)
    parser.add_argument('--plan', required=True)
    args = parser.parse_args()
    plan = json.loads(Path(args.plan).read_text(encoding='utf-8'))
    print(json.dumps(apply_edits(args.source, args.destination, plan)))


if __name__ == '__main__':
    main()
