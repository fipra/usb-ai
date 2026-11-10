"""Exercise the Prism-only package's MLX model selection without loading weights."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

package = Path(sys.argv[1]).resolve()
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix="llamanest-prism-mlx-test-") as temp:
    root = Path(temp)
    (root / "bin").symlink_to(package / "bin", target_is_directory=True)
    (root / "lib").symlink_to(package / "lib", target_is_directory=True)
    (root / "PRISM_ONLY").touch()
    model = root / "models" / "Qwen3.5-0.8B-Astra-WeightEdit"
    model.mkdir(parents=True)
    for name in ("model.safetensors-00001-of-00001.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json"):
        (model / name).write_text("fixture")
    env = dict(os.environ, USB_AI_DIR=str(root), POCKET_AI_HOME=str(root / "data"),
               USB_AI_ASTRA_SERVER=str(package / "bin/astra-safetensors-server.py"),
               USB_AI_ASTRA_PYTHON=sys.executable)
    server = subprocess.Popen([str(package / "bin/usb-ai-rust")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = "http://127.0.0.1:48157"
        for _ in range(100):
            try:
                with http.open(base + "/", timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None:
                    raise RuntimeError("Application exited at startup")
                time.sleep(.2)
        else:
            raise RuntimeError("Application did not start")

        def api(action, **values):
            request = urllib.request.Request(base + "/api", data=json.dumps({"action": action, **values}).encode(),
                headers={"Origin": base, "Content-Type": "application/json"})
            with http.open(request, timeout=10) as response:
                return json.load(response)

        state = api("state")
        assert state["prismAvailable"] and state["mlxAvailable"]
        assert "Qwen3.5-0.8B-Astra-WeightEdit.safetensors" in state["models"]
        state = api("select-model", name="Qwen3.5-0.8B-Astra-WeightEdit.safetensors")
        assert state["inferenceEngine"] == "mlx"
        try:
            api("set-inference-engine", engine="prism")
        except urllib.error.HTTPError:
            pass
        else:
            raise AssertionError("A Safetensors model must not route to PrismML")
        print("PrismML and MLX choices are available; Astra selects MLX.")
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
