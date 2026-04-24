#!/usr/bin/env bash
# =====================================================
#   IGOR FOR MEN — local dev server (macOS / Linux)
#   Run: bash start.sh
#   Then open: http://localhost:5463
# =====================================================
cd "$(dirname "$0")"

echo ""
echo "  IGOR FOR MEN  ---  local preview"
echo "  ============================================"
echo "  Serving folder: $(pwd)"
echo "  URL:            http://localhost:5463"
echo ""
echo "  Press Ctrl+C to stop."
echo "  ============================================"
echo ""

# Try to open a browser
(sleep 1 && (open http://localhost:5463 2>/dev/null || xdg-open http://localhost:5463 2>/dev/null)) &

# Prefer python3, fall back to python
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server 5463
elif command -v python >/dev/null 2>&1; then
  python -m http.server 5463
else
  echo "Python not found. Install Python 3 and try again."
  exit 1
fi
