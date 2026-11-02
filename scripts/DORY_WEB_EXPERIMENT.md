# Dory Web experiment

This separate browser build uses the wllama WebGPU/JSPI binding from the existing Prism WebGPU build and a custom WebAssembly runtime. It is experimental; GPU execution and speed must be checked on the target browser.

The runtime is based on PrismML-Eng/llama.cpp commit `5628c73`, with Dory changes from ggml-org/llama.cpp PR 30306 backported and adjusted for that base. `dory-webgpu-runtime.patch` contains the actual C++ and shader changes used in the build; `dory-webgpu-runtime.zip` contains the generated worker, binding and WebAssembly. Build with the project's wllama CMake setup, `WLLAMA_COMPAT=OFF`, WebGPU enabled, emdawnwebgpu and Emscripten 4.0.20 or compatible.

The exact Dory1.0-4B-Q4_K_M-noimat.gguf file was verified on native CPU with a short generation. This is not proof that the WebGPU backend is correct or fast. The Dory support PR was open when this experiment was built. NVIDIA distributes Dory separately under the OpenMDW license; this project does not bundle model weights.
