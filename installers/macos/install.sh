#!/usr/bin/env bash
# Instala git-smart-flow en macOS
# Uso: curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/macos/install.sh | bash

set -e
echo "Installing git-smart-flow..."

if command -v npm &> /dev/null; then
  npm install -g git-smart-flow
  echo "✅ Installed via npm"
  echo "Run 'git-smart-flow setup' to get started"
  exit 0
fi

echo "Node.js/npm not found. Downloading standalone binary..."
LATEST=$(curl -s https://api.github.com/repos/YOUR_USERNAME/git-smart-flow/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -L "https://github.com/YOUR_USERNAME/git-smart-flow/releases/download/${LATEST}/GitSmartFlow-macOS.zip" -o /tmp/gsf-macos.zip
unzip -q /tmp/gsf-macos.zip -d /tmp/gsf-macos
chmod +x /tmp/gsf-macos/git-smart-flow
sudo mv /tmp/gsf-macos/git-smart-flow /usr/local/bin/git-smart-flow
rm -rf /tmp/gsf-macos /tmp/gsf-macos.zip
echo "✅ Installed standalone binary to /usr/local/bin/git-smart-flow"
echo "Run 'git-smart-flow setup' to get started"
