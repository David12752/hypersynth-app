# Execution Scripts — כלי ביצוע

כל קובץ כאן הוא script דטרמיניסטי שעושה עבודה בפועל.  
ה-AI קורא directives ומפעיל את ה-scripts האלה — לא עושה את העבודה ידנית.

## שימוש

```bash
# WASM build
python execution/build_wasm.py

# Standalone
python execution/build_standalone.py --mode run
python execution/build_standalone.py --mode build

# Plugin
python execution/build_plugin.py

# Engine dev
python execution/dev_engine.py --check
python execution/dev_engine.py --test
python execution/dev_engine.py --clippy
python execution/dev_engine.py --bench

# Frontend
python execution/dev_frontend.py --start
python execution/dev_frontend.py --lint
python execution/dev_frontend.py --build

# Tests
python execution/test_engine.py

# Status
python execution/project_status.py
```

## דרישות
- Python 3.10+
- Rust toolchain (cargo)
- Node.js 18+ (for frontend scripts)
- dotenv (`pip install python-dotenv`)
