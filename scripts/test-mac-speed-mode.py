#!/usr/bin/env python3
"""Smoke-test Apple Silicon Metal inference with the speed-mode server flags."""
import json
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def main():
    server, model = map(Path, sys.argv[1:3])
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    log = Path("speed-mode-metal-smoke.log")
    command = [str(server), "--host", "127.0.0.1", "--port", str(port),
               "-m", str(model), "-c", "1024", "--no-webui",
               "-ngl", "999", "-np", "1", "-fa", "on"]
    with log.open("w", encoding="utf-8") as output:
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=output)
        try:
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"llama-server exited with {process.returncode}")
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as response:
                        if response.status == 200:
                            break
                except Exception:
                    time.sleep(.25)
            else:
                raise TimeoutError("Metal llama-server did not become ready")
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/completion",
                data=json.dumps({"prompt": "Say hello briefly.", "n_predict": 32,
                                 "temperature": 0, "stream": False}).encode(),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=60) as response:
                result = json.load(response)
            if not result.get("content") or not result.get("timings", {}).get("predicted_n"):
                raise RuntimeError(f"llama-server returned no generated tokens: {result}")
            text = log.read_text(errors="replace")
            errors = ("failed to initialize MTL", "failed to build 'unary'", "failed to create_context")
            if "using embedded metal library" not in text:
                raise RuntimeError("llama-server did not load the embedded Metal library")
            if any(error in text for error in errors):
                raise RuntimeError("Metal backend emitted initialization errors")
            print(json.dumps({"metalSmokeTest": "passed",
                              "outputTokens": result["timings"]["predicted_n"],
                              "tokensPerSecond": result["timings"].get("predicted_per_second")}))
        except Exception:
            print(log.read_text(errors="replace")[-12000:], file=sys.stderr)
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    main()
