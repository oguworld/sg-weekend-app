#!/usr/bin/env bash
# android-app/android/ は `npx cap add android` の生成物(gitignore対象)。
# 生成し直したら、このスクリプトで Android 12+ 起動画面の設定を再適用する(冪等)。
set -euo pipefail
cd "$(dirname "$0")/.."
RES=android/app/src/main/res
[ -d "$RES" ] || { echo "android/ が無い。先に npx cap add android を実行すること" >&2; exit 1; }

node scripts/make-splash-icon.js
cp -R native-overrides/. "$RES/"

python3 - "$RES/values/styles.xml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
items = [
    '<item name="windowSplashScreenBackground">@color/splash_background</item>',
    '<item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>',
]
m = re.search(r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)(.*?)(</style>)', s, re.S)
if not m:
    sys.exit('AppTheme.NoActionBarLaunch が見つからない')
body = m.group(2)
add = ''.join('\n        ' + i for i in items if i not in body)
if add:
    s = s[:m.end(2)] + add + '\n    ' + s[m.end(2):]
    open(p, 'w', encoding='utf-8').write(s)
    print('styles.xml を更新')
else:
    print('styles.xml は適用済み')
PY
