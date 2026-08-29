#!/usr/bin/env python3
"""
CLI entry point for Qwen Local Semantic QA Worker.
Delegates to colab/qwen_qa_worker.py with full environment and arguments support.
"""
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "colab"))

args = sys.argv[1:]
if "--once" in args:
    os.environ["QA_RUN_ONCE"] = "true"
if "--max-chapters" in args:
    index = args.index("--max-chapters")
    if index + 1 >= len(args) or not args[index + 1].isdigit():
        raise SystemExit("--max-chapters cần một số nguyên dương")
    os.environ["QA_MAX_CHAPTERS"] = args[index + 1]

from qwen_qa_worker import run_worker_loop

if __name__ == "__main__":
    run_worker_loop()
