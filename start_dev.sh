#!/usr/bin/env bash
# Cross-platform development environment launcher (M-14 fix)
# Usage: ./start_dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  Redbelly MVP — Dev Environment Setup"
echo "========================================"

# Step 1: Check prerequisites
for cmd in node python3 npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is not installed. Please install it first."
    exit 1
  fi
done

# Step 2: Install root dependencies (OpenZeppelin)
if [ ! -d "node_modules" ]; then
  echo "[1/4] Installing root dependencies..."
  npm install
fi

# Step 3: Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
  echo "[2/4] Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

# Step 4: Install Python dependencies
if [ ! -d "api/venv" ]; then
  echo "[3/4] Creating Python virtual environment..."
  python3 -m venv api/venv
fi
source api/venv/bin/activate
pip install -r api/requirements.txt --quiet

# Step 5: Compile contracts
echo "[4/4] Compiling smart contracts..."
npx truffle compile

echo ""
echo "========================================"
echo "  Setup complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Start Ganache:    ganache"
echo "  2. Deploy contracts: npx truffle migrate"
echo "  3. Start API:        cd api && source venv/bin/activate && python app.py"
echo "  4. Start Frontend:   cd frontend && npm run dev"
echo ""
echo "Remember to set AUTH_TOKEN in .env before starting the API!"
