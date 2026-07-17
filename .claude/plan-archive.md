# おでかけNavi 設計書アーカイブ（plan-archive.md）

このファイルは `.claude/plan.md` から退避した過去の設計書を保持する（削除ではなくアーカイブ。CLAUDE.md「plan.mdの扱い」ルールに基づく）。

- **設計書1〜17**（iOSキーボード/ビューポート/タップ不具合系。真因は `capacitor.config.js` の `contentInset:'always'`、設計書15で根本解決）を 2026-07-17 にここへ移動。

---

# 設計書 — 「予定を追加」モーダルのフィールド間フォーカス移動によるシート表示崩れ（極端な高さ潰れ）

## 症状
「予定を追加」モーダル（`#plan-custom-modal`、`.plan-modal`クラス）で、タイトル欄（`#plan-custom-title`）を編集後にメモ欄（`#plan-custom-memo`）をタップして編集しようとする（またはその逆）と、モーダルの高さが極端に潰れる。ヘッダー行（「予定を追加」タイトル＋✕ボタン）だけが画面下部にごく小さく表示され、フォーム本体（タイトル欄・メモ欄など）が一切見えない状態になる。キーボードは通常通り表示されている。

## 原因の特定（推測ではなく静的コード解析で構造的欠陥を確認。実機での`kbHeight`実測値までは未確認のため、発生条件の一部は推測を含む）

### 該当コード
`public/app.js` 73〜209行目付近のキーボード被り対策一式。中心は以下の関数（行番号は現状のファイル）:

- `_adjustSheetForKb(sheet, kbH)`（80〜91行目）: シートの`max-height`（または`height`）を`kbH+24px`分縮小し、`bottom`を同量押し上げる。縮小前に`getComputedStyle`で現在の`max-height`（`curH`）を読み、`curH <= SAFE_GAP + 80`（`SAFE_GAP = kbH + 24`）なら「縮めすぎるためスキップ」するガードを持つ。
- `_liftVisibleSheetForKeyboard(kbHeight)`（101〜163行目）: 表示中の全`.plan-modal.visible`/`.plan-sheet.visible`に対して`_adjustSheetForKb`を無条件に呼ぶ。
- `_onCapKeyboardShow(kbHeight)`（172〜174行目）: `_liftVisibleSheetForKeyboard`を呼ぶだけ。
- Capacitor環境では`@capacitor/keyboard`の`keyboardWillShow`イベントごとに`_onCapKeyboardShow`（＝`_adjustSheetForKb`）が呼ばれる（186〜188行目）。`keyboardWillHide`でのみ`_resetSheetKeyboardOffset`（縮小のリセット）が呼ばれる。

### 構造的欠陥: ガードは「1回限りの多重適用」しか防げない設計
`_adjustSheetForKb`のスキップ判定は次の式である。

```
SAFE_GAP = kbH + 24
if (curH <= SAFE_GAP + 80) return;  // スキップ
```

1回適用すると `curH_new = curH_old - SAFE_GAP` になる。**2回目以降の呼び出しでガードが正しく機能する（＝縮小を止められる）ためには、以下の条件が成り立つ必要がある。**

```
curH_old - SAFE_GAP <= SAFE_GAP + 80
⇔ curH_old <= 2 * SAFE_GAP + 80
```

`curH_old`はシートの初期最大高さ（`.plan-modal`はCSSで`max-height: 88vh`）である。この不等式は`SAFE_GAP`（≒キーボード高さ）が十分大きい場合のみ成立する。`SAFE_GAP`が小さい（キーボード高さが小さい値として渡された）場合、**この不等式が成立せず、`_adjustSheetForKb`が「呼ばれるたびに際限なく縮小を繰り返す」**。実際にシミュレーションした結果は以下の通り（iPhone想定、`88vh`初期高さ、`MARGIN=24px`固定）:

| 画面高 | 初期maxHeight(88vh) | kbH | 適用結果 |
|---|---|---|---|
| 844px | 742.7px | 336px（日本語キーボード大） | 1回適用で382.7pxまで縮小、2回目はガードでスキップ（安全） |
| 844px | 742.7px | 216px（候補バーなし相当） | **2回適用で262.7pxまで縮小、3回目でスキップ** |
| 844px | 742.7px | 50px（何らかの理由で小さい値が渡された場合） | **5回適用しても372.7pxまでしか縮小されずガードが効かない＝毎回縮小し続ける** |

つまり、**`kbH`（キーボード高さ）として実際より小さい値、または不安定な値が繰り返し渡された場合、`_adjustSheetForKb`が呼ばれるたびにシートがどんどん潰れていく**。これが症状（「ヘッダーだけが画面下部にごく小さく残る」＝シートの`max-height`が極端な小さい値まで縮んだ状態）と一致する。

### この構造的欠陥が「フィールドA→フィールドB移動」で顕在化する理由（推測を含む）
iOSネイティブの一般的挙動として、同一フォーム内でテキストフィールド間のフォーカスが移動する場合（キーボードは表示されたまま消えない）、`UIResponder.keyboardWillHideNotification`は発火せず、`UIResponder.keyboardWillShowNotification`のみが**フォーカス変更のたびに再送される**ことが知られている。この場合コード上の経路は次のようになる。

1. タイトル欄フォーカス → `keyboardWillShow`(1回目) → `_adjustSheetForKb`実行（縮小1回目、curHは88vh基準）
2. メモ欄へフォーカス移動 → `keyboardWillHide`は発火しない → `keyboardWillShow`(2回目)が発火 → `_adjustSheetForKb`実行（縮小2回目、curHは1回目の縮小後の値）
3. 以降フィールドを行き来するたびに`keyboardWillShow`が再発火し、縮小が繰り返される

このとき`kbH`（`info.keyboardHeight`）が1回目と2回目以降で異なる値（キーボードの候補バーの有無、レイアウト再計算のタイミング等でわずかに変動する、または一時的に小さい値が報告される）を返すと、上記シミュレーションの「kbHが小さいケース」に該当し、ガードが機能しないまま縮小が繰り返される。**この「`keyboardWillShow`がフィールド間移動のたびに再発火するか」「2回目以降の`kbH`実測値がいくつになるか」は実機ログでの確認が必要（推測）。** ただし、ガードの数式自体が「初期状態からの1回の縮小」しか安全性を保証しない設計になっている点は、実機確認を待たずに静的解析だけで確定できる構造的な欠陥である。

### 副次的な設計上の懸念（今回のバグの直接原因ではない可能性があるが、同系統のリスク）
`_liftVisibleSheetForKeyboard`は`document.querySelectorAll('.plan-modal.visible, .plan-sheet.visible')`で**表示中の全シート**に無条件で`_adjustSheetForKb`を適用する（何回目の呼び出しかを一切記録していない）。ガード用に保存される`sheet.dataset.kbIsMaxH`は「縮小した対象がmaxHeightかheightか」を覚えるだけのフラグであり、「何回縮小を適用したか」「初期値からの差分」を追跡していない。そのため「1回適用済みかどうか」を判定する手段が`curH`の相対値比較（ガード式）のみに依存しており、その式自体が上記の通り不十分。

## 修正方針

### 方針A（推奨・根本修正）: 縮小適用を「冪等」にする
`_adjustSheetForKb`が呼ばれるたびに、**縮小前に必ず一度リセットしてから、初期値を基準に縮小し直す**ようにする。具体的には:

1. シートの「縮小前の元の高さ」を初回適用時に`dataset`（例: `sheet.dataset.kbOrigMaxHeight`）に保存しておく。
2. 2回目以降の呼び出しでは、`getComputedStyle`の現在値ではなく、保存しておいた「元の高さ」を基準に`元の高さ - SAFE_GAP`を計算して適用する（＝同じ`kbH`が何度来ても常に同じ結果になる冪等な計算にする）。
3. `_resetSheetAfterKb`実行時にこの保存値もクリアする。

これにより「キーボード表示中に`keyboardWillShow`が何度再発火しても、縮小は常に「元の高さ基準の1回分」にしかならない」ことが保証され、多重縮小が原理的に発生しなくなる。

### 方針B（補助策）: フィールド間移動では縮小処理自体を再実行しない
`keyboardWillShow`イベント側で「直前と今回で`kbHeight`がほぼ同じ（かつ既にシートが縮小済み状態）」の場合は`_adjustSheetForKb`の呼び出し自体をスキップする、という早期リターンを追加する。ただし「キーボードの高さが実際に変わるケース（例: 日本語⇔英語キーボード切替で高さが変動する）」には追従できなくなるため、方針Aの冪等化と併用するか、方針Aを優先し方針Bは見送るのが安全。

### 方針C（デバッグ計装、原因の実機確認用）
方針A実装前、またはそれでも症状が再現する場合に備え、`_sendDebugLog`基盤を使って以下を計装する案:

- `_onCapKeyboardShow(kbHeight)`の先頭で `_sendDebugLog('plan_kb_show', { kbHeight, activeId: document.activeElement?.id, sheetCurMaxHeight: <対象シートのgetComputedStyle().maxHeight>, hasKbIsMaxH: <dataset.kbIsMaxH有無> })` を送信し、同一モーダル内でのフィールド間移動時に`keyboardWillShow`が何回・どんな`kbHeight`値で再発火するか、また適用直前の`curH`がどう推移するかを実機ログ（`logs/debug-nav.log`）で確認する。
- `_resetSheetKeyboardOffset`（`keyboardWillHide`側）にも同様に`_sendDebugLog('plan_kb_hide', {...})`を仕込み、フィールド間移動時に本当に`keyboardWillHide`が発火しないのか（発火してリセット→縮小の往復になっているのに別の理由で崩れているのか）を切り分ける。

この計装は原因確定後に削除する使い捨てログとする（`_sendDebugLog`基盤自体は恒久機能のため残す）。

## 変更するファイル一覧
- `public/app.js`（`_adjustSheetForKb`・`_resetSheetAfterKb`の冪等化ロジック追加。必要なら計装ログ追加）
- `public/index.html`（`app.js`のキャッシュバスティング用クエリパラメータ更新。CLAUDE.md記載の手順に従う）
- `public/sw.js`（`CACHE_NAME`のバージョン番号更新。上記とセットで必須）

## 受け入れ基準
1. 「予定を追加」モーダルでタイトル欄→メモ欄、メモ欄→タイトル欄と何度フォーカスを往復しても、モーダルの高さが縮み続けない（1回分の縮小量で安定する）こと。
2. モーダルを開いてキーボードを表示→フィールド間を複数回往復→キーボードを閉じる、という操作をした後、モーダルが正しい元の高さ・位置（`bottom:0`、`max-height:88vh`相当）に戻ること。
3. 同種の構造を持つ他のシート（コース作成シート`.plan-sheet`、`#title-edit-sheet`など、複数の入力欄を持つシート）でも同様のフィールド間フォーカス移動で表示崩れが起きないこと（横展開確認）。
4. 既存のキーボード被り対策（シート上端が画面外に出ない、フォーカス欄がキーボードに隠れない）の挙動に回帰がないこと。

## 再発防止策
- ボトムシートの「縮小・移動」系の状態変更処理は、**現在のDOM状態（`getComputedStyle`の相対値）を基準に差分計算する方式ではなく、初期値を保存しておいてそこから絶対値で再計算する冪等な方式**を今後の同種実装（キーボード対策に限らず、リサイズ・アニメーション系の重ね掛けが起こりうる処理全般）でも標準パターンとする。
- 同一イベント（`keyboardWillShow`等）が「1シーケンス中に複数回発火しうる」ケース（フィールド間移動、画面回転、外部キーボード着脱など）を実装時に必ず想定し、「N回呼ばれても同じ最終状態に収束するか」をレビュー観点に加える。
- CLAUDE.mdの「キーボード持ち上げ時のシートはみ出し修正」の過去の教訓（2026-07-09）は「上端が画面外に出る」パターンだったが、今回は「下端側の縮小が多重適用されて全体が潰れる」新パターン。両者は根は同じ「イベント再発火を想定していない一回限りの計算」であるため、今回の修正後はCLAUDE.mdの当該セクションに「フィールド間フォーカス移動時の多重縮小」の教訓も追記することを推奨する（実装フェーズで対応）。

## 不明点（推測にとどまる事項）
- 実機での`keyboardWillShow`がフィールド間移動時に実際に何回・どんな`kbHeight`値で再発火するかは未確認（推測ベース）。方針Cの計装、または方針Aの冪等化実装後の実機確認で裏付けを取ることを推奨する。

---

# 設計書2 — 設定画面フィードバック欄キーボード被り、再々調査（根本原因特定）
（2026-07-11調査。バックアップ: `.claude/plan.md.bak-login-design-2026-07-11`にログイン設計退避済み）

## 原因の特定（ほぼ確定）
`public/index.html`の`#feedback-text`は`.screen-scroll-content`の最後の要素。`public/app.css`の`.screen-scroll-content`は`padding: 0 20px 80px`（下側の伸びしろは80pxのみ）で、実機ログの要求スクロール量（146〜239px）に対して全く足りない。JSロジック自体（祖先探索・`scrollTop`加算）は正しく動作しているが、`scrollTop`は`scrollHeight - clientHeight`で頭打ちになるため「命令は出したが動かせる余地が無かった」。

副次確認: 「`rectBottom`が常に652.25で固定」に見えるのは異常ではなく、ログ送信がスクロール適用**前**のタイミングだから（設計通り）。仮説3（コンテナ取り違え）は否定済み。仮説4（`resize:'none'`）は前提条件であり妥当。

## 修正方針
キーボード表示中のみ`.screen-scroll-content`に一時的な`padding-bottom`（`kbHeight`分程度）を動的付与し、スクロールの伸びしろを確保してから`scrollTop`を加算する。キーボードを閉じたら元に戻す（リセット漏れに注意）。

副次対応（任意）: `settings_kb_fallback_result`の直後にスクロール適用後の`rect`を再取得してログに追加し、「命令は出したが実際に動いたか」を検証可能にする。

## 変更ファイル一覧
`public/app.js`（`_liftVisibleSheetForKeyboard`の画面直下フォールバック処理、`_resetSheetKeyboardOffset()`）／`public/index.html`（キャッシュバスティング）／`public/sw.js`（`CACHE_NAME`更新）

## 受け入れ基準
- 「改善要望」欄・ニックネーム欄にフォーカスした際、テキストエリアと送信ボタンが画面内に見える位置までせり上がる
- キーボードを閉じた際、元の状態（`padding-bottom:80px`）に戻る
- 予定表・コース画面など他の`.screen-scroll-content`使用箇所、`.plan-modal`/`.plan-sheet`系の既存対策に回帰がない

## 再発防止策
「スクロールで押し上げる」対策では、対象コンテナの実際にスクロール可能な量が要求量を上回っているか必ず考慮する。対象がスクロールコンテナの末尾に近い場合、既存paddingだけでは不足しがちなので、キーボード表示中は動的に伸びしろを確保する設計を標準パターンにする。診断ログは「要求値」だけでなく「適用後の実測値」も併記する。

---

# 設計書3 — iOSスプラッシュ画面が表示されないバグの修正
（2026-07-11 planner調査・設計）

## 原因調査の結論
- `ios-app/resources/splash.png`は実在し内容も意図通り。画像自体に問題なし
- `ios-app/package.json`に**`@capacitor/splash-screen`プラグインが存在しない**。`capacitor.config.js`にも`SplashScreen`関連設定が一切ない
- `ios-deploy.yml`のアセット生成ステップ自体は妥当だが、`@capacitor/assets`はバージョン固定なし
- **主因（可能性が高い）**: プラグイン未導入のため、生成された画像を表示・保持・フェードアウトする制御主体がアプリ内に存在しない。表示時間が短すぎる説は主因の結果として現れている副次症状

## 変更方針（設計のみ）
1. `ios-app/package.json`に`@capacitor/splash-screen`（`^6.0.0`系）を追加
2. `ios-app/capacitor.config.js`の`plugins`に`SplashScreen`設定を追加（案。正確なキー名は実装時に公式ドキュメントで確認）: `{ launchShowDuration: 1000, backgroundColor: '#FFF9F2', showSpinner: false, launchAutoHide: true }`
3. `ios-deploy.yml`の「Generate app icons」ステップ名を実態に合わせて改名（任意）
4. `capacitor-assets`のバージョンを`package.json`の`devDependencies`に固定（再現性対策）
5. `npx cap sync ios`の実行順序（アセット生成の後）は妥当、変更不要

## スコープ外
ダークモード専用スプラッシュ、Android対応、スプラッシュ画像デザイン変更

## 変更ファイル一覧
`ios-app/package.json` / `ios-app/capacitor.config.js` / `.github/workflows/ios-deploy.yml`

## リスク
`@capacitor/splash-screen`の正確なiOS向け設定キー名は実装時要確認。Web版に相当機能がなくローカル検証不可、TestFlight実機確認が必須。ダークモード端末での見え方は未検証。

---

# 設計書4 — 「おすすめ」機能をジャンル未設定時に非表示にする
（2026-07-11 planner調査・設計）

## 調査結果（CLAUDE.mdの記述と実装が乖離）
- 「すべて」チップと「おすすめ」チップは**完全に独立した別チップ**、両方常時表示
- 「すべて」チップは無条件で`filterCats.clear(); _recommendModeActive=false`する**純粋な全件表示リセット専用ボタン**（兼用構造ではない）
- 「おすすめ」チップは`toggleCatFilter('recommend')`で`_recommendModeActive`をトグル。ジャンル未設定でもブロックされずON化する
- ジャンル未設定のまま有効化すると`renderEventCards()`内でインライン案内（⭐+説明文+「ジャンルを設定する」ボタン、時間制限なし）を表示。CLAUDE.md記載の`#recommend-setup-banner`（5秒バナー）は現状のコードに存在しない
- ジャンル未設定判定は`getGenreList().length === 0`（`localStorage.app_genres`）
- 「すべて」チップとは独立しているため、「おすすめ」チップだけ非表示にしても全件表示リセット機能に影響なし

## 受け入れ基準
- ジャンル未設定時、「おすすめ」チップが非表示。ジャンルを1つ以上設定後は表示されON/OFF機能する
- ジャンル全解除で0件に戻すと、ホーム画面で再び非表示に
- おすすめモードON中にジャンルを全解除した場合、`_recommendModeActive`を強制falseにリセットし`renderEventCards()`再実行

## 変更方針（案）
1. `_syncRecommendChip()`を拡張し`.active`トグルに加え`display`制御も担わせる
2. 呼び出しタイミング: アプリ初期化時・設定画面でのジャンル選択変更時・`switchNav('home')`遷移時
3. ジャンル0件時の`_recommendModeActive`強制リセットガードを追加
4. `renderEventCards()`内の既存案内分岐（1362-1375行目）は**削除せず残す**（フェイルセーフとして機能）
5. i18n: 表示/非表示はCSS制御のみで新規文言は発生しない

## スコープ外
「すべて」チップの挙動変更、`genreMatch()`ロジック変更、ジャンル設定UI自体の変更、CLAUDE.md該当セクションの実態への更新（別タスク推奨）

## 変更ファイル一覧
`public/index.html`（表示制御用属性追加） / `public/app.js`（`_syncRecommendChip()`拡張、呼び出し箇所追加、強制リセットガード）

## リスク・未解決の質問
現状のインライン案内（グリッド内表示、時間制限なし）についても「非表示にしてほしい」という解釈でよいか要確認。チップ表示/非表示の同期タイミングは実装時に即時反映・遷移時両方対応が望ましい。

## 承認状況（4件共通）
未承認。ユーザーの承認待ち。

---
（旧「Googleアカウント/Apple IDログイン機能」設計書は`.claude/plan.md.bak-login-design-2026-07-11`に退避済み。要点は`.claude/next.md`にも記録済み）

---

# 設計書5 — 「予定を追加」モーダル操作後にタップ操作全体が効かなくなる重大バグ（緊急調査）
（2026-07-11 planner緊急調査。TestFlight配信中ビルド commit de66bb2 で報告。ユーザーより「de66bb2より前から発生していた可能性が高い」との訂正あり）

## 症状（ユーザー実機報告）
「予定を追加」系のモーダル（`.plan-modal`/`.plan-sheet`、特に`#plan-custom-modal`/`#plan-event-modal`/`#plan-detail-modal`）を開いた直後・閉じた直後に、アプリが操作不能になる。
- ボトムナビ（ホーム/コース/予定表/設定）やその他のボタンがタップに反応しなくなる
- 「予定」画面のコンテンツのスクロール操作だけはできる
- 完全なJSフリーズ（無限ループ）ではなく、タップ/クリックだけが効かなくなる。「見えない何かがタップイベントを吸い込んでいる」典型的なオーバーレイ残留系の症状

## 調査の経緯・スコープ
当初「de66bb2（キーボード多重縮小修正・`.screen-scroll-content`動的padding-bottom追加）が原因では」との仮説で調査を開始したが、ユーザーから「de66bb2より前から起きていた可能性が高い」との訂正を受け、`public/app.js`のモーダル開閉・キーボード対策コード全体（2026-07-09「全画面共通キーボード被り対策」実装以降の全履歴）に調査範囲を拡大した。

## 原因の特定：**不明（確定的な単一原因はコードリーディングのみでは特定できず）。ただし構造的な欠陥を複数確認した。実機ログ（`logs/debug-nav.log`）には該当症状の再現ログが記録されておらず、机上の静的解析による仮説止まりであることに留意。**

### 確認できた事実（静的コード解析で確定）

1. **`de66bb2`時点のキーボード関連差分自体に、タップを奪うような明白なバグは見当たらない**
   - `.screen-scroll-content`（`flex:1; min-height:0; overflow-y:auto; box-sizing:border-box`）へ動的`padding-bottom`を付与しても、`box-sizing:border-box`のため要素の外形（bounding box）サイズは変化しない。内部の`scrollHeight`が伸びるだけで、ボトムナビ（`position:fixed`、独立した兄弟要素、`z-index:9999`）の上に当たり判定が拡大して重なることは物理的に起きない。**仮説C（padding-bottom残留による当たり判定拡大）は棄却**。
   - `_adjustSheetForKb`/`_resetSheetAfterKb`の冪等化ロジック自体は、シート（`.plan-modal`/`.plan-sheet`）のインラインstyle（`max-height`/`height`/`bottom`）と`dataset`の操作に閉じており、オーバーレイ（`.plan-modal-overlay`）や`bottom-nav`には触れていない。**仮説B（今回変更がオーバーレイのz-index/pointer-eventsに影響）も直接の証拠はなし**。

2. **モーダルを閉じる関数群（`closePlanModal`/`closeCourseSheet`/`closeCourseDetail`/`closeTitleEdit`/`closeDatePickerSheet`等）は、いずれも`_resetSheetKeyboardOffset()`や`_resetSheetAfterKb()`を呼んでいない**（`public/app.js` 4223行目`closePlanModal`など）。
   - `_resetSheetKeyboardOffset()`が呼ばれるのはCapacitorの`keyboardWillHide`ネイティブイベント発火時のみ（222行目）。
   - キーボード表示中に✕ボタンでモーダルを閉じた場合、「モーダルを閉じる（`.visible`除去）」と「キーボードが閉じる（`keyboardWillHide`発火）」の順序はOS/WebView側のタイミングに依存し保証がない。理論上、シートのインラインstyle（`bottom`等）や`.screen-scroll-content`の`dataset.kbOrigPaddingBottom`がリセットされないまま残るケースがあり得る（**推測**。実機ログでの確証なし）。ただしこれらは全て「非表示中のシート」または「ボトムナビの外側にあるスクロールコンテナ」への操作であり、単独でボトムナビのタップを奪う直接証拠にはならない。

3. **`.plan-modal-overlay`（`#plan-modal-overlay`）は`position:fixed; inset:0; z-index:3099`の全画面オーバーレイで、`display:none/block`をJSのインラインstyleで直接制御している**（CSSクラス`.visible`方式ではない。他の同クラス要素は`classList.add('visible')`方式で、この点だけ実装方式が不統一）。
   - 表示側: `openEventPlanModal`(3828)/`openCustomPlanModal`(3873)/`openPlanDetailModal`(3911)/`openCustomPlanEdit`(4208)の4箇所で`style.display='block'; style.opacity='1'`。
   - 非表示側: `closePlanModal`(4226-4227)の1箇所のみで`style.display='none'; style.opacity='0'`。
   - `openEventPlanModal`/`openCustomPlanModal`は`try { ... } catch(e) { unlockScroll(); throw e; }`で囲われているが、オーバーレイの`display:block`セット（3828/3873行目）は**catch節でロールバックされない**。もしオーバーレイ表示後・シートの`.visible`追加前後に例外が発生した場合（例: `requestAnimationFrame(() => _syncTimeInputUI(...))`内の非同期エラーはtry/catchのスコープ外でそもそも捕捉不可）、オーバーレイだけが`display:block`のまま取り残され、`opacity:0.4`の半透明幕が画面全体を覆いタップを吸い続ける状態になり得る（**推測**。現状の`_syncTimeInputUI`はnullガード済みで例外を投げにくく、発生頻度は低いと考えられるが、構造的リスクとして排除できていない）。
   - `bottom-nav`は`z-index:9999`、`plan-modal-overlay`は`z-index:3099`で、両者は同じ`body`直下のスタッキングコンテキストにあるため、**通常はz-index比較でbottom-navが正しく上に来てタップを受け取れる**。したがってオーバーレイが残留＝即bottom-nav無反応、という単純な図式ではなく、症状再現には別の要因（フォーカスの残留、iOS WKWebViewのヒットテスト遅延等）が絡んでいる可能性がある。

4. **`openPlanDetailModal(planId, 'custom')`という呼び出し経路は現状のコードに存在しない（デッドコード）**。関数内に`lockScroll()`の二重呼び出しになりうる分岐（`openCustomPlanEdit`呼び出し後に`unlockScroll`なしで`return`）があるが、実際に`planType==='custom'`で呼ばれる箇所がないため、**現在発生している症状の原因ではないと判断**（起きうる潜在バグとして記録はするが、今回の原因からは除外）。

5. CLAUDE.mdに記載の「ゴーストクリック」問題（`touchend`ハンドラとonclick属性の二重登録、iOS WKWebViewでの遅延clickイベント）は、`plan-modal-overlay`本体の背景タップ（`onclick="closePlanModal()"`のみでガードなし）を含め、未対応箇所として既知（CLAUDE.md「未対応の類似要素あり」に明記済み）。ただしこれは「✕ボタン/背景タップ自体が効かない」系統の話で、**「モーダル操作後に無関係な他ボタン（ボトムナビ等）まで効かなくなる」という今回の症状とは性質が異なる**。関連は薄いと考えられるが、iOS実機のタッチイベント処理の特殊性（遅延ゴーストクリック）が今回の症状の一因になっている可能性はゼロではない。

## 未解決の疑問・確認できなかったこと
- 実際にどの操作（✕ボタン/背景タップ/スワイプ/OSの「戻る」ジェスチャー等）でモーダルを閉じた場合に再現するか、ユーザー側の詳細な再現手順が不明
- `logs/debug-nav.log`には本症状発生時のログが記録されていない（今回のための計装ポイントが未投入のため）
- iOS WKWebView特有のタッチイベント/ヒットテストの遅延・キャッシュ挙動が絡んでいる可能性があるが、これはコードリーディングだけでは検証不可能
- de66bb2より「前から」起きていたとのユーザー証言はあるが、正確にどの時点のビルドから発生していたかは未確認（2026-07-09の「全画面共通キーボード被り対策」実装が疑わしい起点候補だが確証なし）

## 修正方針（提案）

原因を一つに断定できないため、**構造的リスクを一つずつ潰す防御的対応**を提案する。

1. **最優先: 実機再現時の状況を`_sendDebugLog`で計装してから対応する**
   - 症状発生が疑われるタイミング（モーダルclose直後、`keyboardWillHide`発火時等）で、`document.getElementById('plan-modal-overlay')`をはじめとする全オーバーレイの`getComputedStyle().display`/`pointer-events`と、フォーカス中の要素、`document.elementFromPoint()`でボトムナビ位置に実際にどの要素が存在するかをログ送信する計装を一時的に追加し、ユーザーに再現してもらってから`logs/debug-nav.log`で実態を確認する。これをせずに推測だけで修正すると再発リスクが残る。
2. **`.plan-modal-overlay`の表示制御をインラインstyleから他要素と同じ`classList.add/remove('visible')`方式に統一する**（設計不統一の解消。CSS側に`.plan-modal-overlay.visible{display:block;opacity:1}`は既に定義済みなので、JS側の4箇所の表示処理と1箇所の非表示処理を`classList`操作に揃えるだけで済む）。これにより「表示はstyle操作・非表示は別経路」のような取りこぼしパターンを構造的に防止できる。
3. **モーダルを閉じる全関数（`closePlanModal`/`closeCourseSheet`/`closeCourseDetail`/`closeTitleEdit`/`closeDatePickerSheet`等）で、`_resetSheetKeyboardOffset()`を明示的に呼ぶ**（Capacitorの`keyboardWillHide`イベント任せにしない）。モーダルを閉じる操作は「キーボードも閉じるべきタイミング」でもあるため、閉じる関数側から能動的にキーボード関連の後始末を行うことで、イベント発火順序への依存をなくす。
4. **`openEventPlanModal`/`openCustomPlanModal`のcatchブロックで、`unlockScroll()`に加えて`plan-modal-overlay`の非表示化・シートの`.visible`除去も行う**（オーバーレイ残留の可能性をtry/catchレベルで確実に潰す）。
5. （リスクは低いが併せて解消する場合）`openPlanDetailModal`内のデッドコード分岐（`planType==='custom'`時の二重`lockScroll`リスク）を、将来的な事故防止のため整理する。

上記2〜4は「有力容疑者」への対症療法であり、**1の実機ログ計装による事実確認を経ないまま2〜5だけを実施しても、真因が別にある場合は再発する可能性がある**点に留意。

## 変更するファイル一覧（想定）
- `public/app.js`（計装追加、`plan-modal-overlay`表示制御の統一、モーダルclose関数群への`_resetSheetKeyboardOffset()`追加、catchブロックの後始末強化）
- `public/index.html`（`app.js`/`sw.js`のキャッシュバスティングバージョン更新のみ、構造変更なし）
- `public/sw.js`（`CACHE_NAME`バージョン更新のみ）

## 受け入れ基準
- 「予定を追加」モーダルを開いてキーボードを表示→入力→✕ボタンで閉じる、を繰り返してもボトムナビ・FAB等が常にタップに反応し続けること
- モーダルをキーボード表示中に閉じた場合でも、`plan-modal-overlay`が`display:none`（またはpointer-eventsが効かない状態）に戻っていること（`getComputedStyle`で確認）
- 上記操作を複数回（5〜10回）連続で行っても症状が再現しないこと（実機・TestFlightビルドで確認）

## 再発防止策
- オーバーレイ系要素の表示/非表示制御方式（インラインstyle直書き vs `classList.visible`）をコードベース全体で統一する。CLAUDE.mdの「UIスタイル規約」に「オーバーレイの表示切替は`classList.toggle('visible')`方式に統一する」旨を明記することを推奨
- モーダルを開く関数は必ず「開く処理が始まったら、途中で失敗しても必ずクリーンアップされる」ことを保証する共通ヘルパー化（例: `_openModal(overlayId, sheetId, renderFn)`のような共通関数に集約し、個々の関数でオーバーレイ表示/非表表示ロジックを重複させない）を今後の改修で検討する
- 「タップは効かないがスクロールは効く」系の症状は今後も同種のオーバーレイ残留・z-index/pointer-events異常である可能性が高いため、次回以降はまず`document.elementFromPoint(x,y)`を使った実機計装ログを最初に仕込み、推測ベースの修正より先に事実確認を行う運用にする

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書6 — 「すべて」チップからスワイプで次タブへ移動できないバグ（調査）
（2026-07-11 investigator調査。コード変更なし、原因調査と修正方針のみ）

## 症状
ホーム画面（`#screen-home`）で、カテゴリ「すべて」の状態から画面を左右スワイプしてもタブが切り替わらない（他のカテゴリへ進めない）。ユーザーは「おすすめチップを非表示にしたのが原因では」と推測。

## 対象機能の正確な特定
ユーザーの言う「スワイプでタブ移動」は、チップ行（`#filter-row-category`）自体の横スクロールではなく、**ホーム画面本体（`#screen-home`）へのタッチジェスチャーでカテゴリを前後に切り替える別機構**である。

- 実装箇所: `public/app.js` 1537〜1579行目「カード領域スワイプでタブ切り替え」ブロック
- `CAT_ORDER = ['all', 'recommend', 'event', 'show', 'gourmet', 'sale', 'opening']`（1539行目、DOM取得ではなく固定配列）
- `_currentCatIdx()`（1542〜1547行目）: 現在の選択状態から`CAT_ORDER`内のインデックスを算出
- `_switchCatBySwipe(dir)`（1549〜1557行目）: `idx + dir`で次のカテゴリを求め`toggleCatFilter(CAT_ORDER[next])`を呼ぶ
- `homeEl`（`#screen-home`）の`touchstart`/`touchmove`/`touchend`（1560〜1578行目）: 水平方向の移動が50px以上のスワイプで`_switchCatBySwipe`を発火

`#filter-row-category`のチップ行自体には別途「タップ即時反応」用の`touchstart`/`touchend`ハンドラ（1520〜1535行目）があるのみで、チップ行の横スクロールとカテゴリ切り替えは連動していない（チップ行スクロールは通常のCSS overflow-x、`_switchCatBySwipe`実行後に`chip.scrollIntoView(...)`で追従させているだけ）。

## 原因の特定（コードを読んだ根拠あり。推測ではなく事実として確認）

**ユーザーの推測は部分的に正しいが、直接の原因は「チップが非表示になったこと」自体ではなく、同じcommit（de66bb2）で追加された`_syncRecommendChip()`内の「ジャンル未設定時に`_recommendModeActive`を強制OFFへ戻すガード」処理と、既存のスワイプ機構が組み合わさって発生する新規の相互作用バグである。**

### 発生シーケンス（ジャンル未設定ユーザーが「すべて」から右スワイプした場合）
1. `_switchCatBySwipe(+1)`が呼ばれる。`_currentCatIdx()`は`filterCats.size===0 && !_recommendModeActive`なので`'all'`のインデックス0を返す
2. `next = 0 + 1 = 1` → `CAT_ORDER[1] = 'recommend'` → `toggleCatFilter('recommend')`を呼ぶ
3. `toggleCatFilter('recommend')`内（`public/app.js` 1288〜1294行目）: `getGenreList().length > 0`でない（＝ジャンル未設定）ため`else`分岐に入り、**`_recommendModeActive = true`に強制セットされる**（チップが非表示かどうかのチェックはここには無い。ジャンル設定の有無しか見ていない）
4. `toggleCatFilter`は続けて`_syncCatChips()` → `_syncRecommendChip()`を呼ぶ（1301〜1302行目）
5. `_syncRecommendChip()`（de66bb2で追加されたガード、2129〜2139行目）: `hasGenres = false`かつ直前の手順3で`_recommendModeActive`は`true`になったばかりなので、`if (!hasGenres && _recommendModeActive)`が真になり、**同じ呼び出しの流れの中で即座に`_recommendModeActive = false`に戻し、`renderEventCards()`を再実行してしまう**
6. `toggleCatFilter`の最後（1305行目）でさらに`renderEventCards()`が呼ばれるが、この時点で`filterCats`は空・`_recommendModeActive`も`false`に戻っているため、結果的に「すべて」の時と全く同じ表示状態に収束する

つまり、スワイプ操作自体（`_switchCatBySwipe`の呼び出しや`CAT_ORDER`のインデックス計算）は正常に動作しており、`toggleCatFilter('recommend')`も実際に呼ばれている。しかし**呼ばれた直後に、同commitで追加された「ジャンル0件なら強制的にOFFへ戻す」ガードが割り込んで即座に打ち消してしまう**ため、ユーザーからは「スワイプしても何も起きない（すべてから動かない）」ように見える。

さらに、この状態から再度右スワイプしても`_currentCatIdx()`は再び`'all'`（インデックス0）を返す（`filterCats`は空、`_recommendModeActive`もfalseのため）ので、毎回同じ`CAT_ORDER[1]='recommend'`に向かおうとして同じ現象を繰り返す。**結果として「すべて」から先（`event`・`show`・`gourmet`・`sale`等）へは、ジャンル未設定である限りスワイプでは絶対に到達できない**（`recommend`が経路上の1マス目に居座り続けるため）。これがユーザー体験としての「すべてから次のタブへスワイプで移動できなくなった」の実体である。

### 補足: チップ非表示自体が引き起こす見た目の問題
仮に上記の相互作用バグが無かったとしても、`_switchCatBySwipe`が`toggleCatFilter('recommend')`に到達した場合、`_syncCatChips()`により**非表示の「おすすめ」チップに`.active`クラスが付与される**（1312行目）。ユーザー視点では「アクティブなチップがどれも見えない」状態になり得る。これは`CAT_ORDER`が「表示中のチップ」ではなく「機能として存在するカテゴリ全て」を無条件に列挙した固定配列であることに起因する、設計書4の変更が意図せず露呈させた既存の構造的リスクである（設計書4以前は全チップが常時表示だったため、このズレは顕在化していなかった）。

### de66bb2以前との比較（因果関係の裏付け）
- de66bb2以前: 「おすすめ」チップは常時表示。ジャンル未設定でスワイプ/タップで`recommend`に入っても、`_syncRecommendChip()`に強制OFFガードが存在しなかったため`_recommendModeActive=true`のまま維持され、`renderEventCards()`内の既存インライン案内（「あなた好みのイベントを表示」＋「ジャンルを設定する」ボタン、1440〜1449行目、削除されずに残置）が表示される仕様だった。スワイプで「すべて→おすすめ」へは正常に進めていたと考えられる
- de66bb2以降: 上記5.の強制OFFガードが割り込むため、スワイプで`recommend`へ進んだ瞬間に`all`相当へ引き戻される

## ユーザー推測の評価
「おすすめチップを非表示にしたのが原因」は**方向性としては正しい**（de66bb2が原因commitであることは一致）が、正確には「非表示にしたこと」自体ではなく、**同じcommitで追加した「ジャンル未設定時の強制OFFガード」ロジックが、非表示化と同時に追加されたことで、既存のスワイプ機構（`CAT_ORDER`固定配列が非表示チップも含めて列挙する設計）と衝突した**、という2つの変更の組み合わせが原因である。

## 修正方針（案。複数オプション、要選定）

以下はいずれか単独でも解消するが、根本対応としては(A)+(B)の組み合わせを推奨する。

**(A) スワイプの`CAT_ORDER`を「現在表示中のチップ」から動的に算出する**
`_switchCatBySwipe`内で固定配列`CAT_ORDER`を使う代わりに、`#filter-row-category .filter-chip`をDOM順に取得し、`display:none`の要素（`offsetParent === null`等で判定）を除外したリストからインデックス計算する。今後チップの表示/非表示が増えても自動的に追従できる。

**(B) `toggleCatFilter('recommend')`自体に非表示状態のガードを追加する**
`recommend`チップが非表示（＝ジャンル未設定）の状態では、そもそも`toggleCatFilter('recommend')`を「ONにできない」ようにする（現在の「ONにしてから`_syncRecommendChip()`で即座に戻す」という遠回しな二段構えをやめ、入口でブロックする）。タップ経路（チップ自体が非表示なので通常発生しない）・スワイプ経路の両方に効く。

**(C, 代替/補助) `_syncRecommendChip()`の強制OFFガードを`toggleCatFilter`の外に出す想定の見直し**
現状は「一度ONにしてから戻す」設計のため、`renderEventCards()`が同一操作内で二重に呼ばれる無駄もある（4.と6.）。(B)を採用する場合、この`_syncRecommendChip()`側のガードは「設定画面でジャンルを全解除した際の後追いリセット」用途に限定する形に整理できる（呼び出し経路の整理は実装時に判断）。

**選定にあたっての推奨**: (A)は「非表示要素を機構から除外する」という今回の不具合の本質的な再発防止になるため必須級。(B)は`toggleCatFilter`という共有関数の呼び出し元（タップ・スワイプ双方）に対して一貫した振る舞いを保証するため、(A)と合わせて実施するのが望ましい。(A)のみだと、将来別の経路（キーボード操作等）から`toggleCatFilter('recommend')`が直接呼ばれた場合に同じ穴が残る。

## 変更するファイル一覧（想定）
`public/app.js`（`_switchCatBySwipe`/`_currentCatIdx`まわり、`toggleCatFilter`内の`recommend`分岐）

## 受け入れ基準（修正後にこうなればOK）
- ジャンル未設定の状態で、ホーム画面「すべて」から右スワイプすると、`recommend`をスキップして`event`（またはCAT_ORDER上で表示されている次のカテゴリ）に直接切り替わる
- ジャンル設定済みの状態では、従来通り「すべて」→「おすすめ」→「イベント」…の順でスワイプ移動できる
- スワイプ後、非表示チップに`.active`クラスが付与された状態（どのチップも見た目上アクティブに見えない状態）が発生しない
- 設定画面でジャンルを追加/全解除した直後も、チップの表示/非表示とスワイプ順序の整合性が崩れない

## 再発防止策
- チップ・タブ等のUI要素を`display:none`で動的に出し分ける変更を行う際は、その要素を対象にした「固定配列でのインデックス操作」「`querySelectorAll`での一覧取得」が他に無いか、変更前に`grep`等でコードベース全体を横断確認する（今回のケースでは`CAT_ORDER`という一見無関係な配列が存在に気づかれにくい形で影響を受けた）
- 「非表示化」と「状態を強制的に戻すガード」を同じcommitで同時に導入する場合、両者の呼び出し順序・再入（同一関数呼び出しの流れの中で状態が書き換わって戻る）が無いか、変更後にシミュレーションする
- CLAUDE.mdの「おすすめモード」記述（`#recommend-setup-banner`5秒表示）は設計書4の調査時点で既に実態と乖離していることが判明済み（インライン案内に変更されている）。ドキュメント更新は別タスクとして推奨（本調査のスコープ外）

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書7 — 「予定を追加」モーダル操作後にボトムナビだけが選択的に反応しなくなる重大バグ（実機ログに基づく再調査）

（2026-07-11 investigator再調査。設計書5の実機ログ計装により事実確認できたため、設計書5「原因不明」を更新する。コード変更なし、原因調査と修正方針のみ。実機で再現・修正確認は未実施）

## 症状（ユーザー確認済み、精緻化後）
「予定を追加」モーダル（`#plan-custom-modal`）でタイトル・メモを入力後、✕ボタンで閉じると、直後から**ボトムナビ（ホーム/コース/予定表/設定の4ボタン）だけ**がタップに反応しなくなる。画面内のスクロールやコンテンツ内のボタンタップは正常に動作し続ける。約2分後に前触れなく突然復帰する。

## 実機ログ（`logs/debug-nav.log`）から再構成した確定時系列（`ts`昇順、該当箇所抜粋）
```
closePlanModal_before  activeElementId: "plan-custom-memo"  ← ✕ボタンタップでモーダルを閉じた瞬間。フォーカスがまだtextareaに残っている
closePlanModal_after   activeElementId: "plan-custom-memo"
keyboardWillHide_before
keyboardWillHide_after
+689ms  nav_touchend target:"plan"    fired:true  ← 正常動作
+492ms  nav_touchend target:"settings" fired:true → switchNav_settings → title_position screen:"settings" innerHeight:873（通常932。キーボードがまだ閉じ切っていない高さ）
（この後、115580ms=約2分、ログが一切記録されない＝ボトムナビのtouchendハンドラ自体が発火していない）
+115580ms nav_touchend target:"home" fired:true  ← 前触れなく突然復帰、以降は正常
```

## 原因の特定：**推測（実機ログによる状況証拠は強いが、iOS WKWebView内部の確定的な検証はできていない）**

### 確認できた事実（コード上、確定）
1. **`closePlanModal()`（`public/app.js` 4286〜4300行目）にはフォーカスを外す処理（`.blur()`や`document.activeElement.blur()`）が一切ない。** モーダルを閉じる処理は`.plan-modal-overlay`/`.plan-custom-modal`等の`classList.remove('visible')`のみで、内部の`<input id="plan-custom-title">`/`<textarea id="plan-custom-memo">`にフォーカスが残っている場合、そのフォーカスはDOM上に残り続ける（非表示になっても自動的にblurされる保証はない）。
   - コードベース内で唯一`.blur()`を呼んでいるのは`closeTitleEdit`相当の処理（3467行目、`title-edit-input`専用）のみで、`closePlanModal`を含む他のモーダルclose関数には存在しない。
2. **実機ログで`closePlanModal_before`時点の`activeElementId`が実際に`"plan-custom-memo"`であることが確認された**（設計書5の時点では「実機ログでの確証なし」だったが、今回のログで実証された）。つまりユーザーがメモ欄に入力した状態のまま✕ボタンで閉じており、フォーカスが外れないまま`.plan-modal`が非表示化されている。
3. **フォーカスが残ったtextareaを含む`.plan-modal`は`#screen-plan`とは別のDOM要素**（body直下に配置されており、`switchNav`が`#screen-plan`を`display:none`にしても、`.plan-modal`自体・内部の`textarea`は連動して非表示/blurされない）。
4. モーダルを閉じた直後、ほぼ同時に`keyboardWillHide`ネイティブイベントが発火している（フォーカスが残ったtextareaに対してキーボードを閉じようとするネイティブ処理と推測される）。
5. その後、ユーザーは複数回ボトムナビをタップしており（`plan`→`settings`→`plan`→`settings`等、649ms〜1148ms間隔）、これらは全て`fired:true`で正常に`switchNav`まで到達している。**つまりフォーカス残留・keyboardWillHide自体は、直後の数回のナビタップでは症状を起こしていない。**
6. **フリーズが実際に始まるのは、`nav-settings`タップで`switchNav('settings')`が実行され、`title_position screen:"settings" innerHeight:873`（キーボード分縮小されたままの高さ）が記録された直後**。この`innerHeight:873`という値自体が、この時点で「キーボードがまだ完全には閉じ切っていない（またはWKWebViewのビューポート情報がまだキーボード表示中の値のまま）」状態を示している。
7. この状態遷移（設定画面表示＋キーボードがまだ閉じきっていない過渡状態）の直後から、ボトムナビの`touchend`イベント自体がおよそ2分間まったく発火しなくなる（`_sendDebugLog`が1件も送信されない＝`touchend`ハンドラの先頭にある`_sendDebugLog`呼び出しにすら到達していない）。

### 推測（確証なし）
- iOS WKWebView上で、**フォーカスが残ったまま非表示化された`<textarea>`が存在する状態で、キーボードのwill-hideアニメーション/first responder解除処理と、直後の画面遷移（`switchNav`によるDOM表示切替＋`window.scrollTo`）が重なる**と、WKWebView側のタッチイベントディスパッチ機構が一時的に混乱し、`position:fixed`要素（ボトムナビ）への`touchstart`/`touchend`のヒットテスト・イベント配送が数十秒〜数分単位で遅延・停止することがある、という仮説。これはCLAUDE.mdに記載の既知トラブル領域（「iOS WKWebViewのタッチイベントとCSS transition/レイアウトシフトの相互作用」）と同種の、Appleの一般的な既知の問題（フォーカス解除とキーボードdismissアニメーションの競合によるヒットテスト遅延）に近い現象と推測される。
- `innerHeight:873`（本来932）のまま`settings`画面のタイトル位置が記録されている点から、**キーボードが閉じきる前にJS側の画面遷移処理が走ってしまっている**（`keyboardWillHide`イベントとその後の操作の順序保証がない、というのは設計書5で既に指摘済みの構造的リスクと一致する）。
- なぜ「ボトムナビだけ」が選択的に死ぬのか（画面内スクロールは生きている）の正確な機構は、コードリーディングのみでは断定できない。ボトムナビが`position:fixed`である点、かつ4つのナビボタンすべてに影響が及ぶ点から、個別ボタンの状態異常ではなく、**WKWebView側の「fixed要素に対するタッチイベント配送」レイヤーそのものが一時的に機能不全に陥っている**と推測するのが最も整合的。フォーカス漏れ（未`blur()`）がこの状態を誘発する引き金になっている可能性が高いが、確定的な証明はできない。

## ユーザー仮説（当初提示の座標ズレ/ゴーストクリック説）の評価
- 「✕ボタンタップ時にボトムナビの座標とすり替わる」という仮説は、実機ログ上は否定的。ログに残る`nav_touchend`はすべて`dx:0, dy:0`（クリックしたボタンの座標と離した座標が完全一致）であり、対象ボタン（`settings`等）に対して正規に発火している。ボタンの取り違えではなく、**フォーカス残留とキーボードdismissのタイミング競合による、WKWebView内部のイベント配送遅延**という別の原因の方が実機ログと整合する。

## 未解決の疑問
- なぜ「2分」というほぼ一定の長さで自然回復するのか（アプリのバックグラウンド/フォアグラウンド遷移、OS側のタイムアウト処理等の関与は未確認）
- `_liftVisibleSheetForKeyboard`のsetTimeout(80ms)やCSS `transition: bottom 0.2s ease`が、フォーカス残留・keyboardWillHideの competing タイミングとどう絡むかは、実機でのタイムライン計測が必要（今回の計装では粒度不足）
- Web版（Safari）で同一手順を再現した場合に同じ症状が出るか未確認（`_isCapacitorApp`分岐のため、WKWebView固有の可能性が高いという仮説の傍証にはなるが未検証）

## 修正方針（提案）

**最優先: `closePlanModal()`（および他のモーダルclose関数群）で、モーダルを閉じる際に確実にフォーカスを外す。**

1. **`closePlanModal()`の先頭付近に、フォーカスが自モーダル内の要素にある場合は`document.activeElement.blur()`を呼ぶ処理を追加する。** 理想的には「閉じようとしているモーダル（`.plan-modal`）の内部に`document.activeElement`が含まれる場合のみblurする」形にし、無関係な要素のフォーカスを誤って奪わないようにする。
2. 同様のフォーカス残留リスクは`closeCourseSheet`/`closeCourseDetail`/`closeTitleEdit`（既に`title-edit-input`のみblur済みだが網羅性を再確認）/`closeDatePickerSheet`等、入力要素を持つ他のモーダルclose関数にも横展開で確認する。
3. **`switchNav()`が`closeAllPopups()`を呼ぶより前に、現在フォーカスされている要素があれば無条件でblurする、という共通対策も検討する**（個別モーダルごとの対応漏れを構造的に防止できる）。ただし、意図的にフォーカスを保持したい遷移（もしあれば）がないか事前確認が必要。
4. **副次対応**: `_onCapKeyboardHide`（`keyboardWillHide`ネイティブイベントハンドラ）や`switchNav`が、直前の`closePlanModal`等での後始末（blur・`_resetSheetKeyboardOffset`）が完了してから走るよう、処理順序の保証を強化できないか検討する（設計書5で指摘済みの「イベント発火順序への依存」の解消と共通の対応）。

**このアプローチは「フォーカス残留が真因である」という推測に基づく対症療法であり、実機での再現・修正確認が必須。** 万一これでも再発する場合、iOS WKWebView側のより深い問題（Capacitor/WKWebViewのバージョン起因の既知バグ等）の調査に切り替える必要がある。

## 変更するファイル一覧（想定）
- `public/app.js`（`closePlanModal`他モーダルclose関数群へのblur処理追加。可能なら`switchNav`/`closeAllPopups`レベルでの共通対策も検討）
- `public/index.html`（`app.js`/`sw.js`のキャッシュバスティングバージョン更新のみ）
- `public/sw.js`（`CACHE_NAME`バージョン更新のみ）

## 受け入れ基準
- 「予定を追加」モーダルでタイトル・メモ欄に入力→✕ボタンで閉じる、を5〜10回連続で行っても、その都度ボトムナビが正常にタップに反応し続けること
- モーダルを閉じた直後に`document.activeElement`が`document.body`（またはモーダル外の何らかの要素）になっており、モーダル内のinput/textareaにフォーカスが残っていないこと（実機・Web両方で`document.activeElement`を確認）
- 上記操作の直後に間髪入れずボトムナビの複数ボタンを連続タップしても、2分間相当の無反応状態が発生しないこと（TestFlightビルドでの実機確認必須）

## 再発防止策
- **モーダル・ボトムシートを閉じる関数は、内部に入力要素（input/textarea）を持つ場合、必ずフォーカスを明示的に外す（`blur()`）ことを標準パターンとして統一する。** CLAUDE.mdの「iOS / Capacitor 開発ノウハウ」に「モーダルを閉じる際は必ずフォーカスを外す」旨を追記することを推奨。
- 今後同種の「特定領域だけタップが効かなくなる」系の不具合調査では、`document.activeElement`の記録を診断ログの標準項目にする（今回はこの項目のおかげで真因候補を特定できた）。
- キーボード表示中に入力要素を持つモーダルを閉じる操作（✕ボタン・背景タップ・スワイプ等）は、「フォーカスが残ったまま閉じられるケースがないか」を実装時に必ずチェックリスト化する。

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書8 — 「予定を追加」モーダル→ボトムナビ無反応バグ、追加診断計装の設計（実装フェーズ向け）

（2026-07-11 investigator追加調査。設計書7の対症療法〈blur処理〉実装後もユーザー実機で症状再現の可能性が残るため、次段階の切り分けに必要な診断計装を設計する。**コードは書かない。実装はbuilderが行う。この計装一式は原因特定後に削除する使い捨てである。**）

## 症状の再整理（今回追加されたユーザー証言を反映）
- 「予定を追加」モーダル（`#plan-custom-modal`）でタイトル欄（`#plan-custom-title`、`<input>`）とメモ欄（`#plan-custom-memo`、`<textarea>`）の**間でフォーカスを切り替えてから**✕で閉じた場合にのみ発生する、とユーザーが証言。他のモーダル（コース作成シートのメモ欄、設定画面のフィードバック欄・ニックネーム欄など、単一入力欄のみで完結するもの）では発生しない。
- 「画面がわずかに下がったように見える」という視覚申告があり（比較用の「正常時」スクショはなく厳密な裏付けはまだ無い）、見た目のレンダリング位置と実際のヒットテスト座標系の不整合の可能性を示唆している。

## この追加証言が指す2つの仮説（優先度順）

### 仮説1（最有力）: `keyboardWillShow`のフィールド間再発火と`_adjustSheetForKb`/`_resetSheetAfterKb`の往復による過渡状態
設計書1（実装済み・commit de66bb2想定）で`_adjustSheetForKb`は「初回のみ`dataset.kbOrigHeight`を保存し、以降はその値を基準に絶対値で計算する」冪等方式に修正済み。この修正により「縮み続ける」問題は解消したはずだが、**フィールド間移動時に`keyboardWillHide`が挟まって発火した場合**、`_onCapKeyboardHide()` → `_resetSheetKeyboardOffset()` → `_resetSheetAfterKb()`が呼ばれ、`dataset.kbOrigHeight`・`dataset.kbIsMaxH`が**削除**される（167〜169行目）。その直後に`keyboardWillShow`が再発火すると`_adjustSheetForKb`は再び「初回」として扱われ、`origH`を**その時点の（既にリセットされ、かつ場合によってはアニメーション`transition: bottom 0.2s ease`途中の）`getComputedStyle`値**から取り直す。この「reset→re-init」の往復が、✕ボタンで閉じる時点の`closePlanModal()`実行タイミングと重なると、`_resetSheetAfterKb`が「既にdatasetが無い（＝何もしない）」状態で呼ばれたり、逆に直前の`keyboardWillShow`で入れ直された新しい`dataset`値を消しそこねたりする可能性がある。
**未確認点**: フィールド間移動で実際に`keyboardWillHide`が挟まって発火するのか、それとも`keyboardWillShow`のみが連続発火するのか自体が実機で未検証（設計書1の「不明点」がそのまま残っている）。今回の証言（「フィールド間移動を経由した場合のみ発生」）はこの仮説を補強するが、確定はしていない。

### 仮説2: フィールド間移動特有の`input`↔`textarea`キーボード再構築が、WKWebViewのタッチイベント配送状態異常のトリガーになっている
`<input type="text">`と`<textarea>`はiOSキーボードの入力ビュー（inputAccessoryView等）が微妙に異なる場合があり、フォーカス切り替え時に「キーボードを一度隠して別のキーボードを出し直す」ネイティブ処理が走る可能性がある。これが設計書7で確認された「フォーカス残留＋keyboardWillHideのタイミング競合」をより強く誘発する、という仮説。単一入力欄のみのモーダルではこの「キーボード種別切り替え」自体が発生しないため症状が出ない、という説明とも整合する。

## 追加する計装（実装フェーズ向け、具体的な設計）

### 前提: 全て使い捨て。原因特定後に削除する。恒久基盤（`_sendDebugLog`/`POST /api/debug-log`）自体は残す。

### 計装A: ボトムナビの`touchstart`ログ追加（タップ未達の切り分け）
- 対象: `public/app.js` 1608〜1627行目「ボトムナビ 即時タップ対応」ブロック内、既存の`btn.addEventListener('touchstart', ...)`ハンドラの中（`_navTouchStartX/_navTouchStartY`を記録している箇所）。
- 追加内容: この`touchstart`ハンドラの先頭で `_sendDebugLog('nav_touchstart', { target: s })` を送信する。
- 目的: 現状`touchend`ハンドラの先頭でのみログを送っているため、「タップしたのに`nav_touchend`すら記録されない」フリーズ中に、そもそも`touchstart`が届いているかどうかを区別できていない。これを埋める。
- 期待される切り分け: フリーズ中にユーザーがボトムナビをタップした際、`nav_touchstart`だけ記録され`nav_touchend`が来ない場合→タッチシーケンスの後半（指を離す動作）でイベントが失われている。`nav_touchstart`すら記録されない場合→そもそもタップ自体がこの要素にヒットテストされていない（見た目と実際の要素位置がズレている可能性、仮説2寄り）。

### 計装B: `document`レベル（capture phase）のグローバル`touchstart`監視リスナー（受動的・記録専用）
- 追加位置: `public/app.js`冒頭、`_sendDebugLog`定義の直後あたり（他の使い捨て計装と同じ並び）。
- 実装方針: `document.addEventListener('touchstart', e => { ... }, { passive: true, capture: true })` で登録する。**`preventDefault()`や`stopPropagation()`等、イベント伝播やデフォルト動作を一切変更しない（`passive: true`を必ず指定し、ブロッキングを物理的に不可能にする）**。CLAUDE.mdに記録されている「グローバルclickブロックの重大バグ（2026-07-10）」の教訓を踏まえ、**今回は記録のみで一切ブロックしない設計であることをコメントで明記する**。
- 送信内容案: `_sendDebugLog('global_touchstart', { targetTag: e.target.tagName, targetId: e.target.id || null, targetClass: (typeof e.target.className === 'string' ? e.target.className : null), x: e.touches[0].clientX, y: e.touches[0].clientY, isNavDescendant: !!e.target.closest('.bottom-nav') })`
- 頻度制御: 通常操作でも大量発火するため、**常時有効にはしない**。実装時は以下いずれかの方式を検討:
  - (a) 症状再現待ちの調査期間中のみ有効にする単純なフラグ（コード上に固定で仕込み、調査後に削除）
  - (b) モーダルclose後、一定時間（例: 計装Dのタイマーと合わせて10秒間）だけ`true`にするフラグ`_globalTouchWatchActive`を用意し、それ以外は早期returnしてログを送らない（サーバー・ログファイルへの負荷軽減、無関係操作のノイズ削減の両面で望ましい）
  - 実装時は(b)を推奨するが、簡易さを優先するなら(a)でも可（判断はbuilderに委ねる）
- 目的: 「ボトムナビ要素個別の問題」なのか「JS全体としてタッチイベントが届いていない（WKWebView側のグローバルな配送停止）」なのかを切り分ける。フリーズ中に他の画面内ボタン操作は正常という証言があるため、フリーズ中に`global_touchstart`が他の要素（画面内カード等）では記録されるがボトムナビでは記録されない、という結果が得られれば「ボトムナビ領域だけがヒットテストで別の要素に奪われている」ことの強い証拠になる。

### 計装C: レイアウト・座標系のスナップショット（「画面が下がった」視覚申告の客観的裏付け）
- 関数名案: `_debugLogLayoutSnapshot(tag)`（既存の`_debugLogModalCloseState`と対になる新規ヘルパー）
- 記録内容:
  - `document.body`: `getBoundingClientRect()`（top/bottom/left/right/height）、`getComputedStyle(document.body).transform`、`getComputedStyle(document.body).position`、`document.body.scrollTop`
  - `document.documentElement`（html）: 同上（rect / transform / position / scrollTop）
  - `#screen-plan`（症状発生時に表示されている画面。他画面でも汎用化する場合は`document.querySelector('.screen-wrapper.visible, [id^="screen-"].visible')`等で動的に取得する案もあるが、まずは`#screen-plan`固定で十分）: `getBoundingClientRect()`、`getComputedStyle().transform`、内部スクロールコンテナ（`.screen-content`または`.screen-scroll-content`に該当する子要素）の`scrollTop`
  - `.bottom-nav`: `getBoundingClientRect()`（見た目の位置。計装Dで毎回記録するnav要素の位置と突き合わせて「見た目とJS認識のズレ」を確認する）
  - `window.visualViewport`（存在する場合）: `height`, `offsetTop`, `offsetLeft`, `scale`
  - `window.innerHeight` / `window.scrollY`（参考値として）
- 呼び出し箇所:
  1. `closePlanModal()`内、既存の`_debugLogModalCloseState('closePlanModal_after')`（4327行目）の直後に`_debugLogLayoutSnapshot('closePlanModal_after')`を追加
  2. `_onCapKeyboardHide()`内、既存の`_debugLogModalCloseState('keyboardWillHide_after')`（268行目）の直後に`_debugLogLayoutSnapshot('keyboardWillHide_after')`を追加
  3. 計装Dのタイマーからも同関数を呼ぶ（tagに経過秒数を含める）
- 目的: ユーザーの「画面が下がった」主観的申告に対する客観データ。`body`/`html`/`#screen-plan`に意図しない`transform`・`padding-top`・`scrollTop`が残っていないか、`visualViewport.offsetTop`が0に戻っているか（キーボード関連のビューポートオフセットが残留していないか）を確認する。

### 計装D: モーダルclose後の時系列タイマー計装（状態の時間変化・不変化を追う）
- 追加位置: `closePlanModal()`の末尾（既存処理の後）。
- 実装方針: `closePlanModal()`が呼ばれた際に、1秒おき・計10回（10秒間）、`setInterval`または`setTimeout`の連鎖で以下を実行する:
  - `_debugLogModalCloseState('closePlanModal_timer_' + i)`（既存関数を再利用。ヒットテスト結果を含む）
  - `_debugLogLayoutSnapshot('closePlanModal_timer_' + i)`（計装C）
  - 加えて、その時点の`document.activeElement`・`_scrollLockDepth`（lockScroll/unlockScrollの深度カウンタ。下記「計装E」参照）も同ログに含める
- 目的: フリーズが「一瞬の過渡状態」ではなく「持続する固定状態」であることを確認する（設計書7のログでは約2分間ログが一切無かったため、その間の状態が本当に固定されたままなのか、実は数秒単位で変化しているが単に発火していないだけなのかは未確認）。10秒間の記録により、少なくとも直後の変化傾向を掴む。
- 注意: `closePlanModal()`は多重に呼ばれうる（`closeAllPopups()`経由など）ため、タイマーの多重起動を避ける実装上の配慮が必要（例: 直前のタイマーをクリアしてから新規に張り直す、モジュールスコープの変数でタイマーIDを保持する等）。判断・実装はbuilderに委ねる。

### 計装E: `_scrollLockDepth`（lockScroll/unlockScrollの深度カウンタ）の記録 ★新規着眼点
- 背景（今回の追加調査で判明）: `lockScroll()`/`unlockScroll()`（`public/app.js` 3836〜3848行目）は`body`への`position:fixed`方式ではなく、**`document.addEventListener('touchmove', _preventBgScroll, {passive:false})`をグローバルに追加/削除する深度カウンタ方式**（`_scrollLockDepth`）。コードベース全体で`lockScroll()`呼び出しが12箇所、`unlockScroll()`呼び出しが14箇所あり、対応関係が一見非対称（if分岐で複数箇所からunlockする設計自体はあり得るため、これ単体は「バグ確定」ではないが、深度カウンタの不整合＝リスナーの外し忘れ／二重解除は、今回のフリーズ症状の未知の一因になりうる構造的懸念として計装対象に加える）。
- `_preventBgScroll`自体は`touchend`ではなく`touchmove`にのみ作用するため、「ボトムナビの`touchend`が来ない」症状と直接には一致しないように見えるが、**同一タッチシーケンス中に`touchmove`側で`preventDefault()`されたことが、WKWebView内部でそのシーケンスの`touchend`配送に影響する可能性は排除できない**（未確認・推測）。少なくとも「後始末忘れ」の構造的リスクとして記録しておく価値がある。
- 追加内容: 計装C/Dのログ（`_debugLogLayoutSnapshot`または`_debugLogModalCloseState`のいずれか）に`_scrollLockDepth`の現在値を含める。加えて、`lockScroll()`/`unlockScroll()`本体にも簡易ログを追加する案:
  - `lockScroll()`内: `_sendDebugLog('scroll_lock', { depth: _scrollLockDepth, stack: new Error().stack })`（呼び出し元特定のためstack trace込み。呼び出し頻度が低いため許容範囲）
  - `unlockScroll()`内: 同様に`_sendDebugLog('scroll_unlock', { depthBefore: _scrollLockDepth, stack: new Error().stack })`
- 目的: 「予定を追加」モーダルのフィールド間移動→close、というシーケンスで`_scrollLockDepth`が正しく0に戻っているか、あるいは0にならず`touchmove`のグローバルブロックが残留し続けていないかを確認する。

### 計装F: `dataset`状態遷移の記録（コーディネーター指摘、フィールド間フォーカス移動の追跡）
- 対象: `_adjustSheetForKb(sheet, kbH)`（141〜161行目）と`_resetSheetAfterKb(sheet)`（163〜170行目）。
- `_adjustSheetForKb`内、関数の**冒頭**（何も変更する前）と**末尾**（`sheet.style.bottom`設定後）の2箇所で以下を送信する:
  - `_sendDebugLog('adjust_sheet_kb', { phase: 'enter'|'exit', sheetId: sheet.id || null, kbH, hadOrigHeight: 'kbOrigHeight' in sheet.dataset, origHeightBefore: sheet.dataset.kbOrigHeight || null, isMaxHBefore: sheet.dataset.kbIsMaxH || null, curMaxHeight: getComputedStyle(sheet).maxHeight, curHeight: getComputedStyle(sheet).height, curBottom: getComputedStyle(sheet).bottom, activeElementId: document.activeElement?.id || null })`
  - `exit`側は適用後の`sheet.dataset.kbOrigHeight`・`newH`・`sheet.style.bottom`も含める。
- `_resetSheetAfterKb`内、関数の**冒頭**（早期return判定の直前）で以下を送信する:
  - `_sendDebugLog('reset_sheet_kb', { sheetId: sheet.id || null, hadKbIsMaxH: 'kbIsMaxH' in sheet.dataset, kbIsMaxHValue: sheet.dataset.kbIsMaxH || null, kbOrigHeightValue: sheet.dataset.kbOrigHeight || null, curMaxHeight: getComputedStyle(sheet).maxHeight, curHeight: getComputedStyle(sheet).height, activeElementId: document.activeElement?.id || null })`
  - early return（`if (!('kbIsMaxH' in sheet.dataset)) return;`）で早期終了する場合も、**ログ送信はreturnより前に行う**（early returnしたこと自体が重要な情報のため、`skipped: true/false`をログに含めてもよい）。
- 加えて、`_onCapKeyboardHide()`（`keyboardWillHide`ネイティブイベント本体、265〜269行目）の**冒頭**（`_debugLogModalCloseState('keyboardWillHide_before')`より前、または同じ位置でよい）で、`_sendDebugLog('kb_hide_fired', { activeElementId: document.activeElement?.id || null })`を送る。目的は「フィールド間移動時に本当に`keyboardWillHide`ネイティブイベント自体が発火しているのか（設計書1で未確認のまま残っている論点）」を直接確認すること。
- 目的（コーディネーター指摘への対応）: タイトル欄↔メモ欄のフォーカス往復1回ごとに、`adjust_sheet_kb`（enter/exit）・`reset_sheet_kb`・`kb_hide_fired`がどの順序で・何回発火し、その都度`dataset.kbOrigHeight`/`kbIsMaxH`がどう変化するかを`ts`昇順で完全に再構成できるようにする。特に「✕ボタンで閉じた瞬間（`closePlanModal_before`）の直前に、`reset_sheet_kb`または`adjust_sheet_kb`が実行中だった（＝アニメーション`transition: bottom 0.2s ease`が完了しないうちに次の状態変更が割り込んだ）形跡がないか」を`ts`の間隔（ミリ秒単位）で確認できることが重要。

### 計装Gの追加検討: 入力要素の種別（input/textarea）を記録
- 計装Fの`adjust_sheet_kb`/`reset_sheet_kb`ログ、および計装A/Bの`touch`系ログに、`document.activeElement?.tagName`だけでなく`document.activeElement?.id`も必ず含めること（`plan-custom-title`か`plan-custom-memo`かを判別するため）。これによりコーディネーター指摘の「フィールド間移動を経由したかどうか」をログの時系列から機械的に判定できる（`activeElementId`が`plan-custom-title`→`plan-custom-memo`（またはその逆）と変化した記録があれば「経由あり」と判定できる）。既に計装Fの設計に含めているため、実装時に漏らさないことの確認事項として明記する。

## 実装順序の推奨（builderへの申し送り）
1. 計装F・G（dataset状態遷移。コーディネーター指摘の最優先事項、既存の`_adjustSheetForKb`/`_resetSheetAfterKb`/`_onCapKeyboardHide`に手を入れるだけなので実装コストが低い）
2. 計装A（`touchstart`ログ、既存ブロックへの1行追加で済む）
3. 計装C・D（レイアウトスナップショット＋タイマー。新規ヘルパー関数の追加が必要）
4. 計装E（`_scrollLockDepth`ログ）
5. 計装B（グローバル`touchstart`監視。ノイズが多いため頻度制御の実装判断が必要で、優先度は最後）

## 実機での確認手順（builder実装後、ユーザーに依頼する想定）
1. TestFlightビルドで「予定を追加」モーダルを開く
2. タイトル欄をタップして何か入力
3. メモ欄をタップして何か入力（**ここでフォーカス切り替えが発生する**）
4. 再度タイトル欄をタップ（往復させる、任意で複数回）
5. ✕ボタンでモーダルを閉じる
6. ボトムナビをタップして症状が再現するか確認（再現しない場合は他の閉じ方・往復回数を変えて再試行）
7. 症状の有無に関わらず、`logs/debug-nav.log`を回収し、`ts`昇順で計装A〜Gのイベントを時系列に並べて解析する

## 安全性についての明記（グローバルリスナーに関する念押し）
- 計装Bのグローバル`touchstart`リスナーは、CLAUDE.mdに記録されている2026-07-10の「グローバルclickブロック実装によるボタン無反応の重大バグ」とは性質が異なる。当該バグは`e.preventDefault()`/`e.stopImmediatePropagation()`で**イベント伝播・デフォルト動作を能動的にブロック**したことが原因だった。今回の計装Bは`{ passive: true }`で登録し、`preventDefault`等を一切呼ばない**受動的な記録専用リスナー**であるため、同種の実害は原理的に発生しない。念のためコード上のコメントに「記録専用・ブロックしない」旨を明記することをbuilderに指示する。
- 計装F内の`_adjustSheetForKb`/`_resetSheetAfterKb`へのログ追加は、既存の処理ロジック（縮小・リセットの計算式）そのものを変更しない。ログ送信文（`_sendDebugLog`呼び出し）の追加のみであり、副作用のある処理を新たに挟まないこと（`_sendDebugLog`自体は`fetch(...).catch(()=>{})`のfire-and-forgetで同期処理をブロックしないため安全）。

## 変更するファイル一覧
- `public/app.js`（計装A〜Gの追加のみ。ロジック本体の変更は一切行わない）
- `public/index.html`（`app.js`のキャッシュバスティング用クエリパラメータ更新）
- `public/sw.js`（`CACHE_NAME`のバージョン番号更新）

## 受け入れ基準（この計装タスク自体の受け入れ基準。バグ修正そのものではない点に注意）
- Web版で操作しても`_sendDebugLog`関連のエラーがコンソールに出ないこと（try/catchで握りつぶされている前提だが念のため）
- TestFlight実機で「予定を追加」モーダルのフィールド間フォーカス往復→✕で閉じる、という操作を行った際、`logs/debug-nav.log`に計装A〜Gのイベントが`ts`昇順で記録され、フォーカス往復の回数・`keyboardWillShow`/`keyboardWillHide`の発火回数・`dataset`状態の推移・（症状再現時は）ボトムナビのヒットテスト結果とレイアウトスナップショットが、時系列で追えること
- 計装追加によって、既存のキーボード被り対策・モーダル開閉の見た目の挙動に一切変化がないこと（ログ送信のみの追加であるため）

## 再発防止策（この調査フェーズ自体からの教訓）
- 「症状の再現条件」はユーザーの一言の証言（今回の「フィールド間移動時のみ」）で調査の優先順位が大きく変わる。実機ログだけでなく、症状発生時のユーザー操作の再現手順をできるだけ早い段階で具体的に聞き取ることを今後の調査でも徹底する。
- キーボード対応まわりの「イベント再発火」「多重適用」系の構造的懸念（設計書1で一度発見・修正済み）は、修正後も「reset→re-init の往復」という新たな過渡状態を生み出しうる。冪等化の修正パッチ自体が新しい状態遷移パターンを追加していないか、次回のレビューでも意識する。

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書9 — 「予定を追加」モーダル→ボトムナビ無反応バグ、実機ログ解析による原因特定（決定的証拠に基づく再調査）

（2026-07-11 investigator調査。設計書8で実装した計装A〜Gの実機ログ〈`logs/debug-nav.log`〉を初めて解析できた。加えてユーザー提示の新証拠〈`global_touchstart`計装によるヒットテスト観測〉を検証。**コード変更なし、原因調査と修正方針のみ**。）

## 解析対象ログ
`logs/debug-nav.log`（2957行）。`ts`昇順に再構成し、`closePlanModal_*` / `keyboardWillHide_*` / `adjust_sheet_kb` / `reset_sheet_kb` / `nav_touchstart` / `nav_touchend` / `global_touchstart` / `layout_snapshot` / `modal_close_hittest` / `title_position` / `scroll_lock` / `scroll_unlock` を時系列に突き合わせた。

## 決定的に確認できた事実（実機ログで確証済み。推測ではない）

### 事実1: `window.innerHeight` / `visualViewport.height` は「キーボード表示のたびに932→873へ縮み、`keyboardWillHide`が発火してもすぐには932へ戻らない」という不安定な状態を繰り返す
`layout_snapshot`の`innerHeight`推移を全期間で追跡した結果、次のパターンが繰り返し確認できた（`body`/`html`の`rect`は常に932で不変、`.bottom-nav`の`rect.bottom`は常に`innerHeight`と同値に追従）:

```
935 → (キーボード表示: adjust_sheet_kb kbH:346) → 873 → (kb_hide_fired) → 873のまま変化せず継続 → (数十秒後、画面遷移や別要因で) → 932に復帰
```

`safeAreaInsetTop`は常に59。932-873=59という一致は誤差ではなく、`window.innerHeight`がsafe-area分だけ小さい値のまま固着していることを示す一つの手がかりだが、直接の因果は未確定。

**重要**: 「一度873になったら固定的に873のまま」ではなく、「873のまま持続する期間が数秒〜数十秒とばらつく」「別画面（`course`等）に切り替えると即座に932へ戻る」という挙動が確認された（例: `ts=1783748078909`で`course`へnav遷移した直後の`ts=1783748079003`では即`innerHeight:932`に復帰）。これは「JS側の値が壊れている」のではなく、**iOS側（WKWebView）のビューポートリサイズがネイティブの`keyboardWillHide`アニメーション完了後も遅延し、次の大きなレイアウト変化（画面遷移によるDOM操作）をトリガーに再計算されている**ことを示唆する。

### 事実2: 「873のまま」の期間中、`.bottom-nav`へのタップは`document`レベルでは検知されている（`global_touchstart`記録あり）が、`.nav-item`個別ボタンの`touchstart`ハンドラ（`nav_touchstart`）は発火しない
`ts=1783748046639`〜`1783748050136`の約3.5秒間で、`.bottom-nav`への`global_touchstart`が8回記録されているが、この間`nav_touchstart`は一切記録されていない。この状態は少なくとも`ts=1783748045807`（`keyboardWillHide_after`、873のまま）〜`1783748072045`（ようやく`nav_touchstart`成功）までの**約26秒間**継続した。

### 事実3（今回の最重要な新発見）: 同じ873状態・同じ期間中、`document.elementFromPoint()`によるプログラム的ヒットテスト（`modal_close_hittest`計装）は一貫して正しく`.nav-item`の子要素（`nav-icon`）をヒットし続けている
`modal_close_hittest`ログ（`closePlanModal_timer_1`〜`_10`で1秒おきに記録）は、フリーズ期間中も一貫して`navHitTest.hitClass: "nav-icon", isNavBtnOrDescendant: true`を報告している。すなわち：

- **CSSレイアウト・座標系としては、`.nav-item`は常に正しい位置に存在し続けている**（`document.elementFromPoint(cx, cy)`で正しくヒットする）
- しかし**実際のiOSネイティブタッチイベント配送だけが、同じ座標に対して`.nav-item`ではなく親の`<nav class="bottom-nav">`要素をターゲットとして`touchstart`を発火させている**

この2つの経路（JS/CSSOMのヒットテストAPI vs 実際のUIKit/WKWebViewタッチジェスチャー認識）の間に食い違いが生じていることが、ログから直接確認できた。ユーザーが今回提示した「`global_touchstart`のtargetがほぼ全て`NAV`（`.bottom-nav`自体）」という観測は、この食い違いの表出そのものである。

### 事実4: `_scrollLockDepth`に異常なし
フリーズ期間中を含め、`scrollLockDepth`は常に0または1の正常範囲で推移しており、リークや負数化は確認されなかった。`unlockScroll()`が`depthBefore:0`で複数回呼ばれる場面はあるが（`closeAllPopups()`が多数のcloseX関数を無条件に呼ぶ設計のため）、`if (_scrollLockDepth <= 0) return;`のガードにより実害はない。**設計書8で懸念事項として挙げていた「lockScroll/unlockScrollの深度カウンタ不整合」は、今回の症状の原因ではないと判断できる。**

### 事実5: `_adjustSheetForKb`の冪等化（設計書1で実装済み）は正しく機能している
`adjust_sheet_kb`ログを見る限り、フィールド間フォーカス移動（`plan-custom-title`→`plan-custom-memo`→`plan-custom-title`）のたびに`keyboardWillShow`が再発火し`_adjustSheetForKb`が複数回呼ばれているが（`hadOrigHeight:true`のケース）、常に同じ`newH:450.16px`に収束しており、シートが際限なく縮む挙動（設計書1が修正した旧バグ）は再現していない。**設計書1の冪等化修正は有効に機能している。今回のボトムナビ無反応バグとは別系統の問題であることが確認できた。**

## 原因の特定：iOS WKWebView固有の「position:fixed要素へのタッチイベント配送とヒットテストAPIの不一致」（推測を含むが、実機ログによる強い状況証拠あり）

### 確立した事実からの推論
1. `resize:'none'`設定下でも、キーボード表示中は`window.innerHeight`/`visualViewport.height`が実際に縮む（Capacitor Keyboardプラグインの既知の限界。「WebViewのフレームをリサイズしない」ことと「`visualViewport`のAPI値がネイティブキーボードオーバーレイに応じて変化する」ことは別物であり、後者は`resize:'none'`では止められない）。
2. `.bottom-nav`は`position:fixed;bottom:0`のため、縮んだ`visualViewport`に追従して視覚的位置が上に移動する（`getBoundingClientRect()`が示す通り、CSSレイアウトエンジン上は正しく追従している）。
3. `keyboardWillHide`が発火した後も、iOS側のスクロールビュー・ビューポートの実際のリサイズ完了にはアニメーション遅延があり、その間`window.innerHeight`は縮んだ値のまま報告され続ける（=WKWebView内部の「レイアウト計算に使う値」と「実際にキーボードが占有していた領域が解放されたかどうか」に一時的なズレが生じる過渡期間が存在する）。
4. **この過渡期間中、iOS/WKWebViewのネイティブタッチジェスチャー認識（UIKit側のヒットテスト）は、`position:fixed`要素の子孫に対するタッチ配送で、CSSOM上のヒットテスト（`document.elementFromPoint`が使う経路）とは異なる、独自の（かつ一時的に不正確な）座標系・キャッシュされたレイヤー情報を参照している可能性がある。** これは、WKWebViewが`position:fixed`要素の合成レイヤー（compositing layer）を、ビューポートのリサイズ中に再構築するタイミングに起因する既知の複雑な領域であり、Appleのcontent-inset調整（`contentInset:'always'`設定）とキーボード非表示アニメーションが重なるケースで特に発生しやすいと推測される。
5. `<nav>`自体（親要素）がタッチのターゲットとして解決されている（子の`.nav-item`ではなく）ことから、**WKWebView側は「そのタッチ座標がこの合成レイヤー（fixed要素の矩形）の中である」ことまでは正しく認識しているが、レイヤー内部の子要素へのヒットテストの再計算がまだ古い（またはキャッシュされた）状態のまま**、という解釈が最も整合的である。

### この推測の裏付けとなる状況証拠（実機ログ）
- 常に`.bottom-nav`（親）へのヒットに丸められており、無関係な別要素へのヒットではない → fixed要素の合成レイヤー自体は正しく特定できている
- `document.elementFromPoint()`は同じ瞬間に正しく子要素を返す → CSSOM/レイアウトツリー自体は破壊されていない
- 数十秒後、画面遷移（DOM操作を伴う`switchNav`実行）をきっかけに復帰する → 大きなレイアウト変化がWKWebView側のレイヤー再構築・タッチヒットテストキャッシュのリフレッシュを誘発している可能性

### 確定できないこと（推測にとどまる部分）
- WKWebView内部の合成レイヤー・ヒットテストキャッシュの実装詳細はブラックボックスであり、上記4.は状況証拠からの推論であって、Appleの内部実装を確認したものではない
- なぜ「26秒」「その後926ms後に1回成功」なのか、具体的なタイマー・アニメーション完了通知等の起点は特定できていない
- `contentInset:'always'`設定を外した場合に本症状が緩和されるかは未検証（推測レベルの仮説であり、実機検証が必要）

## 修正方針（提案。優先度順）

### 方針A（最有力・根本対応に近い）: `resize:'none'`を見直し、`resize:'ionic'`または`resize:'native'`への変更を検討する
今回の問題の根本は「`resize:'none'`にもかかわらず`visualViewport`が実際に縮む」という前提の狂いにある。Capacitor Keyboardプラグインの`resize`モードには`'body'`/`'ionic'`/`'native'`/`'none'`があり、モードによってWKWebViewのビューポート・contentInsetの扱いが異なる。`resize:'none'`は「アプリ側で全て手動制御する」前提のモードであり、**iOS側が意図せず`visualViewport`を変化させてしまう今回の実測結果と矛盾する**。他のresizeモード（特に`'native'`）は、キーボード表示・非表示にOS標準の挙動を使うため、WKWebView側のレイヤー再構築タイミングもOS標準の経路に乗り、今回のような非同期のズレが起きにくい可能性がある。
- **リスク**: `resize`モードを変えると、既存のキーボード被り対策一式（`_adjustSheetForKb`等、シート側で`kbH`を使って手動縮小するロジック）の前提が変わるため、全面的な再検証が必要。CLAUDE.mdに記載の「resize:'none'→ナビの上に被さる自然な挙動」という設計意図とも衝突するため、変更する場合は既存のキーボード対策ロジックとの整合を取り直す設計が別途必要（本設計書のスコープ外、別タスクとして切り出すことを推奨）。

### 方針B（対症療法・実装コストが低い）: `keyboardWillHide`後、`innerHeight`が実際に元に戻るまで待ってから通常操作を許可する、または強制的にレイアウトの再計算をトリガーする
`_onCapKeyboardHide()`内、`_resetSheetKeyboardOffset()`実行後に、**`.bottom-nav`を含む何らかの要素に対して強制リフローを引き起こす操作**（例: `document.body.style.display='none'; void document.body.offsetHeight; document.body.style.display=''`のような手法、または`.bottom-nav`自体に対する軽微なスタイル変更→即時撤回によるレイヤー再構築の強制）を試みる。これはWKWebView側のレイヤーキャッシュ・ヒットテスト情報のリフレッシュを能動的に誘発することを狙った対症療法であり、事実5（画面遷移で復帰する）から着想している。
- **リスク**: 強制リフローの具体的な実装・効果は実機検証してみないと分からない。空振りに終わる可能性がある。

### 方針C（対症療法・確実性は高いが体験に妥協あり）: `.bottom-nav`自体に`touchstart`/`touchend`ハンドラを追加し、タップ座標から対象ボタンを`elementFromPoint`または矩形計算で特定して手動でディスパッチする
`.nav-item`個別ボタンへのイベント配送がWKWebView側で失敗するなら、**より外側の`.bottom-nav`（今回、実際にタッチイベントのターゲットとして解決されている要素）に`touchend`ハンドラを追加し、タップ位置のx座標から対象ボタン（home/course/plan/settings）を計算して`switchNav()`を直接呼ぶ**、という迂回策。事実3（`document.elementFromPoint()`はこの状態でも正しく動く）を踏まえると、`.bottom-nav`の`touchend`ハンドラ内で`document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)`を呼べば、正しい子要素を特定できる可能性が高い。
- **利点**: WKWebViewの内部実装の謎を解明せずとも、「親要素にイベントが来ることは常に保証されている」という事実5の観測結果だけを使って迂回できる。既存の`.nav-item`個別ハンドラは残したまま、`.bottom-nav`側に「保険」としてフォールバックハンドラを追加する形にすれば、既存動作への影響も最小限にできる。
- **リスク**: 既存の`.nav-item`個別`touchstart`/`touchend`と`.bottom-nav`側の新規ハンドラが二重発火しないよう、座標ベースのタップがどちらか一方でのみ処理されるよう設計する必要がある（例: `.nav-item`側で処理された場合は`.bottom-nav`側の処理をスキップする、またはその逆）。

### 方針D（併用推奨・監視強化）: `keyboardWillHide`後、`innerHeight`が実際に元の値へ復帰したことを`resize`イベントで検知し、復帰前は視覚的な注意喚起やリトライ導線を出さない
根本原因の解消ではなく、実害の緩和策。`window.addEventListener('resize', ...)` で`innerHeight`の変化を監視し、`keyboardWillHide`後もしばらく古い値のままである期間を可視化・計測することで、方針A/B/Cの効果検証にも使える。

### 推奨する進め方
1. **方針C（`.bottom-nav`への座標ベースのフォールバックハンドラ）を最優先の実装候補とする。** 理由: 今回のログで「`document.elementFromPoint()`は常に正確」「タッチイベントは常に`.bottom-nav`自体には届く」という2つの事実が確認できており、この2つの事実だけに依拠する迂回策のため、WKWebViewの内部実装のブラックボックス部分を推測に頼らず確実に対応できる。
2. 方針Cと並行して、方針B（強制リフロー）を軽量に試し、効果があれば方針Cと併用（根本的な復帰を早める効果があれば、フォールバックの発動頻度自体を減らせる）。
3. 方針A（`resize`モード変更）は影響範囲が大きいため、方針C/Bで実害を止めた上で、別タスクとして中長期的に検討する。

## ユーザーの依頼事項への回答

### 1. なぜ`.nav-item`の当たり判定領域が`.bottom-nav`コンテナの高さいっぱいに広がっていない状態になり得るのか
CSS上の`.nav-item`のレイアウト（`flex:1`によるstretch）自体に問題はない。`grep`の結果、`public/app.js`内に`.nav-item`へ動的にstyleを設定する箇所は存在せず、`.bottom-nav`/`.nav-item`のCSSも他のセレクタで上書きされている箇所はない。キーボード対応コード（`_adjustSheetForKb`等）も`.plan-modal`/`.plan-sheet`のみを対象にしており、`.bottom-nav`/`.nav-item`には一切触れていないことをコード上で確認済み。**「当たり判定領域がCSS的に縮小・消失している」わけではない**（`document.elementFromPoint()`が常に正しい子要素を返している事実がこれを裏付ける）。真の原因は、CSSレイアウトではなく、**WKWebViewネイティブ層のタッチイベント配送だけが一時的に親要素へフォールバックしている**ことにある。

### 2. `innerHeight`/`visualViewport.height`が932→873のまま戻らない件
実機ログで確認した通り、「永久に戻らない」のではなく「`keyboardWillHide`発火後、次の大きなレイアウト変化（画面遷移等）まで数秒〜数十秒間、古い値のまま留まる」という不安定な過渡状態であることが判明した。`_resetSheetKeyboardOffset()`/`_onCapKeyboardHide()`はシート（`.plan-modal`/`.plan-sheet`）のインラインstyleをリセットしているのみで、`window.innerHeight`自体はブラウザ/WKWebViewが管理する読み取り専用プロパティのため、そもそもJSから直接リセットすることはできない。ここはJS側の実装漏れではなく、**WKWebView側のビューポートリサイズの完了タイミングがネイティブの`keyboardWillHide`通知そのものより遅れている**ことが原因である（推測。iOS側の内部実装のため確定できない）。

### 3. 修正方針（CSS防御的修正の検討について）
ユーザー提案の「`.nav-item`に`height:100%`/`align-self:stretch`を明示的に追加する」対応は、**CSSレイアウト自体は既に正しく機能している（`document.elementFromPoint()`が証明済み）ため、今回の症状には効果がないと考えられる**。問題はCSSの当たり判定領域ではなく、WKWebViewのタッチイベント配送そのものであるため、CSS側の防御的修正よりも、上記方針C（座標ベースのフォールバックハンドラ）のようなJS/イベント配送レイヤーでの対応が必要である。ただし、`.nav-item`への明示的な`height:100%`追加自体は、他の副作用のない安全な変更であり、「保険」として追加すること自体は害がない（無意味である可能性はあるが、悪影響もない）。

## 変更するファイル一覧（想定。方針C採用時）
- `public/app.js`（`.bottom-nav`への座標ベースのフォールバック`touchend`ハンドラ追加。既存の`.nav-item`個別ハンドラとの二重発火防止ロジックを含む）
- `public/index.html`（`app.js`のキャッシュバスティング用クエリパラメータ更新）
- `public/sw.js`（`CACHE_NAME`のバージョン番号更新）
- （計装A〜G自体は原因特定に大きく貢献したため、方針C実装後の実機検証が完了するまでは削除せず維持することを推奨。検証完了後にまとめて削除する）

## 受け入れ基準
1. 「予定を追加」モーダルでタイトル⇄メモ欄のフォーカス往復→✕で閉じる操作を10回連続で行っても、その都度ボトムナビが正常にタップに反応し続けること
2. `logs/debug-nav.log`で、症状発生条件下（`innerHeight`が932に戻っていない過渡期間中）にボトムナビをタップした場合でも、`nav_touchstart`/`nav_touchend`相当のログ（または方針C実装後の新規フォールバックログ）が記録され、`switchNav()`が正常に呼ばれること
3. 方針C採用の場合、通常時（`innerHeight`が正常な932の状態）のボトムナビタップの挙動・レスポンス速度に回帰がないこと（二重発火・意図しない画面遷移が起きないこと）

## 再発防止策
- **`document.elementFromPoint()`によるヒットテストと、実際のネイティブタッチイベントターゲットが食い違う可能性がある**、という今回判明した事実は、今後のiOS WKWebView関連の類似調査（「見た目は正しいのにタップが効かない」系）で最初に疑うべき仮説としてCLAUDE.mdに追記することを推奨する。
- `position:fixed`要素（特にbottom-nav、FAB等）は、キーボード表示・非表示のたびにWKWebView側のビューポートリサイズと合成レイヤー再構築のタイミングに晒される。今後`position:fixed`要素にタッチ精度が求められる新規UIを追加する際は、「イベントターゲットが期待通りの子要素になっているか」をログ計装で確認する運用を標準化する。
- 計装（`_debugLogModalCloseState`のヒットテスト部分、`global_touchstart`監視）は、今回のような「JS的には正常なのに実機では効かない」系のバグ切り分けに極めて有効だった。同種の調査では、`document.elementFromPoint()`による理論値と、実際のイベントターゲットの両方を必ず並べて記録する計装パターンを今後も踏襲する。

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書10 — 「予定を追加」モーダル→ボトムナビ無反応バグ、実機ログ再解析（画面遷移をまたぐ持続確認・方針B/C再評価）

（2026-07-11 investigator再調査。ユーザーから「表示より上の空白タップでナビ反応」「画面遷移してもズレが持続する」という2つの新証言を受け、設計書9の結論の一部を実機ログで再検証した。**コード変更なし、原因調査と修正方針の再評価のみ**。）

## 調査の前提確認
- 設計書9で提案された方針C（`.bottom-nav`への座標ベースのフォールバックハンドラ）は commit `993751a`（2026-07-11 05:54 UTC相当）で実装され、`release`ブランチにpush済み・GitHub Actions run `29141984325`でTestFlightビルド完了済み（`origin/release` == `origin/main` == ローカル`main`、差分なしを確認）。
- `logs/debug-nav.log`（6635行）の最終エントリは`2026-07-11T06:09:41Z`。**方針Cのビルドがユーザー実機に反映されるにはTestFlightの配信・端末側の更新反映が必要であり、このログの操作が方針C適用後のビルドによるものかは確認できていない**（ビルド完了時刻とログ最終時刻が数分〜十数分しか離れておらず、TestFlight配信・端末更新の実際の反映タイミングは本調査からは不明）。
- `bottom_nav_fallback_fired`（方針Cのフォールバックハンドラが発火した際のログ）は、ログ全体を通じて**0件**。すなわち今回解析した操作区間では、方針Cのフォールバックが一度も作動していない。

## 新証言1（画面遷移をまたぐ持続）の検証結果：**実機ログで確定的に裏付けられた。設計書9「事実1」の記述は不正確だった**

### 決定的な反証ログ（`ts`昇順、`06:09:28`〜`06:09:41`UTCの約13秒間）
`innerHeight`/`visualViewport.height`が`890`（正常値932ではない）に縮んだ状態のまま、以下の**13回のnav操作（`switchNav()`実行）が連続して行われた**:

```
course→home→course→plan→course→home→course→plan→settings→plan→course→home→course
```

この間、全ての`nav_touchstart`/`nav_touchend`は`fired:true`で正常に発火し`switchNav()`まで到達しているが、**`layout_snapshot`の`innerHeight`は13回のnav遷移すべてで一貫して890のまま一切変化しなかった**（`.bottom-nav`の`rect.bottom`も常に`889.65625`で固定）。設計書9で「画面遷移（`course`等）に切り替えると即座に932へ復帰する」とした唯一の根拠は、単一の事例（`ts=1783748078909→1783748079003`の1件）に基づく早計な一般化であり、今回の13回連続の反証ログにより**「画面遷移では縮小状態は解消されない」が正しい結論**であることが確定した。ユーザーの新証言（「画面が切り替わってもズレは持続する」）と完全に一致する。

### 該当する別の直接原因: 前後の巨大なログ空白（アプリのバックグラウンド化）
上記の890状態は、直前に**約5分14秒間（`06:04:04.427`〜`06:09:18.599`）ログが一切記録されない空白区間**の直後から続いている。この空白の直前（`06:04:02`台）は`innerHeight:873`、直後（`06:09:18`最初のnav操作）は一旦`932`に復帰したのち、`06:09:28`から再び`890`に縮小し、以降13回のnav遷移をまたいで解消しなかった。空白区間中は`closePlanModal`のタイマー計装（1秒おき10回のはずが`timer_2`で途切れている）も止まっており、**iOSでアプリがバックグラウンドに回りJSタイマー・イベント処理自体が停止/スロットルされていた可能性が高い**（推測。ロック画面操作や他アプリ切替の有無はログからは確認不可）。

### `switchNav()`の実装確認（コード上、確定）
`public/app.js` 2720〜2805行目`switchNav(screen)`は、画面のDOM表示切替（`display`/`.visible`トグル）と`window.scrollTo({top:0})`のみを行い、**`window.innerHeight`・`visualViewport`・`.bottom-nav`の位置・`body`/`html`のスタイルを能動的にリセットする処理は一切ない**。`_resetSheetKeyboardOffset()`（`_screenH`の再取得と`.plan-modal`/`.plan-sheet`のインラインstyleクリアのみ）も`switchNav()`内では呼ばれておらず、`keyboardWillHide`ネイティブイベント時にしか実行されない。したがって「画面遷移をすれば直る」という期待自体がコード上何の裏付けもなく、新証言と整合する。

## 新証言2（表示より上の空白タップでナビ反応）の検証結果：**「ペイントとレイアウトのズレ」説は棄却。より単純な「ビューポート自体の縮小」で説明可能。直接の実証ログは今回未取得**

### レイヤー昇格（`will-change`/`transform:translateZ`）の有無
`public/app.css`を`grep`した結果、`.bottom-nav`に`will-change`・`transform`によるレイヤー昇格指定は**存在しない**（`position: fixed; bottom:0` のみ、1932〜1941行目）。ユーザー提示の「独自の合成レイヤーがペイント更新に追従できていない」という仮説を補強する直接的なCSS上の根拠は見当たらなかった。

### `body`/`html`と`.bottom-nav`のrectの関係（ログで確定）
`layout_snapshot`計装の全期間を通じて、`body`/`html`の`getBoundingClientRect()`は常に`932`固定（ドキュメント全体のレイアウトボックスは不変）である一方、`.bottom-nav`のrectは`innerHeight`/`visualViewport.height`の値に**常に正確に追従**していた（例: `innerHeight:873`のとき`bottomNav.rect = {top:751, bottom:873}`、`innerHeight:890`のとき`{top:767.65625, bottom:889.65625}`）。これは`.bottom-nav`が`position:fixed; bottom:0`である以上当然の挙動であり、**レイアウトエンジンとCSSOMヒットテストAPI（`document.elementFromPoint`）は一貫して正しく計算されている**（設計書9の事実3と整合）。

### 「ペイントとレイアウトのズレ」仮説への評価
提示された仮説（「レイアウトは正しい位置に戻っているが、画面に見えている絵だけが古いフレームのまま残像として残っている」）は、**今回集めた事実とは整合しない**。理由:
1. `layout_snapshot`は「一度873/890になったら、次に932に戻るまでずっとその値で安定している」ことを示しており（13回のnav遷移をまたいでも890のまま一定）、"レイアウトは新しい値に切り替わっているのにペイントだけ古い"という短時間の過渡的な不一致ではなく、**長時間（数秒〜数分単位）持続する固定状態**である。ペイントの遅延（通常はフレーム単位=十数ms〜数百ms）で数分間のズレを説明するのは無理がある。
2. `.bottom-nav`のrectそのものが縮んだ値で報告されている（＝レイアウトエンジン自身が「ビューポートが873/890である」という前提で計算している）。これは「レイアウトは正しいがペイントが古い」のではなく、**レイアウトエンジンが参照している“ビューポートサイズ”という入力値自体が、iOS側（WKWebViewのフレーム/contentInset）でまだ縮んだままになっている**、という解釈のほうが単純かつ全ログと整合する。CSSレイアウト計算自体に矛盾や遅延の痕跡はない。
3. したがって「見た目の縮んだナビ」と「実際にタップが命中する位置」は基本的に一致している可能性が高い（ズレているのは物理画面上の"ナビの絵の位置"そのものであり、"絵の位置"と"当たり判定の位置"の間ではない）。ユーザーが「表示より上の空白をタップすると反応する」と感じた場合、最も整合的な説明は、**「縮んだナビの絵」自体が画面の物理下端から離れた上の方に描画されており、その縮んだナビの絵の実際の位置（＝当たり判定も一致する位置）を、ユーザーが無意識に「本来ナビがあるべき通常位置（画面最下端）」だと錯覚し、そこ（今は何も表示されていない空白）をタップしてしまっている**、というものである。つまり「ペイントとレイアウトの内部的な不一致」ではなく、**「ビューポートの縮小そのものが、ユーザーの目には“ナビが上に移動した”のではなく“下に何もない余白ができた”ように見える」という視覚的錯覚**が実体である可能性が高い。

### 未実証事項（正直な限界）
- 上記は「ビューポート縮小」という確定事実からの論理的推論であり、「ユーザーが実際にタップした座標」と「その時点のナビの正確なrect」を直接突き合わせたログは、今回の`logs/debug-nav.log`の範囲では**取得できていない**（`global_touchstart`計装は記録されているが、症状発生が疑われる区間で「ナビの表示範囲の外（上）をタップしてナビが反応した」ことを示す直接ログは見つからなかった。逆に「ナビ範囲の外〈`isNavDescendant:false`〉をタップしてナビに反応しなかった」記録は1件確認できた: `ts=1783749838353`、`targetTag:HTML`, `x=178.3, y=884.3`, `innerHeight:873`時点）。
- 「WKWebViewでレイアウト更新とコンポジット（ペイント）の反映タイミングが非同期になるケースがある」という一般論自体はiOSの技術的に知られた領域だが、**今回の症状がそれに該当するという直接証拠はログ上得られていない**。むしろ全ての客観データは「ビューポートの縮小がJS/CSSレイヤーにも一貫して反映されている（＝内部的な不一致ではない）」ことを示している。

## 修正方針の再評価

### 方針Cについて: 「十分」ではない。効果はあるが対象範囲が限定的
- 方針C（`.bottom-nav`への座標ベースのフォールバック）は「タップイベントのターゲットが`.nav-item`ではなく親の`.bottom-nav`に丸められる」ケースにのみ有効。今回の再解析では、フリーズ区間中も`nav_touchstart`/`nav_touchend`（個別ボタンのハンドラ）が普通に`fired:true`で発火し続けている区間が多数確認できており（06:09:28〜06:09:41の13回連続操作すべて）、**設計書9が想定した「イベントが親要素に丸められる」パターンは、少なくとも今回のログの大半では発生していなかった**。つまり方針Cが対処する現象と、ユーザーが最も強く訴えている「表示より上の空白タップで反応する」現象は、**別物である可能性が高い**。
- 加えて、`bottom_nav_fallback_fired`が0件であることから、方針Cのフォールバック自体が今回のログの範囲では一度も発動していない。これは「症状が起きなかった」のか「起きたが方針Cの対象パターンではなかった」のか、このログだけでは区別できない。

### 方針B（強制リフロー/リペイント）について: 今回の新事実に基づくと優先度を上げるべきだが、対象は「レイアウト再計算」ではなく「ビューポートサイズそのものの復元」にすべき
設計書9提案の方針Bは「`.bottom-nav`や`document.body`に対してtransform変更→即時撤回等でレイヤー再構築を強制する」というペイント起因の対策だったが、今回の再解析で「レイアウトエンジンが参照するビューポート値自体が縮んだまま」という、より根の深い問題であることが分かった。したがって:
- 単純な`display:none→flex`や`transform`のtoggleは、**CSSレイアウトの再計算を強制するだけで、iOS側が保持している"縮んだビューポート/contentInset"という入力値そのものは変わらない可能性が高い**（レイアウトエンジンは常に正しく計算できている、という事実5・事実9との整合性から、これらの手法の効果は限定的と推測される）。
- より直接的なアプローチとして、以下を提案する（いずれも実機検証必須、効果未確認の対症療法）:
  1. **`window.scrollTo`に加え、`switchNav()`内で明示的に`window.dispatchEvent(new Event('resize'))`を発火させ、Capacitor Keyboardプラグイン側やWebViewのリサイズ監視ロジックに再評価を促す**（効果は未検証。WKWebView側の内部状態を書き換える保証はない）。
  2. **Capacitor Keyboardプラグインに、キーボード非表示から一定時間後に`visualViewport.height`が実際に復帰したかを確認し、復帰していなければ`Keyboard.hide()`を再度明示的に呼ぶ、または `webview.reload()`に近い強めのリフレッシュを検討する**（影響範囲が大きいため要別途設計）。
  3. **`_onCapKeyboardHide()`から一定時間後（例: 300〜500ms後）に`window.innerHeight`を再チェックし、まだ縮んだままであれば追加の`_sendDebugLog`で状況を記録しつつ、方針A（`resize`モード変更）の検討材料にする**、という段階的アプローチ。

### 方針Cだけで十分かの判断: **不十分と判断する**
理由:
1. 今回の再解析で、ユーザーが最も強く訴えている症状（画面遷移をまたぐ持続的なズレ、表示位置とタップ位置の不一致の疑い）に対して、方針Cは直接の対策になっていないことが判明した
2. `bottom_nav_fallback_fired`が一度も発火していない一方で、ナビ自体は多くの場面で正常にタップに反応していた（＝「タップが一切効かない」状態ではなく、「見た目が縮んでいる」こと自体が主症状である可能性が高まった）
3. 設計書7で確認された「約2分」・今回確認された「約5分14秒」の完全無反応区間は、方針A〜Dのどれとも異なる、**アプリのバックグラウンド化に起因する別要因の可能性が高い**（未確定）。この区間は方針Cはもちろん、方針Bでも直接は解決しない。

## 今回のユーザー依頼事項への回答まとめ

1. **layout_snapshotの再確認結果**: 「873のまま」ではなく、実際には873→890→932のように微妙に異なる値をとりながら、**いずれも一度縮むと画面遷移13回をまたいでも自然には戻らない**ことが確定した。ユーザー証言と一致。
2. **方針Cが発火した結果かどうかの切り分け**: `bottom_nav_fallback_fired`は0件のため、少なくとも解析したログの範囲では方針Cのフォールバックは発火していない。ナビタップ自体は多くの場面で個別`.nav-item`ハンドラ（`nav_touchstart`/`nav_touchend`）が正常発火しており、「親要素へのイベント丸め」パターン（設計書9が方針Cで対処しようとしたもの）は今回の主症状ではなさそうである。「表示より上をタップしてナビが反応する」現象の直接ログは今回未取得（要追加計装）。
3. **WKWebViewのレイアウト/ペイント非同期説の検討**: 一般論としては存在しうるが、今回集めた全データ（`.bottom-nav`のrectがinnerHeightに正確に追従、`document.elementFromPoint`が常に正しい）はこの仮説より「ビューポートサイズという入力値自体がiOS側で縮んだまま復元されない」という、より単純な説明で足りることを示している。`will-change`/`transform`によるレイヤー昇格も`.bottom-nav`には存在しない。
4. **修正方針の再評価**: 方針Cのみでは不十分。方針B相当（強制リフロー）は「ペイント起因」ではなく「ビューポート値の復元起因」として再設計する必要がある。次のアクションとしては、まず**「表示位置とタップ判定位置が実際にズレているのか」を直接検証する計装**（縮んだ`.bottom-nav`のrectと、ユーザーが実際にタップした座標を突き合わせるログ。既存の`global_touchstart`計装で収集は可能だが、症状発生区間のログが今回はピンポイントで取得できなかった）を追加し、次回実機再現時に回収することを推奨する。

## 変更するファイル一覧（本設計書は調査のみ。次のアクションの想定）
- 追加計装案（実装は別途承認後）: `public/app.js` に、`window.innerHeight`が正規値（932相当、初回ロード時に記録した基準値）と異なる状態が一定時間（例: 3秒）継続した場合に自動で`_sendDebugLog('viewport_stuck', {...})`を送る監視処理を追加する案。既存の`nav_touchstart`/`global_touchstart`と組み合わせ、「縮んだ状態でのタップ座標」と「その時点の`.bottom-nav`の正確なrect」を突き合わせられるようにする。
- 上記はあくまで次段階の調査案であり、本設計書の時点では**コード変更は行わない**。

## 受け入れ基準（本調査自体の受け入れ基準。バグ修正ではない）
- 画面遷移をまたぐズレの持続について、実機ログによる時系列の裏付けが得られたこと（達成済み）
- 「表示より上のタップでナビ反応」現象について、既存ログでの直接証拠の有無を確認し、正直に「今回は直接証拠なし」と報告すること（達成済み）
- 方針B/Cの再評価について、新事実に基づいた具体的な判断（方針Cのみでは不十分、方針Bは対象を再設計すべき）を提示すること（達成済み）

## 再発防止策
- 「画面遷移で直る」という早計な一般化は、単一事例からの推論だった。今後は同種の「一時的に見えるが実は持続する」系の状態異常を調査する際、**最低でも数回〜十数回の連続操作をまたいだログを確認してから「解消する条件」を結論づける**ことを徹底する。
- `window.innerHeight`/`visualViewport.height`のような「JSからは書き込めない、OS管理下の読み取り専用ビューポート値」が異常な状態で固着した場合、CSS側の対策（レイアウト・transform操作）だけでは限界がある可能性を念頭に置き、次回以降はCapacitor Keyboardプラグインの`resize`モード変更（方針A）も含めた、より根本的な対応を早期に検討候補に加える。
- 「タップは効くが見た目がズレる」系と「タップ自体が効かない」系は、症状としては混同されやすいが原因・対策が異なる可能性が高い。今後のユーザーヒアリングでは「反応するがズレて見えるだけなのか」「タップ自体が一切反応しないのか」を早い段階で明確に切り分けて質問することを推奨する。

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書11 — 「予定を追加」モーダル→ビューポート固着バグ、実装可能な修正設計（選択肢1採用、段階的移行方針つき）

（2026-07-11 investigator設計。設計書1・5・7・8・9・10、および実機ログ解析の確証を踏まえた、実装フェーズ〈builder〉向けの具体的修正設計）

## 前提認識（確定済み事実の再掲）
- `window.innerHeight`/`visualViewport.height`は、キーボード表示のたびに縮み、`keyboardWillHide`ネイティブイベント発火後も自然には復元しない（画面遷移13回をまたいでも持続することを実機ログで確認済み・設計書10）
- `.bottom-nav`は`position:fixed;bottom:0`のため、この縮んだビューポートに正確に追従して視覚的に上へシフトする
- CSSレイアウト・`document.elementFromPoint()`は常に正確。実際に縮んだ位置を正しくタップすれば反応する。タッチイベント配送自体の破損（親要素への丸め）は主症状ではないことが判明済み（方針C＝`bottom_nav_fallback_fired`は実機ログで0件）
- ユーザー体感は「ボトムメニューの反応が悪い」ではなく「画面が縮んだ位置のまま固着し、本来の位置に何もない」という視覚的ズレが本質

## 推奨判断: 選択肢1（対症療法・低リスク）を先に実施。選択肢2（`resize`モード変更・高リスク）は効果検証後に判断する2段階アプローチ

### 判断理由
1. 選択肢2は既存のキーボード対策一式（`_adjustSheetForKb`等、複数回のオーバーシュート事故を経て収束した実装）の前提を丸ごと崩す。再設計・再検証コストと事故リスクが非常に高い
2. 選択肢1は「ビューポート値の異常固着」にピンポイントで作用し、既存ロジックへの副作用がほぼゼロ
3. 選択肢1が効かなくても実施自体に実害はない。選択肢2は「まず試して駄目なら戻す」ができるほど軽くない
4. 稼働中の`viewport_stuck`計装で効果を定量検証でき、不十分なら選択肢2へ段階移行できる

### 選択肢2に進むべき条件（あらかじめ明確化）
- 選択肢1適用後も`viewport_stuck`が高頻度で発生し続ける
- `stuckDurationMs`が選択肢1適用前後で有意に短縮されない
- ユーザーから「画面が縮んだまま」の体感報告が選択肢1適用後も継続する

## 選択肢1の具体的実装内容

### 実装方針: フォールバックチェーン方式
`_onCapKeyboardHide()`内、`_resetSheetKeyboardOffset()`実行後に400ms待ってから`window.innerHeight`をチェックし、まだ異常値であれば副作用の小さい順に複数の復元手法を試す。途中で正常値に復元できたら以降はスキップする。

**優先度順**:
1. `window.scrollTo(0,1)→scrollTo(0,0)`: 最も軽量、WKWebViewのスクロールビュー/contentInset再評価を促す
2. `document.body.style.height`の一時変更→撤回: 強制リフロー
3. `window.dispatchEvent(new Event('resize'))`: 実害なし、副次効果狙いで最後に実行
4. Capacitor Keyboard `hide()`の念押し再呼び出し

### 具体的コード変更（`public/app.js`）

**1. `_onCapKeyboardHide()`の拡張**（現状426〜433行目付近）
```javascript
function _onCapKeyboardHide() {
  _sendDebugLog('kb_hide_fired', { activeElementId: document.activeElement?.id || null });
  _debugLogModalCloseState('keyboardWillHide_before');
  _resetSheetKeyboardOffset();
  _debugLogModalCloseState('keyboardWillHide_after');
  _debugLogLayoutSnapshot('keyboardWillHide_after');

  // FIX: ビューポート固着の強制復元試行（選択肢1、設計書11）
  const expectedH = _normalInnerHeight; // _screenHではなく起動時基準値を使う（下記注意点1参照）
  setTimeout(() => _attemptViewportRecovery(expectedH), 400);
}
```

**2. 新規ヘルパー`_attemptViewportRecovery(expectedH)`**
```javascript
// FIX: ビューポート固着の強制復元試行（選択肢1、設計書11。効果不十分なら削除・選択肢2へ移行）
function _viewportRecoveryStep(i, expectedH, steps) {
  if (window.innerHeight === expectedH) {
    _sendDebugLog('viewport_recovery_result', { recovered: true, atStep: i, finalHeight: window.innerHeight, expectedH });
    return;
  }
  if (i >= steps.length) {
    _sendDebugLog('viewport_recovery_result', { recovered: false, atStep: i, finalHeight: window.innerHeight, expectedH });
    return;
  }
  try { steps[i](); } catch (_) {}
  setTimeout(() => _viewportRecoveryStep(i + 1, expectedH, steps), 150);
}

function _attemptViewportRecovery(expectedH) {
  if (window.innerHeight === expectedH) return;
  _sendDebugLog('viewport_recovery_start', { currentHeight: window.innerHeight, expectedH });
  const steps = [
    () => { window.scrollTo(0, 1); window.scrollTo(0, 0); },
    () => {
      document.body.style.height = '100.1%';
      void document.body.offsetHeight;
      requestAnimationFrame(() => { document.body.style.height = ''; });
    },
    () => { window.dispatchEvent(new Event('resize')); },
    () => {
      try {
        let kb = null;
        if (window.Capacitor?.registerPlugin) kb = window.Capacitor.registerPlugin('Keyboard');
        if (!kb) kb = window.Capacitor?.Plugins?.Keyboard;
        if (kb?.hide) kb.hide();
      } catch (_) {}
    },
  ];
  _viewportRecoveryStep(0, expectedH, steps);
}
```

**3. `switchNav()`冒頭にも保険を追加（推奨）**
画面遷移をまたいでも固着が解消しないため、`switchNav()`冒頭（フォーカスblur処理の直後）にも追記:
```javascript
if (_isCapacitorApp && window.innerHeight !== _normalInnerHeight) {
  _attemptViewportRecovery(_normalInnerHeight);
}
```

### 注意点・実装時の判断が必要な事項
1. **`_screenH`ではなく`_normalInnerHeight`を基準値に使うこと**: `_resetSheetKeyboardOffset()`は`_screenH = window.innerHeight`を無条件更新しており、固着中に呼ばれると縮んだ値を「正常値」として上書きしてしまう既存の潜在バグがある。判定には起動時に一度だけ記録した`_normalInnerHeight`（`viewport_stuck`計装が使用）を使うこと
2. `switchNav()`への追加は画面回転等将来のケースで誤爆しないか実装時に確認（iPhone専用・回転非対応なら当面問題なし）
3. `document.body.style.height`の一時変更が、CLAUDE.mdの既存CSSルール（`html,body{overflow:hidden;height:100%}`を使わない）と衝突しないか、`public/app.css`の`body`定義を確認すること

## 効果検証の方法
既存の`viewport_stuck`計装に加え、`viewport_recovery_start`/`viewport_recovery_result`ログを組み合わせて検証する。
1. 実装後、TestFlightビルド配信
2. ユーザーに通常利用の中で継続してもらう
3. `logs/debug-nav.log`から`viewport_recovery_result`の`recovered:true`割合・`atStep`分布、`viewport_stuck`の頻度・`stuckDurationMs`を選択肢1導入前と比較
4. **判定基準**: `recovered:true`が7〜8割以上かつ`viewport_stuck`の傾向が明確に改善→選択肢1で恒久化。効果不十分→選択肢2の詳細設計へ

## 選択肢2に進む場合の大まかな影響範囲（詳細設計は別タスク）
`ios-app/capacitor.config.js`の`Keyboard.resize`を`'none'`から`'native'`等へ変更。既存の「シート縮小+移動」方式（`_adjustSheetForKb`等）はWebView自体がネイティブにリサイズされる前提と衝突するため大幅な作り直しが必要。設定画面の動的padding-bottom処理も不要になる可能性。CLAUDE.md「全画面共通キーボード被り対策」セクション全体の再設計が必要。**この選択肢に進む場合は改めて別途investigatorによる詳細調査を推奨**。

## 変更するファイル一覧（選択肢1実装分のみ）
`public/app.js`（`_onCapKeyboardHide()`拡張、`_attemptViewportRecovery`/`_viewportRecoveryStep`新規追加、`switchNav()`への保険追加）／`public/index.html`（キャッシュバスティング）／`public/sw.js`（`CACHE_NAME`更新）

## 受け入れ基準
1. フィールド往復→閉じる操作後、`logs/debug-nav.log`に`viewport_recovery_start`/`viewport_recovery_result`が記録される
2. `viewport_stuck`の発生頻度・`stuckDurationMs`が導入前と比較して改善傾向にある
3. 既存のキーボード対策・通常のナビ/FABタップ挙動に回帰がない
4. `document.body.style.height`の一時変更が視覚的ちらつきを起こさない（実機目視確認）

## スコープ外
選択肢2の実装そのもの。既存キーボード対策一式の書き換え。「約2分」「約5分14秒」のログ完全欠落区間（別系統、バックグラウンド化が原因と推測）への対応。`_screenH`更新ロジック自体の抜本見直し。

## リスク・未解決の質問
- 各復元手法が実機で本当に効果があるかは未検証（対症療法）
- 400ms・150msの待機時間は暫定値、実機ログで`atStep`分布を見て調整が必要な場合がある
- 選択肢2に進む判定基準（7〜8割等）はやや恣意的な目安

## 承認状況
承認済み（2026-07-11、選択肢1をorchestratorフローで実装）。

---

# 設計書12 — Capacitor Keyboard `resize`モード変更による根本対応（設計書11「選択肢2」詳細設計）

（2026-07-11 investigator設計。選択肢1〈対症療法〉が復元成功率0%〈9回中0回〉だったため、選択肢2〈`resize`モード変更〉への移行が承認された。**今回は詳細設計のみ。実装はしない。**）

## 推奨: `resize:'native'`をフェーズ1（最小差分・容易にロールバック可能）から段階的に試す

### モード比較
| モード | 概要 | 推定影響 |
|---|---|---|
| `'none'`（現状） | WebViewフレーム不変のはずだが、実際は`window.innerHeight`/`visualViewport`が不安定に変化・固着する（今回の根本原因） | 現行バグの元凶 |
| `'native'`（推奨・第一候補） | OS標準のcontentInset処理に委ねる。`.bottom-nav`の`position:fixed`本来の挙動が保たれやすいと推測 | ビューポート値の不安定な固着というカテゴリのバグが起きにくいと期待できる |
| `'body'` | `body`要素自体をキーボード分縮める | `position:fixed`要素との相互作用が複雑化するリスク |
| `'ionic'` | Ionic Framework前提、本アプリ非該当 | 優先度低 |

正確な仕様はCapacitor 6公式ドキュメントで実装時に必ず再確認すること（本設計はコード調査からの推論）。

## 影響を受ける既存コードの棚卸し（`public/app.js`）
`_screenH`／`_adjustSheetForKb`・`_resetSheetAfterKb`（シート縮小+移動、二重適用リスクの中心）／`_liftVisibleSheetForKeyboard`（シート内可視化＋設定画面フォールバックの2役割）／`_resetSheetKeyboardOffset`／`_onCapKeyboardShow`・`_onCapKeyboardHide`／`_attemptViewportRecovery`・`_viewportRecoveryStep`（選択肢1、**削除推奨**だが効果検証完了まで段階的に）／`switchNav()`冒頭の選択肢1保険／`viewport_stuck`監視／`bottom_nav_fallback_fired`（設計書9方針C、別カテゴリの問題の可能性あり温存要否は要再検証）。

`.bottom-nav`（`position:fixed;bottom:0`、CLAUDE.md記載の意図的設計）、`#screen-plan`等の`calc(100dvh-60px-...)`固定高さ、`.plan-modal`/`.plan-sheet`の`max-height:88vh`が主な影響対象CSS。

## 重要な未決定事項（ユーザー判断が必要）: `.bottom-nav`の見え方の方針転換

**現状の意図**（CLAUDE.md記載）: キーボードがナビの上に自然に被る。
**`resize:'native'`変更後の標準的な挙動（推奨候補）**: ナビは画面最下部に留まり、キーボードの下に隠れる（一般的なネイティブアプリの標準挙動。今回のようなJS/ビューポート値の固着バグが原理的に起きにくい）。

→ **これはUXの方針転換を伴う**（キーボード表示中は画面遷移ができなくなり、閉じてからナビを操作する形になる）。現状の「ナビがキーボードの上に被さる」見た目を維持したい場合は`resize:'native'`だけでは実現できない可能性が高く、根本対応の効果が薄まる恐れがある。**実装前にどちらを許容するかユーザー判断が必要**。

## 段階的な移行・検証方針（推奨）

**フェーズ0（コード変更なし）**: Capacitor公式ドキュメントで`resize:'native'`等の正確な仕様を確認
**フェーズ1（最小差分・容易にロールバック可能）**: `ios-app/capacitor.config.js`の`Keyboard.resize`を`'none'`→`'native'`に変更**するだけ**（`public/app.js`は一切変更しない）。TestFlightビルドし実機で「innerHeightがどう変化するか」「.bottom-navの見た目」「二重適用の兆候」「キーボードを閉じた後に正しく復元するか（＝主症状の解消確認）」を確認。**問題があれば`capacitor.config.js`の1行を戻すだけで即座にロールバック可能**
**フェーズ2**: フェーズ1の結果を踏まえ、JS側キーボード対策（`_adjustSheetForKb`等）を`_isCapacitorApp`向けに条件分岐で段階的に無効化・調整（Web版のコードパスに影響しないこと必ず確認）
**フェーズ3**: 選択肢1の対症療法・使い捨て診断ログの段階的整理

実機検証シナリオ: 予定追加モーダルのフィールド往復／コース作成シート／設定フィードバック欄・ニックネーム欄／タイトル編集シート／共有カレンダー参加画面／予定詳細・編集モーダル／日付ピッカー／キーボード表示→即座に画面遷移／バックグラウンド復帰後／ダークモード／Web版リグレッション確認

## 変更するファイル一覧（実装フェーズ想定）
`ios-app/capacitor.config.js`（フェーズ1の中心）／`public/app.js`（フェーズ2以降）／`public/app.css`（3-5節の方針決定後、必要なら）／`public/index.html`・`public/sw.js`（キャッシュバスティング）／`CLAUDE.md`（移行完了後に別タスクで全面改訂）

## データ共有・後方互換性
サーバーAPI・データ構造は無変更。`capacitor.config.js`はWeb版に影響しない。`public/app.js`変更時はWeb版コードパス（`_isCapacitorApp===false`）に意図せぬ影響がないか必ず確認。

## リスク・不確実性
1. Capacitor 6の各resizeモードの正確な仕様は未確認（要ドキュメント確認）
2. 変更範囲が大きく、既存の複雑な実装（複数回の事故を経て収束）に新たな相互作用バグが生まれる可能性
3. `.bottom-nav`の見え方の方針転換はUX判断であり技術設計だけでは決定できない（要ユーザー判断）
4. `100dvh`ベースの画面高さ計算とネイティブリサイズの相互作用は未検証
5. 選択肢1が効果0%だった経緯から、選択肢2も「実機で試すまで分からない」不確実性が高い。フェーズ1の結果次第では選択肢2自体を断念し、より限定的な緩和策（`viewport_stuck`検知時にユーザーへ再起動を促す等）への方針転換もあり得る
6. `bottom_nav_fallback_fired`（設計書9方針C）は別カテゴリの問題の可能性があり、モード変更だけでは解消しないかもしれない

## 承認状況
未承認。ユーザーの承認待ち。

## 実機検証結果（2026-07-11・フェーズ1）

フェーズ1（`Keyboard.resize`を`'none'`→`'native'`に変更、commit `d7d7ef6`）をTestFlight配信し実機検証した結果、**テキスト入力フィールドをタップしてもキーボードが正しく機能せず、入力ができない・入力した文字が画面に表示されない**という重大な回帰が確認された。

設計書に明記していた通り「問題があれば1行戻すだけでロールバックする」方針に従い、`Keyboard.resize`を`'none'`に即座にロールバックした（同日中に緊急対応、ローカル`main`へコミット済み）。

**結論**: `resize:'native'`への変更単体では実機で致命的な副作用（入力不可）を起こすため、このアプローチのままでは採用できない。選択肢2（`resize`モード変更による根本対応）は一旦白紙に戻し、本設計書のフェーズ2以降には進まない。ビューポート固着バグへの対応方針は改めて再考が必要（選択肢1の対症療法も復元成功率0%だったため、両アプローチとも手詰まりの状態）。

---

# 設計書13 — ビューポート固着バグへの新アプローチ「ボトムナビの位置をJSで絶対値固定する」

（2026-07-11 investigator設計。選択肢1〈対症療法／復元成功率0%〉・選択肢2〈resize:'native'／入力不可の重大回帰〉がいずれも不採用となったことを受けた第3のアプローチ。**設計のみ、実装はしない。**）

## 検証結果サマリー
- ユーザー提案の「ナビの位置をJSで絶対値固定する」方向性は妥当。ただし基準値の選び方・計算式・適用タイミングに精査が必要
- **基準値**: `window.screen.height`（候補A）は不採用推奨——WKWebViewの`contentInset`計算の関係でCSSビューポート値と対応関係が不透明。起動時の`window.innerHeight`（候補B、既存`_normalInnerHeight`）を改善して使うことを推奨。ただし現状のキャプチャタイミング（scriptタグ到達時点）はネイティブ側のレイアウト確定前の可能性があり、「安定するまで複数回サンプリングしてから確定」する方式への変更が必要（実機ログで記録された`839`という中途半端な値がこの疑いを裏付ける）
- **計算式**: `D = _normalInnerHeight - window.innerHeight`（D>0で固着中）、`bottom = -D + 'px'`。`env(safe-area-inset-bottom)`（padding側）とは独立に共存可能
- **最重要リスク（3-3節）**: `#screen-plan`等の画面本体は`window.innerHeight`ではなく`100dvh`（CSS単位）ベースで高さを計算しており、これが同じように固着しているか別々の挙動をするかが**未確認**。ナビだけ補正すると、画面本体との間に不自然な隙間が生じる可能性がある

## 推奨: 2段階実装（フェーズ0で計装のみ→フェーズ1で実際の補正）

**フェーズ0（計装のみ、実害ゼロ）**: 既存`viewport_stuck`計装に、`#screen-plan`のrectと`documentElement`のrectを追加記録し、固着時に画面本体も一緒に固着しているか確認する
**フェーズ1（実際の補正）**: `_normalInnerHeight`のキャプチャロジックを安定確認方式に改善し、新規`_applyBottomNavOffset()`関数で`.bottom-nav`の`bottom`を動的補正。`_onCapKeyboardHide()`・`switchNav()`・`viewport_stuck`監視の3箇所から呼ぶ
**フェーズ2（保留）**: フェーズ0で画面本体側も固着していると判明した場合のみ、別途設計

## 既存コードとの関係
- 選択肢1（`_attemptViewportRecovery`等、復元成功率0%）: 削除推奨だが即時ではなく1サイクル様子見
- 方針C（設計書9、`.bottom-nav`座標ベースフォールバック、commit `993751a`）: 別カテゴリの問題への対策のため**残す**
- `.plan-modal`/`.plan-sheet`のキーボード縮小ロジック: 今回のスコープでは触れない

## リスク・未解決の質問
1. **最重要**: `100dvh`ベースの画面本体が固着の影響を受けているか未確認（フェーズ0で確認）
2. 画面回転対応の有無が未確認（`Info.plist`はCI生成のためリポジトリになし）
3. `.bottom-nav`を`bottom:-Dpx`でビューポート外に配置する操作自体がWKWebView側で予期しない副作用を起こさないか実機検証必須
4. バックグラウンド復帰時に基準値を動的更新するかは安全性とのトレードオフ（要ユーザー判断）
5. 基準値の安定確認に数百ms要するため、その間の空白期間の許容可否

## 変更ファイル一覧（フェーズ0+1想定）
`public/app.js`（`viewport_stuck`計装拡張、`_normalInnerHeight`キャプチャ改善、`_applyBottomNavOffset()`新規、呼び出し3箇所）／`public/index.html`・`public/sw.js`（キャッシュバスティング）。`public/app.css`は変更不要（JSのインラインstyleで上書き）。

## 承認状況
未承認。ユーザーの承認待ち。

---

# 設計書14 — 「予定を追加」モーダル ビューポート固着バグ（Opus再設計・選択肢X+Y、段階実装推奨）

（2026-07-11 Opus investigator再設計。設計書1〜13の結論に引きずられずゼロベースで再調査）

## 根本原因（コード + 実機ログから確定）
WKWebViewの**ビューポート高さ破損**。タッチイベント配送でも単純な「2フィールド」問題でもない。
- 正常時`window.innerHeight`=**839**。キーボード使用後**873/932に固着**し839に戻らない（縮むのではなく増える方向のズレ）。画面遷移13回をまたいでも解消しない
- `.bottom-nav`は`position:fixed;bottom:0`。body実高は932なのにinnerHeightが873で固着→ナビが真の画面下端より59px上に描画=「固まって見える」正体
- 既存の強制復元（設計書11）は成功率0%（全ログ`recovered:false,atStep:4`）確定
- **2フィールド往復が引き金の理由**: `<input>`→`<textarea>`のフォーカス移動でキーボードが閉じずに`keyboardWillShow`だけ再発火→そのたび`_adjustSheetForKb`が破損しかけたビューポート上で走り破損が蓄積。単一フィールドはshow1回hide1回でクリーンなので出ない

## 推奨: X+Y併用、ただし段階実装（まずXだけ→検証→残ればY）

### 選択肢X（引き金の除去・低リスク高確実）: 予定作成モーダルを単一入力化
- **案X-a推奨**: メモ欄`#plan-custom-memo`を**新規作成時だけ非表示**（`openCustomPlanModal`で`display:none`、`openCustomPlanEdit`で`display:''`）。新規作成/編集は同一`#plan-custom-modal`を共用している点に注意
- メモは予定作成後、編集モーダルで後付け。データ構造`memo`フィールドは不変（新規時は空文字）、完全後方互換
- HTML: メモのラベル+textareaを`<div id="plan-custom-memo-section">`で囲み一括表示切替。`saveCustomPlan()`は変更不要

### 選択肢Y（悪化要因の除去）: キーボード対策JSの大幅簡素化
- `_adjustSheetForKb`/`_resetSheetAfterKb`/`_liftVisibleSheetForKeyboard`の`.plan-modal`/`.plan-sheet`のinline `max-height`/`bottom`手動操作を**Capacitor環境でも撤去**
- 代わりに`.plan-modal-body`内`scrollIntoView`のみの軽量版に。`_attemptViewportRecovery`系は削除
- **⚠️Yは全`.plan-modal`/`.plan-sheet`に影響**（コース作成シート等含む）。撤去後、全シートで入力欄がキーボードに隠れないことを実機確認必須

### なぜ段階実装か
X-aだけで固着が解消する可能性があり、その場合Yの全シートへの影響（R3）を負わずに済む。フェーズ1=Xのみ→実機で「新規作成→✕→ナビ固着なし」を10回確認+`viewport_stuck`ログが出なくなるか確認→解消すればY見送り、編集時に再発or不十分ならフェーズ2=Y。

## 変更ファイル
`public/index.html`（メモセクションをラッパーで囲む、キャッシュバスティング）／`public/app.js`（X: openCustomPlanModal/Edit の display制御。Y〈フェーズ2〉: キーボード対策簡素化）／`public/sw.js`（CACHE_NAME）。server.js/data/API変更なし。

## データ・API変更
なし。`memo`フィールド不変、完全後方互換。旧App Store版とも破綻しない。

## リスク
- R1(中): Y簡素化後、編集モーダルのメモ欄が`resize:'none'`下で`scrollIntoView`だけで見えない可能性→`.plan-modal-body`一時padding-bottomで補う（設定画面と同パターン）。実機検証
- R2(低): 編集モーダルでタイトル⇄メモ往復が依然可能→理論上編集時に再発しうるがYで悪化要因除去済み、頻度低
- R3(低): Y撤去で他の全シートのキーボード挙動が変わる→全シート実機確認が必要

## ユーザー確認事項
- Q1: 段階実装（フェーズ1=Xのみ→検証→残ればY）でよいか【推奨】
- Q2: メモは案X-a（新規時のみ非表示・編集時表示）でよいか【推奨】

## 承認状況
未承認。ユーザーの確認待ち（Q1・Q2）。

---

# 設計書15 — ビューポート固着バグ 根本対策（Opus再々調査・contentInset変更+キーボード対策JS撤去）

（2026-07-11 Opus investigator。フェーズ1〈メモ欄非表示〉が実機で無効・単一フィールドでも固着することが判明した後の再調査）

## 根本原因の切り分け結論（確度：高）
実機ログの決定的証拠により、**キーボード対策JS（`_adjustSheetForKb`等）は加害者ではなく無関係の被害者**と確定。真因は**WKWebViewが`contentInset:'always'`設定下でキーボード表示時に`window.innerHeight`を`safe-area-inset-top`(=59px)分縮め、閉じても・画面遷移しても873pxのまま固着すること**。`.bottom-nav`は`position:fixed;bottom:0`でこの縮んだビューポート(873)の下端に描画されるため、真の画面下端(932)との間に59pxの死帯ができ「固まって見える」。

### 決定的証拠
- 正常時: `innerHeight:932`, `safeAreaInsetTop:59`, `bottomNav.bottom:932`
- キーボード時: `innerHeight:873`(=932-59), `bottomNav.bottom:873`（59px上にズレ）
- キーボード閉・モーダル閉・遷移後も`873`固着継続
- `_adjustSheetForKb`が触るのは`.plan-modal`の`max-height`/`bottom`のみ、`.bottom-nav`には一切触れていない → JS無害
- ズレ量59pxが`safeAreaInsetTop`と一致（`contentInset:'always'`のレイアウトビューポート挙動）
- **基準値`_normalInnerHeight`=839は起動時の過渡値で誤り**（真の正常値は932）。この839依存で`viewport_stuck`計装・`_attemptViewportRecovery`が誤検知・空回りしている → 839依存ロジックは全廃対象

## 対策（2本立て）
- **対策B（本命の根治）**: `ios-app/capacitor.config.js`の`contentInset:'always'`→`'never'`。`innerHeight`の縮み・固着そのものを止める。`resize:'none'`は据え置き（`'native'`は入力不可回帰が実証済み）
- **対策Y（保守性向上・ユーザー希望）**: キーボード対策JS一式（`_adjustSheetForKb`/`_resetSheetAfterKb`/`_liftVisibleSheetForKeyboard`/`_onCapKeyboardShow`/`_onCapKeyboardHide`/`_resetSheetKeyboardOffset`/`_attemptViewportRecovery`/`_viewportRecoveryStep`）と839依存計装を撤去。CSS(`.plan-modal-body{overflow-y:auto}`の内部スクロール)とネイティブに委ねる

### 因果整理（どちらが効くか）
- 対策Y単独では真因(`innerHeight`固着)は残る可能性が高い（JSは被害者だから）→ **対策Bが本命**
- 対策B単独で固着が消えるなら、対策Yは「無害コードの掃除」

## 設定画面フォールバックの扱い（回帰防止・重要）
`_liftVisibleSheetForKeyboard`内の設定画面フォールバック（`#feedback-text`/`#nickname-input`のスクロール逃がし）は別問題への対策で実績あり。丸ごと消すと設定画面のキーボード被りが再発する。→ 独立した軽量関数`_scrollFocusedIntoViewOnKb()`に切り出し温存（案1・推奨）、`contentInset:'never'`で不要になれば後で撤去（案2）。

## 段階的実装・検証手順（各段階独立コミット・TestFlight実機必須）
- **段階1a**: キーボード対策JS撤去（シート操作無効化）。設定画面フォールバックのみ温存。実機で「入力欄が内部スクロールで見えるか」「設定画面が隠れないか」確認（この段階では固着が残ってよい＝Bで直す前提）
- **段階2（本命）**: `contentInset:'never'`を重ねる。実機で「ナビが真の下端に張り付き固着しない」「レイアウト崩れ・入力被りがない」確認。崩れたら1行ロールバック
- **段階3（任意）**: 後片付け

## 変更ファイル
`public/app.js`（JS撤去・計装削除）／`ios-app/capacitor.config.js`（contentInset）／`public/index.html`・`public/sw.js`（キャッシュバスティング）。server.js/data/API変更なし・完全後方互換。

## リスク
- R1(高): `contentInset:'never'`がヘッダー/セーフエリア/ステータスバーの見え方を変えレイアウト崩れの可能性→段階2単独検証・1行ロールバック可
- R2(中): JS撤去で内部スクロールが浅く入力欄が隠れて詰む→`scrollIntoView`最小保険を段階1で追加可能
- R3(中): 設定画面キーボード被りの回帰→フォールバック切り出し温存で担保
- R4(中): `contentInset:'never'`単独でも固着が残る（真因がインセット以外）可能性→段階2判定で検出
- R5(高): 過去`resize`変更で入力不可回帰→今回`resize`は触らない

## 未解決（実機でしか判定不能）
1. `contentInset:'never'`がヘッダーのsafe-area paddingとどう干渉するか
2. 対策B単独で根治するか（真因がインセットかWKWebView本体か、確度高いが100%でない）
3. `resize:'none'`維持で`contentInset:'never'`時のキーボード被り具体挙動

## ユーザー確認事項
段階1（JS撤去）と段階2（contentInset:'never'）を**1ビルドにまとめるか、別々のビルドで切り分けるか**。別々の方が「どちらが効いたか」を確実に特定できるが各15〜20分。

## 承認状況
未承認。ユーザーの確認待ち。

---

# 設計書16 — フォローアップ2件（予定作成モーダルのメモ欄復活 / シート内入力欄のキーボード被り対策）

（2026-07-11 Opus planner設計。設計書15の根本対策が実機成功した後の残課題2件）

## 課題1: 予定作成モーダルのメモ欄を戻す
2フィールド往復は真因ではなかったため（設計書15で確定）、設計書14フェーズ1の非表示化は不要。
- `openCustomPlanModal()`内の`display='none'`（旧3804行）と`openCustomPlanEdit()`内の`display=''`（旧4156行）を**両方削除**（常時表示にするなら出し分け自体が不要）
- HTMLの`#plan-custom-memo-section`ラッパーは残す（実害なし、将来の取っ掛かり）
- **要実機再確認**: メモ欄を戻すと再び2フィールドになるが、根本対策（`contentInset:'never'`）が効いているので固着は再発しないはず。念のため確認する

## 課題2: シート内入力欄のキーボード被り対策
`_scrollFocusedIntoViewOnKb()`の早期リターン（`if (focused.closest('.plan-modal, .plan-sheet')) return;`、旧89行）が、コース作成シート等の内部入力欄を対象外にしていたのが原因。
- **この早期リターン行を削除するだけ**。既存の祖先スクロールロジック（`overflow-y:auto`コンテナを探して`scrollTop += overflow`）がそのままシート内入力欄にも適用される
- 対象: `#course-sheet`の`#course-note`、各`.plan-modal-body`内の入力欄
- **⚠️最重要（再発防止）**: 今回の変更は「内部スクロールコンテナの`scrollTop`変更」のみ。シート自体の`bottom`/`max-height`/`transform`は絶対に触らない（撤去した`_adjustSheetForKb`類を復活させない）。`scrollTop`変更は`window.innerHeight`にも`.bottom-nav`位置にも影響しないため、原理的に固着は再発しない
- 80ms遅延・`scrollTop`即時加算方式は据え置き

## 変更ファイル
`public/app.js`（旧3803-3804行削除、旧4155-4156行削除、旧89行削除）／`public/index.html`・`public/sw.js`（キャッシュバスティング）。データ・API変更なし、完全後方互換。

## リスク
- R1(中): `#title-edit-sheet`は内部スクロールコンテナを持たず`scrollIntoView`フォールバックの効果が薄い可能性。実機確認要
- R2(低): `#course-sheet`のスクロールコンテナがid/class無しのインラインstyle divだが祖先探索で機能上は問題ない見込み
- R3(低): 課題1の2フィールド往復での固着非再発は実機再確認必須
- R4(低): 80ms遅延の妥当性は環境依存、必要なら100〜150msに調整

## 承認状況
承認済み（実装・ビルドまでユーザー事前承認）。

---

# 設計書17 — コース作成シート「ひとこと」欄のキーボード被り修正（`.plan-sheet` の `max-height:88dvh` 除去）

（2026-07-11 planner設計。設計書16で`.plan-modal`系は解決したが`#course-sheet`だけ被りが残った件の対症療法）

## 発見
`.plan-modal`（正常）は`max-height:88vh`のみ。`.plan-sheet`（`#course-sheet`で被り発生）は`max-height:88vh; max-height:88dvh;`と2重宣言され、`dvh`（動的ビューポート高さ、キーボード表示で縮む単位）が有効になっている。ただし`vh`+`dvh`併記は`.cal-popup`/`.pin-picker-sheet`にも存在するプロジェクトの既存パターンで、むしろ`.plan-modal`側が例外という位置づけ。`88dvh`追加の経緯は記録になく不明。

**重要な訂正**: 設計書15でシート操作JSは既に全撤去済み。`_scrollFocusedIntoViewOnKb`は現在シート内外問わず無条件に動作する（設計書16で早期リターン削除済み）。

## 修正方針
`.plan-sheet`の`max-height:88dvh;`の行を削除し、`.plan-modal`と同じ`88vh`単独にする。副作用は小さい（`#course-detail-sheet`も対象になるが表示専用シートで実害薄い）。ただし**根本原因の確証はなく対症療法**。これで直らなければ原因は別（インラインstyleスクロールコンテナのpadding不足等）と判断し追加調査。

## 変更ファイル
`public/app.css`（`.plan-sheet`の`max-height:88dvh;`削除）／`public/index.html`・`public/sw.js`（キャッシュバスティング）。データ・API変更なし。

## リスク
- 未解決: dvhが`resize:'none'`環境で実際に悪さをしているかは確証なし、実機検証必須
- 未解決: `88dvh`追加の経緯・意図が不明
- `.plan-sheet`だけ`vh`単独になり`.cal-popup`等との不揃いが生まれる（将来的には`.plan-modal`側に`dvh`を揃える方向も検討余地だが今回はスコープ外）

## 承認状況
承認済み。

