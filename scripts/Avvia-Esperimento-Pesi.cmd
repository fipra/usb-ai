@echo off
setlocal
set "EXPERIMENT_DIR=%~dp0bin\weight-experiment"
set "EXPERIMENT_PYTHON=%~dp0PocketAI-data\cuda-venv\Scripts\python.exe"
if not exist "%EXPERIMENT_DIR%\weight_space_gui.py" (
  echo Weight experiment files are missing. Extract the complete package.
  pause
  exit /b 1
)
if exist "%EXPERIMENT_PYTHON%" (
  "%EXPERIMENT_PYTHON%" "%EXPERIMENT_DIR%\weight_space_gui.py"
) else (
  py -3 "%EXPERIMENT_DIR%\weight_space_gui.py"
)
if errorlevel 1 (
  echo The experiment requires Python with tkinter, PyTorch, transformers, gguf and safetensors.
  pause
)
endlocal
