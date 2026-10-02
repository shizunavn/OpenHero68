from pathlib import Path
import subprocess
import sys

# Compatibility entry point; the Node publisher refuses to replace published assets.
script = Path(__file__).with_suffix('.mjs')
raise SystemExit(subprocess.call(['node', str(script), *sys.argv[1:]]))
