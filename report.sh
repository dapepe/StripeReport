#!/bin/bash
# report.sh

# Ensure we're in the project directory
cd "$(dirname "$0")" || exit

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is required. Install it with 'npm install -g pnpm'."
    exit 1
fi

# Run the Node.js script with arguments
pnpm exec node main.js "$@"
