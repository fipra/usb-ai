#!/usr/bin/env python3
"""Compare local llama-server generation with and without LlamaNest speed flags."""
import argparse
import json
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

PROMPT = "Explain why measuring inference speed requires controlling the model, prompt, context, and hardware."


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_ready(process, address):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"llama-server exited with status {process.returncode}")
        try:
            with urllib.request.urlopen(f"{address}/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.25)
    raise TimeoutError("llama-server health check timed out")


def run(server, model, speed, context):
    help_result = subprocess.run([str(server), "--help"], capture_output=True, text=True)
    help_text = help_result.stdout + help_result.stderr
    args = [str(server), "--host", "127.0.0.1", "--port", str(port()), "-m", str(model), "-c", str(context), "--no-webui"]
    if speed:
        if "-ngl" in help_text or "--gpu-layers" in help_text:
            args += ["-ngl", "999"]
        if "--parallel" in help_text:
            args += ["-np", "1"]
        if "--flash-attn" in help_text:
            args += ["-fa", "on"]
        if "--spec-type" in help_text:
            args += ["--spec-type", "ngram-simple"]
    address = f"http://127.0.0.1:{args[args.index('--port') + 1]}"
    with open(f"benchmark-speed-{'on' if speed else 'off'}.log", "w", encoding="utf-8") as log:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log)
        try:
            wait_ready(process, address)
            payload = json.dumps({"prompt": PROMPT, "n_predict": 128, "temperature": 0, "stream": False}).encode()
            request = urllib.request.Request(f"{address}/completion", data=payload, headers={"Content-Type": "application/json"})
            started = time.perf_counter()
            with urllib.request.urlopen(request, timeout=600) as response:
                result = json.load(response)
            elapsed = time.perf_counter() - started
            timings = result.get("timings", {})
            print(json.dumps({"mode": "on" if speed else "off", "elapsedSeconds": round(elapsed, 3),
                              "tokensPerSecond": timings.get("predicted_per_second"),
                              "outputTokens": timings.get("predicted_n"), "log": f"benchmark-speed-{'on' if speed else 'off'}.log"}))
        finally:
            process.terminate()
            process.wait(timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("--server", type=Path, default=Path("llama-server"))
    parser.add_argument("--context", type=int, default=8192)
    args = parser.parse_args()
    if not args.model.is_file():
        parser.error("model file does not exist")
    for enabled in (False, True):
        run(args.server, args.model, enabled, min(args.context, 8192))


if __name__ == "__main__":
    main()
