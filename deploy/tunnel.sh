#!/usr/bin/env bash
#
# ══════════════════════════════════════════════════════════════
#  احسمها AI — جسر الاتصال
#
#  يعطي احسمها اللي على جهازك رابط HTTPS عام تحطه في التطبيق،
#  بدون ما تفتح أي منفذ في الراوتر ولا تشتري دومين.
#
#  التشغيل:
#    bash tunnel.sh                 جسر سريع (رابط مؤقت، بدون حساب)
#    bash tunnel.sh --tailscale     رابط دائم (يحتاج حساب مجاني)
# ══════════════════════════════════════════════════════════════

set -uo pipefail

PORT="${PORT:-4000}"
MODE="quick"
[ "${1:-}" = "--tailscale" ] && MODE="tailscale"

GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
ok()   { echo "${GREEN}✓${OFF} $1"; }
warn() { echo "${YELLOW}!${OFF} $1"; }
die()  { echo "${RED}✗${OFF} $1"; exit 1; }

echo
echo "${BOLD}جسر احسمها AI${OFF}"
echo "────────────────────────────"

# ── احسمها لازم يكون شغّالًا أول ──
if ! curl -sf --max-time 5 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  die "احسمها مو شغّال على المنفذ ${PORT}.
   شغّله أول في نافذة ثانية:  npm start
   أو حدد منفذًا ثانيًا:       PORT=5000 bash tunnel.sh"
fi
ok "احسمها شغّال على المنفذ ${PORT}"

# ══════════════ الوضع الدائم: Tailscale ══════════════
if [ "$MODE" = "tailscale" ]; then
  if ! command -v tailscale >/dev/null; then
    echo
    warn "Tailscale مو مثبت. ثبّته بـ:"
    echo "    curl -fsSL https://tailscale.com/install.sh | sh"
    echo
    die "ثبّته وأعد تشغيل هذا السكربت."
  fi

  echo "نجهّز الرابط الدائم…"
  tailscale up >/dev/null 2>&1 || true
  tailscale funnel --bg "${PORT}" || die "فشل تشغيل Funnel. تأكد أنك مسجّل دخول: tailscale up"

  URL=$(tailscale funnel status 2>/dev/null | grep -oE 'https://[^ ]+' | head -1)
  echo
  echo "════════════════════════════════════════"
  echo "  ${BOLD}${GREEN}رابطك الدائم:${OFF}"
  echo "  ${BOLD}${URL}${OFF}"
  echo "════════════════════════════════════════"
  echo
  echo "الرابط ما يتغيّر — حطه في التطبيق مرة وحدة وخلاص."
  echo "لإيقاف الجسر:  tailscale funnel --https=443 off"
  echo
  exit 0
fi

# ══════════════ الوضع السريع: Cloudflare ══════════════
if ! command -v cloudflared >/dev/null; then
  echo "ننزّل أداة الجسر…"

  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *) die "معمارية غير مدعومة: $ARCH" ;;
  esac

  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${OS}-${CF_ARCH}"

  if curl -fsSL "$URL" -o /tmp/cloudflared && chmod +x /tmp/cloudflared; then
    CF=/tmp/cloudflared
    ok "الأداة جاهزة"
  else
    die "فشل تنزيل الأداة. ثبّتها يدويًا من:
   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  fi
else
  CF=$(command -v cloudflared)
  ok "أداة الجسر موجودة"
fi

echo
echo "نفتح الجسر… (استنى شوي)"

LOG=$(mktemp)
"$CF" tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate > "$LOG" 2>&1 &
CF_PID=$!

cleanup() {
  kill "$CF_PID" 2>/dev/null
  rm -f "$LOG"
  echo
  echo "أقفلنا الجسر."
}
trap cleanup EXIT INT TERM

# ننتظر الرابط يطلع
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  kill -0 "$CF_PID" 2>/dev/null || break
  sleep 2
done

if [ -z "$URL" ]; then
  echo
  # نفسّر أشهر الأسباب بدل ما نرمي سجلًا خامًا
  if grep -qi "not in allowlist\|egress\|403 Forbidden" "$LOG"; then
    warn "شبكتك تحجب خدمة الجسر."
    echo "  جرّب شبكة ثانية (بيانات الجوال مثلًا)، أو استخدم:"
    echo "    bash tunnel.sh --tailscale"
  elif grep -qi "no such host\|dial tcp\|timeout\|connection refused" "$LOG"; then
    warn "ما قدرنا نوصل لخوادم الجسر — تأكد أن الإنترنت شغّال."
  else
    warn "ما طلع الرابط. آخر ما قالته الأداة:"
    tail -12 "$LOG"
  fi
  exit 1
fi

echo
echo "════════════════════════════════════════"
echo "  ${BOLD}${GREEN}رابطك:${OFF}"
echo "  ${BOLD}${URL}${OFF}"
echo "════════════════════════════════════════"
echo
echo "حطه في تطبيق احسمها على جوالك."
echo
warn "الرابط مؤقت — يتغيّر كل ما تعيد تشغيل الجسر."
echo "  لرابط دائم:  bash tunnel.sh --tailscale"
echo
echo "${BOLD}خل هذي النافذة مفتوحة${OFF} — الجسر يشتغل منها."
echo "للإيقاف: اضغط Ctrl+C"
echo

wait "$CF_PID"
