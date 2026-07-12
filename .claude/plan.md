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

---
# 設計書18 — イベント記事取り込みパイプライン「取りこぼし」対策（毎日実行化 + ハイウォーターマーク方式 + Haiku採否基準の厳格化）

（2026-07-12 planner改訂。ユーザーとの相談により、当初案（フェッチ頻度は変えずハイウォーターマーク方式のみ導入）から方針変更。実測の投稿ペースデータに基づき「RSS取得の毎日実行」を主軸とし、ハイウォーターマーク方式は「無駄な再送信防止」の補助策として継続採用する。加えてHaiku採否基準の厳格化、パイプライン構成の見直しを新たに追加する）

## 改訂の経緯

前回設計書18は「フェッチ頻度（週2回）は変えず、ハイウォーターマーク方式のみでRSSの取りこぼしを解消する」という案だった。理由は「頻度を上げるとHaiku送信件数が増えてコストが上がる」という懸念からだったが、ユーザーが実際に8ソースの投稿ペースをライブ計測した結果、以下が判明した。

| ソース | 投稿数/日 | フィード返却件数 | カバー日数 |
|---|---|---|---|
| The Smart Local | 8.57件/日 | 10件 | 約1.2日 |
| Eatbook | 7.57件/日 | 10件 | 約1.3日 |
| Seth Lui | 7.5件/日 | 10件 | 約1.3日 |
| The New Age Parents | 5.12件/日 | 10件 | 約2.0日 |
| SINGPromos | 5.11件/日 | 15件 | 約2.9日 |
| Little Day Out | 4.17件/日 | 10件 | 約2.4日 |
| Honeycombers | 3.53件/日 | 10件 | 約2.8日 |
| Expat Living | 1.85件/日 | 50件 | 約27日（安全） |

現行の週2回（水・日、間隔3〜4日）ペースでは、Expat Living以外の全7ソースでカバー日数が実行間隔を下回っており、「稀に起こりうるリスク」ではなく「毎サイクル確実に一部記事を取りこぼしている」ことが確定した。これはハイウォーターマーク方式だけでは解決できない（ハイウォーターマークは「重複を送らない」ための仕組みであり、「フィードの返却件数上限に押し出されて一度も取得できなかった記事」自体は救えない、という前回設計書の限界欄に記載していた構造的制約そのもの）。そのためユーザーの判断により、フェッチ頻度自体を毎日に上げる方針へ転換する。

## 背景・現状の正確な把握（実コード確認済み、前回設計書から変更なし）

### パイプライン構成
`scripts/run-fetch-all.sh`（システムcrontab、現状は週2回・水日6:30 SGT実行）が以下を直列実行:
1. `scripts/fetch-events.js --city=sg` — RSS/Instagram取得 → 重複排除 → Claude API（Haiku→Sonnet）でフィルタ・記事生成 → `data/sg/events.json`に保存
2. `scripts/discover-sources.js --city=sg --no-notify` — 新規ソース候補のスコアリング（`PROBE_COOLDOWN=5日`で内部的に間引かれる）
3. `scripts/analyze-sources.js --city=sg --no-notify` — 既存ソースの採用率分析・不良ソースの自動入れ替え
4. `scripts/notify-fetch-summary.js` — LINE通知
5. `scripts/check-content-integrity.js --city=sg` — コンテンツ重複検出（警告のみ）
6. `scripts/refresh-courses.js --city=sg` — モデルコースの一部リフレッシュ（システムコース2件削除→3件新規生成）

BKK/SYDは現在停止中（`run-fetch-all.sh`内でコメントアウト済み）。本設計は稼働中のSGのみを対象とする。

### RSS取得ロジック（`scripts/fetch-events.js` `fetchRssItems()`、140〜161行目付近）
- `daysBack = 7`（pubDateカットオフ）、`maxPerFeed = 30`（`.slice(0, maxPerFeed)`）
- **カットオフは実質無意味**: `rss-parser`はフィードのXML自体を素直にパースするだけで、返却件数はサイト側のフィード設定（WordPress標準で10件、SINGPromosのみ15件、Expat Livingのみ50件）に依存する。`maxPerFeed=30`のスライスはExpat Living以外では発動せず、フィード自体が返す件数がそのまま処理対象になる

### 重複排除ロジック（実コードで確認、2段階、変更なし）
1. **`deduplicateItems()`**（`fetch-events.js` 198〜225行目、フィルタ送信前）: `existing`（=既存`events.json`）の`url`集合との完全一致チェック＋タイトル類似度チェック（Jaccard的比較、閾値0.7）。**pubDateやGUIDは一切保存・参照していない**
2. **`deduplicateSaved()`**（313〜348行目、Claude API後の最終チェック）: `events.json`全体に対しURL+店舗名類似・店舗名類似のみでの重複除去

重複排除は「今回取得したRSSの中身」と「現在`events.json`に載っている（＝過去に採用された）記事」の突き合わせのみで機能する。**RSSフィードの返却件数上限に押し出されて一度も取得できなかった記事は、この重複排除ロジックの対象にすら乗らず、silentに欠落する。**

### `data/source-history.json`の実データ構造（確認済み）
`{ city: { sourceName: [ { date, sent, accepted } ] } }` という日次の集計値のみ。個別記事のURL/GUID/pubDateは一切記録されていない。

## 1. コスト構造の再試算

### 前提となる実データ
`data/source-history.json`のSG実績（直近ラン、2026-07-12時点）から、RSS 8ソースの`sent`（Haikuに送信された件数）は以下の通り（1回あたり）:

| ソース | 直近sent | 直近accepted | 採用率 |
|---|---|---|---|
| The Smart Local | 9 | 2 | 22% |
| Eatbook | 10 | 4 | 40% |
| Seth Lui | 10 | 3 | 30% |
| The New Age Parents | 10 | 4 | 40% |
| SINGPromos | 14 | 5 | 36% |
| Little Day Out | 10 | 1 | 10% |
| Honeycombers | 10 | 1 | 10% |
| Expat Living | （history無し。50件返却・1.85件/日のため通常のフェッチ間隔では飽和しない） | — | — |

**重要な事実**: 上表の`sent`値は、現行の週2回（3〜4日間隔）運用において**既にフィードの最大返却件数（10件または15件）に張り付いている**ソースがほとんどである。これは「フィードが返す全件を毎回Haikuに送っている」ことを意味し、かつ本設計の前提（The Smart Local/Eatbook/Seth Luiはカバー日数1.2〜1.3日）から、**実際に投稿された記事のうち相当数がフィードの返却件数上限からあふれて一度もHaikuに送信されていない**ことを示す。つまり現状の`sent`件数は「投稿された全記事数」ではなく「フィードが返せる上限に切り詰められた件数」であり、母集団としてはすでに欠落している。

### 毎日実行化後の送信件数変化の見積もり

**Step1（Haiku）への送信件数**

毎日実行かつハイウォーターマーク方式併用時、1日あたりの新着記事数 ≒ 実測の「投稿数/日」に収束する（フィードの返却上限を毎日下回るようになるため、実測ペースがほぼそのまま送信件数になる）。

| ソース | 現状: 1回あたりsent（3.5日間隔換算） | 毎日実行後: 1日あたり新着（見積） | 週合計（現状 週2回 vs 毎日） |
|---|---|---|---|
| The Smart Local | 9（フィード上限で頭打ち、実際は約30件/3.5日投稿されている） | 約8.6件/日 | 現状 週18件 → 毎日 週60件（約3.3倍） |
| Eatbook | 10（同上、実際は約26件/3.5日） | 約7.6件/日 | 現状 週20件 → 毎日 週53件（約2.6倍） |
| Seth Lui | 10（同上、実際は約26件/3.5日） | 約7.5件/日 | 現状 週20件 → 毎日 週52.5件（約2.6倍） |
| The New Age Parents | 10（実際は約18件/3.5日、フィード上限にほぼ達している） | 約5.1件/日 | 現状 週20件 → 毎日 週35.8件（約1.8倍） |
| SINGPromos | 14（実際は約18件/3.5日、フィード上限15件に近い） | 約5.1件/日 | 現状 週28件 → 毎日 週35.8件（約1.3倍） |
| Little Day Out | 10（実際は約14.6件/3.5日、フィード上限に近い） | 約4.2件/日 | 現状 週20件 → 週29.2件（約1.5倍） |
| Honeycombers | 10（実際は約12.4件/3.5日、フィード上限に近い） | 約3.5件/日 | 現状 週20件 → 週24.7件（約1.2倍） |
| Expat Living | 未飽和（27日分カバー、現行頻度でも取りこぼしなし） | 約1.85件/日 | 現状 週2回×11件≒週22件相当 → 週13件（**減少**、頻度を上げても新着自体が少ないため） |

**Step1合計の見積もり**: 現状（週2回運用、フィード上限で頭打ちの状態）の週間Haiku送信件数は概算 約168〜170件（8ソース×週2回×平均10.5件）。毎日実行後は約294件/週（8ソース×実測投稿数/日×7日）。**概算で1.7〜1.8倍程度の増加**。単純な「頻度が3.5倍だから送信件数も3.5倍」にはならない理由は、フィード上限による頭打ちがすでに現状の送信件数を実際の投稿数より少なく見せているため（分母が既に欠落した状態からの増加であるため、倍率が見た目より小さくなる）。

**Step2（Sonnet）への送信件数**

Step1の採用率（現状10〜40%、ソース平均約27%）がそのまま維持されると仮定すると、Step2送信件数もStep1と同程度の倍率（約1.7〜1.8倍）で増加する。現状の週間採用件数（`events.json`への追加件数）が仮に週20〜30件程度だとすると、毎日実行後は単純計算で週35〜54件程度に増える計算になる。

**この「Sonnet送信件数・最終採用件数の増加」こそが、今回ユーザーが「Haiku採否基準を厳しくしたい」と考えた理由と直結する。** 3節で後述する基準厳格化により、この増加幅を圧縮することを狙う。

### コスト増加の性質
- Step1（Haiku）は送信件数（採用/不採用問わず全件）に比例してコストがかかるため、上記1.7〜1.8倍がほぼそのままAPIコスト増になる。Haiku自体は単価が低いモデルであるため、絶対額としての影響は限定的と考えられるが、「送信件数が増える」という事実自体は正確に見積もっておく必要がある
- Step2（Sonnet）は採用された記事のみに比例する。単価はHaikuより高いため、採用件数の増加はコストへの影響が相対的に大きい。**Haiku基準の厳格化で採用率を抑えることが、Step2コスト増を抑制する主な手段になる**（3節で詳述）
- 外部リンク記事の`fetchArticleContent()`（本文取得、HTTPリクエスト）もStep1送信件数に比例して回数が増える。API課金ではないが、フェッチ処理全体の実行時間・外部サイトへの負荷は増加する

## 2. パイプライン全体を毎日にすべきか、`fetch-events.js`だけ毎日にすべきか（実コード確認済みの判断）

結論: **`fetch-events.js`のみ毎日実行に変更し、`discover-sources.js`・`analyze-sources.js`・`notify-fetch-summary.js`・`check-content-integrity.js`は現行の週2回のまま維持、`refresh-courses.js`は`run-fetch-all.sh`から分離して独立cronで従来通り週2回実行する。** 理由を以下に個別に示す。

### 2-1. `discover-sources.js`（新規ソース候補探索）— 毎日呼んでも実害なし、ただし意味がないので変更不要
- 内部に`PROBE_COOLDOWN = 5`（5日）のガードがあり、`isStale(lastProbed)`が`daysSince >= 5`でない限り各ソースの再プローブをスキップする（`discover-sources.js` 57〜61行目）
- つまり毎日呼び出しても、実際にプローブが走るのは各ソースごとに5日に1回のみ。**害はないが「毎日呼ぶ意味もない」**（実行しても`skippedCount`が積み上がるだけの空振りが大半になる）
- 判断: 現状の週2回のまま維持で問題ない。強いて毎日にする理由がない（不要な空振り実行が増えるだけ）

### 2-2. `analyze-sources.js`（ソース採用率分析・自動入れ替え）— 毎日実行は判定粒度を壊すため非推奨
- 採用率判定は`THRESHOLDS.historyWindow = 4`（直近4ラン）・`THRESHOLDS.minRuns = 3`（3ラン以上でようやく判定対象）を使う設計（`analyze-sources.js` 12〜19行目）
- `updateHistory()`は`fetch-summary-{city}.json`の`date`をキーに履歴へ追記する。**同日に複数回実行された場合は`sameDay`判定で上書きされる**（111〜117行目）ため、`fetch-events.js`だけ毎日化しても、`analyze-sources.js`自体を毎日実行しなければ履歴のポイント数は「実行した回数」分しか増えない
- 仮に`analyze-sources.js`も毎日実行した場合: `historyWindow=4`は「直近4日分」になり、現状「直近4回（≒2〜3週間相当）」で見ていた判定が「直近4日」に短縮される。**ソースの調子は日によって記事の有無が偏るため、4日分だけで採用率を判定すると、たまたま数日投稿がなかった・偏った日が続いただけのソースを「不良」と誤判定して停止してしまうリスクが上がる**。`minTotalSent=15`（ウィンドウ内最低送信件数）のガードはあるが、判定に使う実質的な期間が3.5倍短縮される影響は無視できない
- 判断: **`analyze-sources.js`は現行の週2回のまま維持する。** 頻度を変えるなら`historyWindow`等の閾値も合わせて再設計する必要があり、今回のスコープ（取りこぼし対策）を超える。日次実行にする積極的な理由もない（ソースの良し悪しは日単位で急変するものではない）

### 2-3. `refresh-courses.js`（システムコース入れ替え）— `run-fetch-all.sh`から分離すべき
ユーザーの提案通り、**フェッチ頻度とコースリフレッシュ頻度は分離すべき**と判断する。理由:
- `refresh-courses.js`は「システムコース2件削除→3件新規生成」という、`fetch-events.js`の実行結果（新着イベントの有無）に直接依存しない独立した処理（`generate-model-courses.js`と同様、既存の`events.json`全体からコースを組み立てる）
- 現状は`run-fetch-all.sh`に同居しているため、フェッチ頻度＝コースリフレッシュ頻度という暗黙の結合が生まれている。フェッチを毎日化すると、この結合により**モデルコースの入れ替わりが週2回→毎日に自動的に加速する**が、これは「取りこぼし対策」の狙いとは無関係な副作用であり、ユーザーが指摘する通り意図しない挙動変化になる
- コースの新陳代謝ペース（週2回、2件入れ替え=週4件）を変える積極的な理由が今回の設計には存在しない。「公開コース」タブの新陳代謝は、ユーザー体験上「頻繁すぎる入れ替え」よりも「程よいペースでの更新」が望ましいと考えられ、フェッチ頻度に引きずられて意図せず加速させるべきではない

**分離方法（提案）**:
1. `run-fetch-all.sh`から`refresh-courses.js`の呼び出しブロック（21〜23行目）を削除する
2. 新規に`scripts/run-refresh-courses.sh`（または既存のログ出力方式に合わせた薄いラッパー）を作成し、`refresh-courses.js --city=sg`のみを実行する
3. システムcrontabに、現行の`run-fetch-all.sh`のエントリ（`30 0 * * 3,0`）と**同じ曜日・同じ時刻帯**で`run-refresh-courses.sh`用の新規エントリを追加する（水・日、フェッチ完了後に走るよう数分〜数十分後にずらす。例: `30 0 * * 3,0`のフェッチが完了する頃合いを見て`0 1 * * 3,0`（1時間後）等、実行時間の実測を踏まえて調整）
4. これにより「フェッチは毎日」「コースリフレッシュは週2回」という独立した頻度を両立できる。`refresh-courses.js`は`data/{city}/events.json`をAPI経由（`/api/courses/generate`）で参照するのみで、`fetch-events.js`の実行結果に直接依存する処理ではないため、フェッチ直後である必要性は薄い（むしろ切り離すことで「今日追加された新着イベントがまだ少ない状態でコース生成される」という偶発的な偏りからも解放される）

### 2-4. `notify-fetch-summary.js`（LINE通知 + ユーザー向けWebプッシュ通知）— 2種類の通知を分離する【2026-07-12ユーザー判断で確定】

このスクリプトは実は**性質の異なる2つの通知**を1つのファイルに同居させている（実コード確認済み、136〜149行目）:
1. **LINE通知**（`pushToLine()`、139行目）— 開発者（あなた）宛の運用実務通知。採用件数・ソース別内訳・ソース分析結果
2. **ユーザー向けWebプッシュ通知**（141〜149行目、`fetch('http://localhost:PORT/api/notify-events-updated')` → `server.js`の`sendPushToAll(cityKey)`）— アプリの全ユーザー（Web Push購読者 + iOS APNs購読者）宛に「新着イベント追加」を通知する、`totalAccepted > 0`の場合に無条件で送信

当初この2つを区別せず「`notify-fetch-summary.js`の頻度」として一括でユーザーに確認したが、**実際は別々の頻度判断が必要**と判明した。ユーザー回答（2026-07-12）:
- **① LINE通知（開発者向け）**: 毎日でよい → `notify-fetch-summary.js`を`run-fetch-all.sh`側（毎日実行グループ）に残す
- **② ユーザー向けWebプッシュ通知**: **完全に停止する**。理由: 毎日「新着イベント追加」プッシュが届くのはユーザー体験として過剰（従来は週2回程度の頻度だったものが毎日になり、通知疲れ・アンインストール要因になりうる）と判断

**実装方針**: `notify-fetch-summary.js`の141〜149行目（`/api/notify-events-updated`へのfetch呼び出しブロック）を丸ごと削除する。`server.js`側の`app.post('/api/notify-events-updated', ...)`エンドポイント・`sendPushToAll()`関数自体は削除しない（他に呼び出し元がないことは確認済みだが、admin用エンドポイントとして手動再送信等に将来使える可能性を残すため）。これにより①は毎日・②は完全停止、という異なる頻度を1つのスクリプト内で両立できる（②を呼んでいたブロックを消すだけなので、頻度分離のためにスクリプトを分割する必要はない）。

### 2-5. `check-content-integrity.js`（コンテンツ整合性チェック）
- タイトルと説明の入れ替わり検出、警告のみでデータ変更は行わない軽量なチェック処理。`fetch-events.js`の直後に実行する意味がある（新規追加分の整合性を確認する処理と推測される）ため、**`fetch-events.js`と同じ頻度（毎日）で問題ない**。害・コスト増ともに無視できるレベル

### 2-6. 結論: `run-fetch-all.sh`の新しい構成（確定）
```bash
# 毎日実行される部分（新run-fetch-all.sh）
1. fetch-events.js --city=sg              ← 毎日
2. check-content-integrity.js --city=sg   ← 毎日（fetch直後の整合性チェックのため）
3. notify-fetch-summary.js                ← 毎日（LINE通知のみ。ユーザー向けWebプッシュ呼び出しは削除済み）

# 週2回のまま別スクリプト・別cronで実行
- discover-sources.js --city=sg --no-notify   ← 現行どおり週2回（変更不要、毎日化の必要性なし）
- analyze-sources.js --city=sg --no-notify    ← 現行どおり週2回（毎日化は判定粒度を壊すため非推奨）
- refresh-courses.js --city=sg                ← run-fetch-all.shから分離、独立cronで週2回
```

`discover-sources.js`と`analyze-sources.js`は現状`run-fetch-all.sh`内で`fetch-events.js`の直後に直列実行されている。これらを週2回のまま残す場合、「`fetch-events.js`+`check-content-integrity.js`+`notify-fetch-summary.js`用の毎日cron」と「`discover-sources.js`+`analyze-sources.js`用の週2回cron」を完全に別スクリプト・別crontabエントリとして分離する。「頻度の異なる処理は物理的に別ジョブにする」という2-3節の分離方針と一貫性がある。

## 3. Haiku採否基準を「少し厳しめ」にする具体案

### 現状の基準（`scripts/filter-events.js` `filterBatch()`）
- `scoreThreshold = 5`（101行目）。プロンプト内の採用基準文言は「score 5以上のみ採用」（118行目）
- カテゴリ補完ロジック（103〜116行目）: 現在のDB分布が目標比率（event 30%/show 20%/gourmet 30%/sale 10%）の70%を下回るカテゴリがあれば、そのカテゴリに限り**score 4以上**まで基準を緩める例外がある（114行目）
- スコアリング観点（118〜122行目）: 日本文化・日本ブランド関連、ファミリー・子連れ対応、発見感・意外性（major_scoreが低いほど加点）、情報の具体性、の4点で加点方式。**減点方向の基準（何を積極的に落とすか）は明示的にほぼ存在しない**（不動産・金融等の業種除外、場所不特定の除外はあるが、"ありがちな凡庸な記事"を積極的に弾く基準がない）

### 狙い（ユーザー提示の2点、再確認）
1. 毎日実行で処理対象記事数が増える分、Step2 Sonnetに流れる件数・最終的な`events.json`追加件数が今より膨らみすぎないようにする
2. 記事の質を今より下げない（処理母数が増える分、相対的に緩い基準のままだと採用イベント数が急増し、ユーザー体験（イベント一覧の情報の質）が変わる懸念）

### 具体案

**(A) `scoreThreshold`を5→6に引き上げる**
最も直接的でシンプルな変更。現状「5以上采用」を「6以上採用」にするだけで、Haikuの相対評価の中で下位1段階を機械的に足切りする。source-history.jsonの実測（採用率10〜40%）から、閾値を1段階上げることで採用率が数パーセント〜1割程度下がることが期待できる（正確な下落幅はHaikuのスコア分布に依存するため実装後の実測が必要）。

**(B) カテゴリ補完の緩和基準（score 4以上の例外）を撤廃、または4→5に引き上げる**
現状の「カテゴリが薄い場合はscore 4以上で採用可」という例外は、(A)でscoreThresholdを6に上げた場合、このカテゴリ補完だけが実質的に「score 4以上」という別基準として残り、**厳格化の抜け穴**になる。カテゴリ補完の例外閾値も同時に引き上げる（例: 4→5、または「補完対象カテゴリでも基準の緩和幅を1段階までにとどめる」＝新閾値6に対して補完時5、のように相対値を維持する）ことを推奨する。

**(C) プロンプト文言に「凡庸な記事を積極的に除外する」観点を追加**
現状のスコアリング観点は加点方式のみで、「何を弾くべきか」の言語化が薄い。以下のような文言追加を提案する（118〜122行目付近の`scoringCriteria`に追加）:
```
- 【厳格化】以下は加点要素があっても採用を見送ること:
  - 既存の定番スポット・チェーン店の「よくある」プロモーション（同種の告知が頻繁に繰り返されているもの）
  - 情報の具体性が低い（日時・場所・価格のいずれか2つ以上が不明確）
  - 対象読者（在住日本人ファミリー・カップル）にとって新規性・独自性が乏しく、単なる日常商品紹介の域を出ないもの
```
これは「score 5〜6のボーダーライン記事」に対する判断のブレを減らし、Haikuが機械的にスコアを1〜2点辛くつける方向に誘導する狙い。数値基準の変更（A・B）と組み合わせることで、閾値操作だけでは拾いきれない「量が増えたことによる質の低下」を防ぐ。

**(D) （検討したが非推奨）カテゴリ補完ロジック自体の撤廃**
カテゴリ補完（薄いカテゴリをscore 4で救済する仕組み）は「カテゴリバランスを保つ」という別の目的のために存在しており、今回の「量の抑制」とは独立した既存の設計意図がある。撤廃すると特定カテゴリ（現状の実績からは`sale`や`show`）が痩せる可能性があり、今回のスコープ（取りこぼし対策とコスト抑制）を超えた副作用になる。**撤廃は推奨せず、(B)の相対的な引き上げに留める。**

### 推奨する組み合わせ
(A)+(B)+(C)を同時に実施する。数値基準（A・B）だけでは「ボーダーラインの記事をHaikuがどう評価するか」というプロンプト側の運用実態までは変えられず、逆にプロンプト文言（C）だけでは閾値という明確な足切り線がないため判定が安定しない。両者を組み合わせることで「量を抑える」「質を落とさない」の両方に効く設計とする。

### 実装時の検証方法（提案）
`filter-events.js`の`filterBatch()`を、閾値変更前後で同一の記事セット（例: 直近1〜2回分のフェッチで実際にHaikuに送信した記事）に対して再実行し、採用件数・採用された記事の内容を比較する簡易A/Bテストを実施することを推奨する。scoreThresholdの適正値（5→6が最適か、5→7まで上げるべきか）は実測なしに机上で断定できないため、実装フェーズでの調整余地として残す。

## 4. crontab変更案

### 現状
```
# イベント取得: 水・日 6:30 SGT (= 0:30 CEST)
30 0 * * 3,0 /home/masahiko/sg-weekend-app/scripts/run-fetch-all.sh >> /home/masahiko/sg-weekend-app/logs/run-fetch-all.log 2>&1
```

### 変更案
```
# ──────────────────────────────────────────────────────────────────
# イベント取得（fetch-events.js + check-content-integrity.js + notify-fetch-summary.js）: 毎日 6:30 SGT (= 0:30 CEST)
30 0 * * * /home/masahiko/sg-weekend-app/scripts/run-fetch-all.sh >> /home/masahiko/sg-weekend-app/logs/run-fetch-all.log 2>&1

# ソース分析・候補探索（discover-sources.js + analyze-sources.js）: 水・日 7:30 SGT (= 1:30 CEST)
# fetch-events.jsの実行完了を見込み1時間後にずらす（実行時間の実測により調整余地あり）
30 1 * * 3,0 /home/masahiko/sg-weekend-app/scripts/run-source-analysis.sh >> /home/masahiko/sg-weekend-app/logs/run-source-analysis.log 2>&1

# コースリフレッシュ（refresh-courses.js）: 水・日 8:00 SGT (= 2:00 CEST)
# ソース分析完了を見込みさらに30分後にずらす
0 2 * * 3,0 /usr/bin/node /home/masahiko/sg-weekend-app/scripts/refresh-courses.js --city=sg >> /home/masahiko/sg-weekend-app/logs/refresh-courses.log 2>&1
# ──────────────────────────────────────────────────────────────────
```

**変更点の要約**:
- `run-fetch-all.sh`の実行曜日指定`3,0`を`*`（毎日）に変更するのみで時刻は据え置き（`30 0`）
- `run-fetch-all.sh`の中身は「`fetch-events.js` + `check-content-integrity.js` + `notify-fetch-summary.js`」に変更（2-6節）。`notify-fetch-summary.js`は141〜149行目のユーザー向けWebプッシュ呼び出しブロックを削除した上で毎日実行に含める（LINE通知のみ残る）
- 新規スクリプト`scripts/run-source-analysis.sh`（`discover-sources.js` + `analyze-sources.js`を直列実行）を作成し、水・日のみの新規cronエントリで実行
- `refresh-courses.js`は`run-fetch-all.sh`から独立させ、単体で水・日の新規cronエントリから直接実行
- 各ジョブの実行時刻は30分〜1時間ずつずらし、前段ジョブの完了を待たずに並行実行してファイルI/O競合が起きるリスクを避ける（正確な所要時間は実装後の実測に基づき微調整が必要）

`notify-fetch-summary.js`は現状`source-analysis-result.json`/`discover-sources-result.json`（週2回のみ更新される想定のファイル）も参照しており、これらが当日更新されていない日は該当セクションが省略される作りになっている（`notify-fetch-summary.js` 85行目・110行目の`if (data.date === today)`チェック）ため、**毎日実行してもコード的には壊れない**（週2回しか更新されないセクションは自然に非表示になる）。

## 変更するファイル一覧（実装フェーズ想定、今回は設計のみ）
- `scripts/fetch-events.js`（`fetchRssItems()`のハイウォーターマーク方式導入。前回設計書の該当節をそのまま踏襲）
- `data/source-fetch-state.json`（新規作成、ハイウォーターマーク永続化用。前回設計書の該当節をそのまま踏襲）
- `scripts/filter-events.js`（`filterBatch()`の`scoreThreshold`引き上げ、カテゴリ補完閾値の相対調整、プロンプト文言追加）
- `scripts/run-fetch-all.sh`（`fetch-events.js` + `check-content-integrity.js` + `notify-fetch-summary.js`に変更）
- `scripts/notify-fetch-summary.js`（141〜149行目、ユーザー向けWebプッシュ通知（`/api/notify-events-updated`呼び出し）ブロックを削除。LINE通知部分は変更なし）
- `scripts/run-source-analysis.sh`（新規作成。`discover-sources.js` + `analyze-sources.js`を直列実行）
- crontab（システムcrontab、`crontab -e`で編集。4節の変更案を適用）
- `refresh-courses.js`自体はロジック変更なし（呼び出し元・頻度のみ変更）
- `server.js`の`/api/notify-events-updated`エンドポイント・`sendPushToAll()`関数は削除しない（呼び出し元がなくなるだけ。将来の手動再送信用に残置）

## APIエンドポイントへの影響
**なし。** `/api/*`エンドポイントのレスポンス構造・`data/sg/events.json`のイベントオブジェクトのフィールド構造は一切変更しない。今回の変更は「サーバー側の非公開バッチ処理（cron経由のフェッチパイプライン）」に閉じており、クライアント（Web版・iOS App Store版）が参照するAPI・データ構造には触れない。

## ⚠️ データ共有（Web版/App Store版）への影響確認（CLAUDE.md必須項目）
1. **後方互換性**: 影響なし。`events.json`のフィールド構造・保存されるイベントオブジェクトの形は一切変えない。旧バージョンのApp Storeアプリが読み取るデータ形式に変化はなく、壊れる要素はない
2. **影響範囲**: サーバーサイドのバッチ処理のみ。ただし今回は「フェッチ頻度が上がり、`events.json`への追加ペースが週2回から毎日になる」という**データの更新頻度自体の変化**がある。これは意図した挙動改善だが、Web版・App Store版どちらの利用者にとっても「イベント一覧の更新頻度が上がる」という体感変化として現れる（悪影響ではないが、事実として明記する）。一方で、**ユーザー向けWebプッシュ通知（新着イベント追加のお知らせ、`sendPushToAll`）は今回の変更で完全に停止する**（2-4節）。Web Push購読者・iOS APNs購読者は今後この種の通知を受け取らなくなる。これは意図した仕様変更であり、既存の購読データ（`data/push-subscriptions.json`等）自体は削除・変更しない（購読解除処理は行わない。単に送信トリガーが無くなるだけ）
3. **リリースタイミング**: サーバー側のみの変更（`data/`・バッチスクリプト・crontab）のため、App Storeのアプリバイナリ更新・審査は不要。`pm2 restart`等も不要（cronから起動される独立スクリプトのため、次回のcron実行から自動的に新スケジュール・新ロジックが適用される）

## 受け入れ基準
1. **正常系**: 毎日6:30 SGTに`run-fetch-all.sh`（`fetch-events.js`+`check-content-integrity.js`+`notify-fetch-summary.js`）が実行され、エラーなく完走すること
2. **正常系**: 水・日のみ`run-source-analysis.sh`（`discover-sources.js`+`analyze-sources.js`）と`refresh-courses.js`が追加で実行され、それ以外の曜日は実行されないこと
3. **正常系**: ハイウォーターマーク方式導入後、2回目以降のフェッチで前回`lastSeenGuids`に含まれていた記事は新着として扱われないこと（前回設計書の受け入れ基準を踏襲）
4. **正常系**: The Smart Local・Eatbook・Seth Lui等のカバー日数が短いソースについて、毎日実行により実測の投稿ペース（8.57件/日等）に対して取りこぼしが解消されること（複数日運用後、`source-fetch-state.json`の推移と`fetch-summary-sg.json`の`rawTotal`/`uniqueTotal`を観察して確認）
5. **正常系**: `scoreThreshold`引き上げ後、同一記事セットに対する採用件数が引き上げ前より減少すること（3節の簡易A/Bテストで確認）。かつ、明らかに質の高い記事（既存の採用実績があるような具体性の高い記事）が誤って弾かれていないこと（実装者の目視確認が必要）
6. **正常系**: `refresh-courses.js`の実行頻度が週2回のまま維持され、`fetch-events.js`の毎日化によってコース入れ替えペースが加速しないこと
7. **正常系**: `notify-fetch-summary.js`実行後、LINE通知は毎日届くが、ユーザー向けWebプッシュ通知（新着イベント追加のお知らせ）は一切送信されないこと（`sendPushToAll`が呼ばれないことをログ・実機で確認）
8. 前回設計書のハイウォーターマーク関連の受け入れ基準（初回フォールバック、失敗時の状態維持、GUID欠落時のURL代替等）はそのまま維持する

## スコープ外（今回作らないもの）
- RSSページネーション取得（案2、前回設計書で不採用と結論済み）
- Instagram取得ロジックの変更（4日カットオフの見直し等）
- `discover-sources.js`/`analyze-sources.js`の閾値・ロジック自体の変更（頻度は現行維持と判断したため、閾値調整も不要）
- BKK/SYDへの適用（現在停止中のため対象外。復活時に横展開が必要）
- 取りこぼし記事の遡及的な救済（過去に取りこぼされた記事を後から取得する仕組み）は作らない
- `notify-fetch-summary.js`の通知内容・フォーマット自体の変更（頻度のみが論点）

## リスク・未解決の質問

1. ~~【要ユーザー確認】LINE通知（`notify-fetch-summary.js`）の実行頻度~~ → **解決済み（2026-07-12ユーザー回答）**: LINE通知（開発者向け）は毎日でよい。ただし同スクリプトが同時に送っていたユーザー向けWebプッシュ通知（`sendPushToAll`）は別問題と判明し、**完全停止**することも合わせて決定（2-4節）。`notify-fetch-summary.js`は毎日実行グループに残すが、Webプッシュ呼び出しブロックは削除する
2. **未解決**: `scoreThreshold`の具体的な最適値（5→6が適切か、5→7まで上げるべきか）は実装後の実測データなしに机上で断定できない。3節記載のA/Bテスト的な検証を実装フェーズで行うことを推奨する
3. **未解決**: 毎日実行化後、実際のHaiku/Sonnet送信件数増加率が1-1節の見積もり（約1.7〜1.8倍）とどれだけ一致するかは、実測ペース（8ソースの投稿数/日）自体に日によるばらつきがあるため、正確な検証は数週間の運用実績が必要
4. **未解決**: `item.guid`が全8ソースで安定的に提供されているかは実装時に実際のフィードXMLを確認する必要がある（前回設計書から継続する未解決事項）
5. **未解決**: `run-fetch-all.sh`・`run-source-analysis.sh`・`refresh-courses.js`の3ジョブの実行時刻の間隔（4節では30分〜1時間の余裕を仮置き）は、各スクリプトの実際の所要時間を実測してから確定させる必要がある。特に`fetch-events.js`は毎日実行になることで1回あたりの処理件数が変わり、所要時間も従来と変わる可能性がある
6. **リスク（低）**: `source-fetch-state.json`のサイズ・停止済みソースのエントリ蓄積に関するリスクは前回設計書から変更なし（低リスク、将来的なクリーンアップ課題として記録するのみ）

## 承認状況
承認済み（2026-07-12）。LINE通知は毎日実行のまま（`run-fetch-all.sh`側に残す）でユーザー確認済み。実装（orchestrator）待ち。

---

# 設計書19 — イベント画面・コース画面へのプルトゥリフレッシュ（PTR）再実装

（2026-07-12 planner調査。CLAUDE.mdに記載の「PTRは永久廃止」ルールに対し、ユーザーの明示要望により再挑戦の設計を行う。コード変更なし、調査と設計のみ）

## 0. 【2026-07-12改訂】実差分で検証済み。当初の推定は誤りだったため全面訂正

初版のplannerはBashが使えず`git show`を実行できなかったため、状況証拠からの推定で原因を書いていた。その後メイン会話側（Bashあり）で実際に`git show 4f99b9e`・`git show 4a75e03`・`git show 9fe6bc9`を実行し、実差分を確認した。**結果、初版の推定（overflow:hidden/position:fixedが原因）は誤りだったことが判明した。** 以下、実差分に基づく正しい原因分析に全面差し替える。

## 1. 過去の失敗の実際の原因（`git show`で実差分確認済み）

### `4f99b9e`（実装）: 実際の実装内容
ホーム画面・コース画面の両方に自前JSでPTRを実装。`.screen-content`内部に`#ptr-indicator`/`#ptr-indicator-course`を新設し、`touchstart`/`touchmove`/`touchend`（すべて`{passive:true}`）でドラッグ量に応じてインジケーターの`height`を操作する実装だった。**`overflow:hidden`も`position:fixed`も一切使われていない。** ヘッダー・`.screen-content`自体の`position`/`overflow`は変更されていない。当初のplanner推定（禁止事項2箇条が原因）は的外れだった。

### `4a75e03`（部分対策）: 実際の対処内容
「ヘッダーずれ」の応急処置として、**PTR自体を`_isCapacitorApp`条件でCapacitor環境だけ無効化**（Web版は動作継続、`if (!_isCapacitorApp) (function() {...})()`のようにガードを追加）。あわせて`.screen-content`に`overscroll-behavior: none`を追加、safe-area対応のpadding調整も同時実施。PTRのコード自体は消さず、発火条件を絞っただけ。

### `9fe6bc9`（完全廃止）: 実際に効いた修正はPTRと無関係の2点だった
このコミットで「ヘッダーずれ」「白いステータスバー」を実際に解決したのは、以下の2つの変更であり、**PTRのコード自体の削除は問題の直接的な修正ではなく、同じコミットに巻き込まれて一緒に削除されただけ**と読み取れる:

1. **白いステータスバー対策**: それまでJS実行時に`Capacitor.Plugins.StatusBar.setStyle({style:'DARK'})`を呼んでいたが、これを削除し、**`.github/workflows/ios-deploy.yml`にInfo.plistを直接書き換えるCIステップ（`UIViewControllerBasedStatusBarAppearance:false` + `UIStatusBarStyle:UIStatusBarStyleDarkContent`）を追加**する方式に切り替えた。JSでの実行時設定がタイミング的に不安定だったことが原因だったと考えられる。
2. **ヘッダーずれ対策**: `document`全体に対するグローバル`touchmove`リスナー（`scrollY<=0`の状態で`preventDefault()`し、WKWebViewのネイティブな上方向ゴムバンドスクロール＝ラバーバンドバウンスを禁止する）を新規追加。コメントに明記: 「WKWebViewの上方向ゴムバンドスクロールを禁止（ヘッダーのずれ防止）」。**つまり実際の原因は「PTRの実装方法」ではなく「WKWebViewのネイティブオーバースクロール（ゴムバンド）挙動そのもの」が、指を引っ張った際にヘッダー位置を視覚的にずらしていたことだった。**

### 結論（訂正版）: 過去の失敗の本当の原因

**PTRの実装コード自体（DOM構造・CSS）に欠陥があったのではなく、「WKWebViewの上方向ネイティブオーバースクロール（ラバーバンド）を防止する仕組みが当時存在しなかった」ことが、ヘッダーずれの直接原因だった。** PTRは「最上部で下に引っ張る」という、ネイティブオーバースクロールが発生するのと全く同じジェスチャーを扱うため、このオーバースクロール防止が無い状態でPTRを実装すると症状が出た。ステータスバー問題もPTRとは別件（JS実行タイミングの不安定さ）。

**この2つの本当の原因は、現在のコードベースには既に両方とも修正済みの状態で存在している**（`public/app.js`44〜67行目の`_isCapacitorApp`限定オーバースクロール防止JS、CLAUDE.md「✅ iOS overscroll防止」として文書化・`.github/workflows/ios-deploy.yml`のInfo.plist StatusBar設定）。したがって、**これらの既存の仕組みを変更・削除しない限り、PTRを再実装しても同じ症状が再発するリスクは低いと判断できる**（推定ではなく実差分に基づく結論）。

## 2. 今回の設計の大原則（訂正版）

**最重要: 現在の`public/app.js` 44〜67行目のグローバルoverscroll防止JS、および`.github/workflows/ios-deploy.yml`のInfo.plist StatusBar設定ステップを、一切変更・削除しない。** この2つが「本当の過去の修正」であり、PTR実装がこれらと共存できることが今回の成否を分ける。

追加の安全策（当初案から踏襲、実害はないため維持）:

1. ヘッダー（`.app-header`/`.course-screen-header`）自体、`.screen-scroll-content`/`.screen-content`自体、`html`/`body`のいずれにも、position/overflow/heightの変更を一切加えない（当初の設計方針も引き続き良い実践のため維持するが、今回判明した通り、これ自体が過去の直接原因ではなかった点に注意）。
2. 引っ張り演出は、**`.screen-scroll-content`/`.screen-content`の内部に新設する専用の子要素（インジケーター用の`<div>`）の高さ・opacityをJSで操作するだけ**で完結させる。
3. **PTR用の新規`touchmove`リスナーは、既存のグローバルoverscroll防止リスナーと同じ`touchmove`イベントを読むことになる。両者は独立したリスナーとして共存可能（実差分で確認済みの通り、既存リスナーは`document`に、PTR用は個別コンテナに登録するため）。既存リスナーが`preventDefault()`を呼んでもPTR用リスナーの`touches[0].clientY`読み取り自体には影響しない（イベントは伝播する）ため、この点は当初懸念していたほどのリスクではない。**
4. Web版でのPTR復活も検討可能（過去`4a75e03`時点でWeb版は`_isCapacitorApp`条件で有効のまま残されていた実績があるため、Web版側の安定性はそもそも問題になっていなかったと考えられる）。

## 3. 実装方式の比較

### 選択肢A（第一候補）: Capacitor公式相当のネイティブPTR — 現状「存在しない」ため不採用

Capacitor本体には「Pull to Refresh」専用の公式プラグインは存在しない（`@capacitor/*`公式パッケージ一覧に該当なし）。サードパーティ製プラグイン（例: コミュニティ製`capacitor-pull-to-refresh`系）は存在しうるが、以下の理由で本プロジェクトでは不採用と判断する:

- 新規ネイティブプラグイン導入は`npx cap sync`・Xcodeプロジェクトへの影響範囲が読めず、CLAUDE.mdの「iOS/Capacitor開発ノウハウ」に蓄積された既知の落とし穴（`resize`モード、`contentInset`、entitlements等の相互作用）に**新しい未知の相互作用**を追加するリスクがある
- Web版（`_isCapacitorApp`が`false`の環境）では動作しないため、結局Web版向けに別実装が必要になり「2つの実装を保守する」コストが発生する
- 直近（設計書15）でようやく`contentInset:'never'`によるビューポート固着バグを根治したばかりであり、ネイティブ層への追加変更はこの安定性を再び揺るがすリスクが高い

→ **選択肢A（サードパーティネイティブプラグイン）は今回はスコープ外。将来的にCapacitor公式がPTRプラグインを出した場合のみ再検討する。**

### 選択肢B（採用）: 自前JS実装（構造的にヘッダー/ナビへ影響しない設計）

CLAUDE.mdの「正しいスクロール・レイアウトパターン」（flex + `.screen-scroll-content{flex:1; overflow-y:auto}`）を**一切変更せず**、その内部だけで完結する実装。詳細は下記「4. 実装方針」参照。

**Web版とiOS版の扱いを分ける**:
- **iOS版（Capacitor）**: 自前JS実装を有効化。ネイティブのブラウザPTR挙動が存在しないため実装が必要。
- **Web版（ブラウザ）**: モバイルブラウザ（iOS Safari／Android Chrome）には、`overscroll-behavior`が`auto`のページ最上位で下に引っ張ると**ブラウザネイティブのPTR（ページリロード）が働くケースがある**。ただし本アプリは`.screen-scroll-content`が独立したスクロールコンテナであり、ページ全体（`html`/`body`）はスクロールしない構成のため、ブラウザネイティブPTRは基本的に発火しない（`html`/`body`自体がスクロール可能な状態でないと発火条件を満たさない）。Web版でも同じ自前JS実装を有効にするか、Web版はスコープ外として何もしないかは**未決定（下記「未解決の質問」参照）**。

## 4. 実装方針（選択肢B詳細）

### 4.1 対象範囲の切り分け（イベント画面 vs コース画面）

| 項目 | イベント画面（`#screen-home`） | コース画面（`#screen-course`） |
|---|---|---|
| 既存の横スワイプ機構 | あり（`homeEl`＝`#screen-home`全体に`touchstart`/`touchmove`/`touchend`、カテゴリタブ切替） | なし |
| PTRジェスチャー検知の対象要素 | `#home-scroll-content`（`.screen-scroll-content`、スクロールコンテナ自体） | `#course-screen-content`（`.screen-content`、スクロールコンテナ自体） |
| 横スワイプとの衝突対策 | **必要**（後述4.2） | 不要（横スワイプ機構自体が存在しないため独立して実装できる） |
| 実装難易度 | 高（既存ジェスチャーとの共存が必須） | 低（新規に単独実装できる） |

**PTRのタッチイベントリスナーは、既存の横スワイプが`#screen-home`（画面全体）に登録されているのに対し、`#home-scroll-content`（スクロールコンテナ自体）に登録する。** これにより、ヘッダー領域（`.app-header`）でのタッチはPTRの対象外になる（引っ張り操作はスクロールコンテナ内部で完結するべきという大原則とも一致する）。

### 4.2 既存の横スワイプ機構との衝突回避（イベント画面のみ）

現在の横スワイプ実装（`public/app.js` 1413〜1463行目）を実コードで確認済み。要点:

```js
homeEl.addEventListener('touchstart', e => {
  _swipeStartX = e.touches[0].clientX;
  _swipeStartY = e.touches[0].clientY;
  _swipeIntent = null;
}, { passive: true });

homeEl.addEventListener('touchmove', e => {
  if (_swipeIntent) return;
  const dx = Math.abs(e.touches[0].clientX - _swipeStartX);
  const dy = Math.abs(e.touches[0].clientY - _swipeStartY);
  if (dx > 6 || dy > 6) _swipeIntent = dx > dy ? 'h' : 'v';
}, { passive: true });

homeEl.addEventListener('touchend', e => {
  if (_swipeIntent !== 'h') return;   // ← 縦方向('v')判定時は何もしていない
  ...
}, { passive: true });
```

この機構は**既に「横方向('h')か縦方向('v')か」を最初の6px移動で判定し、`_swipeIntent`に記録する仕組みを持っている**。`_swipeIntent === 'v'`の場合、現状は何も処理されず単にスクロールに委ねられている（`{passive:true}`のため`preventDefault`もしていない）。

**この既存の`_swipeIntent`判定ロジックをPTR側でも再利用する（相乗り方式）**:

- PTRのトリガー判定は、既存の`_swipeIntent`が`'v'`と確定し、かつ`dy > 0`（下方向）、かつ`e.touches[0].clientY - _swipeStartY`が正、かつ**スクロールコンテナが最上部（`scrollTop <= 0`）にいる場合のみ**発火させる。
- 既存の横スワイプ用`touchmove`リスナー（`{passive:true}`）とは別に、**PTR専用の`touchmove`リスナーを`#home-scroll-content`に`{passive:false}`で追加**し、その中で`_swipeIntent`（既存の変数、モジュールスコープで共有可能にする）を参照する。`_swipeIntent === 'h'`が確定した時点でPTR側は即座に何もしない（`return`）ことで、斜め方向スワイプで両方が同時に反応することを防ぐ。
- 逆に、`_swipeIntent === 'v'`かつスクロール最上部での下方向ドラッグが確定した時点で、既存の横スワイプ側（`touchend`）は`_swipeIntent !== 'h'`のため何もしない（既存コードのまま変更不要）。つまり**「'h'なら横スワイプ、'v'かつ最上部での下ドラッグならPTR、それ以外はただのスクロール」という三分岐が、既存の判定変数を拡張するだけで実現でき、新しい衝突を生まない**。

コース画面には同種の横スワイプが存在しないため、`#course-screen-content`側は`_swipeIntent`のような共有判定を作らず、単独で「スクロール最上部＋下方向ドラッグ」のみを見るシンプルな実装でよい。

### 4.3 overscroll防止JS（既存グローバル`touchmove`）との関係

`public/app.js` 44〜67行目の既存overscroll防止は**`document`に対するグローバルリスナー**であり、対象範囲を絞らず「祖先を辿ってスクロール可能要素を探し、端に達していたら`preventDefault`」という設計。この既存ロジックには**手を加えない**（触ると設計書15以前の混乱を再発させるリスクがあるため）。

PTR用の新規`touchmove`リスナーは、既存グローバルリスナーとは別に、**PTR対象コンテナ（`#home-scroll-content`/`#course-screen-content`）に個別バインドする形で追加する**。イベントリスナーは同一要素に複数バインドでき、DOM上はバブリング順（またはcapture指定）で両方とも呼ばれるため、既存のグローバルリスナーとPTR用リスナーが同時に発火すること自体は問題ない。ただし**両方が`preventDefault()`を呼ぶタイミングが競合しないよう、PTR用リスナーは「スクロール最上部で下方向ドラッグが確定した場合のみ」`preventDefault`する**（それ以外はスクロールを既存ロジックに委ねる）。

**懸念点（要実機検証、リスク欄に記載）**: 既存グローバルリスナーは「`atTop && dy > 0`の場合に`preventDefault`してゴムバンドを止める」ロジックを持つ。これはPTRが必要とする「最上部で下に引っ張るジェスチャーの検出」と**イベント自体は同じ条件**を見ている。既存ロジックが先に`preventDefault`を呼んでしまうと、PTR用リスナーに渡る`touchmove`イベントの挙動（`cancelable`状態や後続の処理）に影響が出ないか、実機で確認が必要。

### 4.4 引っ張り演出（ヘッダー・ナビに触れない実装）

- スクロールコンテナ（`#home-scroll-content`/`#course-screen-content`）の**先頭**（`.cards-grid`/`#course-list`の直前）に、常時DOM上に存在する非表示のインジケーター要素（例: `#ptr-indicator-home`/`#ptr-indicator-course`）を新設する。
- 引っ張り中: `touchmove`で計測した`dy`（下方向の移動量、上限にクランプ）に応じて、インジケーター要素の`height`（または`transform: scaleY`）とスピナーの回転角をJSで更新する。**この操作はインジケーター要素自身のスタイルのみを変更し、`.screen-scroll-content`自体やヘッダーには一切触れない。**
- インジケーター要素が「スクロールコンテナの通常のフローの中の最初の子要素」として配置されるため、その高さが増えると自然にその下のコンテンツ（カード一覧）が押し下げられる（＝ブラウザの通常のレイアウト計算に任せる。JSで「コンテンツ全体をtransformで動かす」ような実装はしない）。
- 一定の閾値（例: 60px）を超えて指を離した場合に「リフレッシュ確定」とし、インジケーターをローディング状態で固定表示 → データ再取得APIを呼ぶ → 完了後にインジケーターの高さを0に戻すアニメーション。
- 閾値未満で指を離した場合は、インジケーターの高さを0に戻すだけ（リフレッシュは実行しない）。

この設計であれば、**ヘッダーの`position:sticky`、bottom-navの`position:fixed`、`.screen-scroll-content`の`overflow-y:auto`のいずれも一切変更されない**ため、CLAUDE.mdの禁止事項2箇条が問題にしていた「ヘッダーがずれる」「bottom-navのクリックが効かなくなる」という症状は、**構造的に発生し得ない**（ヘッダー・ナビを動かすコードが存在しないため）。

### 4.5 データ再取得の内容

- イベント画面: 現状のイベント一覧再取得ロジック（`fetchEvents()`相当、既存のカテゴリ・フィルター状態を維持したまま再フェッチ）を呼ぶ想定。**具体的な関数名・既存のフィルター再適用フローは未調査（builderフェーズで実コードを確認して統合すること）。**
- コース画面: 現状のコース一覧再取得ロジック（`fetchCourses()`相当、現在選択中のタブ「みんなのコース」/「マイコース」を維持したまま再フェッチ）を呼ぶ想定。**同上、未調査。**
- どちらも**既存の`API_BASE`付きfetch呼び出しパターンを踏襲**し、新しいAPIエンドポイントは追加しない（既存の`GET /api/events`・`GET /api/courses`を再度叩くだけ）。

## 5. 変更するファイル一覧

- `public/app.js`: PTR用の新規タッチイベントリスナー2組（イベント画面用・コース画面用）、インジケーター制御関数、既存`_swipeIntent`変数のスコープ調整（PTR側から参照できるようにする）
- `public/index.html`: `#home-scroll-content`・`#course-screen-content`それぞれの先頭にインジケーター用`<div>`を追加。`app.js`/`app.css`のキャッシュバスティング用クエリパラメータ更新
- `public/app.css`: インジケーター要素のスタイル（非表示時は`height:0; overflow:hidden`、スピナーアニメーション用`@keyframes`）
- `public/sw.js`: `CACHE_NAME`のバージョン番号更新
- **変更しないファイル（明示）**: `server.js`（新規APIエンドポイント追加なし）、`ios-app/capacitor.config.js`（`contentInset`/`resize`は現状維持、一切触らない）、データファイル一式

## 6. データモデルの変更

なし。既存の`GET /api/events`・`GET /api/courses`をクライアント側から再度呼ぶだけで、レスポンス構造・エンドポイントとも変更しない。

## 7. APIの変更

なし（上記の通り既存エンドポイントの再利用のみ）。

## 8. 後方互換性・データ共有の影響（CLAUDE.md必須確認事項）

- **後方互換性**: 影響なし。APIレスポンス構造・データファイル構造のいずれも変更しないため、旧バージョンのApp Storeアプリが壊れる心配はない。
- **影響範囲**: `public/app.js`・`public/app.css`・`public/index.html`・`public/sw.js`はCapacitorに**ローカルバンドル**されるファイル（`CLAUDE.md`「Capacitorバンドル方式」参照）であるため、この変更はWeb版に即時反映される一方、**iOS App Store版には次回のTestFlightビルド＋審査（または既存の`release`ブランチ運用ルールに従ったTestFlight配信）を経ないと反映されない**。Web版とiOS版で一時的にPTRの有無が異なる期間が生じるが、これは既存の全ての`public/`配下の変更と同じ扱いであり、新規のリスクではない。
- **リリースタイミング**: サーバーサイド（`server.js`・データ構造）を一切変更しないため、Web版とiOS版を同時にリリースする必要はない。**Web版で先行して十分に動作確認してからiOS版（TestFlight）に展開する段階的リリースが可能かつ推奨**（Web版はpm2 restartのみで即座に確認・ロールバックできるが、iOS版はビルド〜配信に15〜20分かかり、かつ`_isCapacitorApp`分岐がある部分はWeb版だけでは検証しきれないため）。

## 9. 受け入れ基準

### 正常系
- イベント画面: `#home-scroll-content`が最上部にスクロールされている状態で、下方向に一定量（閾値）以上引っ張って離すと、インジケーターがローディング表示になり、イベント一覧が再取得され、成功後にインジケーターが消えること
- コース画面: `#course-screen-content`が最上部にスクロールされている状態で、同様の操作でコース一覧が再取得されること
- 引っ張り操作中、常に**ヘッダー（タイトル・カテゴリチップ行／コースタブ）の位置が画面上で一切動かない**こと（`getBoundingClientRect()`で引っ張り前後の位置を比較して確認）
- 引っ張り操作中〜完了後を通して、**bottom-navが常にタップに反応し続ける**こと（4〜5回連続で引っ張り→ナビタップを繰り返すシナリオでの確認）
- 閾値未満で指を離した場合はリフレッシュが実行されず、インジケーターが元の高さ（0）に戻ること

### 失敗系
- イベント一覧・コース一覧の再取得APIが失敗（ネットワークエラー等）した場合、インジケーターがエラー状態を経て確実に消え、無限ローディング状態のまま残らないこと
- 連続して素早く複数回引っ張った場合（リフレッシュ処理中に再度引っ張る）、二重リクエストが発行されないこと（処理中フラグでガードする）

### エッジケース
- イベント画面: 最上部ではない位置（スクロール途中）で下方向にドラッグしてもPTRが発火しない（通常のスクロール、または横スワイプ判定が優先されること）こと
- イベント画面: 斜め方向のドラッグ（横成分・縦成分がほぼ同じ）で、横スワイプとPTRのどちらか一方のみが発火し、両方同時に反応しないこと
- カテゴリフィルター・エリアフィルター等が適用された状態でPTRを実行した場合、フィルター条件を維持したまま該当データのみ再取得されること（フィルターがリセットされないこと）
- コース画面のタブ（「みんなのコース」/「マイコース」）を切り替えた状態でPTRを実行した場合、選択中のタブのデータのみ再取得されること
- Web版（ブラウザ、`_isCapacitorApp === false`）でPTRを有効化する場合、モバイルSafari/Chromeのネイティブのページリロード的PTRと二重発火しないこと（下記「未解決の質問」で方針決定後に確定する基準）

### 過去の不具合が再発していないことの具体的な確認方法（最重要）
1. **ヘッダーずれの再発確認**: TestFlight実機で、PTR操作の引っ張り中〜完了後の一連の流れで、`.app-header`（イベント画面）・`.course-screen-header`（コース画面）の`getBoundingClientRect().top`が常に一定（`env(safe-area-inset-top)+0`相当の位置から動かない）ことを目視、または`_sendDebugLog`を使った一時計装で数値記録して確認する
2. **白いステータスバーの再発確認**: TestFlight実機で、PTR操作中〜完了後にステータスバー領域の背景色・文字色が変化しないことを目視確認する。CLAUDE.mdに記載の`ios-deploy.yml`の`UIStatusBarStyleDarkContent`固定設定は本設計では変更しないため、ここが原因で再発する可能性は低いと考えられるが、必ず実機で確認する
3. **bottom-navクリック不可の再発確認**: PTR操作を5〜10回連続で行った直後に、毎回ボトムナビ4項目全てが正常にタップ反応することを確認する（`CLAUDE.md`に記載の他の重大バグ〈設計書5・7・9等〉と同じ確認パターンを踏襲）
4. **`html`/`body`への`overflow:hidden`が実装に含まれていないことのコードレビュー確認**: builder実装後、`git diff`で`html`/`body`セレクタへの`overflow`プロパティ追加が一切ないことをchecker段階で機械的に確認する（今回の設計方針の根幹であるため、レビューチェックリストに明記する）
5. **スクリーンコンテナへの`position:fixed`が実装に含まれていないことのコードレビュー確認**: 同様に`.main`/`#screen-course`/`.screen-scroll-content`/`.screen-content`に`position:fixed`が追加されていないことを`git diff`で確認する

## 10. スコープ外（今回作らないもの）

- サードパーティ製ネイティブPTRプラグインの導入（選択肢A、上記の理由により不採用）
- Android対応（本プロジェクトはiOSのみ対応、CLAUDE.mdのAPNsセクションと同じ扱い）
- コース画面以外の「みんなのコース」/「マイコース」タブを横断した一括リフレッシュ（現在選択中のタブのみを対象とする）
- 予定表画面・設定画面へのPTR追加（今回はイベント画面・コース画面の2画面のみが対象。ユーザー依頼の範囲外）
- リフレッシュ時の差分ハイライト表示（新着イベントの強調表示等の付加演出）
- オフライン時・API失敗時のリトライ自動化（エラー表示のみで、手動で再度引っ張れば良い設計とする）

## 11. リスク・未解決の質問

### リスク

- ~~R1（高、最重要）: git show未確認~~ → **解決済み（2026-07-12、メイン会話側でBashを使い`git show 4f99b9e`/`4a75e03`/`9fe6bc9`を実行し実差分確認済み）**。当初の推定（overflow:hidden/position:fixedが原因）は誤りと判明し、セクション0・1・2を実差分に基づき全面訂正した。実際の原因はWKWebViewのネイティブオーバースクロール（ゴムバンド）防止の欠如とStatusBar JS設定の不安定さであり、どちらも現在のコードベースには既に修正済みで存在する。
- **R2（中）**: 既存の横スワイプ用`_swipeIntent`判定ロジックとPTR用ロジックを同じ変数で共有する設計にした場合、変数のスコープ（現在はブロックスコープ`{ let _swipeStartX = 0, ... }`で囲われている）を外部に公開する必要があり、既存コードの構造に手を入れることになる。既存の横スワイプ機構に意図しない副作用を与えないよう、変更は最小限にし、実装後は横スワイプ機能（カテゴリタブ切り替え）の全既存シナリオ（設計書6の受け入れ基準）を再度回帰確認する必要がある。
- **R3（中）**: 既存のグローバルoverscroll防止`touchmove`リスナー（`public/app.js` 49〜67行目）とPTR専用`touchmove`リスナーが同一のタッチジェスチャーに対して両方発火する設計のため、`preventDefault()`呼び出しの順序・競合が実機でどう振る舞うか未検証。設計上は問題ないと考えられるが、TestFlight実機での重点確認項目とする。
- **R4（中）**: `contentInset:'never'`（設計書15で確定済み）環境下でのPTR時、スクロールコンテナの`scrollTop`挙動・`touchmove`のイベント座標系に、当時発見された「過渡期間中のタッチイベント配送先のずれ」（CLAUDE.md記載、設計書9由来）と同種の問題が新たに発生しないか未検証。PTR操作直後にボトムナビ・カテゴリタブをタップする一連の操作を実機で重点確認する。
- **R5（低）**: リフレッシュ処理中（API呼び出し中）に画面遷移（他のボトムナビタップ）が行われた場合の挙動未定義。処理中フラグと画面遷移の相互作用を実装時に決める必要がある。

### 未解決の質問（ユーザー確認が必要）

1. **Web版でもPTRを有効化するか、iOS版のみに限定するか。** 本設計は「iOS版のみ有効化」をベースに書いたが、Web版ユーザー（テスト環境）にも欲しいという要望があれば、モバイルブラウザのネイティブPTR挙動との二重発火リスクを追加調査する必要がある。
2. **リフレッシュ確定の閾値（何px引っ張ったら発火するか）・視覚的なインジケーターのデザイン（スピナーのみか、ロゴ等のブランド要素を使うか）について、具体的な要望はあるか。** 未指定のため設計書では仮に60pxとしている。
3. **イベント画面・コース画面のうち、どちらから先に段階的に実装・検証するか。** リスクR2（横スワイプとの衝突）を踏まえると、**衝突リスクのないコース画面から先に実装・実機検証し、問題のない設計パターンを確立してからイベント画面に展開する**段階移行を推奨するが、最終判断はユーザーに委ねる。
4. ~~`git show`による実差分確認~~ → **解決済み（上記R1参照）**

### 未解決の質問への回答（2026-07-12ユーザー確認）
上記1〜3は未回答のまま実装フェーズに進める。builder実装時のデフォルト方針: (1)iOS版のみ有効化, (2)閾値60px・シンプルなスピナーデザイン, (3)横スワイプ衝突リスクのないコース画面から先に実装し、動作確認後にイベント画面へ展開。

## 承認状況
承認済み（2026-07-12）。R1（実差分未確認）は解決済み。orchestrator実装に進む。

---

# 設計書20 — Google/Apple IDログイン + サブスクリプション基盤（再設計・実現性再検証）
（2026-07-12 planner再調査。2026-07-11設計書の実装未着手分を、現状コードベースの追加事実を踏まえて全面的に見直す。実装は行わない。設計のみ）

## 0. 背景・経緯
2026-07-11に本機能の詳細設計を実施したが、`.claude/`ディレクトリがgitignore対象のため、その後別タスクでの`.claude/plan.md`上書きにより設計書本文が失われた（と思われていた）。要約（`.claude/next.md`）のみが残存していたが、調査の結果 `.claude/plan.md.bak-login-design-2026-07-11` に元の設計書全文が退避されていたことが判明し、これを一次資料として発見・回収した。本設計書はその内容を土台に、2026-07-12時点の実コード（`server.js`／`ios-app/capacitor.config.js`／`ios-app/package.json`／`.github/workflows/ios-deploy.yml`）を再確認し、事実誤認がないか検証した上で更新したものである。

## 1. 現状確認（2026-07-12実コード検証で裏付けた事実）

### 1-1. フェーズ0ブロッカー（Apple法人審査待ち）の実態
- `.github/workflows/ios-deploy.yml`には、APNs対応（2026-07-10実装）用に追加された「Create App.entitlements」「Wire App.entitlements into Xcode project build settings」の2ステップが**現在もコメントアウトされたまま**残っている。コメント内に「Apple Developerアカウントを個人→法人へ切替登録中で、法人審査（D-U-N-S番号確認等）完了までApp ID(app.dosuru)のPush Notifications capabilityを有効化できない」と明記されており、2026-07-12時点でも未解消と確認できた。
- `ios-app/capacitor.config.js`にはSign in with Apple関連の設定は一切存在しない（未着手のため当然）。
- **結論**: Push Notifications capabilityが同一Apple Developer Portal・同一App ID（`app.dosuru`）の審査待ちでブロックされている実例が既にCI設定に存在する。Sign in with Apple capability・In-App Purchase capabilityも同じPortal・同じApp IDの操作であるため、同様にブロックされる可能性が高いという前提は、推測ではなく**類似の既知事例による裏付けのある推測**として扱ってよい（完全な確証ではないが、単なる楽観的推測ではない）。

### 1-2. なりすまし脆弱性（実コード確認、過去設計書より深刻と判明）
`server.js` 2154〜2217行目のコース関連エンドポイントを実際に確認した結果:
- `POST /api/courses/publish`（2155行目）: `req.body`の`authorId`をそのまま保存。検証なし。
- `DELETE /api/courses/:id`（2173行目）: リクエストボディの検証は**一切ない**。`id`（URLパス）と`city`（クエリ）のみでコースを削除できる。認証ヘッダー・authorId比較のいずれも存在しない。
- `POST /api/courses/:id/unpublish`（2206行目）: 同上、認証・所有権チェックなし。
- クライアント側（`public/app.js` 2961行目）の「自分の投稿か」判定（`course.authorId === getUserId()`）は表示制御（削除ボタンの表示/非表示）のみに使われ、サーバー側では一切検証されない。`getUserId()`（3706行目）は`localStorage.user_id`が無ければ乱数生成する完全な自己申告値。
- **評価**: 過去設計書は「誰でも他人のコースを削除できる」としていたが、実際には「削除ボタンを直接叩かなくても、`DELETE /api/courses/:id?city=sg`にidとcityさえ分かればcurlで誰でも削除できる」という、UIの制約すら回避可能なレベルの脆弱性であることを確認した。ただし「改ざん」（内容の書き換え）ができるAPIは存在しないため、被害は「削除・非公開化」に限定される。

### 1-3. Stripeコード（`server.js` 116〜260行目、コメントアウト中）の再利用性
- Webhook受信（`checkout.session.completed`/`customer.subscription.updated`/`customer.subscription.deleted`）、Checkout Session作成（`POST /api/create-checkout-session`）のAPI呼び出しパターン自体は妥当で流用可能。
- ただし状態保存先が`premiumSessions`という**インメモリMap**（プロセス再起動で消滅、PM2再起動のたびに全ユーザーの課金状態が失われる）であり、そのままでは本番運用に使えない。`data/users.json`の永続データへの置き換えが実装時に必須（過去設計書の評価が正確であることを確認）。
- ユーザーアカウントの概念がなく、`x-session-id`ヘッダーのみで状態を引く設計だったため、ログイン基盤と接続するには識別子の持ち方から作り直す必要がある。

### 1-4. iOS/CI側の現状（Sign in with Apple・Google Sign-In関連）
- `ios-app/package.json`（v1.3、依存関係6種）にApple/Google Sign-In系プラグインは存在しない。`jsonwebtoken`パッケージも`package.json`（ルート）に存在しない。
- CI署名方式は`ios-app/fastlane/Fastfile`を確認した結果、**`fastlane match`は使用しておらず、`DIST_CERT_BASE64`/`PROVISION_PROFILE_BASE64`という手動証明書・プロファイルのBase64エンコード配布方式**（`import_certificate`/`install_provisioning_profile`/`update_code_signing_settings`with`use_automatic_signing: false`）であることを確認した。CLAUDE.mdの「`fastlane match init`」という記載は実態と乖離している（過去設計書の指摘と一致）。
- entitlements自動生成パターン（APNs対応時に導入、現在コメントアウト中）が既存し、Sign in with Apple capability追加時も同様のPlistBuddy/xcodeprojパターンで実現できる見込みは変わらず妥当。
- **手動証明書配布方式であることの追加含意**: Sign in with Apple capability・In-App Purchase capabilityをApp IDに追加すると、Provisioning Profileの再生成が必要になる（既存のAPNs対応時と同じ構造）。`fastlane match`を使っていないため、Provisioning Profile再生成のたびに`PROVISION_PROFILE_BASE64`のGitHub Secretsを**手動で**更新する必要があり、この手動更新オペレーション自体もApple Developer Portalへのアクセス（＝フェーズ0の審査完了）が前提になる。

### 1-5. データモデルの実現性
`data/push-subscriptions.json`（実データ確認済み。配列形式、各要素が`{endpoint, keys:{p256dh, auth}}`または`{platform:'ios', deviceToken, registeredAt}`）と`server.js` 277行目の`withFileLock`（`fileLocks`オブジェクトによる簡易ロック、10ms間隔でのポーリング待機）を確認した。`data/users.json`を同じ「単一JSON配列ファイル+`withFileLock`」パターンで作る設計は、既存コードベースの一貫した実装パターンと完全に整合しており、技術的な障害はない。

## 2. ユーザーストーリー（2026-07-11版から変更なし）
- iOSアプリユーザーとして、Google/Apple IDでログインし、将来の有料プラン加入に備えたい
- ログインしなくても引き続き匿名で基本機能を使い続けられてほしい
- 将来サブスク加入者として、機種変更してもログインし直せば有料プラン状態が引き継がれてほしい（フェーズ3以降）
- 運営者として、コミュニティコース投稿者を偽装できない形で識別し、不正投稿・なりすまし削除に対処したい（1-2節で確認した通り、現状は削除さえ誰でも可能な状態）

## 3. 受け入れ基準（フェーズ1「認証基盤のみ」想定、変更なし）

### 正常系
- 設定画面から「Googleでログイン」「Appleでログイン」でネイティブ認証フロー起動、成功後ログイン状態になる
- 設定画面にユーザー名・メールアドレス表示。アプリ再起動後もログイン状態保持
- ログアウトで匿名状態（従来のlocalStorageベース動作）に戻る

### 失敗系
- ネットワークエラー時はエラー表示、匿名状態のまま使い続けられる
- ユーザーによる認証キャンセル時は何も変化せず元画面に戻る
- サーバー側トークン検証失敗時は401、クライアントは再ログインを促す

### エッジケース
- 同一Apple IDで2台目端末からログインした場合の挙動（12節で未解決）
- 既存localStorage匿名データがある状態でのログイン時の扱い（6-3節で3案比較、変更なし）
- Appleの「メール非公開」オプション選択時はリレーメールのみ保持
- 旧バージョンAppは本機能を認識せず従来通り匿名動作（後方互換）

## 4. スコープ外（2026-07-11版から変更なし）
- Android版ログイン対応、Web版へのログインUI提供（サーバーAPIは将来Web展開しやすい形で設計）
- 既存匿名データの完全自動移行の保証、決済・サブスク本体の実装（フェーズ1範囲外）
- 共有カレンダー機能へのログイン必須化、メール+パスワード方式
- 実装そのもの（本タスクは設計のみ）

## 5. 認証方式の技術選定

### 5-1. クライアント側（iOSアプリ/Capacitor）
- Sign in with Apple: `@capacitor-community/apple-sign-in`等。`identityToken`/`authorizationCode`/`user`取得
- Google Sign-In: `@capacitor-community/google-signin`または`@codetrix-studio/capacitor-google-auth`等。iOS用OAuthクライアントID発行が別途必要
- Appleガイドライン4.8対応: サードパーティログイン提供時はSign in with Appleも同等提供が必須。最初から両方セットで提供するため要件を満たす

### 5-2. サーバー側の認証方式
- Apple/GoogleのJWT（identityToken/idToken）をそれぞれの公開鍵で検証
- `sub`を主キーに`data/users.json`をupsert
- JWT発行方式を推奨（`jsonwebtoken`パッケージは現状未導入のため新規追加が必要。`JWT_SECRET`環境変数、有効期限は要検討）
- クライアントはCapacitor `Preferences`にJWT保存、`Authorization: Bearer`ヘッダー付与
- 共通ヘルパー`authedFetch(url, options)`を新設。既存匿名エンドポイントの動作は変更しない

## 6. データモデル設計

### 6-1. `data/users.json`（単一ファイル、既存`data/push-subscriptions.json`と同一の`withFileLock`パターンを踏襲。1-5節で実装パターンの一貫性を確認済み）
```json
[{
  "userId": "usr_XXXXXXXXXX",
  "provider": "apple",
  "providerSub": "001234.abcdef...",
  "email": "example@privaterelay.appleid.com",
  "displayName": "山田太郎",
  "avatarEmoji": "🦊",
  "createdAt": "...", "lastLoginAt": "...",
  "subscriptions": []
}]
```

### 6-2. `provider`+`providerSub`をユニークキーに（同一メールでもApple/Googleは別アカウント扱い）

### 6-3. 既存localStorageデータの移行方針（3案比較、2026-07-11版から変更なし）
- 案A: ログイン時に自動アップロード・サーバーマージ。機種変更引き継ぎ可だが実装コスト高。フェーズ1には含めない
- 案B: ログインは識別子取得のみ、マイコース等は端末データのまま。実装コスト最小だが機種変更時引き継ぎ不可
- 案C（推奨）: フェーズ1は案B、フェーズ2以降でサブスク加入者限定にコース/プロフィールのみ選択的に案Aへ拡張

### 6-4. 既存`authorId`との統合（1-2節の実コード確認結果を反映）
ログイン中ユーザーのコース公開時、サーバー側でJWTから復元した`userId`で`authorId`を上書き（自己申告値を信用しない）。`DELETE /api/courses/:id`・`POST /api/courses/:id/unpublish`に、ログイン中ユーザーの`userId`と対象コースの`authorId`一致チェックを追加する。
- **重要な限定**: 1-2節で確認した通り、現状これらのエンドポイントは認証ヘッダーの概念自体を持たない。フェーズ1導入後も**未ログインで投稿されたコース**（`authorId: 'anonymous'`または自己申告の`user_XXXXXXXX`のまま）に対しては、所有権を検証しようがないため対策効果が及ばない。真の対策効果を得るには「コース公開はログイン必須」という運用変更が必要になるが、これは4節スコープ外の「ログインしなくても引き続き匿名で基本機能を使い続けられてほしい」というユーザーストーリーと衝突するため、フェーズ1では**ログイン済みユーザーの投稿のみ保護**という限定的な効果にとどまる。この限定を受け入れるか、フェーズ1の範囲を「コース公開のみログイン必須化」に広げるかは意思決定事項（12節に追加）。

### 6-5. サブスクリプション管理（両チャネル対応、2026-07-11版から変更なし）

前提: ユーザー決定により、**iOSアプリ内課金はStoreKit、Web版はStripeを両方実装する**（8節参照）。

#### 6-5-1. `data/users.json` の `subscriptions` フィールド拡張案
```json
{
  "userId": "usr_XXXXXXXXXX",
  "provider": "apple",
  "providerSub": "001234.abcdef...",
  "subscriptions": [
    {
      "source": "app_store",
      "active": true,
      "plan": "premium_monthly",
      "originalTransactionId": "2000000123456789",
      "latestTransactionId": "2000000123456999",
      "productId": "app.dosuru.premium.monthly",
      "expiresAt": "2026-08-11T00:00:00Z",
      "autoRenewing": true,
      "status": "active",
      "environment": "Production",
      "createdAt": "...", "updatedAt": "..."
    },
    {
      "source": "stripe",
      "active": false,
      "plan": "premium_monthly",
      "stripeCustomerId": "cus_XXXX",
      "stripeSubscriptionId": "sub_XXXX",
      "stripePriceId": "price_XXXX",
      "expiresAt": "2026-06-01T00:00:00Z",
      "status": "canceled",
      "createdAt": "...", "updatedAt": "..."
    }
  ]
}
```
`subscriptions`（配列）とする理由: Appleガイドライン3.1.3(b)により両チャネル提供が必須のため、同一ユーザーが両方契約しうる。`source`ごとに最新1件のみ保持。

#### 6-5-2. 統一判定ロジック `isSubscriptionActive(user)`
```javascript
function isSubscriptionActive(user) {
  const subs = user.subscriptions || [];
  return subs.some(s => s.active && (!s.expiresAt || new Date(s.expiresAt) > new Date()));
}
function getActiveSubscriptionSources(user) {
  const now = new Date();
  return (user.subscriptions || []).filter(s => s.active && (!s.expiresAt || new Date(s.expiresAt) > now)).map(s => s.source);
}
```
プレミアム判定を行う全APIはこの共通関数のみを参照する（StoreKit/Stripeの生データを個別実装で分散させない）。

#### 6-5-3. 二重課金（両チャネル同時active）の検出・扱い方針
- 検出: `getActiveSubscriptionSources(user).length >= 2`
- 推奨: フェーズ3時点では「検知時にフラグ記録＋次回ログイン時にユーザーへ通知、手動解約を促す」案を採用、発生頻度を見て自動化を検討
- 未解決: 異なる`plan`を両チャネルで契約した場合の表示優先順位は未定義（12節）

## 7. APIの変更（新規追加のみ、既存構造は無変更）
- `POST /api/auth/apple` / `POST /api/auth/google`: トークン検証・upsert・JWT発行
- `GET /api/auth/me`: JWT検証しユーザー情報返却
- `POST /api/auth/logout`: 型だけ用意（JWT方式のためサーバー側状態変更は基本不要）
- `POST /api/courses/publish`: `Authorization`ヘッダーがあればサーバー検証済み`userId`で上書き、なければ従来通り（完全後方互換）
- `DELETE /api/courses/:id` / `POST /api/courses/:id/unpublish`: `Authorization`ヘッダーがある場合のみ所有権チェックを追加。ヘッダーがない場合（未ログイン・旧バージョンApp）は**現状の挙動を完全に維持**（無検証のまま削除可能）。これにより後方互換性を100%保ちつつ、ログイン済みユーザーの投稿のみ段階的に保護する

### 7-1. 後方互換性・影響範囲（プロジェクトCLAUDE.md必須確認事項）
- **後方互換性**: 新規APIはすべて追加のみ。既存エンドポイントのレスポンス構造・リクエスト仕様は一切変更しない。旧バージョンApp Store版アプリは`Authorization`ヘッダーを送らないため、サーバー側は「ヘッダーなし＝従来の匿名フロー」として今まで通り処理する。旧バージョンユーザーが本機能により壊れることはない設計。
- **影響範囲**: `data/users.json`・`/api/auth/*`はiOSアプリ限定機能（4節スコープ外によりWeb版UIは対象外）。ただしAPIエンドポイント自体はサーバー上で1つのため、Web版から`POST /api/auth/apple`等を直接叩くことは技術的には可能（UIを出さないだけ）。コース関連の既存API（`GET /api/courses`等）のレスポンス構造は無変更のため、Web版・iOS両方に影響なし。
- **リリースタイミング**: フェーズ1（認証基盤）はApp Store版の新バージョンリリースと同時に段階導入する。ヘッダーなしリクエストの互換性を保つ設計のため、サーバー側APIの先行デプロイ自体は安全（新エンドポイントの存在だけでは何も壊れない）。ただし`DELETE /api/courses/:id`等への所有権チェック追加は、ログイン機能を持たない現行App Store版ユーザーの挙動（誰でも削除できる）を変えないため、単独でサーバー先行デプロイしても支障はない。

## 8. サブスク・決済アーキテクチャ（決定事項、2026-07-11版から変更なし）

### 8-0. 決定事項
StoreKit（iOSアプリ内課金）とStripe（Web版課金）を両方実装する。Appleガイドライン3.1.3(b) "Multiplatform Services"に正面から準拠するため。

### 8-1. StoreKit側の実装要件
- App Store Connect: Subscription Group「おでかけNaviプレミアム」、Product ID `app.dosuru.premium.monthly`等（価格・トライアル有無はビジネス判断待ち）
- レシート検証方式: 「App Store Server API」（初回検証）＋「App Store Server Notifications V2」（更新・解約・返金等の非同期Webhook）
- **Apple Developer Portal側の準備**: In-App Purchase capability追加、App Store Server API用キー（`.p8`）生成。**1-1節で確認した通り、既存のAPNs対応（Push Notifications capability）が同一Portal・同一App IDで審査待ちブロックされている実例があるため、In-App Purchase capabilityも同様にフェーズ0（Apple法人審査）完了待ちになる可能性が高い**
- Capacitorプラグイン候補: `@capacitor-community/in-app-purchases`等。Capacitor 6対応・メンテ状況は要実装時調査

### 8-2. Stripe側の実装要件
- 既存コード改修方針: `premiumSessions`（インメモリMap）を廃止し`data/users.json`の`subscriptions`（`source:'stripe'`）へ置き換え。`withFileLock`パターン踏襲。1-3節で確認した通り、Webhook処理パターン自体は流用可能だが状態管理部分の作り直しが必須
- Web版のユーザー識別手段: 案W1（推奨）は、Web版はログインUIを作らず、Stripe Checkout時のメールアドレスを識別子に（`provider:'email'`, `providerSub:<email>`として`data/users.json`に許容）

## 9. iOS/CI側の変更見込み（1-4節の実コード確認を反映して更新）
- `ios-app/package.json`: Apple Sign-In・Google Sign-In系プラグイン追加
- ルート`package.json`: `jsonwebtoken`パッケージ追加（現状未導入と確認済み）
- **Sign in with Apple capability**: 既存entitlements動的生成パターン（APNs対応時実装、`.github/workflows/ios-deploy.yml`に現存するが現在コメントアウト中）を参考に`com.apple.developer.applesignin`キー追加。**フェーズ0（Apple法人審査）完了待ちの可能性が高い**（1-1節で裏付け）
- **手動証明書配布方式であることの追加影響（今回新たに確認した事実）**: `fastlane match`不使用のため、capability追加に伴うProvisioning Profile再生成は、Apple Developer Portalへの手動アクセス＋`PROVISION_PROFILE_BASE64` Secretの手動更新が必要。これもフェーズ0完了が前提
- **Google Sign-In用URL Scheme**: `Info.plist`への`CFBundleURLTypes`追加が新規に必要。Google Cloud ConsoleでのiOS用OAuthクライアントID発行も別途必要。**Apple Developer Portalとは無関係のため、フェーズ0の影響を受けない**
- GitHub Secrets追加候補: `JWT_SECRET`、Google OAuth関連
- 既存のCI署名方式（手動証明書配布、`fastlane match`不使用）への影響は見込みなし。ただし証明書更新オペレーション自体が手作業である点は、capability追加のたびに手間とヒューマンエラーリスクを伴う

## 10. 段階的実装フェーズ分け（重要な見直し：フェーズ1の位置づけを修正）

### 10-1. 見直しのポイント
2026-07-11版設計書は「フェーズ0＝StoreKit/Sign in with Apple双方のブロッカー」としつつも、「フェーズ1（認証基盤のみ、サブスクなし）は低リスクで着手できる」という含意があった（要約に「フェーズ1=認証基盤のみ（サブスクなし）→フェーズ2〜」という記載があり、フェーズ0との依存関係が要約からは曖昧だった）。しかし1-1節・1-4節の実コード確認により、**Sign in with Apple自体がApple Developer Portal側のcapability有効化を必要とし、既存のPush Notifications capabilityと同じ理由（法人審査待ち）でブロックされる可能性が高いことが、CI設定の実例で裏付けられた**。したがって、**フェーズ1（認証基盤のみ）のうち「Sign in with Apple」部分は、フェーズ0完了が事実上の前提条件になる**。

### 10-2. 更新後のフェーズ分け
- **フェーズ0（最優先ブロッカー、既存のAPNs対応と共通）**: Apple Developerアカウントの個人→法人切替審査完了待ち。2026-07-12時点で未解消（`.github/workflows/ios-deploy.yml`のコメントアウトで裏付け済み）
- **フェーズ1a: Google Sign-Inのみ先行実装**（新設・今回追加した選択肢）: Apple法人審査と無関係に着手可能。JWT検証・`data/users.json`基盤・コース`authorId`真正性確保（Googleログイン済みユーザーのみ）を、Sign in with Apple抜きで先行実装する。**ただしAppleガイドライン4.8（サードパーティログイン提供時はApple IDログインも同等提供必須）に抵触するリスクがあるため、この状態のままApp Store審査に提出することはできない**。TestFlight内部テストの範囲に限定するか、審査提出直前にフェーズ1bを合流させる前提での先行着手にとどまる
- **フェーズ1b: Sign in with Apple実装**（依存: フェーズ0完了）: フェーズ0解消後、フェーズ1aと合流させて両方揃った状態で初めて審査提出可能になる
- **フェーズ2: エンタイトルメント管理**: `subscriptions`配列（6-5節）でのプレミアム判定整備、`isSubscriptionActive(user)`共通ロジック実装
- **フェーズ3a: Stripe/Web版 先行**（フェーズ0に依存せず着手・検証可能）
- **フェーズ3b: StoreKit/iOS版**（依存: フェーズ0完了＋In-App Purchase capability準備）
- 両者共通: フェーズ3b完了後（両チャネル揃った時点）に6-5-3節の二重課金検出ロジックを有効化
- **フェーズ3a単独稼働期間（Web版のみ課金可能）中は、3.1.3(b)抵触を避けるためWeb版の課金導線をiOSアプリ内に一切露出させないこと**

### 10-3. 実質的な結論
「フェーズ1＝低リスクでサブスクと無関係に即着手できる」という当初の前提は**部分的に崩れる**。Google Sign-Inのみなら無関係に着手できるが、Sign in with Appleを含む「認証基盤フェーズ1」全体としては、Apple審査提出可能な完成形にするためにフェーズ0の完了を待つ必要がある。純粋な「着手」（コーディング開始）自体はGoogle Sign-In部分・サーバー側JWT基盤・`data/users.json`実装・不正投稿対策ロジックの範囲であれば今すぐ始められるが、**「アプリとしてリリースできる状態」に持っていくにはフェーズ0が事実上のブロッカーであり続ける**点を明確にしておく必要がある。

## 11. フロントエンドの変更（フェーズ1範囲、見込み、2026-07-11版から変更なし）
- 設定画面に「ログイン」セクション新設（Apple/Googleボタン、ログイン後はユーザー名・ログアウト表示）
- `_isCapacitorApp`判定でCapacitor環境限定表示（Web版には出さない）
- i18n必須ルールに従いja/en同時追加
- 認証状態保持の共通変数・`authedFetch`ヘルパー新設

## 12. リスク・未解決の質問

1. **Apple法人審査完了タイミングへの依存（最重要、10節で再確認）**: フェーズ1b（Sign in with Apple）・フェーズ3b（StoreKit）双方の着手完了がこれに依存する。フェーズ1a（Google Sign-Inのみ）は先行着手可能だが、Appleガイドライン4.8により単独リリースは不可
2. **フェーズ1aを「先行着手はするがリリースはしない」形にした場合の開発運用リスク**: 未リリースのコードをどれだけの期間メンテナンスし続けるか、フェーズ0解消までの期間が長期化した場合の技術的負債化リスク
3. 既存匿名ユーザーのデータ扱い（6-3節、機種変更時データ消失の許容度は要議論）
4. Google Sign-InのiOS向けOAuthクライアントID発行作業（担当・アカウント用意状況は不明）
5. 同一人物が複数ログイン方法を使った場合、別アカウント扱いになる点（サブスク管理上の懸念）
6. 2台目端末からの再ログイン時、フェーズ1では各端末のlocalStorageデータは同期されない体験になる（UI文言の検討要）
7. JWTの有効期限・リフレッシュ方式は未確定
8. **不正投稿対策の実効性の限界**: 6-4節で確認した通り、未ログインユーザーの投稿には対策が及ばない。「コース公開はログイン必須」への運用変更を検討するか、限定的効果を受け入れるかは意思決定が必要
9. `data/users.json`の個人情報保護対応（バックアップ運用・アクセス制限の要否）
10. 二重課金・二重解約のエッジケース: `isSubscriptionActive`は残るチャネルを正しく判定できるが、ユーザーが二重契約に気づかず無駄払いを続けるケースの検知・通知フローは案のみ
11. チャネル間のポリシー差異によるUX不整合（StoreKit＝Apple主体の返金、Stripe＝運営側で任意返金可）
12. App Store Server API利用のApple Developer Portal追加設定も法人審査待ちの影響を受ける可能性
13. `appAccountToken`とuserIdの紐付け設計の詳細化が必要（Capacitorプラグインの対応状況は要実装時確認）
14. Web版のセッション/状態確認方式が未確定（案W1採用時の再訪問時の購読状態確認方法）
15. **手動証明書配布方式（`fastlane match`不使用）であることの運用負荷**: Sign in with Apple・In-App Purchase capability追加のたびにProvisioning Profileの手動再生成・GitHub Secrets手動更新が発生する。フェーズ0解消後の作業リストに正式に組み込む必要がある

## 13. 変更するファイル一覧（フェーズ1a: Google Sign-Inのみ先行着手する場合の想定）
- `package.json`（ルート）: `jsonwebtoken`追加
- `server.js`: `/api/auth/google`、`GET /api/auth/me`、`data/users.json`読み書き（`withFileLock`パターン）、`/api/courses/publish`・`DELETE /api/courses/:id`・`POST /api/courses/:id/unpublish`への任意Authorizationヘッダー対応（後方互換）
- `data/users.json`（新規、gitignore対象にするか要検討。個人情報を含むため）
- `ios-app/package.json`: Google Sign-In系Capacitorプラグイン追加
- `public/app.js`・`public/index.html`: 設定画面ログインUI、i18n文言追加（`_isCapacitorApp`限定表示）
- CLAUDE.md: 新機能の記録、フェーズ状況の追記

## 承認状況
2026-07-12 planner再調査・設計完了。**実装は未着手**。ユーザーのレビュー・意思決定待ち（10節フェーズ分け・フェーズ1a先行着手の是非、6-4節の運用変更要否、8節アーキテクチャ選択等）。

---

# 設計書21 — イベント画面カテゴリタブ切り替え時のInstagram埋め込み再読み込み防止

（2026-07-12 planner設計。コード変更なし、設計のみ）

## 背景・症状
イベント画面（`#screen-home`）でカテゴリタブ（すべて/イベント/展示・公演/グルメ・フェア等）を切り替えるたびに、カード内のInstagram埋め込み（oEmbed、`<blockquote class="instagram-media">` → `embed.js`が非同期で`<iframe>`に変換）が毎回イチから再読み込みされて見える。サーバーへの再フェッチは発生していない（`EVENT_DATA`はクライアント側配列にロード済みで、以降は純粋なクライアントサイドフィルタリング）。

## 原因（コード読解により確認済み）
- `public/app.js` `toggleCatFilter(val)`（1248行目）: `filterCats`更新 → `window.scrollTo(...)` → `renderEventCards()`。サーバー再フェッチなし
- `renderEventCards()`（1402行目）: フィルタ・ソート後、`grid.innerHTML = filtered.map((e,i) => renderEventCard(e,i)).join('')`（1474行目）で**`#cards-grid`配下のDOMを毎回丸ごと文字列から再構築**。末尾で`loadInstagramEmbeds()`（1478行目）→`window.instgrm.Embeds.process()`を呼ぶ
- `renderEventCard(e,i)`（1044行目）: `e.url`がInstagram投稿URLの場合（`igSc`）、生の`<blockquote class="instagram-media" data-instgrm-permalink="...">`を毎回新規に文字列生成する（1164〜1168行目）
- `innerHTML`への再代入は、既存の子孫ノード（Instagram処理済みの`<iframe>`を含む）を完全に破棄し、新しいノードを生成する。ブラウザの標準仕様上、この新しい`<blockquote>`は「未処理の生マークアップ」でしかないため、`Embeds.process()`は毎回ゼロから oEmbed 取得→`<iframe>`生成をやり直す。これが「タブ切り替えのたびに再読み込みされる」ように見える直接原因

## `renderEventCards()`呼び出し元の全体像（案の影響範囲確認のため事前調査）
`renderEventCards()`はカテゴリタブ以外からも広範囲に呼ばれている（1248/1270/1230/1381/814/1018/1482/2140/2588行目）: 初回ロード、ピン留めフィルター（📌/⏰/🔔アイコン）、フィルターシート（いつ行く？/誰と/エリア/キーワード確定時）、ジャンル設定変更、言語切替、PTR再取得後、等。**今回の対策はこれら全ての呼び出し元で同一の`renderEventCards()`を通るため、「カテゴリタブ切り替え時だけ」に限定した特別分岐を作るのではなく、`renderEventCards()`自体を「差分に強い」実装に変える方針が自然**（呼び出し元ごとの分岐は複雑化・保守性低下を招くため採用しない）。

## 検討した案と技術的判断

### 案A（推奨）: イベントIDごとにレンダリング済みDOM要素をキャッシュし、差分更新する
`renderEventCards()`内で、`grid.innerHTML`への一括再代入をやめ、以下のロジックに変更する。

1. `id → HTMLElement(.spot-card)`のMapをモジュールスコープで保持する（例: `_cardElCache`）
2. フィルタ後の`filtered`配列を確定した後、各イベントについて「既にキャッシュにDOM要素があるか」を判定する
3. **既存要素がある場合**: 新しい`<blockquote>`文字列を生成せず、既存のDOM要素（Instagram側で`<iframe>`化済みの場合はそれを含む）をそのまま使う。ただし、その要素内で「フィルタと無関係に変化しうる状態」（ピン留め状態のラベル・アイコン、tips展開/折りたたみ状態、言語切替による文言）は`updatePinButtons()`と同様の「既存要素を書き換える」個別更新で追従させる必要がある
4. **新規要素の場合**: 従来通り`renderEventCard(e,i)`で新規生成する
5. 最終的に、`filtered`の順序通りに要素を並べ直す。**DOMノードを`appendChild`で「同一document内の別位置」へ移動させることは、ブラウザの標準仕様上ノードの再生成・iframeの再読み込みを引き起こさない**（`Node.appendChild`が既存ノードを移動対象とした場合、内部的にはremove+insertだが、documentツリーに留まる限り`<iframe>`のブラウジングコンテキストは維持される、というのが一般的なブラウザ挙動）。これにより「並べ替えのみ」ならiframeは維持されたまま再配置できる
6. フィルタで除外され表示不要になった要素は、破棄せず`display:none`にしてキャッシュに残す（再度該当カテゴリに戻った際に再利用するため）か、あるいはDOMから外して保持する（`display:none`のほうがシンプルで、後述の「新着リボンのCSSアニメーションが要素を毎回作り直すたびに再生される」問題も同時に回避しやすい）
7. `newRibbon`のCSSアニメーション（`fadeUp`、`i * 0.06s`のdelay）は「新規に生成されたカードのみ」に適用し、再利用された既存カードには適用しない（挙動としても、既に見たことのあるカードが毎回浮き上がるように再アニメーションするのはUXとして望ましくない）

**技術的裏付け**: これは「ブラウザがiframeを再読み込みするかどうか」の一般的な条件（documentから完全に切り離される／`src`が変更される／親を`innerHTML`で書き換えられて新規ノードとして再生成される、のいずれかに該当するとiframeは再読み込みされる）を踏まえ、**ノードを保持したまま同一document内で移動・表示切替するだけなら再読み込みは発生しない**、という標準挙動に依拠した確実な解決策である。

### 案B: 処理済みHTML（iframe化後の状態）をキャッシュし、次回は生blockquoteの代わりに挿入する
検討したが**不採用**。理由: `innerHTML`経由で`<iframe>`を含むHTML文字列を挿入した場合、ブラウザは常にこれを「新規ノード」として扱い、`<iframe>`の`src`への実際のナビゲーション（読み込み）を行う。これは案Aの「ノードそのものを移動する」場合とは根本的に異なり、**キャッシュしているように見えても実際には毎回ブラウザがiframeを再読み込みしてしまう**。ユーザー体感としては現状と変わらない見せかけの解決になるため、この案は技術的に目的を達成できないと判断した。

### 案C: 他の代替案（不採用・参考として記載）
- **Cー1（IntersectionObserverによる遅延処理）**: 画面内に入ったカードのみ`Embeds.process()`対象にする案。再読み込み自体の防止にはならず（依然としてinnerHTML再構築のたびに生blockquoteに戻ってしまう）、根本原因を解消しないため不採用
- **Cー2（`filtered`配列が前回と同じ内容なら`renderEventCards()`を早期returnする）**: カテゴリ切り替えは基本的に表示内容が変わる操作のため、この最適化は効果範囲が限定的（同じタブを連打した場合のみ有効）。案Aと排他ではないが、今回のスコープの主要課題は解決しないため、案Aへの軽微な追加最適化候補として位置づけるに留め、今回のメインの修正案としては採用しない

## 推奨案
**案A**（DOM要素キャッシュ＋差分更新）を推奨する。案Bはブラウザの標準挙動上、目的（再読み込みなしの実現）を達成できないため技術的に不採用。

## 既存ロジックへの影響（`renderEventCards()`内の各要素）
- **ソート（`CATEGORY_ORDER`＋`fetched_at`降順）**: 影響なし。ソート結果の順序通りにDOM要素を並べ替える処理（既存要素の移動 or 新規要素の挿入）に置き換えるのみで、ソートロジック自体（`filtered.sort(...)`）は変更しない
- **新着リボンのCSSアニメーション（`i*0.06s`のdelay、`.spot-card`の`fadeUp`）**: 挙動を変更する必要がある。現状は`renderEventCard`内のインラインstyle`animation-delay:${i*0.06}s`で全カード共通の実装だが、差分更新後は「新規追加されたカードだけ」にアニメーションを適用し、「既に存在し再利用されたカードは即座に表示（アニメーションなし）」に変える設計とする。**この点は見た目の変更を伴うため、受け入れ基準・リスクとして明記する**（後述）
- **`resultCount`表示・`emptyState`表示切替**: 影響なし。`filtered.length`に基づく処理のため、DOM構築方式を変えても計算ロジックはそのまま流用できる
- **`updatePinButtons()`呼び出し**: 影響なし。既存の`querySelectorAll('.spot-card')`ベースでDOM属性を書き換える実装のため、差分更新後もそのまま動作する（実装上、再利用された既存カードのピン状態表示もこの関数が正しく同期する前提を活かせる）
- **`toggleCardTips(id)`（tips展開状態）**: 案Aで要素を使い回す場合、既存カードで開いていたtipsの展開状態がそのまま維持される可能性がある。これは現状（`innerHTML`再構築のたびに必ず閉じた状態にリセットされる）とは異なる挙動変化になるため、**「同じ状態を維持する」か「従来通り閉じた状態にリセットする」かの仕様判断が必要**（未確定、下記「未解決の質問」参照）
- **言語切替（`getLang()`依存の文言）**: 既存カードを再利用する場合、`displayContent`・`whoLabels`等の言語依存文言が古い言語のまま残ってしまうリスクがある。キャッシュキーに現在の言語設定を含める（言語が変わったらキャッシュを破棄して作り直す）等の対応が必要

## 変更するファイル一覧（想定）
- `public/app.js`
  - `renderEventCards()`: `grid.innerHTML`一括再代入をやめ、キャッシュMapを参照した差分更新ロジックに変更
  - `renderEventCard(e, i)`: 戻り値の扱いを見直す可能性あり（文字列生成のままか、DOM要素生成に変えるかは実装フェーズで判断。文字列のままでも「一時コンテナに`innerHTML`で流し込んでから該当ノードだけ取り出す」実装は可能）
  - 新規ヘルパー（例: `_getOrCreateCardEl(e, i, isNew)`、キャッシュMap `_cardElCache`の管理）の追加
- `public/index.html`（`app.js`のキャッシュバスティング用クエリパラメータ更新。CLAUDE.md記載の手順に従う）
- `public/sw.js`（`CACHE_NAME`のバージョン番号更新。上記とセットで必須）

## データモデルの変更
なし。`EVENT_DATA`のデータ構造・API（`/api/events`）は変更しない。

## APIの変更
なし。今回の対応はクライアント側（`public/app.js`）のみの変更であり、`/api/*`エンドポイントのレスポンス構造・振る舞いには一切変更を加えない。

### ⚠️ Web版・App Store版へのデータ共有影響（CLAUDE.md必須確認事項）
1. **後方互換性**: 影響なし。APIレスポンス構造・データファイル（`data/sg/events.json`等）を一切変更しないため、旧バージョンのApp Storeアプリが壊れる可能性はない
2. **影響範囲**: `public/app.js`はCapacitorが`public/`をローカルバンドルする対象のため、この変更は**Web版とiOS App Store版の両方に同時に反映される**（Web版はpm2 restart後即時、iOS版は次回のTestFlight/App Storeビルドで反映）。サーバーサイド（`server.js`・データファイル）は無変更のため、iOS版アプリのバイナリ更新をしなくても既存App Storeユーザーには一切影響しない（クライアント側の見た目・挙動の改善のみで、ビルドを配信するまでは旧UIのまま動き続ける）
3. **リリースタイミング**: サーバー側変更を伴わないため、API変更とアプリリリースの同時実施を考慮する必要はない。Web版に先行反映し、動作確認後にiOS版へ`release`ブランチ経由で反映する、という通常のフロー（他の設計書と同様）で問題ない

## フロントエンドの変更
- `renderEventCards()`のDOM構築方式を「innerHTML一括再代入」から「イベントIDベースのDOM要素キャッシュ＋差分更新（既存要素の再利用・並べ替え、新規要素のみ生成）」に変更する
- 新着リボンのCSSアニメーション適用対象を「新規追加要素のみ」に限定する（案の詳細は実装フェーズで確定）
- 影響範囲はイベント画面（`#screen-home`の`#cards-grid`）のみ。コース画面・予定表・設定画面には影響しない

## 受け入れ基準

### 正常系
1. カテゴリタブ（すべて/イベント/展示・公演/グルメ・フェア/プロモ・お得/新規オープン/おすすめ）を切り替えた際、**既に画面表示され`<iframe>`化済みのInstagram埋め込みカードが、再度「読み込み中」の状態に戻らない**こと（ブラウザのネットワークタブでも、同一投稿への再リクエストが発生しないことを確認できるとより確実）
2. タブ切り替え後、画面が自動的に一番上へスクロールされる既存の挙動（`window.scrollTo({top:0, behavior:'instant'})`）が維持されていること
3. タブ切り替え後、表示される件数（`resultCount`）・並び順（新着降順・カテゴリ順の複合ソート）が従来と変わらないこと
4. 一度も表示していない新規カテゴリ（初回タブ切り替え時など未生成のイベント）は、従来通り正しく描画され、Instagram埋め込みも正常に`<iframe>`化されること
5. ピン留めフィルター（📌）、終了間近フィルター（⏰）、新着フィルター（🔔）、絞り込みシート（いつ行く？/誰と/エリア/キーワード）、おすすめモードなど、**カテゴリタブ以外のフィルター機能の挙動・見た目に変化がない**こと（今回のスコープ外機能への影響なし）
6. ピン留めボタンの押下によるON/OFF表示切替が、DOM再利用後も正しく反映され続けること（`updatePinButtons()`の動作継続確認）

### 失敗系
7. イベントデータそのものが更新された場合（サーバー再フェッチ、日次バッチによる`EVENT_DATA`の中身変更等）、古いキャッシュ済みDOM要素を使い回してしまい、内容が更新されないという事故が起きないこと（キャッシュの無効化条件を明確に設計する）
8. 言語切替（ja/en）を行った場合、キャッシュされた旧言語のカード内容が残らず、正しく現在の言語のテキストに更新されること

### エッジケース
9. 該当カテゴリの結果が0件になった場合、`emptyState`が正しく表示され、かつ非表示になった既存カード要素がユーザーに見えたまま残らないこと
10. 同じカテゴリタブを連続で複数回タップした場合に、重複した要素や表示崩れが発生しないこと
11. tips（豆知識）を展開した状態でタブを切り替えて戻ってきた場合の挙動が、意図した仕様（維持する/リセットする、いずれか未確定・要合意）通りであること

## スコープ外（作らないもの）
- カテゴリタブ以外のフィルター条件（いつ行く？/誰と/エリア/キーワード/ピン留めのみ表示/おすすめモード等）のDOM再利用最適化は今回のスコープに含めない。ただし、これらも同じ`renderEventCards()`を通るため、実装上は自然に同じ差分更新の恩恵を受ける可能性が高い（副次効果としては歓迎するが、この設計の主目的・検証対象ではない）
- コース画面・予定表画面など、イベント画面以外の画面のカード再描画ロジックの変更は行わない
- Instagram embed.js自体の読み込み方式（`<script async>`）や、サーバーサイドでのoEmbedプロキシ化・キャッシュ化などのサーバー側対策は行わない（今回はクライアント側DOM差分更新のみで完結させる）
- 通常の画像カード（Instagram以外のイベント）についてもキャッシュの恩恵を受ける設計になるが、画像カード自体には再読み込みで視認できるほどの重い処理がないため、対応の主眼はInstagram埋め込みカードに置く

## リスク・未解決の質問
1. ~~未解決の質問: tips展開状態~~ → **解決済み（2026-07-12ユーザー回答）**: 従来通り閉じた状態にリセットする。展開状態を維持する実装は不要
2. **リスク**: 差分更新ロジックの実装が複雑になり、キャッシュの無効化条件（言語切替、イベントデータ更新、ピン状態変化以外の属性変化等）を網羅的に扱いきれないと、「更新されるべき箇所が更新されない」という新たなバグを生むリスクがある。実装時はキャッシュキーの設計（`e.id`のみで十分か、`e.id + 言語`等の複合キーにすべきか）を慎重に検討する必要がある
3. ~~リスク: 新着リボンのアニメーション演出変化~~ → **解決済み（2026-07-12ユーザー回答）**: 「新規要素のみアニメーション」の仕様変更は問題ないと確認済み
4. **未解決の質問**: `.cards-grid`は`flex-direction:column`の縦積みリスト（CSS Gridではない）であるため、DOM要素の並べ替えは「正しい順序でのノード再配置（`insertBefore`/`appendChild`を使った並べ替え）」で対応可能と考えられるが、大量のカード（数十件規模）がある場合の並べ替えコストが許容範囲か、実装時に軽量な確認が必要
5. **リスク（低）**: `renderEventCard(e,i)`は現状「HTML文字列を返す関数」であり、DOM要素を直接返す関数ではない。差分更新方式に変えるには「一時コンテナへ`innerHTML`で流し込んでから該当ノードを取り出す」等の変換ステップが必要になり、既存のテストされていない文字列生成ロジック（サニタイズ処理の`safeTitle`等含む）に手を入れずに済むよう、実装時に影響範囲を最小化する設計判断が必要
6. **確認事項**: Instagram `embed.js`の`window.instgrm.Embeds.process()`は、通常「未処理のblockquoteのみ」を対象に処理する想定だが、これは公式ドキュメントで明示的に保証された挙動ではなく、Instagram側の内部実装に依存する。案Aで「既にiframe化済みの要素を含むDOM」に対して`process()`を呼び直しても、処理済み要素に対して誤って再処理しないことを実装後に目視・ネットワークタブで確認する必要がある

## 承認状況
承認済み（2026-07-12）。tips展開状態はリセット、アニメーション演出変化は許容。実装（orchestrator）待ち。

---

# 設計書22 — 共有カレンダー: 予定追加直後のforce quit→再起動でデータが消える重大バグの修正

## 背景・症状
共有カレンダーグループに参加中のユーザーが「予定を追加」して保存した直後にアプリをforce quit → 再起動すると、追加したはずの予定が消える。

## 原因の特定(実コード確認済み)

### 保存経路(`public/app.js`)
- `saveCustomPlans(arr)`(3835行目付近)は`localStorage.setItem()`で即座にローカル保存した後、`getSharedGroupId()`が真かつ`_calSyncFromServer`でなければ`syncToServer()`を**awaitせず**fire-and-forgetで呼ぶ。
- `saveCustomPlan()`(4245行目付近、予定作成モーダルの保存ボタンハンドラ)は`saveCustomPlans(plans)` → `_notifyGroupIfChecked(...)` → `closePlanModal()` → `showToast(...)` を同期的に連続実行する。`syncToServer()`のPromiseは待たれないため、**PUTがサーバーに到達する前にモーダルが閉じ「保存完了」のトーストが表示される**。
- `syncToServer()`(5442行目付近)は`fetch(... , {method:'PUT', ...})`を`try/catch`で包むだけで、タイムアウト・リトライ・失敗通知は一切ない。失敗しても呼び出し元は結果を知る手段がない。

### 上書き経路(`public/app.js`)
- `switchNav('plan')`(2700〜2703行目付近)は予定表タブを開くたびに、`getSharedGroupId()`があれば無条件で`fetchFromServer()`を呼ぶ。
- `fetchFromServer()`(5462行目付近)はサーバーから取得したデータで`saveCustomPlans(customPlans)`/`saveEventPlans(eventPlans)`を呼び、**ローカルの`custom_plans`/`{city}_event_plans`を差分マージではなく丸ごと置換する**。
- 同じ全置換パターンは`doRefreshCalSync()`(手動更新ボタン、5590行目付近)・`doLeaveGroup()`(離脱時、5597行目付近)にもある。

### サーバー側(`server.js`)
- `PUT /api/calendar/:groupId`(1498〜1517行目): リクエストボディの`customPlans`/`eventPlans`(または`encryptedData`)で**既存データを無条件に完全上書き**する。`lastSyncAt`はサーバー側でタイムスタンプ更新されるが、**クライアント側では一切参照されていない**(`grep`で`lastSyncAt`の読み取り箇所なしを確認済み)。楽観的ロック・バージョニング・最終更新者記録は無い。
- `GET /api/calendar/:groupId`(1491〜1496行目): ファイルの中身をそのまま返すのみ。
- 既存の`doJoinGroup()`(グループ参加時、5765行目付近)には**IDベースの和集合マージ**(`mergeArr(a,b)`: `id`をキーにしたオブジェクトで後勝ち統合)が既に実装されている。日常的な同期(`syncToServer`/`fetchFromServer`)には使われておらず、参加時のみの特別処理になっている。

### 確定した再現シナリオ
1. 共有カレンダー参加中のユーザーが予定を追加→保存。ローカル保存は即座に完了、PUTはバックグラウンドで進行中(未完了)。
2. PUT完了前にユーザーがforce quit。ネットワーク上でリクエストが中断され、サーバー側には反映されない。
3. 再起動→予定表タブを開く→`fetchFromServer()`がサーバー側の古いデータ(追加前の状態)を取得→`saveCustomPlans()`で丸ごと上書きされ、追加した予定がローカルからも消える。

## 修正方針

### 検討した案
- **案A(保存の完了を待つ)**: `syncToServer()`をawaitし、同期完了(またはタイムアウト)を待ってから`closePlanModal()`する。
- **案B(上書きをマージに変更)**: `fetchFromServer()`の全置換を、`doJoinGroup()`に既にある`mergeArr`方式(IDベースの和集合マージ)に置き換える。
- **案C(応急処置、案Aと併用)**: 直近の`syncToServer()`完了を待ってから`switchNav('plan')`時の自動`fetchFromServer()`を実行するガード。

### 推奨: 案A + 案B の併用(両方を採用)

**理由**: 案A単体では「PUTが成功してからモーダルを閉じる」ことは保証できても、以下のケースで依然データ消失リスクが残る。
- 案Aのタイムアウトに引っかかりPUTが実際には後から成功した場合(ユーザーはローカル保存のまま先に進んでしまい、その間に別デバイスの`fetchFromServer()`が古いデータで上書きしてしまう)
- 複数デバイス・複数ユーザーが同時に別々の予定を追加した場合、PUTが確実に届いたとしても後発のPUTが先発の内容を丸ごと上書きしてしまう「Last Write Wins」構造そのものはAだけでは直らない(force quitシナリオに限らない、より一般的な競合バグ)

逆に案B単体では、「PUTが送信中に中断される」問題自体は直らない(マージ元データがサーバーに届いていなければマージしようがない)。

**両方を組み合わせることで**:
- 案A: 少なくとも「保存操作が完了状態としてユーザーに見える前に、サーバーへの反映を試みきる」ことを保証し、force quitのタイミングを「PUT送信中」の窓から極力狭める
- 案B: 万一それでも送信できなかった場合(オフライン・タイムアウト等)でも、次回の同期時に**ローカルの未送信分が上書きで消えることを防ぐ**(`fetchFromServer`をマージ方式にすることで、ローカルにしか無いid・サーバーにしか無いidの両方を保持する和集合になる)

案Cは案Aと同じ「完了待ち」を別の場所に重複実装するだけで、案Aがあれば構造的に不要(`switchNav('plan')`の`fetchFromServer()`が呼ばれる時点で直前の`syncToServer()`は既にawait済みのため)。**不採用**。

### 案Aの具体設計
- `saveCustomPlans(arr)`/`saveEventPlans(arr)`を`async function`化し、`syncToServer()`の完了(成功/失敗問わず、`finally`相当)を待ってから返すようにする。
- `syncToServer()`自体に**タイムアウト**(例: 5秒)を追加する。`AbortController`で`fetch`を中断し、タイムアウト時は失敗として扱う(＝待たせすぎない)。
- 呼び出し元(`saveCustomPlan()`/`savePlanDetail()`/`deleteCustomGroup()`等)は`saveCustomPlans(...)`を`await`する形に変更。`closePlanModal()`/`showToast()`は同期完了後(またはタイムアウト後)に実行する。
- **オフライン・PUT失敗時のUX方針**: 保存自体(ローカルへの反映)は必ず即座に成功させる。サーバー同期が失敗・タイムアウトしても、ユーザーの操作をブロックしない(＝モーダルは閉じる、保存成功のトーストは出す)。ただし同期に失敗したことが分かるよう、通常の「保存しました」とは別に軽微な警告(例: 「予定を保存しました(オフラインのためカレンダーへの反映は後で行われます)」のようなトースト文言、または既存トーストは変えず別途小さいインジケータ)を出すかは要検討(下記「未解決の質問」参照)。**アプリの操作自体がハングすることは絶対に避ける**(タイムアウト必須の理由)。

### 案Bの具体設計
- `fetchFromServer()`内の「サーバーから取得したデータで丸ごと置換」を、`doJoinGroup()`の`mergeArr(a, b)`と同等のロジック(`id`をキーにした和集合、両者に同じidがあればサーバー側を優先＝後勝ち)で置き換える。
- 具体的には`fetchFromServer()`内で、置換前に現在のローカル`getCustomPlans()`/`getEventPlans()`を取得し、`mergeArr(serverCustom, localCustom)`(サーバー優先の和集合)でマージしたものを`saveCustomPlans()`に渡す。
- **削除の扱いに関する制約(重要・未解決)**: 単純な和集合マージは「追加」には強いが「削除の同期」に弱い。ローカルで削除した予定がサーバー側にまだ残っている場合、和集合マージでは削除済みのはずの予定が復活してしまう。現在の`doJoinGroup()`の`mergeArr`もこの制約を持ったまま運用されている(参加時の1回限りなので実害が出にくい)が、`fetchFromServer()`は予定表タブを開くたびに毎回呼ばれるため、この制約が顕在化する頻度がはるかに高い。この点は下記「リスク・未解決の質問」で扱う。
- `doRefreshCalSync()`(手動更新ボタン)・`doLeaveGroup()`(離脱時)が呼ぶ`fetchFromServer()`も、関数を共通化しているため自動的に同じマージ方式の恩恵を受ける。

### 削除の同期に関する補足方針(設計時点での結論)
今回のバグ(追加した予定が消える)を最優先で修正するため、和集合マージ方式を採用する。「削除が復活する」というトレードオフは新たに生まれるリスクだが、以下の理由で許容範囲と判断する。
- 現状(全置換)でも「追加した予定が消える」「削除したはずの予定が復活する」の両方が既に起こり得る構造(Last Write Winsのため)。マージ方式は「消える」問題を解消する代わりに「復活する」問題が起きやすくなる、という位置付けであり、**新規に持ち込むリスクというより既存リスクの性質が変わる**。
- 「予定が消える(データロス)」は復旧不能な重大な不具合である一方、「削除した予定が復活する」はユーザーが再度削除すれば直る軽微な不具合であり、深刻度の非対称性がある。
- 恒久的な解決(削除も含めた正しい競合解決)には、削除操作自体をトゥームストーン(削除マーカー)として記録する仕組みが必要だが、これは今回のスコープを大きく超える設計変更になるため、**スコープ外**とする(下記参照)。

## 変更するファイル一覧
- `public/app.js`
  - `saveCustomPlans(arr)` / `saveEventPlans(arr)`: `async function`化、`syncToServer()`のawait化
  - `syncToServer()`: `AbortController`によるタイムアウト(5秒目安)追加
  - `fetchFromServer()`: 全置換ロジックを`mergeArr`方式(サーバー優先の和集合マージ)に変更。`doJoinGroup()`内の`mergeArr`ヘルパーをスコープの広い共通関数として切り出し、`fetchFromServer()`からも呼べるようにする
  - `saveCustomPlan()` / `savePlanDetail()` / `deleteCustomGroup()` / その他`saveCustomPlans`/`saveEventPlans`の呼び出し元: `await`を追加
  - (必要に応じて)同期失敗時の軽微なユーザー通知文言追加。追加する場合は`STRINGS.ja`/`STRINGS.en`両方に同時追加(CLAUDE.md i18nルール準拠)
- `public/index.html`: `app.js`のキャッシュバスティング用クエリパラメータ更新(CLAUDE.md手順)
- `public/sw.js`: `CACHE_NAME`のバージョン番号更新(上記とセットで必須)
- `server.js`: **変更なし**(今回はクライアント側のみの修正で対応可能と判断。理由は下記「サーバー側を変更しない理由」参照)

### サーバー側を変更しない理由
- `PUT`/`GET`のAPIレスポンス構造・リクエスト構造は今回変更しない。App Store版(旧バージョン含む)との後方互換性への影響が一切ない。
- マージロジックはクライアント側(`fetchFromServer()`実行時)で完結させる設計とし、サーバーは従来通り「送られてきたものをそのまま保存する」単純な仕組みのまま維持する。これにより本修正はWeb版のみのデプロイで完結し、iOSアプリ側のバイナリ更新(TestFlight/App Store申請)を待たずに先行して本番のバグを緩和できる(クライアントJSはCapacitorのローカルバンドルのため、**iOS側の反映にはアプリ更新が必要**な点は次項で扱う)。

## データモデルの変更
なし。`data/shared-calendars/{groupId}.json`のスキーマ(`groupId`/`city`/`createdAt`/`lastSyncAt`/`customPlans`/`eventPlans`/`encryptedData`/`pushSubscriptions`)は変更しない。

## APIの変更
なし。`PUT /api/calendar/:groupId`・`GET /api/calendar/:groupId`ともにリクエスト/レスポンス構造は現状のまま。

### 後方互換性の確認(CLAUDE.md必須項目)
- **旧バージョンのApp Storeアプリへの影響**: API構造を変更しないため、旧バージョンのアプリは今回の修正後も従来通り動作する。ただし今回のバグ自体(データ消失)は**クライアント側JSの修正でのみ解消される**ため、旧バージョンのアプリを使い続けているユーザーには本バグ修正の恩恵は届かない(App Store版はCapacitorローカルバンドルのため、Webの`public/app.js`修正が自動的に反映されるわけではない)。
- **影響範囲**: 今回の変更は`public/app.js`のみで、サーバーAPIは無変更。Web版は`pm2 restart`で即時反映される。iOS版はこの`app.js`の変更を含む新しいCapacitorバンドルをビルドし、TestFlight/App Store経由でリリースしない限り反映されない。
- **リリースタイミング**: サーバー側の変更を伴わないため、Web版への反映(`pm2 restart`)とiOSアプリのリリースを厳密に同時に行う必要はない。ただし、**この修正の主目的は「共有カレンダー利用者のデータ消失」という重大バグの解消**であり、実際に恩恵を受けるのは最終的にiOSアプリ(本番環境)のユーザーである。Web版はテスト環境のため先行デプロイして動作確認し、問題なければ速やかに`release`ブランチへpushしてTestFlight/App Store版に反映することを推奨する(ユーザー明示指示がある場合のみpushする、という既存運用ルールに従う)。

## フロントエンドの変更
- 予定保存操作(新規追加・編集・削除)の体感速度が、`syncToServer()`のawait化により**共有カレンダー利用者に限り**わずかに遅くなる可能性がある(PUT完了までモーダルが閉じない、または最大タイムアウト秒数まで待たされる)。通信環境が良好であれば数百ms程度の遅延増、オフライン・不安定な環境ではタイムアウト秒数分(設計目安5秒)待たされた上で保存自体はローカルに反映される。
- 同期失敗時にユーザーへ知らせる文言を追加するかは未確定(下記「未解決の質問」)。追加する場合は必ず`STRINGS.ja`/`STRINGS.en`両方に同時追加し、英語モードでの目視確認を行う(CLAUDE.md i18n必須ルール)。

## 共有カレンダーを使わないユーザーへの影響の保証
- `saveCustomPlans`/`saveEventPlans`内の`syncToServer()`呼び出しは`getSharedGroupId()`が真の場合のみ実行される(`if (getSharedGroupId() && !_calSyncFromServer) syncToServer();`という既存の条件分岐を維持する)。`getSharedGroupId()`が`null`(共有カレンダー未使用)のユーザーはこの分岐に入らないため、`await`化・タイムアウト追加による遅延は一切発生しない。
- `switchNav('plan')`内の`fetchFromServer()`呼び出しも同様に`if (getSharedGroupId()) fetchFromServer()...`でガードされており、共有カレンダー未使用ユーザーはこの経路自体を通らない。マージロジックの変更もこのユーザー層には無関係。
- 結論: **共有カレンダーを使わないユーザーの保存・表示速度、データ挙動には一切変更がない**(この保証は実装後、変更差分が`getSharedGroupId()`ガードの外側に出ていないことをコードレビューで再確認する)。

## 受け入れ基準

### 正常系
1. 共有カレンダー利用中、オンライン環境で予定を追加→保存すると、モーダルが閉じ「保存しました」トーストが表示される時点で、サーバー側(`data/shared-calendars/{groupId}.json`)にも当該予定が反映されていること(PUT完了後にモーダルが閉じることの確認)。
2. 直後に予定表タブを離れて再度開いても(`fetchFromServer()`が再度呼ばれても)、追加した予定が消えないこと。
3. 別デバイス(または別ブラウザセッション)から同じグループに参加し、双方が別々の予定を追加した場合、どちらの予定も消えずに両方とも最終的に反映されること(和集合マージの効果確認)。
4. 共有カレンダー未使用ユーザーは、保存操作の速度・挙動に一切変化がないこと(`syncToServer`/`fetchFromServer`が呼ばれないことをネットワークタブ等で確認)。

### 失敗系
5. オフライン状態(機内モード等)で共有カレンダー利用中に予定を追加した場合、タイムアウト後(設計目安5秒以内)にローカル保存は成功し、モーダルは閉じ、UIがハングしないこと。
6. オフライン状態から復帰後、次回`fetchFromServer()`実行時に、オフライン中にローカルで追加した予定がサーバー側の内容とマージされ、消えずに残ること(案Bの効果確認。ただしPUT自体がまだ送信されていなければサーバー側には無いため、あくまで「ローカル側は消えない」ことの確認が主眼)。
7. サーバー側APIが一時的に500エラー等を返す場合も、UIがハングせずローカル保存は成功すること。

### エッジケース
8. **(今回の主目的)force quitのタイミング再現**: 予定追加の保存操作を行った瞬間(PUT送信中)にアプリをforce quitし、再起動後に予定表タブを開いた際、追加した予定が消えていないこと。
   - **再現の難しさへの対応方針**: force quitの正確なタイミングを人手で毎回再現するのは困難なため、以下の代替検証手段を用いる。
     a. ネットワーク条件をブラウザDevTools/実機のネットワークリンク条件設定で意図的に低速化(例: PUTのレイテンシを3〜10秒に引き伸ばす)し、PUT送信中の猶予時間を人為的に作った上でforce quitを試みる。
     b. 案Aの`await`化により「モーダルが閉じる＝PUTが完了(または確実にタイムアウトした)」ことが保証されるため、**モーダルが閉じてからforce quitすれば理論上データは消えないはず**という前提を検証する(＝「モーダルが閉じる前にforce quitしないと再現しなくなること」自体が修正の成功を意味する)。
     c. サーバーログ(`data/shared-calendars/{groupId}.json`の`lastSyncAt`更新タイミング)と、クライアント操作のタイムスタンプを突き合わせ、PUTの実際の所要時間を計測し、force quitの「危険な窓」がどれだけ短縮されたかを確認する。
9. 削除操作(`deleteCustomGroup`)と追加操作が同時多発した場合、和集合マージにより「削除したはずの予定が復活する」ケースが起こり得る。これは既知のトレードオフとして許容し、受け入れ基準の対象外とする(下記スコープ外参照)が、**明らかに頻発するようであれば別途対応が必要**なことをリスク欄に明記する。
10. `encryptedData`(E2E暗号化)を使っている共有カレンダーの場合、`fetchFromServer()`内のマージは復号後の`customPlans`/`eventPlans`配列に対して行われる(暗号化されたバイナリ同士をマージするわけではない)。暗号化利用時も非暗号化時と同じマージロジックが適用されることを確認する。
11. 予定が0件の状態(新規グループ作成直後等)でのマージが正しく空配列同士の和集合(＝空配列)になり、エラーにならないこと。

## リスク・未解決の質問

1. **削除の同期に関する構造的な弱さ(設計時点で認識済み・スコープ外扱い)**: 上記の通り、和集合マージは「削除の伝播」に弱い。削除したはずの予定が他デバイスとの同期で復活するケースが増える可能性がある。運用開始後にユーザーからこの逆方向の不具合報告が増える場合、削除操作をトゥームストーン(`deletedIds`配列等)として記録し、マージ時に「サーバー・ローカルどちらかで削除済みのidは復活させない」仕組みへ拡張する必要がある。**今回はスコープ外**(別途設計が必要な規模の変更のため)。
2. **タイムアウト秒数の妥当性(未確定)**: 5秒を目安としたが、実際のネットワーク環境(特にiOS実機のモバイル回線)でユーザー体感として許容できる待ち時間かは実機検証が必要。長すぎればUX悪化、短すぎればタイムアウトしてもPUTがバックグラウンドで実は成功してしまい「タイムアウト扱いだが実際は届いていた」というケースが増え、マージロジックへの依存度が上がる。
3. ~~同期失敗時のユーザー通知文言を追加するか~~ → **解決済み(2026-07-12ユーザー回答)**: 追加しない。通常の保存成功トーストのみでよい
4. **`_calSyncFromServer`フラグの再入可能性**: `fetchFromServer()`内で`_calSyncFromServer = true`を設定してから`saveCustomPlans()`/`saveEventPlans()`を呼ぶことで、マージ後の保存が再度`syncToServer()`を呼ばないよう防いでいる(無限ループ防止)。`saveCustomPlans`を`async`化・`await`化する変更がこのフラグの同期的な立て直しタイミングに影響しないか、実装時に慎重に確認する必要がある(現状は同期的に`true`→呼び出し→`false`のシーケンスだが、`await`が絡むと`_calSyncFromServer`が`false`に戻る前に別の非同期処理が割り込む余地がないか要確認)。
5. **複数の同時保存操作(予定追加を連打する等)でのレースコンディション**: 案Aの`await`化により1回の保存操作内でのPUT完了は保証されるが、ユーザーが連続して複数の予定を素早く追加した場合、複数の`syncToServer()`呼び出しが並行して走り、後から送信したPUTが先に完了して「先発の変更が結果的に上書きされる」順序逆転が起こり得る。今回の設計では個別の保存操作ごとに直列化(前の保存の完了を待ってから次を許可する)までは行わない。深刻な実害が確認された場合は、保存操作全体をキュー化する追加対応を検討する。
6. **`doRefreshCalSync()`/`doLeaveGroup()`への影響確認**: `fetchFromServer()`の内部ロジック変更(全置換→マージ)は、この2つの呼び出し元にも自動的に適用される。特に`doLeaveGroup()`は「離脱時に最新のサーバーデータをローカルに保存する」という説明文言(`confirm()`ダイアログ内)になっているが、マージ方式に変わることで「サーバーデータで完全に置き換えられる」という文言の意味合いが微妙に変わる(実際にはローカルの内容も残る)。文言の見直しが必要か実装時に確認する。
7. **サーバー側の恒久対応は今回スコープ外**: 案A・案Bはいずれもクライアント側だけで完結する設計とした。より頑健な解決(サーバー側での楽観的ロック、`lastSyncAt`を使ったリクエスト時点のバージョン検証、409 Conflict応答など)は、今回よりも大きい設計変更になるため見送った。将来的に競合が頻発するようであれば、サーバー側APIの拡張(後方互換性を保った形での)を別途設計する必要がある。

## スコープ外(今回作らないもの)
- 削除操作のトゥームストーン管理(削除マーカーによる正確な削除同期)
- サーバー側の楽観的ロック・バージョニング・409 Conflict応答
- 保存操作のキュー化・直列化(連打対策)
- 複数デバイス間のリアルタイム同期(WebSocket等によるプッシュ型同期)。あくまで「予定表タブを開いたタイミングでの同期」という既存の仕組みの信頼性向上にとどめる
- オフライン時の同期失敗を後から自動リトライする仕組み(バックグラウンド再送信キュー等)。今回は「その場でタイムアウトし、次回の同期タイミングでマージにより実害を防ぐ」という設計にとどめる

## 承認状況
承認済み（2026-07-12）。同期失敗時のユーザー通知文言は追加しない。実装（orchestrator）待ち。

---

# 設計書23 — 広告表示機能（Klookアフィリエイトリンク主軸 + PRカード）

## 背景
以前の相談で以下の方針に合意済み（再検討不要、そのまま踏襲）:
1. AdMob等の自動広告ネットワーク（バナー/インタースティシャル）は不採用。理由: ATT許諾ダイアログがApp初回体験を損なう、「シンガポール在住日本人」という極小セグメント向け広告在庫がほぼ無く埋め率が低い、既存UIデザインとの世界観の不整合
2. 推奨2本柱: **①PRカード**（イベント/コース一覧への「PR」タグ付き純広告枠、地元事業者への直接営業想定）／**②アフィリエイトリンク**（コースの立ち寄りスポットにKlook等の予約リンクを設置。ユーザーが既に行く気になっている状態でのクリックのためCVRが高いと想定、営業不要ですぐ試せる）
3. 検討したが優先度低: 「スポンサー提供コース」（AIのおすすめとしての信頼感を損なうリスク）
4. 今回、ユーザーは「Klook他、相性のいい広告を表示する」ことを軸に進めたいと明言。②を主軸に①も含めた全体設計を依頼

## 現状確認（実コード）

### コースデータ構造
- `data/sg/model-courses.json`（AI生成コース）: 調査時点で空配列 `[]`
- `data/sg/community-courses.json`（ユーザー公開コース、AI生成が公開されたものも含む）: 実データあり
- コースの`spots`配列、各スポットのフィールド:
  ```json
  {
    "time": "09:00",
    "name": "Tekka Centre",
    "type": "グルメ",
    "duration": "60分",
    "description": "...",
    "address": "665 Buffalo Rd, Little India（Rochor MRT徒歩3分）",
    "emoji": "🍛"
  }
  ```
  現状、スポットに料金・チケット・外部リンクの概念は一切存在しない。`type`フィールドは自由文字列（「グルメ」「観光」「ショッピング」「公園」等）で、Klook等の予約対象になりやすい「観光」「アクティビティ」系スポットを機械的に判別する仕組みは現状ない。

### コース詳細のレンダリング（`public/app.js`）
- `renderCourseDetail(course)`（2937行目台〜、実体は3062〜3146行目付近）がスポット一覧をタイムライン表示。各スポットは以下のマークアップ（3090〜3099行目）:
  ```js
  ${(course.spots || []).map(s => `
    <div class="course-timeline-item">
      <div class="course-timeline-time">${escapeHtml(s.time)}</div>
      <div class="course-timeline-body">
        <div class="course-timeline-name">${s.emoji || ''} ${escapeHtml(s.name)} <span>[${escapeHtml(s.duration)}]</span></div>
        <div class="course-timeline-desc">${escapeHtml(s.description || '')}</div>
        <div class="course-timeline-meta">${escapeHtml(s.address || '')}</div>
      </div>
    </div>
  `).join('')}
  ```
- 同一の`spots`ループ・ほぼ同一マークアップが**もう1箇所**（3493行目付近）に存在する（要確認: どの画面用か。コース詳細以外にコース候補プレビュー等で再利用されている可能性が高い。実装フェーズで両方の要修正箇所を洗い出すこと）
- コース詳細下部に既存の「予定に追加」ボタン（`card-action-btn`クラス、3105〜3110行目）あり。新規ボタンのスタイル基準として流用できる

### コース生成（AIパイプライン）
- `server.js`の`POST /api/courses/generate`（1787行目）、`POST /api/courses/candidates`（1693行目）、`scripts/generate-model-courses.js`がコース本体を生成。いずれもClaude APIでスポット情報を生成しており、Klookとのマッチングは行っていない
- コースいいね数の更新は`POST /api/courses/:id/like`が`withFileLock`でJSONファイルを安全に読み書きするパターン（2186〜2204行目）。新規のクリックカウントAPIも同様のロック付き書き込みパターンを踏襲すべき

### イベントカードのレンダリング・データ
- `public/app.js`の`renderEventCard(e, i)`（1047行目〜）がイベント1件分のカードHTMLを生成。ヒーロー画像上に`bannerLabel`（「終了間近」等）や`newRibbon`（新着）をオーバーレイ表示する仕組みが既にある（1109〜1147行目）ため、「PR」バッジも同系統のオーバーレイパターンで実装可能
- `renderEventCards()`（1428行目〜）が`EVENT_DATA`をフィルタ・ソートし、`_getOrCreateCardEl`によるDOM差分キャッシュ（設計書21）でカードを描画。ソート順は`fetched_at`降順→`CATEGORY_ORDER`（1510行目: `event:0, show:1, gourmet:2, opening:3, sale:4`）。**PRカードを特定順位に固定挿入する場合、このソート後・DOM構築前の位置に割り込ませる必要がある**
- `GET /api/events`（server.js 465行目〜）はイベント配列をそのまま返す。`end_date`超過・`opening`タイプの2週間経過フィルタあり。PRカードをこのレスポンスに混ぜる場合、既存の期限切れフィルタ・カテゴリ絞り込み・ソートロジック全てとの整合を取る必要がある
- カテゴリフィルタ（`filterCats`、`e.type`ベース）: 現行の`type`は`event/gourmet/sale/opening/show`程度（CLAUDE.mdには`edu`も記載あり）。PR用の新規`type`値（例: `sponsored`）を追加すると、既存のカテゴリチップ（`CAT_ORDER`→設計書6で`_visibleCatOrder()`に変更済み）・`CATEGORY_ORDER`定数・`tabLabels`等、`e.type`を分岐条件にしている全箇所に影響する

### i18n・UIスタイル規約
- 新規UI文字列は`data-i18n`属性＋`STRINGS.ja`/`STRINGS.en`両方に同時追加が必須（CLAUDE.md記載）
- カラーは`:root`のCSS変数必須（例: `--caramel: #C8804A`、`--terracotta: #C4705A`等）。新規バッジ色を追加する場合もCSS変数を新設するか既存変数を流用する
- z-index方針: bottom-nav(9999)未満の3000番台。ただし今回の機能（PRカード・予約ボタン）はモーダル/オーバーレイではなくインラインのカード内要素のため、新規z-index管理は基本的に不要と想定される

### 実機デバッグ・計測基盤
- `_sendDebugLog(event, data)`（`public/app.js` 6〜14行目）: fire-and-forgetでサーバーに任意イベントを送信し`logs/debug-nav.log`に1行1JSON追記する恒久基盤が既にある。ただしこれは「実機不具合調査用」の位置づけで、認証なし・サイズ上限なし・ローテーションなしという注意書きがCLAUDE.mdにある。**継続的な集計を必要とするビジネス指標（アフィリエイトクリック数等）の記録先として転用するのは設計上望ましくない**（調査用ログと恒久的な集計データを同じ無制限ファイルに混在させることになるため）
- クリック計測用には**専用の新規エンドポイント＋専用データファイル**を设けるのが適切と判断（詳細は後述）

## 検討した案

### A. アフィリエイトリンクのスポット紐付け方式
1. **全自動マッチング**（スポット名でKlook検索APIを叩き、最上位候補を自動採用）: 実装は最速だが、名称の表記ゆれ（日本語/英語、店舗名の一部一致等）で誤ったアクティビティに誘導するリスクが高い。ユーザー体験を損なう危険があるため不採用
2. **半自動フロー（推奨）**: スポット名でKlook検索APIまたはアフィリエイトフィード（Klookが提供するCSV/API形式の商品カタログ）を検索し、候補を人力管理画面またはCLIスクリプトで提示→人力で確定してデータに保存。精度と省力化のバランスが良い
3. **完全手動**: 対象スポットをリストアップし、Klookサイトで人力検索してURLをコピー。実装コストは最小だが、コース件数が増えると運用が破綻しやすい

**採用: 案2（半自動フロー）**。ただし「Klook検索/フィード連携」自体はKlookアフィリエイトプログラム登録後でないとAPI仕様・提供形態が確定しないため、フェーズを分けて設計する（後述）。

### B. アフィリエイトデータの持たせ方
1. スポットオブジェクトに直接`affiliateUrl`等のフィールドを追加（コースJSON本体を編集）
2. スポット名をキーにした別マッピングファイル（例: `data/sg/affiliate-links.json`、`{ "Tekka Centre": {...} }`）を新設し、表示時に突き合わせる

**比較**:
- 案1はシンプルだが、コースが再生成される（AIパイプラインの再実行）たびにアフィリエイト情報が失われるリスクがある。`generate-model-courses.js`や`/api/courses/generate`は現状スポットをゼロから生成するため、手動で紐付けたリンクが上書き消失する
- 案2は「スポット名」を疎結合キーにするため、コース再生成後も同名スポットであれば自動的にリンクが復活する。複数コースで同じスポット（例: 有名な観光地）が使われるケースにも1回の登録で対応できる

**採用: 案2（別マッピングファイル方式）**。ただしスポット名の表記ゆれ（同じ場所でも生成のたびに微妙に名称が変わる可能性）というリスクは残る。運用初期は件数が少ないため人力で許容し、件数が増えたら正規化キー（住所ベース等）の検討を将来課題とする。

### C. PRカードのデータモデル
1. `events.json`に`category: "sponsored"`等のフィールドを追加して混入
2. `events.json`とは別に専用JSON（例: `data/sg/sponsored-cards.json`）を新設し、表示時にクライアント側またはAPI側でマージ
3. 既存カテゴリ（`sale`等）を流用し、フラグのみ追加（`isSponsored: true`）

**比較**:
- 案1は`GET /api/events`のフィルタ・ソート・期限切れ処理ロジックすべてに影響し、旧App Store版が「スポンサー」を通常イベントとして表示してしまう後方互換性リスクがある。また`events.json`は`fetch-events.js`/`filter-events.js`の自動パイプラインが上書きするファイルであり、手動追加したスポンサーデータが自動処理で誤って削除・変更される事故リスクが高い
- 案2は既存のイベント取り込みパイプラインと完全に独立しており、事故リスクが低い。表示側の一覧に「差し込む」処理だけをフロントエンド（または新規API）に追加すればよく、既存の`GET /api/events`のレスポンス構造・フィルタロジックは一切変更不要（後方互換性の懸念が最小）

**採用: 案2（専用ファイル`data/sg/sponsored-cards.json`）**。

### D. PRカードの管理方法
1. 管理画面（Web UI）を新規構築
2. サーバーの`data/sg/sponsored-cards.json`を直接編集（SSH+テキストエディタ、またはシンプルなCLIスクリプト）

**比較**: 想定されるスポンサー枠は「週1枠、S$50〜150程度」という小規模運用であり、営業〜掲載までの頻度も低い。管理画面構築のコストに見合わないと判断。

**採用: 案2（直接JSON編集 or 簡易CLIスクリプト）**。件数・頻度が増えてきた場合に管理画面を将来検討する。

## 推奨案（全体アーキテクチャ）

### フェーズ0（人力・外部作業、実装対象外）
- Klookアフィリエイトプログラムへの登録（Klook Affiliate Program、またはKlookが提携するアフィリエイトネットワーク経由）
- 登録後に発行されるアフィリエイトID・トラッキングパラメータ形式・利用可能なAPI/フィード仕様を確認する
- ここで確定した技術仕様（URL形式、パラメータ名等）によって、以降のフェーズの実装詳細（特にURL生成ロジック）が変わる可能性がある点に注意

### フェーズ1（推奨・最優先）: アフィリエイトリンク（Klook）
1. **データモデル**: `data/sg/affiliate-links.json`を新設。スポット名をキーに以下を保存:
   ```json
   {
     "Tekka Centre": {
       "provider": "klook",
       "url": "https://www.klook.com/...(アフィリエイトパラメータ付き)",
       "productId": "12345",
       "title": "Tekka Centre フードツアー",
       "updatedAt": "2026-07-12T00:00:00.000Z",
       "confirmedBy": "manual"
     }
   }
   ```
   - `provider`フィールドを最初から持たせることで、将来GetYourGuide・Agoda等を追加する際も同一ファイル・同一表示ロジックで拡張可能（拡張性の担保）
2. **紐付けフロー（半自動）**: 新規スクリプト`scripts/match-affiliate-links.js`（案）を作成。
   - 既存の全コース（`model-courses.json`+`community-courses.json`）からユニークなスポット名を抽出
   - Klook検索API（フェーズ0で確定した仕様に依存、詳細不明）または人力検索を通じて候補URLを提示
   - 人力で確定した候補のみ`affiliate-links.json`に書き込む（`--dry-run`オプションで確認のみも可能にする、既存スクリプト群の慣習に合わせる）
   - 全自動マッチングはしない。スクリプトはあくまで「候補提示・人力確定の支援」に留める
3. **表示ロジック**: `renderCourseDetail(course)`（および3493行目付近の重複箇所、実装時に要特定）で、各スポット描画時に`affiliate-links.json`の該当エントリを探し、あれば「チケットを予約」ボタンを追加する。ボタンはコース詳細取得時にサーバー側でJOINして返す方式（`GET /api/courses`側でスポットに`affiliateLink`を埋め込んで返す）を推奨（クライアント側で別途fetchする方式より往復が少なく、キャッシュ・オフライン耐性の観点でも有利）
4. **UI**: 各`course-timeline-item`内、`course-timeline-meta`（住所）の下に、該当スポットにリンクがある場合のみボタンを追加。
   ```html
   <button onclick="if(!_touchCapableDetected) openAffiliateLink('...', 'klook', '<spotName>')"
     style="margin-top:8px;padding:8px 14px;background:var(--caramel);color:#fff;font-size:13px;
            font-weight:700;border:none;border-radius:var(--radius-btn);cursor:pointer;
            display:inline-flex;align-items:center;gap:4px;">
     🎫 <span data-i18n="affiliateBookBtn">チケットを予約</span>
   </button>
   ```
   - 既存の「onclick属性＋touchendガード」方式（CLAUDE.md記載の`_touchCapableDetected`パターン）に倣うか、新規ボタンとして通常のonclickのみにするかは実装フェーズで判断（既存の17+6箇所の対象リストに追加するか検討）
   - Capacitor環境では外部リンクは`Capacitor.Plugins.Browser.open()`経由でデバイスブラウザに渡す既存の仕組み（`a[target="_blank"]`向け）があるため、`window.open()`直呼びではなく同様の分岐が必要（`openAffiliateLink()`内で`_isCapacitorApp`判定）
   - 「PR」相当の明示は必須ではないが、App Storeガイドライン・広告表示の透明性の観点から、リンク先が外部サイトであることが分かる表示（🎫アイコン＋文言、または小さな「外部サイト」注記）が望ましい
5. **クリック計測**: 新規エンドポイント`POST /api/affiliate-click`を新設。
   ```json
   { "spotName": "Tekka Centre", "provider": "klook", "courseId": "course_sg_...", "city": "sg" }
   ```
   サーバー側は`data/affiliate-clicks.json`（または日付別ログファイル）にappendし、`withFileLock`パターンで安全に書き込む。認証なしのfire-and-forgetでよいが、`_sendDebugLog`とは目的が異なる（恒久的なビジネス指標）ため専用エンドポイント・専用ファイルとして分離する（調査用ログとの混在を避ける）。クリック数の集計・可視化（管理画面やCLI集計スクリプト）は今回のスコープ外とし、まずは記録のみ行う

### フェーズ2: PRカード
1. **データモデル**: `data/sg/sponsored-cards.json`（新設、専用ファイル）
   ```json
   [
     {
       "id": "sponsor_20260712_001",
       "sponsorName": "〇〇学習塾",
       "title": "夏期講習、今なら入会金無料",
       "content": "...",
       "imageUrl": "...",
       "url": "https://...(スポンサー先の外部リンク、遷移計測用に自社経由でラップするかは実装時判断)",
       "category": null,
       "startDate": "2026-07-15",
       "endDate": "2026-07-31",
       "priority": 1,
       "active": true
     }
   ]
   ```
   - `category: null`は「全カテゴリ共通で出す」を意味し、特定カテゴリのみに出したい場合は`e.type`と同じ値（`event`/`gourmet`等）を入れる案
   - `startDate`/`endDate`で掲載期間を管理し、期限切れは自動的に非表示にする（`events.json`の`end_date`処理と同様の考え方）
2. **表示ロジック**: `renderEventCards()`のフィルタ・ソート後、DOM構築直前に「PRカードを1件、上から3〜5枚目あたりに挿入」する処理を追加。カテゴリタブで絞り込み中（`filterCats.size > 0`）の場合、`category`が一致するPRカードのみ対象にするか、絞り込み中は非表示にするか（挙動は要ユーザー判断、未確定事項として明記）
   - 複数スポンサーがいる場合のローテーション: 表示のたびに`active:true`のカードからランダム選択、または日替わりで固定選択（例: 日付ベースのシード値でインデックス選択）。日替わり固定の方が「効果測定」の観点で扱いやすい（同じ日にアクセスしたユーザーには同じ枠を見せられる）ため推奨
3. **UI**: 通常のイベントカードと同じ`spot-card`ベースの見た目を踏襲しつつ、`renderEventCard`のヒーロー画像上バッジ（`bannerLabel`と同系統の実装パターン）として、カード左上または右上に「PR」バッジを追加。
   ```html
   <div style="position:absolute;top:10px;right:10px;font-size:11px;font-weight:700;color:#fff;
     background:var(--warm-gray);border-radius:4px;padding:2px 8px;" data-i18n="prBadgeLabel">PR</div>
   ```
   カラーは既存の`bannerLabel`（`var(--terracotta)`）と区別できる色を新規CSS変数として定義するか、既存の`var(--warm-gray)`等を流用するか実装時判断
4. **API**: `GET /api/events`のレスポンス自体は変更せず（後方互換性維持）、PRカードは別途新規`GET /api/sponsored-cards?city=sg`で取得し、クライアント側で`renderEventCards()`実行時にマージする方式を推奨。旧バージョンのApp Storeアプリはこの新規APIを呼ばないため単に「PRカードが出ない」だけで済み、既存動作を一切壊さない
5. **管理方法**: `data/sg/sponsored-cards.json`をSSH経由で直接編集する運用とする。将来的に頻度・件数が増えた場合、簡易的な追加専用CLIスクリプト（`scripts/add-sponsored-card.js`案）や管理画面の導入を再検討する

## 変更するファイル一覧（実装フェーズ向け見積もり、今回は設計のみ）

### フェーズ1（アフィリエイトリンク）
- 新規: `data/sg/affiliate-links.json`
- 新規: `scripts/match-affiliate-links.js`（半自動紐付け支援スクリプト）
- 新規: `data/affiliate-clicks.json`（クリック計測ログ、都市横断の1ファイル、または`data/{city}/affiliate-clicks.json`。命名は実装時に既存の`push-subscriptions.json`等の配置慣習に合わせて決定）
- 変更: `server.js`（`GET /api/courses`にスポット単位のアフィリエイトリンク埋め込み処理を追加、新規`POST /api/affiliate-click`エンドポイント追加）
- 変更: `public/app.js`（`renderCourseDetail`、および重複箇所〈3493行目付近、実装時に特定〉のスポット描画に予約ボタン追加。`openAffiliateLink()`新規関数。`STRINGS.ja`/`STRINGS.en`に新規キー追加）
- 変更: `public/index.html`（`app.js`のキャッシュバスティング用クエリパラメータ更新）
- 変更: `public/sw.js`（`CACHE_NAME`バージョン更新）
- 変更: `.gitignore`（クリックログファイルを既存の`data/source-fetch-state.json`等と同様にgit管理除外するか要判断）

### フェーズ2（PRカード）
- 新規: `data/sg/sponsored-cards.json`
- 変更: `server.js`（新規`GET /api/sponsored-cards`エンドポイント追加）
- 変更: `public/app.js`（`renderEventCards()`にPRカード差し込みロジック追加、PRカード用の新規レンダリング関数、`STRINGS.ja`/`STRINGS.en`に「PR」バッジ等の新規キー追加）
- 変更: `public/index.html`・`public/sw.js`（キャッシュバスティング）

## データモデルの変更
- **既存ファイルの構造変更: なし**（`events.json`・`model-courses.json`・`community-courses.json`はいずれも既存フィールドを一切変更しない。新規ファイルの追加のみ）
- **`GET /api/courses`のレスポンス拡張**: スポットオブジェクトに`affiliateLink`（存在する場合のみ）フィールドを追加する案。既存クライアントは未知フィールドを無視するため後方互換（旧App Store版は単に予約ボタンが出ないだけ）
- **`GET /api/events`のレスポンス**: 変更なし（PRカードは別APIとして分離するため）

## APIの変更
- 新規: `POST /api/affiliate-click`（認証なし、fire-and-forget、クリック記録専用）
- 新規: `GET /api/sponsored-cards?city=sg`（PRカード取得専用）
- 変更（拡張のみ、非破壊）: `GET /api/courses`のレスポンスに`spots[].affiliateLink`フィールドを追加
- 変更なし: `GET /api/events`、`POST /api/courses/generate`、`POST /api/courses/candidates`等、既存の全エンドポイント

## フロントエンドの変更
- コース詳細画面（`renderCourseDetail`等）: スポットごとに条件付き「チケットを予約」ボタン表示
- イベント一覧画面（`renderEventCards`）: PRカードの差し込み表示、「PR」バッジ
- 新規i18nキー（案、実装時に確定）: `affiliateBookBtn`（チケットを予約）、`prBadgeLabel`（PR）、その他PRカード関連の文言。**追加時は`STRINGS.ja`/`STRINGS.en`両方に同時追加必須**（CLAUDE.md記載のi18nルール）

## ⚠️ データ共有（Web版/App Store版）への影響（CLAUDE.md必須確認事項）

1. **後方互換性**:
   - フェーズ1（`GET /api/courses`へのフィールド追加）: 追加のみで既存フィールドは変更しないため、旧App Store版アプリは新規`affiliateLink`フィールドを単に無視する。表示は変わらず、クラッシュ等のリスクもない
   - フェーズ2（新規`GET /api/sponsored-cards`エンドポイント）: 旧App Store版はこのエンドポイントを呼び出す実装を持たないため、単に「PRカードが出ない」状態になるだけ。既存動作への悪影響なし
   - 両フェーズとも`GET /api/events`のレスポンス構造は一切変更しないため、イベント一覧まわりの後方互換性リスクはゼロ
2. **影響範囲**:
   - サーバーAPI変更（`server.js`）は**Web版・App Store版の両方に即座に影響する**（データ層は共有のため）。ただし上記の通り非破壊的追加のみなので実害は想定されない
   - フロントエンド変更（`public/app.js`・予約ボタン・PRカードのUI）は**Capacitorバンドル方式のためApp Store版に反映するには新規TestFlightビルド・審査が必要**。Web版は`pm2 restart`で即時反映されるが、App Store版ユーザーは次のアプリアップデートまでこの機能を見られない
3. **リリースタイミング**:
   - サーバーAPI変更（新規エンドポイント追加）は非破壊的なため、Web版先行デプロイで問題ない
   - フロントエンドの見た目の変更（PRカード・予約ボタンの表示）は、Web版でテスト環境として先行確認 → 問題なければ`release`ブランチへpushしTestFlightビルド、という既存の運用フローをそのまま踏襲できる
   - **収益化施策のため、App Store版（本番・実際のエンドユーザーが使う環境）に反映されて初めて効果が出る点に注意**。Web版だけの確認で満足せず、必ずTestFlight実機確認〜本番リリースまで完了させる必要がある

## App Storeガイドライン上の留意点（一般的な知識、詳細な法務確認はスコープ外）
- **広告であることの明示**: Appleの審査ガイドラインでは、広告・PRコンテンツと通常コンテンツの区別を明確にすることが求められる一般的傾向がある。「PR」バッジの表示は明確性の観点で有効と考えられる
- **アフィリエイトリンクによる外部サイト誘導**: 単体では通常問題にならないことが多いが、リンク先（Klook等）が決済・個人情報入力を伴う外部サイトである旨が分かるようにすることが望ましい
- **App Tracking Transparency（ATT）**: 今回の設計（クリックログのみ記録、個人を特定するトラッキングは行わない）であればATTダイアログの対象にはならない可能性が高いが、Klook側のリンク・アフィリエイトパラメータ自体がユーザー識別子を含む場合は要注意（Klook側の実装次第、フェーズ0で確認が必要）
- **上記はいずれも一般的知識に基づく留意点であり、詳細な法務確認・Appleガイドラインの正式な逐条確認は今回のスコープ外**。実装前に別途、最新のApp Store Review Guidelines（特にSection 3 Business、Section 5.6 Advertising等）を確認することを推奨

## 受け入れ基準

### フェーズ1（アフィリエイトリンク）
**正常系**
1. `affiliate-links.json`にリンクが登録済みのスポットが含まれるコースを詳細表示すると、該当スポットに「チケットを予約」ボタンが表示される
2. ボタンをタップすると、Klookの該当アクティビティページ（アフィリエイトパラメータ付きURL）が正しく開く。Web版は新規タブ/ウィンドウ、Capacitor版はデバイスブラウザ（`Browser.open()`）で開く
3. ボタンタップ時に`POST /api/affiliate-click`が送信され、`data/affiliate-clicks.json`（等）に記録が残る
4. リンク未登録のスポットにはボタンが表示されない（既存表示に変化なし）

**失敗系・エッジケース**
5. `affiliate-links.json`が存在しない、または空の場合でもコース詳細表示自体はエラーなく従来通り動作する
6. クリック計測APIがタイムアウト・失敗してもユーザー操作（外部サイトへの遷移）はブロックされない（fire-and-forget）
7. 同名だが実際には別の場所を指すスポット（表記ゆれ由来の誤紐付け）が万一発生した場合、人力でのファイル修正のみで即座に反映できる（コース再生成不要）
8. コースが再生成された場合も、同一スポット名であれば既存のアフィリエイトリンクが失われず引き続き表示される

### フェーズ2（PRカード）
**正常系**
9. `active:true`かつ掲載期間内のPRカードが、イベント一覧の指定位置（上から3〜5枚目あたり）に「PR」バッジ付きで表示される
10. 複数のPRカードが登録されている場合、ローテーションルールに従って表示が切り替わる
11. PRカードをタップするとスポンサー先の外部リンクが正しく開く

**失敗系・エッジケース**
12. `sponsored-cards.json`が存在しない、または`active:true`のカードが0件の場合、PRカードなしで通常のイベント一覧が表示される（エラーなし）
13. カテゴリタブで絞り込み中の挙動（PRカードを出すか隠すか）が仕様通りに動作する（※未確定事項、実装前にユーザー判断が必要）
14. 掲載期間（`startDate`/`endDate`）を過ぎたPRカードは自動的に表示されなくなる

### 共通
15. 旧バージョンのApp Storeアプリ（今回の変更を含まないビルド）が、サーバーAPI変更後も一切のクラッシュ・表示崩れなく従来通り動作し続ける
16. 新規追加した全てのUI文字列が日本語・英語両方で正しく表示される（英語モード目視確認）
17. Web版・App Store版どちらでも既存のコース閲覧・イベント閲覧機能に回帰がない

## スコープ外（今回作らないもの）
- Klookアフィリエイトプログラムへの登録作業自体（人力・外部作業、フェーズ0）
- Klook以外のアフィリエイト先（GetYourGuide・Agoda等）の実装（データモデルに`provider`フィールドを持たせ拡張しやすくするに留める）
- 全自動でのスポット↔Klookアクティビティのマッチング（精度リスクのため不採用、常に人力確定を挟む）
- PRカード・アフィリエイトクリックの集計・可視化ダッシュボード（記録のみ行い、集計は将来のCLIスクリプト等で対応）
- PRカードの管理画面（Web UI）。直接JSON編集運用とする
- 「スポンサー提供コース」機能（AIのおすすめとしての信頼感を損なうリスクがあるため、以前の相談時点から優先度低のまま今回もスコープ外）
- BKK/SYD都市への対応（現在両都市は一時停止中のため、SGのみを対象とする）
- クリックログのローテーション・容量管理の自動化（`_sendDebugLog`と同様の注意点として、将来運用しながら手動確認する前提）
- アフィリエイトリンクのURL有効性チェック（リンク切れ検知の自動化）

## リスク・未解決の質問

1. **【最重要・未解決】Klookアフィリエイト登録の審査・条件が不明**: Klook Affiliate Programの登録要件（サイト規模・トラフィック要件の有無）、承認までの期間、提供されるAPI/フィードの仕様（検索APIがあるのか、静的CSVカタログのみなのか）が現時点で未確認。フェーズ1の技術詳細（`match-affiliate-links.js`の実装方式）はこの登録完了後でないと確定できない
2. **【未解決】Klookのアクティビティ紐付けの精度**: シンガポールの人気観光地・グルメスポットであればKlookに対応アクティビティが存在する可能性が高いが、ホーカーセンターや小規模な地元店舗など「チケット化されない」スポットも多く含まれる（実際に確認した`community-courses.json`のサンプルでも「Tekka Centre」「Little India Arcade」等、必ずしもKlookで予約可能とは限らない場所が多い）。**紐付け可能なスポットの実際の割合（カバレッジ率）は運用してみないと分からない**
3. **【未解決】収益化の実績が出るまでの期間**: アフィリエイトCVR・PRカード営業の成約状況はいずれも未知数。効果測定（クリック計測）の仕組みは用意するが、「いつ黒字化するか」は本設計の範囲外の事業判断
4. **【要確認】App Store審査への影響有無**: 一般的な知識に基づく留意点は本文に記載したが、実際の審査可否は申請してみないと確定しない。特に「外部サイトへの決済誘導」を含むアプリとしての扱われ方（Appleの決済ルール、In-App Purchase要求の対象になるかどうか）は要注意。**Klook側の決済がApp外（Klookサイト/アプリ内）で完結する限り、通常はApple課金ルールの対象外と考えられるが、この判断は法務確認スコープ外としており未確定**
5. **未解決: コース内スポット描画の重複箇所（3493行目付近）の実体**: 今回の調査で`renderCourseDetail`と同一パターンの`spots.map`処理がもう1箇所存在することを確認したが、それがどの画面・フローで使われているか（候補プレビュー、公開前確認画面等）は実装フェーズで特定が必要。予約ボタンの追加漏れを防ぐため、実装時に必ず両方確認すること
6. **未解決: PRカードのカテゴリ絞り込み中の挙動**: 「カテゴリタブで絞り込み中、PRカードを出すか隠すか」はユーザー判断が必要な未確定事項（本文中に明記）
7. ~~未解決: アフィリエイトリンクURLの生成方式~~ → **解決済み（2026-07-12、フェーズ0完了・Klookアフィリエイトダッシュボードで確認済み）**:
   - AID発行済み: `127020`（サイト名 "Odekake Navi"、ターゲット地域「日本」、カテゴリ「Trip Planning Tool/Navigation App」で登録）
   - URL形式: 任意のKlookページURLの末尾に`?aid=127020`を追加するだけ（例: `https://www.klook.com/activity/xxxx/?aid=127020`）。専用のショートリンク発行APIは不要
   - **⚠️重要な制約**: `s.klook.com`形式の短縮URLは計測できないため、アフィリエイトリンクには必ず`www.klook.com`形式の完全URLを使用すること（Klook公式の注意書きより）。`scripts/match-affiliate-links.js`実装時、候補として拾ってきたURLが`s.klook.com`形式だった場合は`www.klook.com`形式に正規化するか、そのまま使わないよう実装時に注意する
   - **実例で確認済みの個別アクティビティURL形式**: `https://www.klook.com/ja-JP/activity/127-gardens-by-the-bay-singapore/?aid=127020`（`/activity/{id}-{slug}/`パターン、`/ja-JP/`言語コードを含む）。日本語向けアプリのため、紐付けスクリプトでは`/ja-JP/`ロケールのURLを優先的に採用する
8. **軽微リスク: `affiliate-links.json`のキーがスポット名の完全一致に依存**: AIコース生成のたびに微妙に異なる表記（例: 「Tekka Centre」と「Tekka Market」）で生成されると、既存のリンク紐付けが引き継がれない可能性がある。運用初期は件数が少なく人力で対応可能だが、コース数が増えた場合は正規化・部分一致等の改善が将来必要になる可能性がある
9. **軽微リスク: クリックログファイルの肥大化**: `_sendDebugLog`基盤に関するCLAUDE.mdの既存注意点（サイズ上限・ローテーションなし）と同様の懸念が新規クリックログファイルにも当てはまる。運用しながら定期確認が必要

## 承認状況
方向性は承認済み（2026-07-12）。他アフィリエイト先（GetYourGuide・楽天トラベル・Shopee）も検討したが、まずはKlookのみ（フェーズ1）で進める方針を確定。GetYourGuide・楽天トラベルは`provider`フィールドの拡張性を活かし将来追加候補として保留。Shopeeはコース/イベントの「場所・体験」データ構造と合わないため不採用。**実装はフェーズ0（Klookアフィリエイトプログラム登録、人力の外部作業）の完了待ち。** 登録完了後、orchestratorでの実装に進む。
