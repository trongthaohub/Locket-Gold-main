import os
import sys

# Add the parent directory to sys.path so we can import 'app'
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    from app.api import app
except ImportError as e:
    print(f"Import Error: {e}")
    # Fallback to a very simple app to see if it even runs
    from fastapi import FastAPI
    app = FastAPI()
    @app.get("/api/test")
    def test():
        return {"error": str(e), "path": sys.path}

# Vercel looks for 'app'
app = app
