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

# --- リリース署名とバージョン(app/build.gradle) ---
# 鍵は ~/android-keystore/ に置く(リポジトリ外、コミットしない)。無ければ署名設定は無効のままでデバッグビルドは通る。
python3 - android/app/build.gradle package.json <<'PY'
import json, re, sys
gp, pj = sys.argv[1], sys.argv[2]
s = open(gp, encoding='utf-8').read()
pkg = json.load(open(pj, encoding='utf-8'))
name = pkg['version']
code = int(pkg.get('androidVersionCode', 1))

s = re.sub(r'versionCode\s+\d+', f'versionCode {code}', s, count=1)
s = re.sub(r'versionName\s+"[^"]*"', f'versionName "{name}"', s, count=1)

if 'keystoreProps' not in s:
    head = '''def keystorePropsFile = file(System.getProperty("user.home") + "/android-keystore/keystore.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) { keystorePropsFile.withInputStream { keystoreProps.load(it) } }

'''
    s = head + s
    s = s.replace('    buildTypes {', '''    signingConfigs {
        release {
            if (keystoreProps['storeFile']) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {''', 1)
    s = s.replace("        release {\n            minifyEnabled false", "        release {\n            signingConfig keystoreProps['storeFile'] ? signingConfigs.release : null\n            minifyEnabled false", 1)
open(gp, 'w', encoding='utf-8').write(s)
print(f'build.gradle: versionName={name} versionCode={code}、署名設定を適用')
PY
