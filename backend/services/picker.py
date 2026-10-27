"""Standalone GUI picker process script for native file/folder selection."""

import json
import os
import sys
import tkinter as tk
from tkinter import filedialog


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Mode required"}))
        return

    mode = sys.argv[1]  # "folder" or "file"
    title = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else "Select"
    initial = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    filetypes_raw = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else "[]"

    init_dir = None
    if initial:
        initial_str = str(initial).strip()
        if os.path.isdir(initial_str):
            init_dir = initial_str
        elif os.path.isfile(initial_str) and os.path.isdir(os.path.dirname(initial_str)):
            init_dir = os.path.dirname(initial_str)

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", 1)

    if mode == "folder":
        selected = filedialog.askdirectory(title=title, initialdir=init_dir)
    else:
        try:
            filetypes = json.loads(filetypes_raw)
        except Exception:
            filetypes = [("All files", "*.*")]
        selected = filedialog.askopenfilename(
            title=title, initialdir=init_dir, filetypes=filetypes
        )

    root.destroy()
    print(json.dumps({"path": selected or "", "cancelled": not bool(selected)}))


if __name__ == "__main__":
    main()
