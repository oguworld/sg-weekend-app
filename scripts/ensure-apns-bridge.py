#!/usr/bin/env python3
"""設計書48・課題1: Capacitorが生成するAppDelegate.swiftに、APNsデバイストークン登録を
@capacitor/push-notificationsプラグインへブリッジするメソッドが欠落している場合に条件付きで追記する。

- 冪等: 既に `capacitorDidRegisterForRemoteNotifications` を含む場合は何もしない。
- クラス開き波括弧が見つからない場合は SystemExit(1) で明示的にビルドを失敗させる（サイレント素通り禁止）。

使い方: python3 scripts/ensure-apns-bridge.py <path-to-AppDelegate.swift>
"""
import re
import sys

if len(sys.argv) < 2:
    print("Usage: ensure-apns-bridge.py <path-to-AppDelegate.swift>")
    raise SystemExit(1)

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    src = f.read()

# 冪等: 既にブリッジメソッドがあれば何もしない
if "capacitorDidRegisterForRemoteNotifications" in src:
    print("AppDelegate.swift already contains APNs bridge methods. Skipping.")
    raise SystemExit(0)

methods = (
    "\n"
    "    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {\n"
    "        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)\n"
    "    }\n"
    "\n"
    "    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {\n"
    "        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)\n"
    "    }\n"
)

m = re.search(r'(class\s+AppDelegate[^\{]*\{)', src)
if not m:
    print("!!! Could not find AppDelegate class opening brace. Aborting build to avoid silent failure. !!!")
    raise SystemExit(1)

insert_at = m.end()
new_src = src[:insert_at] + methods + src[insert_at:]

with open(path, "w", encoding="utf-8") as f:
    f.write(new_src)

print("Inserted APNs bridge methods into AppDelegate.swift.")
