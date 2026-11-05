"""Standalone local Windows interface for the experimental weight editor."""
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

TEXT = {
 'it': ['Esperimento pesi · Windows','Modifica diretta senza fine-tuning. La chat resta separata. I dati rimangono locali.','Modello piccolo GGUF','Modello grande GGUF','Domande di analisi JSON','Domande di verifica JSON','Convertitore Hugging Face → GGUF','llama-cli con GPU','llama-quantize','Cartella dei risultati (nuova)','Sfoglia','Avvia esperimento','Interrompi','Stato','Pronto','In corso…','Terminato. Controlla report.json e la qualità delle risposte.','Errore: controlla il log.','Scegli tutti i file e una nuova cartella.','Il modello grande è caricato in un processo separato durante l’analisi. Questa funzione non garantisce miglioramenti.'],
 'en': ['Weight experiment · Windows','Direct weight edits without fine-tuning. Chat stays separate. Data stays local.','Small GGUF model','Large GGUF model','Calibration questions JSON','Test questions JSON','Hugging Face → GGUF converter','llama-cli with GPU','llama-quantize','Results folder (new)','Browse','Start experiment','Stop','Status','Ready','Running…','Finished. Review report.json and answer quality.','Error: check the log.','Choose all files and a new folder.','The large model runs in a separate process during analysis. Improvement is not guaranteed.'],
 'de': ['Gewichtsexperiment · Windows','Direkte Gewichtsänderung ohne Fine-Tuning. Der Chat bleibt getrennt. Daten bleiben lokal.','Kleines GGUF-Modell','Großes GGUF-Modell','Analysefragen JSON','Testfragen JSON','Hugging Face → GGUF Konverter','llama-cli mit GPU','llama-quantize','Ergebnisordner (neu)','Auswählen','Experiment starten','Stoppen','Status','Bereit','Läuft…','Fertig. report.json und Antwortqualität prüfen.','Fehler: Protokoll prüfen.','Alle Dateien und einen neuen Ordner wählen.','Das große Modell läuft während der Analyse separat. Eine Verbesserung ist nicht garantiert.'],
 'fr': ['Expérience des poids · Windows','Modification directe sans fine-tuning. Le chat reste séparé. Les données restent locales.','Petit modèle GGUF','Grand modèle GGUF','Questions d’analyse JSON','Questions de test JSON','Convertisseur Hugging Face → GGUF','llama-cli avec GPU','llama-quantize','Dossier des résultats (nouveau)','Parcourir','Lancer l’expérience','Arrêter','Statut','Prêt','En cours…','Terminé. Vérifiez report.json et les réponses.','Erreur : consultez le journal.','Choisissez tous les fichiers et un nouveau dossier.','Le grand modèle fonctionne dans un processus séparé pendant l’analyse. Une amélioration n’est pas garantie.'],
 'es': ['Experimento de pesos · Windows','Edición directa sin ajuste fino. El chat queda separado. Los datos permanecen locales.','Modelo pequeño GGUF','Modelo grande GGUF','Preguntas de análisis JSON','Preguntas de prueba JSON','Conversor Hugging Face → GGUF','llama-cli con GPU','llama-quantize','Carpeta de resultados (nueva)','Examinar','Iniciar experimento','Detener','Estado','Listo','En curso…','Terminado. Revisa report.json y las respuestas.','Error: revisa el registro.','Elige todos los archivos y una carpeta nueva.','El modelo grande se ejecuta en otro proceso durante el análisis. No se garantiza una mejora.']}

class App:
    def __init__(self, root):
        self.root = root
        self.root.geometry('820x790')
        self.lang = tk.StringVar(value='it')
        self.status = tk.StringVar()
        self.fields = [tk.StringVar() for _ in range(8)]
        script_dir = Path(__file__).resolve().parent
        package_dir = script_dir.parent.parent if script_dir.parent.name == 'bin' else None
        for index, name in ((2, 'weight-space-calibration-example.json'), (3, 'weight-space-test-example.json')):
            path = script_dir / name
            if path.is_file(): self.fields[index].set(str(path))
        if package_dir:
            for index, candidates in ((4, [package_dir / 'bin/converter/convert_hf_to_gguf.py']),
                                      (5, [package_dir / 'bin/prism/vulkan/llama-cli.exe', package_dir / 'bin/gpu/llama-cli.exe']),
                                      (6, [package_dir / 'bin/prism/llama-quantize.exe', package_dir / 'bin/llama-quantize.exe'])):
                selected = next((p for p in candidates if p.is_file()), None)
                if selected: self.fields[index].set(str(selected))
        self.process = None
        self.events = queue.Queue()
        toolbar = ttk.Frame(root, padding=12); toolbar.pack(fill='x')
        self.title = ttk.Label(toolbar, font=('Arial', 17, 'bold')); self.title.pack(side='left')
        language = ttk.Combobox(toolbar, textvariable=self.lang, values=['it','en','de','fr','es'], state='readonly', width=5)
        language.pack(side='right'); language.bind('<<ComboboxSelected>>', lambda _: self.translate())
        self.intro = ttk.Label(root, wraplength=760); self.intro.pack(anchor='w', padx=16)
        panel = ttk.Frame(root, padding=16); panel.pack(fill='x')
        self.labels, self.browsers = [], []
        for i, value in enumerate(self.fields):
            label = ttk.Label(panel); label.grid(row=i, column=0, sticky='w', pady=4); self.labels.append(label)
            entry = ttk.Entry(panel, textvariable=value); entry.grid(row=i, column=1, sticky='ew', padx=8)
            button = ttk.Button(panel, command=lambda n=i: self.browse(n)); button.grid(row=i, column=2); self.browsers.append(button)
        panel.columnconfigure(1, weight=1)
        actions = ttk.Frame(root, padding=(16,0)); actions.pack(fill='x')
        self.start = ttk.Button(actions, command=self.run); self.start.pack(side='left')
        self.stop = ttk.Button(actions, command=self.cancel, state='disabled'); self.stop.pack(side='left', padx=8)
        self.status_label = ttk.Label(actions); self.status_label.pack(side='left', padx=8)
        ttk.Label(actions, textvariable=self.status).pack(side='left')
        self.note = ttk.Label(root, wraplength=760); self.note.pack(anchor='w', padx=16, pady=8)
        self.log = tk.Text(root, height=15, wrap='word', state='disabled'); self.log.pack(fill='both', expand=True, padx=16, pady=(0,16))
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        self.translate(); root.after(100, self.poll)

    def translate(self):
        t = TEXT[self.lang.get()]; self.root.title(t[0]); self.title.config(text=t[0]); self.intro.config(text=t[1]); self.note.config(text=t[19]); self.status_label.config(text=t[13]+':')
        for i, label in enumerate(self.labels): label.config(text=t[i+2])
        for button in self.browsers: button.config(text=t[10])
        self.start.config(text=t[11]); self.stop.config(text=t[12]); self.status.set(t[14] if not self.process else t[15])

    def browse(self, index):
        if index == 7:
            path = filedialog.asksaveasfilename(title=TEXT[self.lang.get()][9], initialfile='weight-experiment')
        else:
            patterns = [('GGUF', '*.gguf')] if index in (0,1) else [('JSON','*.json')] if index in (2,3) else [('File','*.*')]
            path = filedialog.askopenfilename(filetypes=patterns)
        if path: self.fields[index].set(path)

    def run(self):
        paths = [field.get().strip() for field in self.fields]
        if any(not path for path in paths) or any(not Path(path).is_file() for path in paths[:7]) or Path(paths[7]).exists():
            messagebox.showerror(TEXT[self.lang.get()][0], TEXT[self.lang.get()][18]); return
        cmd = [sys.executable, '-u', str(Path(__file__).with_name('weight_space_experiment.py')), '--original',paths[0],'--teacher',paths[1], '--calibration',paths[2],'--test',paths[3], '--converter',paths[4], '--llama-cli',paths[5], '--quantize',paths[6], '--output',paths[7]]
        try:
            flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
            self.process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace', bufsize=1, creationflags=flags)
        except OSError as exc:
            messagebox.showerror(TEXT[self.lang.get()][0], str(exc)); return
        self.status.set(TEXT[self.lang.get()][15]); self.start.config(state='disabled'); self.stop.config(state='normal')
        threading.Thread(target=self.read_output, args=(self.process,), daemon=True).start()

    def read_output(self, process):
        for line in process.stdout: self.events.put(('line', line))
        self.events.put(('exit', process.wait()))

    def poll(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == 'line':
                    self.log.config(state='normal'); self.log.insert('end', value); self.log.see('end'); self.log.config(state='disabled')
                elif kind == 'exit':
                    self.process = None; self.start.config(state='normal'); self.stop.config(state='disabled')
                    self.status.set(TEXT[self.lang.get()][16 if value == 0 else 17])
        except queue.Empty: pass
        self.root.after(100, self.poll)

    def cancel(self):
        if not self.process: return
        if os.name == 'nt': subprocess.run(['taskkill','/PID',str(self.process.pid),'/T','/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else: self.process.terminate()

    def close(self):
        if self.process: self.cancel()
        self.root.destroy()

if __name__ == '__main__':
    root = tk.Tk(); App(root); root.mainloop()
