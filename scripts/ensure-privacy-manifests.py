#!/usr/bin/env python3
"""設計書68: App Store審査差し戻し対応（ITMS-91061 Missing privacy manifest）。

CocoaPodsが生成するPodfileに、GoogleSignIn/GTMAppAuth/GTMSessionFetcherの各target向けに
ビルド成果物へPrivacyInfo.xcprivacyをコピーするRun Scriptビルドフェーズを追加する
post_install処理を注入する。

- 冪等: 既にマーカー文字列（PRIVACY_MANIFEST_MARKER）を含む場合は何もしない。
- 既存の post_install do |installer| ... end ブロックがあればその内部（対応するendの直前）に
  処理を挿し込む。無ければ新規にpost_installブロックをPodfile末尾に追記する。
- 対応するpost_installブロックの終端(end)を正規表現で検出できない場合は SystemExit(1) で
  明示的にビルドを失敗させる（サイレント素通り禁止、scripts/ensure-apns-bridge.pyと同じ思想）。
- 対象target名が1つも見つからない場合はビルド自体は失敗させず警告ログのみ出す
  （target名一覧のデバッグ出力を注入するため、実際のCIログで原因調査が可能）。

使い方: python3 scripts/ensure-privacy-manifests.py <path-to-Podfile>
"""
import re
import sys

PRIVACY_MANIFEST_MARKER = "# --- privacy manifest injection (設計書68) ---"

if len(sys.argv) < 2:
    print("Usage: ensure-privacy-manifests.py <path-to-Podfile>")
    raise SystemExit(1)

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    src = f.read()

# 冪等: 既に注入済みなら何もしない
if PRIVACY_MANIFEST_MARKER in src:
    print("Podfile already contains privacy manifest injection. Skipping.")
    raise SystemExit(0)

# post_installブロック内部に挿し込む処理本体（インデントはブロック内部の想定、2スペース単位）
injected_body = (
    f"    {PRIVACY_MANIFEST_MARKER}\n"
    "    installer.pods_project.targets.each do |target|\n"
    "      puts \"POD TARGET: #{target.name}\"\n"
    "      privacy_manifest_targets = ['GoogleSignIn', 'GTMAppAuth', 'GTMSessionFetcher']\n"
    "      is_target_match = privacy_manifest_targets.include?(target.name) || target.name.start_with?('GTMSessionFetcher')\n"
    "      if is_target_match\n"
    "        manifest_name = privacy_manifest_targets.find { |n| target.name == n || target.name.start_with?(n) }\n"
    "        phase = target.new_shell_script_build_phase(\"Add Privacy Manifest\")\n"
    "        phase.shell_script = \"cp \\\"${SRCROOT}/../../../PrivacyManifests/#{manifest_name}-PrivacyInfo.xcprivacy\\\" \\\"${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/PrivacyInfo.xcprivacy\\\"\"\n"
    "        puts \"Injected privacy manifest build phase for target: #{target.name} (manifest: #{manifest_name})\"\n"
    "      end\n"
    "    end\n"
)

# 既存 post_install do |installer| ... end ブロックの検出
post_install_start_re = re.compile(r"post_install\s+do\s+\|installer\|")
m = post_install_start_re.search(src)

if m:
    # ブロック開始位置以降で、doに対応するendを深さカウントで探す
    # (Podfile中の他のdo...end/if...end等とネストしている可能性を考慮)
    block_start = m.end()
    depth = 1
    idx = block_start
    end_match_start = None
    end_match_end = None
    # do/end相当のRubyキーワードの簡易トークナイズ（block開始・終了のみに注目）
    keyword_re = re.compile(r"\b(do|if|unless|case|def|class|module|begin)\b|\bend\b")
    pos = block_start
    found_end = False
    while pos < len(src):
        km = keyword_re.search(src, pos)
        if not km:
            break
        token = km.group(0)
        if token == "end":
            depth -= 1
            if depth == 0:
                end_match_start = km.start()
                end_match_end = km.end()
                found_end = True
                break
        else:
            # "do" 単体、あるいは if/unless/case/def/class/module/begin の開始
            depth += 1
        pos = km.end()

    if not found_end:
        print("!!! Could not find matching 'end' for existing post_install block. Aborting build to avoid silent failure. !!!")
        raise SystemExit(1)

    # end直前に処理を挿し込む
    insert_at = end_match_start
    new_src = src[:insert_at] + injected_body + src[insert_at:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_src)
    print("Inserted privacy manifest injection into existing post_install block.")
else:
    # 既存post_installブロックが無い場合は新規追記
    new_block = (
        "\n"
        "post_install do |installer|\n"
        f"{injected_body}"
        "end\n"
    )
    new_src = src.rstrip("\n") + "\n" + new_block
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_src)
    print("Appended new post_install block with privacy manifest injection.")

print("Done.")
