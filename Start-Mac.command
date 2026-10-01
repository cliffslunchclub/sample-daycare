#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 24 or later, then reopen this launcher."
  read -r -p "Press Return to close."
  exit 1
fi
npm run demo
read -r -p "Press Return to close."
