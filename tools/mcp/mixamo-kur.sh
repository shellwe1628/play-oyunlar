#!/usr/bin/env bash
# Mixamo MCP sunucusunu bu deponun içine (tools/mcp/mixamo-mcp, git'e girmez) kurar.
# Kendi bilgisayarınızda, deponun kök klasöründen çalıştırın:  bash tools/mcp/mixamo-kur.sh
# Ayrıntı ve uyarılar: tools/mcp/README.md
set -euo pipefail

REPO="https://github.com/V1xel/mixamo-mcp"
# İncelenen sürüm. Yeni bir sürüme geçmeden önce koda yeniden bakın.
COMMIT="8bdb0a3ed91fdc1fadc469701e09ecb0bdb7aefd"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HERE/mixamo-mcp"

PY="$(command -v python || command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "Python bulunamadı. Önce Python 3.10 ya da üstünü kurun." >&2
  exit 1
fi

if [ ! -d "$TARGET/.git" ]; then
  git clone "$REPO" "$TARGET"
fi
git -C "$TARGET" fetch --quiet origin
git -C "$TARGET" checkout --quiet "$COMMIT"

"$PY" -m pip install -r "$TARGET/requirements.txt"
"$PY" -m playwright install chromium

echo
echo "Kuruldu: $TARGET"
echo "Şimdi Claude Code'u bu depoda yeniden başlatın ve 'mixamo' sunucusunu onaylayın."
echo "İlk kullanımda açılan tarayıcı penceresinden Mixamo'ya (Adobe hesabınızla) giriş yapın."
