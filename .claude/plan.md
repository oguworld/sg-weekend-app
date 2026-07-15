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
2. **紐付けフロー（半自動、2026-07-12実物確認により具体化）**: Klookアフィリエイトダッシュボードの「製品」検索画面から**都市（シンガポール）でフィルタした商品カタログをCSVで一括エクスポートできる**ことを実機確認した。ライブAPI呼び出しは不要で、このCSVをオフラインでの突き合わせ元データとして使う。

   **実際にエクスポートされたCSVの列構成（確認済み）**:
   ```
   Country Name, City Name, Product Name (Activity name or Hotel name), Product Image,
   Currency, Sell Price, Commission Rate, Instant Confirmation tag, Affiliate Link
   ```
   - `Product Name`は日本語（例: 「ガーデンズバイザベイ チケット（シンガポール）」「ナイトサファリ チケット | マンダイ・ワイルドライフ・リザーブ（シンガポール）」）
   - `Affiliate Link`列には**既に完成した状態のリンクがそのまま入っている**（自分でURLを組み立てる必要はない）。実際の形式:
     ```
     https://affiliate.klook.com/redirect?aid=127020&_currency=SGD&k_site=https%3A%2F%2Fwww.klook.com%2Fja%2Factivity%2F127-gardens-by-the-bay-singapore&aff_label1=test
     ```
     （`affiliate.klook.com/redirect`という専用リダイレクトサービス経由。`k_site`パラメータにURLエンコードされた実際の遷移先、`aff_label1`はエクスポート時に自由に設定できるラベル。前節で確認した「`www.klook.com`URLの末尾に`?aid=`を足すだけ」というシンプルな方式とは別の、より高機能な形式。**どちらも有効だが、カタログエクスポートで得られるこちらの形式をそのまま使うのが最も確実**）
   - `Commission Rate`（商品ごとのコミッション率、0.02〜0.05等バラつきあり）・`Sell Price`・`Instant Confirmation tag`（即時予約可否）も同時に取得できるため、将来的に「即時予約可能なスポットのみボタンを出す」「価格を一緒に表示する」等の拡張にも使える

   **新規スクリプト`scripts/match-affiliate-links.js`（案）の実装方針を確定**:
   - 既存の全コース（`model-courses.json`+`community-courses.json`）からユニークなスポット名を抽出
   - ユーザーが事前にダウンロードしたKlookカタログCSVを読み込む。**2026-07-12、`data/klook-catalog-sg.csv`に238件（全件）を配置済み**（`aff_label1=Odekake Navi`で再エクスポート済み、`data/`はgitignore対象のため非追跡）。実装時はこのファイルをそのまま入力として使ってよい。件数が更新されたら同じパスに上書き配置する運用とする
   - **【2026-07-13マッチング方式を確定】** スポット名（英語表記が多い）とCSVの`Product Name`（日本語）を直接ファジーマッチングするのではなく、**`Affiliate Link`列内の`k_site`パラメータ（URLエンコードされたKlook活動ページURL）をデコードして英語スラッグを抽出し、それをマッチングキーに使う**方式に変更する。例: `k_site=https%3A%2F%2Fwww.klook.com%2Fja%2Factivity%2F127-gardens-by-the-bay-singapore`をデコードすると`.../activity/127-gardens-by-the-bay-singapore`となり、ここから`gardens-by-the-bay-singapore`という英語スラッグが取れる。これを英語スポット名（例:「Gardens by the Bay」）とハイフン区切り・小文字化した上で単語単位の一致度でスコアリングする方が、日本語⇄英語間のローマ字化・カタカナ変換を挟むファジーマッチングより単純かつ確実（実際に5件で検証済み: gardens-by-the-bay-singapore / singapore-night-safari-singapore / singapore-zoo-singapore / skyline-luge-singapore / faber-peak-cable-car-singapore、いずれもスポット名との対応が一目で分かる）。`Product Name`（日本語）は人力確認時の表示用（「これはガーデンズバイザベイのことです」と分かりやすく見せる）として引き続き使う
   - 候補一覧を`--dry-run`でコンソール出力し、人力で確認したもののみ`affiliate-links.json`へ書き込む（既存スクリプト群の慣習に合わせる）
   - `affiliate-links.json`には`Affiliate Link`列の値をそのまま保存する（自前でのURL組み立て・`?aid=`付与処理は不要）
   - 全自動マッチングはしない。スクリプトはあくまで「候補提示・人力確定の支援」に留める（表記ゆれによる誤紐付けリスクのため、方針は変更なし）
   - **【2026-07-13追加】2回目以降の実行はインクリメンタルにする**: スクリプト開始時に既存の`affiliate-links.json`を読み込み、そこに既にキー（スポット名）が存在するスポットはマッチング対象から除外し、確認プロンプトも出さない。新しくコースが追加されて未紐付けのスポットが増えた場合、その差分だけを対象に候補提示・人力確認を行う（毎回全件を確認し直す必要がないようにする）。「既存のリンクを再確認して上書きしたい」場合のための`--force`的な再確認オプションを設けるかは実装フェーズで判断する
   - **`aff_label1`の運用方針（要検討）**: CSVエクスポート時にユーザーが自由に設定できるラベル。今回のテストでは`test`が入っていた。本番運用時は空欄のままか、アプリ識別用の固定値（例: `odekakenavi`）を設定するかは実装時に判断する（Klook側の集計上の区別に使えるのみで、機能的な必須要件ではない）
3. **表示ロジック**: `renderCourseDetail(course)`（および3493行目付近の重複箇所、実装時に要特定）で、各スポット描画時に`affiliate-links.json`の該当エントリを探し、あれば「チケットを予約」ボタンを追加する。ボタンはコース詳細取得時にサーバー側でJOINして返す方式（`GET /api/courses`側でスポットに`affiliateLink`を埋め込んで返す）を推奨（クライアント側で別途fetchする方式より往復が少なく、キャッシュ・オフライン耐性の観点でも有利）
4. **UI（2026-07-12ユーザー決定により変更）**: ボタン形式ではなく、**`course-timeline-meta`（住所表示）に地味なテキストリンクとして併記する**方式に変更。理由: ユーザーより「コース生成とアフィリエイトを結びつけたくない（＝コース内容自体は広告の影響を受けない）」「チケットリンクは広告だと思わせないさりげない見せ方にしたい」という明確な方針が示された。目立つCTAボタン（カラー背景・太字・アイコン）は「広告っぽさ」が強いため不採用とし、既存の`.card-detail-link`（イベントカードの「🔗 元記事を見る」）と同系統の、地味な文字リンクパターンを踏襲する。
   ```html
   <div class="course-timeline-meta">
     ${escapeHtml(s.address || '')}${affiliateLink ? ` · <a onclick="if(!_touchCapableDetected) openAffiliateLink('${affiliateLink}','klook','${safeSpotName}')" style="color:var(--caramel);text-decoration:underline;cursor:pointer;" data-i18n="affiliateInfoLink">チケット情報</a>` : ''}
   </div>
   ```
   - 文言も「チケットを予約」（購入を煽るCTA文言）から「**チケット情報**」（情報提示のみ、購入を煽らない）に変更する
   - ボタンではなく住所と同じ行に埋め込むインラインリンクのため、独立した余白・背景色は持たせない
   - 既存の「onclick属性＋touchendガード」方式（CLAUDE.md記載の`_touchCapableDetected`パターン）を踏襲する
   - Capacitor環境では外部リンクは`Capacitor.Plugins.Browser.open()`経由でデバイスブラウザに渡す既存の仕組み（`a[target="_blank"]`向け）があるため、`window.open()`直呼びではなく同様の分岐が必要（`openAffiliateLink()`内で`_isCapacitorApp`判定）
   - 「PR」バッジ等の明示的な広告表示は行わない（さりげなさを優先する今回の方針のため）。ただしリンク先が外部サイト（Klook）であることは文言・遷移後の画面で自然に分かるため、App Storeガイドライン上の透明性は損なわれないと考えられる
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
- **【2026-07-12検討・不採用】Klookカタログをコース生成AIへの参考ネタとして渡し、生成段階からKlook対応スポットを優先的に含める案**: 紐付けヒット率は上がるが、「スポンサー提供コース」と同種の信頼性リスク（AIのおすすめが実質広告主導になる）があるため、ユーザー判断により不採用。**コース生成ロジック（`generate-model-courses.js`・`POST /api/courses/generate`等）は広告要素と一切結びつけない方針を維持する**。今回のフェーズ1は「生成済みコースに事後的にリンクを添える」表示層の変更のみに徹する
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
   - **【上書き・最終確定】採用する実装方式**: 上記の「`?aid=`を手動で末尾追加する」簡易方式は不採用とし、**1-2節で確認したCSVカタログエクスポートの`Affiliate Link`列（`affiliate.klook.com/redirect?aid=...&k_site=...`形式）をそのまま使う**方式を正式採用する。理由: (1)カタログエクスポートで商品名・画像・価格・コミッション率・即時予約可否も同時に取得でき情報量が多い (2)リンクが既に完成した状態で提供されるため自前でのURL組み立て・エンコード処理が一切不要 (3)`s.klook.com`短縮URL誤用のリスクも構造的に発生しない。詳細な運用フローは1-2節（紐付けフロー）を参照
8. **軽微リスク: `affiliate-links.json`のキーがスポット名の完全一致に依存**: AIコース生成のたびに微妙に異なる表記（例: 「Tekka Centre」と「Tekka Market」）で生成されると、既存のリンク紐付けが引き継がれない可能性がある。運用初期は件数が少なく人力で対応可能だが、コース数が増えた場合は正規化・部分一致等の改善が将来必要になる可能性がある
9. **軽微リスク: クリックログファイルの肥大化**: `_sendDebugLog`基盤に関するCLAUDE.mdの既存注意点（サイズ上限・ローテーションなし）と同様の懸念が新規クリックログファイルにも当てはまる。運用しながら定期確認が必要

## 承認状況
承認済み（2026-07-13）。フェーズ0（Klookアフィリエイトプログラム登録）完了、AID発行済み（127020）、商品カタログCSV全件（238件）取得済み（`data/klook-catalog-sg.csv`）。UI方針はボタンではなく住所行併記の地味なテキストリンク「チケット情報」に確定。マッチングはURLスラッグベース方式に確定。`match-affiliate-links.js`はインクリメンタル実行対応。コース生成AIへの広告バイアスは明確に不採用。フェーズ1の実装（orchestrator）を開始する。他アフィリエイト先（GetYourGuide・楽天トラベル・Shopee）は`provider`フィールドの拡張性を活かした将来候補として保留、Shopeeは不採用。

---

# 設計書23 フェーズ1.5 — 「定番」スタイル限定・コース生成時のKlookスポット組み込み

## 背景・経緯
設計書23フェーズ1（Klookアフィリエイトリンクの後付け表示）は実装済み・稼働中（2026-07-13時点、Web版確認済み、iOS版はTestFlight未反映）。以下の追加相談によりユーザー承認済み（再検討不要）:

1. コース作成条件「こだわり条件」に既存の`style`選択肢（`定番`/`ローカル`/`ニッチ`）があり、`定番`は「王道・安心定番コース」という意味で定義されている
2. `style === '定番'`が選ばれた場合に限り、Klookカタログから該当エリアの商品をAIへの参考候補として渡し、コースの1スポットとして自然に選ばせる案が承認された。「ローカル」「ニッチ」は一切対象外（設計書23で不採用となった「全コースにKlookを混ぜる」案とは異なり、"定番"というコンセプト自体がKlookカタログ＝有名観光地と概念的に合致するため、AIのおすすめが広告主導になる信頼性リスクを限定的にできる、という判断）
3. Klookカタログ（`data/klook-catalog-sg.csv`）にはシンガポール国内のエリア情報がなく（`Country Name`/`City Name`列は全行"Singapore"固定）、コース生成が`CITY_COURSE_AREAS.sg`の6エリア単位で行われるため、地理的に破綻した組み合わせを避けるには一度限りのエリアタグ付けエンリッチメント処理が必要という結論に至った

## 現状確認（実コード、2026-07-13時点）

### コース生成のエリア・スタイルの扱い（`server.js`）
- `POST /api/courses/generate`（1815行目〜）: `resolvedArea = cond.area || area`。**エリアはユーザーがシート上で選択した場合のみ値が入る。未選択の場合は`resolvedArea`が`null`/`undefined`になり、プロンプトの`- エリア: ...`行自体が出現しない**（1924行目 `${resolvedArea ? '\n- エリア: ${resolvedArea}' : ''}`）。つまり「エリア未指定でコース生成」は現行仕様上ごく普通に起こりうるケースであり、フェーズ1.5の設計はこのケースを必ず考慮する必要がある
- `resolvedStyle = cond.style || style`。値は`'定番'`/`'ローカル'`/`'ニッチ'`の3値（または未選択で`null`）。1851〜1857行目の`styleNote`で分岐し、プロンプトに1行追記される形。この`styleNote`変数への追記という同一パターンを、フェーズ1.5のKlook候補注入にも踏襲できる
- `POST /api/courses/candidates`（1721行目〜、Haikuによる3択候補生成）も同様に`resolvedStyle`/`resolvedArea`を持つが、**こちらはタイトル・タグライン・説明のみを生成する軽量フローであり、スポット配列は生成しない**。Klook候補の注入は「フルコース生成」である`/api/courses/generate`側のみに行えばよく、`/api/courses/candidates`は変更不要と判断する
- `scripts/generate-model-courses.js`は`mood`/`pace`ベースの旧世代の条件形式を使っており、現行`style`（定番/ローカル/ニッチ）とは体系が異なる。現在`data/sg/model-courses.json`は空配列で実質未稼働のため、**フェーズ1.5は`server.js`の`POST /api/courses/generate`のみを対象とし、`generate-model-courses.js`は対象外**とする（旧スクリプトへの追随はスコープ外・別タスク）

### コース生成レスポンス構造（`spots`配列）
```json
{
  "time": "09:00",
  "name": "スポット名（英語正式名称）",
  "type": "観光|グルメ|ショッピング|公園|文化",
  "duration": "90分",
  "description": "おすすめポイント",
  "address": "エリア・場所",
  "emoji": "🌿"
}
```
既存フィールドのみ。フェーズ1で追加された`affiliateLink`はAI生成時点では付与されず、`GET /api/courses`のレスポンス時に`embedAffiliateLinks()`（server.js 1648行目）でスポット名の完全一致マッチにより事後的に埋め込まれる方式（`data/sg/affiliate-links.json`をキーにJOIN）。

### `match-affiliate-links.js`のマッチング方式（フェーズ1実装済み、流用可能と確認）
- CSVの`Affiliate Link`列内`k_site`パラメータをデコードしてKlook活動ページURL末尾の英語スラッグを抽出（`extractSlug()`）
- スラッグを`-`区切りの単語配列に変換（`slugToWords()`、先頭の数字ID部分は除去）
- スポット名（英語）も同様に単語配列化（`spotNameToWords()`、ストップワード除去）
- Jaccard風スコアリング（`scoreMatch()`）で上位候補を提示し、人力確認を経て`data/sg/affiliate-links.json`に確定保存
- インクリメンタル実行対応済み（既存キーはスキップ）
- **このスコアリングロジック（`extractSlug`/`slugToWords`/`spotNameToWords`/`scoreMatch`）はフェーズ1.5のエリアタグ付けスクリプトでも流用可能**だが、目的が異なる（フェーズ1=スポット名↔Klook商品のマッチング、フェーズ1.5=Klook商品↔エリア分類）ため、コードの共有は「参考にする」程度に留め、新規スクリプトとして独立させる（後述）

### `fill-genres.js`の実装パターン（参考にした点）
- Haiku、バッチサイズ20件、`--dry-run`フラグ対応
- 対象抽出は「未処理のもののみ」フィルタ（`!Array.isArray(e.genres) || e.genres.length === 0`）→そのままインクリメンタル実行の土台になっている
- プロンプトに選択肢の列挙（ジャンルID一覧）＋JSON配列での一括バッチ回答形式（`{"index":0,"genres":[...]}`）
- バッチごとに`try/catch`し、失敗時は空配列でスキップ（全体を止めない設計）
- 最後に`id`をキーにマージして全件上書き保存

### `CITY_COURSE_AREAS.sg`（`public/app.js` 708〜716行目）
```js
sg: [
  { val: 'Central',     label: '🏙 Central' },
  { val: 'East',        label: '🌅 East' },
  { val: 'West',        label: '🌇 West' },
  { val: 'North',       label: '🌿 North' },
  { val: 'North-East',  label: '🌳 North-East' },
  { val: 'Island-wide', label: '🗺️ Island-wide' },
],
```
6区分。コース生成の`conditions.area`もこの文字列（`'Central'`等）がそのまま送られる。

### CSVカタログの実データ傾向（238件、抜粋確認）
Gardens by the Bay（Central）、Night Safari／Singapore Zoo／River Wonders／Rainforest Wild（Mandai＝North）、Skyline Luge／Cable Car／Sentosa各種（Sentosa）、Marina Bay Sands／ArtScience Museum／National Gallery（Central）等、地理的に判別可能な有名観光地が中心。**Sentosaは設計書24により`CITY_COURSE_AREAS.sg`の7区分目として正式に追加されるため、他区分と対等な独立区分として扱う（後述B節参照、旧妥協案は撤回済み）。**

## 検討した案

### A. エリアタグ付けの粒度・実行方式
1. **CSV全238件を毎回Haikuで判定**（キャッシュなし）: 実行コスト・API課金が生成のたびに発生し無駄。不採用
2. **一度だけバッチ処理してJSONにキャッシュ、以降は差分のみ処理**（`fill-genres.js`踏襲、推奨）: 初回のみコストがかかり、以降のコース生成時は読み込むだけで済む
3. **商品名のキーワードルールベースで機械的に分類**（Haiku不使用、正規表現等）: 「Mandai」「Sentosa」等の地名キーワードが商品名に含まれる場合は高精度だが、含まれない商品（例: "Kayak, Stand Up Paddleboard at Ola Beach Club"）の判別ができない。実際にCSVを確認したところ地名を含まない商品名が一定数あり、ルールベース単独では網羅できないと判断

**採用: 案2**。ただし前処理として案3のキーワードルール（Mandai→North、Sentosa→South相当、Marina Bay/Orchard/CBD→Central等）で機械的に確定できるものは先に処理し、判別できない残りのみHaikuに投げるハイブリッド方式にすることで、API呼び出し件数とコストを削減できる（実装フェーズでの最適化判断に委ねる。必須要件ではない）。

### B. Sentosaエリアの扱い（2026-07-13 設計書24により方針転換）
当初は`CITY_COURSE_AREAS.sg`の6区分に「Sentosa」に直接対応する値がないことを前提に、West/Island-wideへの混入という内部分類ラベル案（旧案3）を採用していた。しかし設計書24の検討により、Sentosaは地理的にも体験的にも独立した「行き先」であり、既存イベントデータの実態確認でも既存6区分への混入が不自然だったことが判明したため、**`CITY_COURSE_AREAS.sg`に`Sentosa`を本物の7つ目の区分として追加することをユーザーと合意した（設計書24）**。

これに伴いフェーズ1.5の設計もシンプルになる: SentosaはWest/Island-wideとは独立した1エリアとして扱い、`resolvedArea === 'Sentosa'`のときのみSentosa分類のKlook候補を候補プールに含める。他エリア（West/Island-wide含む）への混入マッピングは不要になり、以降本節に記載していたマッピングルールは撤回する。

### C. AIへのKlook候補の渡し方
1. **候補リスト全件（該当エリアの全商品）をプロンプトに列挙**: 該当エリアに商品が多い場合（例: Central）プロンプトが肥大化し、トークンコスト・レイテンシが増える
2. **上位N件（例: 5〜8件）に絞って提示**: プロンプト肥大化を防ぎつつ選択の余地を残す

**採用: 案2（上位N件、Nは実装時に5前後で調整）**。エリアが未選択の場合（`resolvedArea`が`null`）は、全エリア横断でランダムまたは著名度順に上位N件を提示する（後述リスク欄で扱う未解決事項）。

### D. AIが選んだ場合のaffiliateLink付与タイミング
1. **生成時点でサーバー側が直接`affiliateLink`をスポットデータに埋め込む**（プロンプトに候補として渡したURLを、AIが採用したスポット名と突き合わせてその場で埋め込む）
2. **生成後は何もせず、既存のフェーズ1マッチング処理（`GET /api/courses`の`embedAffiliateLinks()`によるスポット名の完全一致JOIN）に委ねる**
3. **ハイブリッド: 生成直後にサーバー側で「渡した候補と生成されたスポット名」を突き合わせ、一致度が高ければ`affiliate-links.json`への自動登録を提案（人力確認は省略しない）**

**比較**:
- 案1は「AIが確実にカタログの商品名をそのまま使う」という前提に依存する。実際にはプロンプト内で英語正式名称を使うよう既存ルール（`"スポット名（必ず英語の正式名称で...）"`）があるため一致しやすいと想定されるが、AIが微妙に表記を変える可能性（例: "Gardens by the Bay Ticket" → "Gardens by the Bay"のようにサフィックスを落とす）は残る。誤って別の商品のURLを埋め込むリスクもゼロではない
- 案2は既存のフェーズ1インフラ（`embedAffiliateLinks()`のスポット名完全一致）にそのまま乗る。**ただし現状の`match-affiliate-links.js`は「既存コースのスポット名」を対象にする設計であり、新規生成されたコースのスポットが自動的に拾われるには次回のスクリプト手動実行を待つ必要がある**（運用上のタイムラグが生じる。設計書23フェーズ1の運用実態＝手動実行ベースとも整合する）
- 案3は誤登録防止と即時性のバランスを取るが、「生成直後にサーバー側で自動登録」は`match-affiliate-links.js`が前提とする人力確認フローの原則（表記ゆれによる誤紐付けリスクのため常に人力確定を挟む、設計書23で明記済み）と矛盾する

**採用: 案2をベースに、生成直後の一致判定のみ即時反映する軽量な折衷案（案2＋部分的な案1）**。具体的には:
- AIへのプロンプトでは「Klook候補として渡した商品の`Product Name`（英語表記済みのものを渡す想定）」を**スポット名の参考例としてそのまま使うよう明示的に指示**する（プロンプト内で「以下の候補から選ぶ場合は名称を変更しないこと」という指示を追加する設計。既存の「スポット名は英語正式名称で」という指示と自然に整合する）
- 生成直後、サーバー側で「今回渡したKlook候補リスト」と「実際に生成された`spots[].name`」を**完全一致（またはごく単純な正規化: 前後空白除去・大文字小文字無視程度）で突き合わせ**、一致したスポットには生成レスポンスの時点で`affiliateLink`を直接埋め込む（案1相当だが、渡した候補との照合という限定条件がある分、誤爆リスクは低い）
- この即時埋め込みとは**別に**、`match-affiliate-links.js`による定期的な半自動マッチングも従来通り継続する（新規スポット名がカタログ内の別商品と一致するケースを拾うため、両者は排他ではなく併用）
- 完全一致しない場合（AIが表記を変えた場合）は何も埋め込まず、次回`match-affiliate-links.js`実行時の人力確認フローに委ねる（フォールバックとして機能）

この折衷案は「ローカル/ニッチスタイルには一切コードパスが触れない」設計（後述）とも矛盾しない。あくまで`style === '定番'`の生成処理内で完結する追加ロジックである。

## 推奨案（全体設計）

### 1. エリアタグ付けエンリッチメント処理

**新規スクリプト**: `scripts/enrich-klook-areas.js`

- 入力: `data/klook-catalog-sg.csv`（既存、238件）
- 出力: `data/klook-catalog-sg-areas.json`（新規）
  ```json
  {
    "127-gardens-by-the-bay-singapore": {
      "productName": "Gardens by the Bay Ticket",
      "area": "Central",
      "updatedAt": "2026-07-13T00:00:00.000Z"
    },
    "3928-singapore-night-safari-singapore": {
      "productName": "Night Safari Ticket | Mandai Wildlife Reserve, Singapore",
      "area": "North",
      "updatedAt": "2026-07-13T00:00:00.000Z"
    }
  }
  ```
  - **キーは`match-affiliate-links.js`と同じ`extractSlug()`ロジックで抽出したスラッグ**（商品名ではなくスラッグをキーにする）。理由: CSVの`Product Name`列は表記ゆれ・重複の可能性がある一方、スラッグはKlook側の商品IDを含み一意性が高く、`match-affiliate-links.js`が既に確立した抽出ロジックと完全に同じキー体系を使うことで、将来的にこの2つのJSONファイル（`affiliate-links.json`はスポット名キー、`klook-catalog-sg-areas.json`はスラッグキー）を`Affiliate Link`列経由で相互参照しやすくなる
  - `area`の値は設計書24で7区分化された`CITY_COURSE_AREAS.sg`の値（`Central`/`East`/`West`/`North`/`North-East`/`Island-wide`/`Sentosa`）のいずれか（Sentosaも他区分と対等な正式な選択肢であり「内部分類ラベル」という特別扱いではない）
- 処理方式: `fill-genres.js`を参考にしたHaikuバッチ処理（バッチサイズ20件程度）。プロンプトに7エリアの定義と代表エリアの例（Mandai地区→North、Sentosa島→Sentosa、Marina Bay/Orchard/CBD→Central等）を明記し、商品名から分類させる
- **インクリメンタル設計**: スクリプト開始時に既存の`klook-catalog-sg-areas.json`を読み込み、スラッグが既に存在する商品はスキップ。CSVが更新されて新商品が追加された場合のみ、その差分だけをHaikuに送る（`fill-genres.js`の「`genres`未設定のみ対象」パターンを踏襲）
- 実行方法: `node scripts/enrich-klook-areas.js [--dry-run]`（一度だけ実行する運用想定。CSVを再エクスポート・上書きした場合に再実行）
- **`--dry-run`でコンソールに分類結果一覧を出力し、目視確認してから本実行する運用**（`fill-genres.js`と同様、Haiku分類なので誤判定の可能性がある。特にSentosa/Central境界のような曖昧な商品は人力チェックが有効）

### 2. コース生成プロンプトへの組み込み（`server.js`の`POST /api/courses/generate`のみ対象）

#### 2-1. 変更箇所の限定（最重要方針）
既存の`styleNote`分岐（1851〜1857行目）の**すぐ後**に、`resolvedStyle === '定番'`の場合のみ実行される新規ブロックを追加する。**`resolvedStyle`が`'ローカル'`または`'ニッチ'`または未選択の場合、新規コードパスは一切実行されない**ことをコード構造上明確にする（`if (resolvedStyle === '定番') { ... }`という単一のガード節の中に処理を閉じ込め、既存の`styleNote`三項演算子チェーンとは独立した変数・独立したプロンプト差し込み文字列として実装する。既存の`styleNote`自体の文言・分岐は一切変更しない）。

#### 2-2. Klook候補抽出ロジック（新規、`server.js`内関数）
```
function getKlookCandidatesForArea(resolvedArea, limit = 5) {
  // klook-catalog-sg-areas.json + affiliate-links.json 相当のデータを読み込み
  // resolvedArea に完全一致する商品を上位N件返す（Sentosaも他区分と同じ完全一致ロジック、特別扱いなし）
  // resolvedArea が null の場合は全エリアから上位N件（著名度順 or ランダム）を返す
}
```
- データソースは新規`data/klook-catalog-sg-areas.json`（エリア情報）と、既存`data/klook-catalog-sg.csv`または`data/sg/affiliate-links.json`（商品名・URL）を組み合わせる。**具体的にどちらのファイルから商品名・URLを取得するかは実装時に確定**（CSVを都度パースするか、`enrich-klook-areas.js`の出力に`productName`を持たせて自己完結させるか。上記データモデル例では`productName`を含めているため、実装時はこの1ファイルのみで完結させる方式を推奨）

#### 2-3. プロンプトへの差し込み文言（案）
```
【定番スタイル: Klook予約可能スポットの参考候補】
以下は今回のエリアで、外国人観光客・駐在員に人気の定番アクティビティです。
コースの1スポットとして自然に組み込める場合は、名称を変更せずそのまま採用してください（無理に入れる必要はありません。コース全体のテーマに合わなければ使わなくてよい）。
- Gardens by the Bay Ticket
- Marina Bay Sands Skypark Observation Deck Ticket
...(上位5件)
```
- **「無理に入れる必要はない」という一文を必ず含める**（Klook候補が地理的・テーマ的に不自然な場合まで強制的に組み込ませないため。設計書23フェーズ1で確立した「AIのおすすめが広告主導にならない」という信頼性方針を踏襲するため必須の文言）
- この差し込みブロックは`resolvedStyle === '定番'`の場合のみ`prompt`テンプレート文字列に連結される。`'ローカル'`/`'ニッチ'`/未選択時は空文字列（何も連結されない）

#### 2-4. 生成直後の即時マッチング（前述D案の折衷案）
- `POST /api/courses/generate`のレスポンス構築処理（1957〜2034行目付近）に、`resolvedStyle === '定番'`かつ今回Klook候補を渡した場合のみ実行される後処理を追加
- `course.spots[].name`と、プロンプトに渡した候補リストの`productName`を単純比較（trim + 大文字小文字無視）
- 一致した場合、該当スポットに`affiliateLink`フィールドを直接埋め込む（値は候補データが持つ`Affiliate Link`のURL）
- 一致しない場合は何もしない（`match-affiliate-links.js`の次回実行に委ねる）

### 3. `match-affiliate-links.js`との関係
- 既存の`match-affiliate-links.js`は無変更（フェーズ1のインクリメンタル半自動フローはそのまま継続運用）
- フェーズ1.5の即時マッチング（2-4）は、`match-affiliate-links.js`の役割を代替するものではなく、**「AIが候補をそのまま採用した明白なケースのみ」を対象にした限定的な即時反映**という位置づけ。それ以外の表記ゆれケースは引き続き人力確認フローに委ねる

## 変更するファイル一覧

### 新規
- `data/klook-catalog-sg-areas.json`（エリアタグ付け結果のキャッシュ、スラッグキー）
- `scripts/enrich-klook-areas.js`（エリアタグ付けエンリッチメントスクリプト、インクリメンタル対応、`--dry-run`対応）

### 変更
- `server.js`:
  - 新規関数`getKlookCandidatesForArea(resolvedArea, limit)`追加
  - `POST /api/courses/generate`内、`resolvedStyle === '定番'`の場合のみ実行される新規ガード節を追加（プロンプト差し込み＋生成直後の即時マッチング）
  - **`'ローカル'`/`'ニッチ'`分岐・既存`styleNote`変数・既存プロンプトテンプレートの他の部分は一切変更しない**
- 変更なし（明示）: `public/app.js`（フロントエンドの表示ロジックはフェーズ1の`renderCourseDetail`/`renderCourseResultHtml`の仕組みをそのまま使う。`affiliateLink`フィールドが生成時点で既に付与されているスポットも、フェーズ1で実装済みの「チケット情報」テキストリンク表示ロジックがそのまま機能するため、フロントエンド側の変更は不要と想定される）
- 変更なし: `public/index.html`・`public/sw.js`（サーバーサイドのみの変更のため、キャッシュバスティングは今回不要。ただし実装フェーズで表示側に軽微な調整が必要になった場合はこの限りではない）
- 変更なし: `scripts/match-affiliate-links.js`、`scripts/generate-model-courses.js`（対象外）

## データモデルの変更
- 新規ファイル`data/klook-catalog-sg-areas.json`の追加のみ。既存ファイル（`events.json`・`model-courses.json`・`community-courses.json`・`affiliate-links.json`）の構造変更なし
- `POST /api/courses/generate`のレスポンス（`spots[]`）に、`style === '定番'`かつ即時マッチング成立時のみ`affiliateLink`フィールドが追加される場合がある。これは既存フェーズ1で`GET /api/courses`のレスポンスに対して行われている拡張と**同じフィールド名・同じ意味**であり、後方互換性の考え方も同一（未知フィールドとして無視される）

## APIの変更
- `POST /api/courses/generate`のリクエスト構造: 変更なし（既存の`conditions.style`をそのまま読むだけ）
- `POST /api/courses/generate`のレスポンス構造: 拡張のみ（`style === '定番'`時、条件が揃えば`spots[].affiliateLink`が追加される場合がある）。非破壊的追加のため後方互換
- `POST /api/courses/candidates`: 変更なし
- `GET /api/courses`: 変更なし（既存の`embedAffiliateLinks()`が引き続き機能。生成時点で既に`affiliateLink`が付与されているスポットも、`community-courses.json`に保存された後は同じ仕組みで読み出される）

## フロントエンドの変更
- 想定上は変更不要（前述の通り）。ただし実装フェーズで以下を確認すること:
  - コース生成直後のプレビュー画面（`renderCourseResultHtml`、`public/app.js` 3509行目〜）で、生成直後に`affiliateLink`が付与されたスポットに「チケット情報」リンクが正しく表示されるか（フェーズ1で該当箇所に実装済みのはずだが、生成直後フローでの表示は未検証のため確認が必要）
  - 新規UI文字列は今回発生しない想定（既存の`affiliateInfoLink`キーをそのまま使うため）。万一新規文言が必要になった場合はi18nルール（`STRINGS.ja`/`STRINGS.en`同時追加）に従うこと

## ⚠️ データ共有（Web版/App Store版）への影響（CLAUDE.md必須確認事項）

1. **後方互換性**:
   - `POST /api/courses/generate`のレスポンスへの`spots[].affiliateLink`拡張は非破壊的追加のみ。旧App Store版アプリはこの新規フィールドを単に無視する（フェーズ1で確立済みの考え方をそのまま踏襲）
   - リクエスト構造は変更しないため、旧App Store版が送るリクエストにも影響なし
2. **影響範囲**:
   - `server.js`の変更は**Web版・App Store版の両方に即座に影響する**（データ層共有のため）。ただし新規追加ロジックは`style === '定番'`かつコース新規生成時のみ発火するため、影響範囲は限定的
   - 新規ファイル`data/klook-catalog-sg-areas.json`はサーバーローカルの参照データであり、クライアントに直接配信されない（`GET /api/courses`等のレスポンスには含まれない）ため、旧App Store版への影響はゼロ
   - フロントエンド変更が不要と想定される（想定通りなら）App Store版への新規TestFlightビルド・審査は不要
3. **リリースタイミング**:
   - サーバーサイドのみの変更（想定通りフロントエンド変更が不要な場合）は、非破壊的追加のためWeb版先行デプロイで問題なく、`pm2 restart`のみで即時Web版・App Store版両方に反映される
   - **エンリッチメントスクリプト（`enrich-klook-areas.js`）の実行はデプロイ作業とは独立した一度限りの人力オペレーション**。実行タイミングはコード配置後、`POST /api/courses/generate`の変更を有効化する前に済ませておく必要がある（`data/klook-catalog-sg-areas.json`が存在しない状態でも`getKlookCandidatesForArea()`が例外を投げずフォールバック動作する設計にすること、下記受け入れ基準参照）

## 受け入れ基準

### 正常系
1. `conditions.style === '定番'`かつ`conditions.area`が`CITY_COURSE_AREAS.sg`の7値（Sentosa含む）いずれかで指定されている状態でコース生成すると、該当エリアのKlook候補がプロンプトに含まれる
2. AIが渡された候補の商品名をそのまま採用した場合、生成レスポンスの該当スポットに`affiliateLink`が即時付与される
3. AIが候補を採用しなかった場合（コーステーマに合わないと判断した場合）でもコース生成自体は正常に完了する（強制組み込みではない）
4. `node scripts/enrich-klook-areas.js`を実行すると、`data/klook-catalog-sg-areas.json`が生成され、238件（CSV件数）すべてに`area`が付与される
5. `enrich-klook-areas.js`を再実行した場合、CSVに変更がなければ処理対象0件で即座に終了する（インクリメンタル動作）

### 失敗系・エッジケース
6. `conditions.area`が未指定（null）の状態で`style === '定番'`が選ばれた場合でもコース生成はエラーなく完了する（エリア横断の候補提示、または候補提示自体をスキップするフォールバックのいずれかで対応。実装時にどちらを採るか確定すること、後述リスク欄）
7. `data/klook-catalog-sg-areas.json`が存在しない場合（`enrich-klook-areas.js`未実行の状態）でも、`POST /api/courses/generate`はエラーを起こさず、Klook候補なしの従来通りの生成を行う（フェーズ1の`loadAffiliateLinks()`と同様、ファイル未存在時は空扱いで握りつぶすフェイルセーフ設計とする）
8. `conditions.style`が`'ローカル'`または`'ニッチ'`の場合、Klook候補抽出関数`getKlookCandidatesForArea()`が一切呼ばれないこと（コード上のガード節の外側にあるため呼びようがない構造だが、実装レビューで明示的に確認する）
9. `conditions.style`が未選択（null）の場合も同様にKlook候補が一切登場しないこと
10. `enrich-klook-areas.js`実行中にHaiku APIが一部バッチで失敗しても、他のバッチの処理は継続し、失敗分は次回実行時に再試行対象として残る（`fill-genres.js`の「バッチごとのtry/catch」パターンを踏襲）
11. Sentosa関連商品は`area: 'Sentosa'`のコース生成でのみ候補プールに入り、他6区分（`'Central'`/`'East'`/`'West'`/`'North'`/`'North-East'`/`'Island-wide'`）のコース生成には混入しないこと（設計書24によりSentosaは他区分と対等な完全一致判定のため、混入防止は自動的に満たされる）

### 共通
12. 旧バージョンのApp Storeアプリが、サーバー変更後も一切のクラッシュ・表示崩れなく従来通り動作し続ける
13. Web版・App Store版どちらでも既存のコース生成・閲覧機能（`定番`以外のスタイル含む）に回帰がない

## ⚠️ checker向け重点確認観点（「ローカル」「ニッチ」への非影響保証）

builderの実装完了後、checkerは特に以下を重点的に確認すること:

1. **`grep`等で`getKlookCandidatesForArea`の呼び出し箇所を洗い出し、それが`if (resolvedStyle === '定番')`（またはそれと同義の単一条件）の内側にのみ存在することをコードレビューで直接確認する**（実行してみて偶然通らなかった、ではなく、コード構造として物理的に到達不可能であることを確認する）
2. `resolvedStyle`の三項演算子チェーン（既存の`styleNote`生成部分）自体の文言・分岐ロジックが一切変更されていないことを`git diff`で確認する（"ローカル"/"ニッチ"のプロンプト文言に1文字の差分もないこと）
3. `conditions.style = 'ローカル'`および`'ニッチ'`を指定した実際のコース生成リクエストを最低1回ずつ試行し、レスポンスの`spots[]`に`affiliateLink`フィールドが（フェーズ1の事後マッチング経由以外で）一切含まれていないことを確認する
4. `conditions.style`未指定（デフォルト動作）でも同様にKlook候補が混入しないことを確認する
5. 新規追加コード（Klook候補抽出・プロンプト差し込み・即時マッチング）が、既存の`resolvedPurpose`/`resolvedOccasion`/`resolvedFood`/`resolvedTransport`等、他の条件分岐処理に一切触れていない（変数名の衝突・意図しない上書きがない）ことを確認する

## スコープ外（今回作らないもの）
- `scripts/generate-model-courses.js`（旧世代の条件体系、`model-courses.json`は現状空配列で実質未稼働）への対応
- `POST /api/courses/candidates`（Haikuによる3択候補生成）へのKlook候補注入。スポット配列を持たないため対象外
- BKK/SYD都市への対応（現在両都市は一時停止中）
- Klookカタログの継続的な自動更新（CSVの再エクスポート自体は引き続き人力オペレーション。フェーズ1と同様）
- エリアタグの精度検証・修正のための管理画面やCLI編集ツール（誤判定が見つかった場合は`data/klook-catalog-sg-areas.json`を直接編集する運用とする）
- `定番`スタイル以外のスタイルへのKlook要素拡大（将来的な拡大があっても本設計書のスコープには含まれない。改めてユーザー判断・別設計が必要）
- Klook候補の「AIが実際に採用したかどうか」の集計・分析（採用率のモニタリング等は将来課題）
- 生成後の即時マッチングが失敗した場合の自動リトライ・自動修正（`match-affiliate-links.js`の次回実行に委ねるフォールバックのみ）

## リスク・未解決の質問

1. **【未解決・実装時要判断】`conditions.area`未指定時のKlook候補提示方針**: エリア指定なしで`定番`スタイルが選ばれた場合、(a)全エリア横断で上位N件を提示する、(b)候補提示自体をスキップする（エリア不明な状態でKlook候補を混ぜるとAIが地理的に不整合なコースを作るリスクがあるため）、のどちらを採るか未確定。設計時点では(b)の方が安全側に倒せると考えられるが、実装フェーズで判断すること
2. ~~【解決済み】Sentosaのエリアマッピングルールの妥当性~~: 設計書24によりSentosaは他区分と対等な独立区分になったため、この懸念（West/Island-wideへの混入による地理的不整合リスク）は解消された。
3. **【未解決】Haikuによるエリア分類の精度**: 商品名だけから正確なエリア判定ができない商品（地名を含まない体験系商品等）が一定数存在すると想定される。`enrich-klook-areas.js`の`--dry-run`結果を人力で全件チェックすることが望ましいが、238件を人力で全チェックする運用コストは軽くない。誤判定の許容度（どの程度なら許容するか）は未確定
4. **【未解決】即時マッチングの一致率**: AIが「候補の商品名をそのまま使う」指示にどれだけ忠実に従うかは実装・運用してみないと分からない。一致率が低い場合、即時マッチングの価値が薄く、結局`match-affiliate-links.js`の定期実行頼みになる可能性がある（それ自体は許容範囲だが、期待値としては認識しておくべき）
5. **【未解決】プロンプト肥大化によるコース生成品質への影響**: Klook候補ブロックの追加により`定番`スタイルのプロンプトが長くなる。既存の生成品質（他の条件との整合性チェック含む、1970〜2010行目の乖離チェックロジック）に悪影響がないか、実装後に複数回のコース生成で品質確認が必要
6. **軽微リスク: `data/klook-catalog-sg-areas.json`のメンテナンス漏れ**: CSV（`data/klook-catalog-sg.csv`）が将来再エクスポートされて件数・内容が更新された場合、`enrich-klook-areas.js`の再実行を忘れると新商品にエリアタグが付かず候補プールから漏れ続ける。運用上の注意点として記録するのみで、自動化の対象外（スコープ外に明記済み）
7. **軽微リスク: `Product Name`が英語表記ではない商品が混在する可能性**: 2026-07-12時点で確認したCSVは英語版に差し替え済みとのことだが、仮に一部商品名が日本語のまま残っている場合、プロンプト内でAIに「英語正式名称のまま使う」よう指示しても不整合が起きる可能性がある。実装時にCSV全件が英語表記であることを再確認すること

## 承認状況
未承認（今回新規作成、ユーザー承認待ち）

---

# 設計書24 — シンガポールのエリア区分に「Sentosa」を追加

## 背景・経緯
設計書23フェーズ1.5（未承認）を設計中、Klookカタログ（Sentosa関連商品多数）のエリア分類方法で議論になった。当初案は「Sentosaを内部ラベルとしてWest/Island-wide両方の候補プールに混入させる」という妥協案（フェーズ1.5「B. Sentosaエリアの扱い」節、採用案3）だったが、以下の理由により方針転換し、**Sentosaを本物の7つ目のエリア区分として追加する**ことがユーザーと合意済み（再検討不要）。

- 実データ確認（後述d節、98件全件レビュー）により、既存のSentosa関連イベント5件が、本来Sentosaという独立区分があるべきところを既存6区分に無理やり押し込めている状態だと確認できた
- Sentosaは地理的にも体験的にも独立した「行き先」（ケーブルカー・モノレールで渡る）であり、「西部に行く」ではなく「セントーサに行く」という認識が実態に近い
- ユニバーサル・スタジオ、S.E.A.アクアリウム、ビーチ、ケーブルカー等、Sentosaだけで1コース分埋まるほど濃いエリアであり、独立区分として扱う価値がある

この設計書は上記の背景に基づき、影響範囲全体（コース作成画面・イベント絞り込み・イベント取り込みパイプライン・既存データ）を洗い出し、対応スコープを明示する。

## 現状確認（実コード、2026-07-13時点）

### a. コース作成画面のエリアチップ（対象確実）
- `public/app.js` 708〜716行目 `CITY_COURSE_AREAS.sg`（6値、`{val, label}`の配列）
- `public/index.html` 538行目 `#course-area-chips`（空のコンテナ、JSで動的生成）
- 生成箇所: `public/app.js` 3227〜3233行目（都市切替時に`CITY_COURSE_AREAS[city]`から`.course-chip`ボタンをinnerHTMLで動的生成）
- `label`文字列（`'🏙 Central'`等）はJSリテラル直書きで`data-i18n`属性を使わない。ja/en共通の英語固有名詞として扱われている既存パターン（i18n分岐不要）

### b. イベント絞り込みシートのエリアチップ（別実装、独立）
- `public/index.html` 926〜937行目、`#event-filter-sheet`内。**HTMLに直接ハードコードされた6つの`.ef-chip`ボタン**（`data-key="area" data-val="Central"`等）。`CITY_COURSE_AREAS`とは完全に独立した別実装で、片方を変更してももう片方には自動反映されない
- 対応する絞り込みロジック: `public/app.js` 989行目`filterAreas`（Set）、1375行目`toggleEfChip()`、1484行目`areaMatch = filterAreas.size === 0 || filterAreas.has(e.area)`
- 都市別出し分けは無い（SG固定のハードコード）。CLAUDE.mdの都市対応状況通り現在BKK/SYDは停止中でUI上SGのみ露出するため実害はないが、コード構造上は「SG専用チップがハードコードされている」状態である点に留意

### c. イベント取り込みパイプラインのエリア判定
- `scripts/filter-events.js` 16〜17行目 `CITY_AREAS.sg = '"Central"/"East"/"West"/"North"/"North-East"/"Island-wide"'`（AIプロンプトへの埋め込み文字列）
- 166行目 `- area: ${cityAreas}` としてAI（Claude API）への分類指示プロンプトに直接連結される。**AIが記事本文からこの列挙値の中の1つを選んで`area`フィールドを返す方式**であり、他に別のエリア判定ロジック（ルールベース等）は存在しない
- 437行目 `defaultArea = cityKey === 'bkk' ? 'Sukhumvit' : cityKey === 'syd' ? 'CBD' : 'Central'`：AIが`area`を返さなかった場合のフォールバック値（SGは`'Central'`固定）。Sentosa追加後もこのフォールバック挙動は変更不要（Sentosaはあくまで選択肢の1つであり、デフォルトにする理由がない）
- **結論: `CITY_AREAS.sg`にSentosaを追加しない限り、今後新規に取り込まれるSentosa関連記事も引き続きCentral/West/Island-wide等に誤分類され続ける。** ユーザー要望を満たすには、この一覧値への追加が必須

### d. 既存データの実態（`data/sg/events.json`、98件**全件レビュー実施**、2026-07-13）
ユーザー指摘を受け、当初の「`Sentosa`という単語を含む3件」だけでなく、**98件全件を対象に、店名(`store`)・本文(`content`/`content_en`)・URL・エリア以外の全フィールドを横断してレビューした**。手順は (1) 全フィールドを文字列化して`sentosa`（大文字小文字無視）を含むレコードの機械的抽出、(2) 明示的に「Sentosa」と書かれていないがSentosa島内の著名施設名（Universal Studios Singapore／S.E.A. Aquarium・Singapore Oceanarium／Adventure Cove Waterpark／Skyline Luge／Wings of Time／Madame Tussauds／Palawan Beach／Siloso Beach／Tanjong Beach／Cable Car／iFly Singapore等）が店名・本文に含まれる98件全件の目視レビュー、の2段階。

- `area`フィールド値の分布（修正前）: `West:6, North:2, Central:50, Island-wide:32, East:6, North-East:2`（Sentosaは0件、既存6区分に混入済み）
- レビューの結果、**Sentosa関連イベントは3件ではなく5件**と判明:
  | store | area（現状） | 判定根拠 | url |
  |---|---|---|---|
  | Sentosa GrillFest 2026 | `Island-wide` | 店名に"Sentosa"明記 | eatbook.sg/sentosa-grillfest-2026 |
  | Resorts World Sentosa（ドリアンフェス） | `West` | 店名に"Sentosa"明記 | eatbook.sg/rws-durian-festival |
  | Sentosa Island（ディズニークルーズコラボ） | `Island-wide` | 店名に"Sentosa"明記 | instagram.com/@sentosa_island |
  | Adventure Cove Waterpark | `Island-wide` | **新規発見**。Sentosa島内の施設だが店名に"Sentosa"を含まないため機械的抽出のみでは漏れていた。地理的知識に基づく目視レビューで発見 | thenewageparents.com/adventure-cove-park-halloween |
  | Singapore Oceanarium - Into the Glowcean | `Island-wide` | **新規発見**。Resorts World Sentosa内の施設（旧S.E.A. Aquariumの後継、2025年改称）。本文にも"Sentosa"の記載なし、店名からも判別不能で、地理的知識に基づく目視レビューでのみ発見できた | thenewageparents.com/singapore-oceanarium-halloween |
- いずれも`location`フィールドも`area`と同一値（`location`は別フィールドだが今回のSGデータでは`area`と同期して埋まっている）
- **教訓**: 単純な文字列検索（"Sentosa"を含むか）だけでは98件中2件（Adventure Cove Waterpark、Singapore Oceanarium）を見逃していた。今回のような地理的分類の遡及修正では、キーワード抽出に加えて既知のランドマーク名リストでの照合・目視レビューが必要になる

### e. 未使用の死んだコード（対象外・参考情報）
- `public/app.js` 2369行目 `const AREAS = ['Central', 'East', 'West', 'North', 'North-East'];`（`Island-wide`すら含まれない不完全な定数）。コードベース全体を`grep`したが**この定数を参照する呼び出し箇所は他に一切存在しない**（宣言のみで未使用）。今回のSentosa追加の対象外とする。将来誰かがこの定数を使い始めた場合に混乱を招く可能性はあるが、今回のスコープでは触らない（別問題として記録のみ）

## 検討したスコープ範囲（a〜d）と判断

### a. `CITY_COURSE_AREAS.sg`にSentosa追加 → **対象に含める（確実）**
ユーザーの元々の要望（コース作成画面でSentosaを選べるようにする）そのもの。

### b. イベント絞り込みシート（`.ef-chip`）にもSentosa追加 → **対象に含める（推奨）**
理由:
- コース作成画面だけSentosaが選べて、イベント絞り込みでは選べないという状態は、UI一貫性の観点から不自然かつユーザー体験として分かりにくい
- 既存のSentosa関連イベント5件（後述d節、98件全件レビューで判明）を今回`area:'Sentosa'`に修正する場合、イベント絞り込み側にSentosaチップが無いと**そのイベントをエリア軸で絞り込む手段が一切なくなる**（`filterAreas.has(e.area)`は完全一致判定のため、選択肢にない値のイベントは絞り込み対象からアクセス不能になる。ただし「エリア未選択＝すべて」がデフォルトなので一覧そのものから消えるわけではない）
- 実装コストは小さい（6行のHTML追加のみ、JSロジック変更不要）

### c. イベント取り込みパイプライン（`CITY_AREAS.sg`）にSentosa追加 → **対象に含める（推奨）**
理由:
- ユーザーが要望として明示している（今後取り込まれる新規イベントがSentosaのものであれば正しく`area:'Sentosa'`と判定されるようにする）
- a・bだけ対応してcを対応しない場合、「エリア区分としてSentosaはUI上存在するが、新規イベントは永遠にSentosaに分類されない」という中途半端な状態になり、b区分を追加した意味が薄れる
- 実装コストが小さい（プロンプト内の列挙文字列1行の変更のみ）

### d. 既存イベント全件レビュー＋該当5件の遡及的修正 → **対象に含める（人力・慎重に、少量修正として許容範囲と判断）**
ユーザー指摘により、当初「Sentosaという単語を含む3件のみ」としていたスコープを「`data/sg/events.json`98件全件のレビュー」に拡大した（実施済み、上記d節参照）。結果、機械的なキーワード抽出だけでは見逃していた2件（Adventure Cove Waterpark、Singapore Oceanarium）を含む**合計5件**が対象と判明した。

判断根拠:
- CLAUDE.mdの禁止事項は「イベントデータを**大量**削除・破壊的に更新する」こと。今回は5件のみの`area`フィールド値の書き換えであり、削除でも大量更新でもない
- `area`フィールドの意味論的訂正であり、他のフィールド（`title`/`content`/`url`等）や件数には一切影響しない
- 実施しない場合、区分を新設したにもかかわらず初期状態でSentosaに紐づくイベントが0件のままになり、機能追加の効果が体感できない（「Sentosaを選んでも何も出ない」という一見バグに見える状態が本番リリース直後に発生する）
- 全件レビューを見送り3件のみ修正した場合、Adventure Cove WaterparkとSingapore Oceanarium（いずれもSentosa島内の主要施設）が`Island-wide`のまま取り残され、「Sentosaを選んでもユニバーサル系の目玉施設が出てこない」という中途半端な状態になっていた
- **実施方法は`node`スクリプトによる一括置換ではなく、対象5件のみを個別に手動編集する**（大量差分コミットを避け、diffレビューを容易にするため）。バックアップ（`events.json`のコピー）を編集前に取得することを推奨
- **注意**: この5件はWeb版・App Store版共有データのため、修正時点で両環境に即座に反映される

## 設計書23フェーズ1.5への差分修正指示

今回の変更（Sentosaが本物のエリア区分になる）により、フェーズ1.5「B. Sentosaエリアの扱い」節の妥協案（内部分類ラベルとして混入させる案3採用）は不要になる。以下の通り**該当箇所を単純化した内容に書き換える**こと（実施済み、下記参照）。

## i18n・UIスタイル規約の確認

- **ラベル文言**: `Sentosa`は固有名詞であり、既存の`Central`/`East`/`West`等と同様に英語のまま日本語UIでも通用する
- 絵文字案: 🏖（ビーチ）を推奨。既存6区分の絵文字パターン（🏙/🌅/🌇/🌿/🌳/🗺️、いずれも地形・雰囲気を表す単一絵文字）に一貫する
- `CITY_COURSE_AREAS.sg`の`label`はCLAUDE.md記載の通り既存パターンが`data-i18n`属性を使わないJSリテラル直書き方式のため、新規追加分もこのパターンを踏襲し`data-i18n`は不要
- `#event-filter-sheet`の`.ef-chip`も同様（絵文字+英語ラベルの直書きHTML、既存6区分と同じパターン）
- `STRINGS.ja`/`STRINGS.en`への新規キー追加は不要（新規UI文言が発生しないため）

## 変更するファイル一覧

### コード変更
- `public/app.js`:
  - `CITY_COURSE_AREAS.sg`に`{ val: 'Sentosa', label: '🏖 Sentosa' }`を追加（既存6区分の末尾、`Island-wide`の後）
- `public/index.html`:
  - `#event-filter-sheet`内926〜937行目のエリアチップ群に`<button class="ef-chip" data-key="area" data-val="Sentosa" onclick="toggleEfChip(this)">🏖 Sentosa</button>`相当を追加（既存6ボタンと同じマークアップパターン）
  - キャッシュバスティング: `app.js?v=YYYYMMDDX`のクエリ文字列更新が必要
- `public/sw.js`:
  - `CACHE_NAME`のバージョン番号を1つ上げる
- `scripts/filter-events.js`:
  - `CITY_AREAS.sg`の文字列に`/"Sentosa"`を追加（例: `'"Central"/"East"/"West"/"North"/"North-East"/"Island-wide"/"Sentosa"'`）
  - `defaultArea`（437行目）は変更不要（`'Central'`のまま）

### データ変更（人力・少量、98件全件レビュー済み）
- `data/sg/events.json`:
  - 5件の`area`フィールド値を手動修正: "Sentosa GrillFest 2026"（`Island-wide`→`Sentosa`）、"Resorts World Sentosa"（`West`→`Sentosa`）、"Sentosa Island"（`Island-wide`→`Sentosa`）、"Adventure Cove Waterpark"（`Island-wide`→`Sentosa`）、"Singapore Oceanarium - Into the Glowcean"（`Island-wide`→`Sentosa`）
  - 同時に`location`フィールドも`area`と同期させる
  - 編集前に`events.json`のバックアップを取得すること

### 設計書の修正
- `.claude/plan.md`「設計書23 フェーズ1.5」の該当5箇所（本設計書に統合済み）

### 変更しない（明示）
- `public/app.js` 2369行目の未使用`AREAS`定数（今回のスコープ外、死んだコード）
- `server.js`（コース生成ロジック自体はエリア文字列をそのままプロンプトに渡すのみで、エリア値のホワイトリスト検証等は行っていない。念のためbuilder実装時に該当箇所を確認すること）
- `data/bkk/events.json`・`data/syd/events.json`（BKK/SYDは一時停止中、かつSentosaはシンガポール固有の地名のため対象外）
- `scripts/generate-model-courses.js`（`model-courses.json`は現状空配列で実質未稼働のため対象外）

## データモデルの変更
- `events.json`の`area`/`location`フィールドが取りうる値集合が6値→7値に拡張（`Sentosa`追加）。フィールド自体の型・構造は変更なし
- 新規ファイルの追加なし

## APIの変更
- `GET /api/events`・`POST /api/courses/generate`等、既存APIのレスポンス/リクエスト構造そのものに変更はない。`area`フィールドの値として新たに`"Sentosa"`という文字列が出現するようになるだけ
- **後方互換性の判断**: 旧バージョンのApp Storeアプリが`area`フィールドの値を厳密なホワイトリストで検証・分岐している形跡は現状のコード調査範囲では確認されていない（`filterAreas.has(e.area)`のような完全一致比較のみ）。未知の`area`値が来た場合の旧アプリの挙動は「その値のイベントは絞り込みシートのどのチップにも一致せず、エリア未選択時のみ表示される」程度の影響に留まると推測されるが、過去配信された旧バンドルのソースは未確認のため「不明」として記録

## フロントエンドの変更
- コース作成画面: エリアチップに「🏖 Sentosa」が追加表示される（都市セレクトがSGの場合のみ）
- イベント絞り込みシート: 同様に「🏖 Sentosa」チップが追加される
- 既存のカードレンダリング・絞り込みロジック（`renderEventCards`/`areaMatch`等）はロジック変更不要。値の集合が増えるだけで動作原理は同じ

## ⚠️ データ共有（Web版/App Store版）への影響（CLAUDE.md必須確認事項）

1. **後方互換性**:
   - APIレスポンスの構造自体は変わらない。`area`フィールドの値集合に`"Sentosa"`が追加されるのみ
   - 旧バージョンのApp Storeアプリがエリア値を厳密なホワイトリストで検証していないか、実装時にコードベース内で再確認すること
   - `scripts/filter-events.js`の変更は取り込みパイプライン（サーバー内部処理）のみに影響し、クライアント側のAPI契約には影響しない
2. **影響範囲**:
   - `public/app.js`・`public/index.html`・`public/sw.js`の変更はCapacitorバンドル対象のため、Web版に`pm2 restart`で即時反映されても、**iOS App Store版（本番）には次回`release`ブランチpush・TestFlightビルドまで反映されない**
   - `data/sg/events.json`の5件修正、`scripts/filter-events.js`の変更は**Web版・App Store版の両方に即座に影響する**。影響は「Sentosaというエリアで絞り込めるようになる／5件のイベントの分類が変わる」という軽微なもの
   - **注意**: `public/app.js`側の変更が反映される前のApp Store版ユーザーは、Sentosaに分類された5件のイベントを絞り込みシートでは見つけられなくなる（エリア未選択時は引き続き一覧に表示されるため、完全に見えなくなるわけではない）
3. **リリースタイミング**:
   - `scripts/filter-events.js`の変更は次回のcron実行から効果が出る。App Storeリリースと同期させる必要はない
   - `data/sg/events.json`の5件修正は、`public/app.js`側の変更と**同時にデプロイすることを推奨**
   - `public/app.js`側の変更はWeb版なら`pm2 restart`で即時反映可能。App Store版への反映（TestFlightビルド）は、CLAUDE.md記載の通り**ユーザー明示指示時のみ**`release`ブランチへpushする運用のため、この設計書の実装完了後もユーザーの指示を待つこと

## 受け入れ基準

### 正常系
1. コース作成画面のエリアチップに「🏖 Sentosa」が表示され、タップで選択状態になる
2. `conditions.area = 'Sentosa'`でコース生成すると、`server.js`側でエラーなくプロンプトに`- エリア: Sentosa`が差し込まれる
3. イベント絞り込みシートの「エリア」セクションに「🏖 Sentosa」チップが表示され、タップで選択・絞り込みが機能する
4. `data/sg/events.json`内の対象5件の`area`（および`location`）が`Sentosa`に修正されている
5. 絞り込みシートで「Sentosa」チップのみ選択すると、上記5件が一覧に表示される
6. 次回`scripts/filter-events.js`実行時、Sentosa関連の新規記事があればAIが`area: 'Sentosa'`と分類する

### 失敗系・エッジケース
7. エリア未選択の場合、Sentosaに分類されたイベントも含め全件が表示される（既存仕様に変更なし）
8. コース生成で`conditions.area`が指定されない場合、Sentosa追加前と同じくエリア行自体がプロンプトに出現しない
9. 都市セレクトがBKK/SYDの場合、Sentosaチップは表示されない

### 共通
10. 旧バージョンのApp Storeアプリが、サーバー変更後も一切のクラッシュ・表示崩れなく従来通り動作し続ける
11. Web版・App Store版どちらでも既存のコース生成・イベント絞り込み機能（Sentosa以外の6エリア含む）に回帰がない
12. 英語モードでも「Sentosa」チップの文言が正しく表示される

## スコープ外（今回作らないもの）
- `public/app.js` 2369行目の未使用`AREAS`定数の修正・削除
- 設計書23フェーズ1.5の実装そのもの（今回はフェーズ1.5の該当節を書き換えるのみ。フェーズ1.5全体はまだ未承認・未実装）
- Sentosa以外の新規エリア区分の追加
- BKK/SYDへのエリア区分追加・変更
- 今回の98件全件レビュー（対象は現時点の`data/sg/events.json`）以降に新規追加されるイベントの遡及チェック（cへの対応でカバーされるため対象外）
- エリア値のサーバー側バリデーション・ホワイトリストチェックの新規導入
- `location`フィールドと`area`フィールドの統合・スキーマ整理

## リスク・未解決の質問

1. **【未解決】旧バージョンApp Storeアプリの`area`値検証ロジックの実態が不明**: 過去にビルド・配信された旧バージョンのバンドルにエリア値のホワイトリスト検証等が存在するかは「不明」。実装時点でこれ以上の確証は得られないため、リリース後の旧バージョンユーザーからの不具合報告に注意を払う運用でカバーする
2. **【要判断】絵文字選定**: `🏖`（ビーチ）を提案したが、Sentosaはビーチ以外の要素（テーマパーク、ケーブルカー等）も多く含む複合エリアのため、他の絵文字の方が適切という判断もあり得る
3. **【要判断】チップの挿入位置**: 末尾（`Island-wide`の後）への追加を提案。地理的な並び順として自然かどうかはUI上の見た目次第、機能上の影響はない
4. **【運用上の留意点】5件のデータ修正とUI変更の同時デプロイ推奨だが、Web版とApp Store版で反映タイミングがずれる**: 意図的な許容と位置づける
5. **【未確認】`scripts/generate-model-courses.js`・`data/sg/model-courses.json`への影響有無**: 実質未稼働のため実害はないと推測されるが、確証はない
6. **【軽微リスク】目視レビューの精度**: 今回の98件全件レビューは筆者（Claude）の地理的知識に基づく目視判定であり、機械的な検証（現地API照合等）は行っていない。Adventure Cove WaterparkとSingapore Oceanarium以外にも、店名からは判別できないSentosa関連イベントが見逃されている可能性はゼロではない

## 承認状況
承認済み・実装完了（2026-07-13）

---

# 設計書25 — コミュニティコース「Sembawang、北の隠れ家で夜雑貨さんぽ」の時刻不整合修正

## 発端
ユーザーがアプリのスクリーンショットで、Sembawangエリアのコース「Sembawang、北の隠れ家で夜雑貨さんぽ」に含まれる Sembawang Hot Spring Park（19:00閉園）が18:45開始・45分予定（〜19:30終了想定）になっており、実質15分しか滞在できない不具合を発見。

## 対象
`data/sg/community-courses.json` の `id: "course_sg_1783463896514"`（`authorName: "おでかけNavi"`、`createdAt: "2026-07-07T22:38:16.514Z"`、タイトルに"Sembawang"を含む唯一のコース）。

同名スポット「Sembawang Hot Spring Park」を含む別コース `course_sg_1783463855242`（08:30開始の朝コース）は対象外・無変更。

## 原因
コース生成時、3スポットの巡回順序（Shopping Centre → Hot Spring Park → Hawker Centre）に沿って単純に時刻を積み上げただけで、各スポットの実際の営業時間（Hot Spring Parkの19:00閉園）が考慮されていなかった。

## 修正内容
スポットの中身・順序ロジック・durationの合計は維持したまま、時刻の組み方のみ入れ替え。

| スポット | 修正前 | 修正後 |
|---|---|---|
| Sembawang Hot Spring Park | 18:45／45分 | **17:00／60分** |
| Sembawang Shopping Centre | 17:00／90分（維持） | **18:15**／90分（維持） |
| Canberra Plaza Hawker Centre | 19:45／75分（維持） | 19:45／75分（変更なし） |

結果のタイムライン: 17:00 Hot Spring Park[60分](〜18:00) → 18:15 Shopping Centre[90分](〜19:45) → 19:45 Hawker Centre[75分](〜21:00)。Hot Spring Parkの19:00閉園に対し余裕を持って収まる。

**説明文の微調整**: Hot Spring Parkの`description`内「夕暮れ時に二人で足湯気分を楽しめる幻想的なスポット。」を、17:00開始（シンガポールの日没は年間通じて19:00前後のためまだ明るい時間帯）という実態に合わせ、「夕方のひととき、二人で足湯気分を楽しめる幻想的なスポット。」に変更（時間帯を限定しすぎない自然な表現への言い回し調整のみ、大幅な書き換えなし）。

## 実装メモ
- `data/`ディレクトリは`.gitignore`で全体除外されているため、`community-courses.json`はそもそもgit管理外。今回の修正はgit差分としては現れず、コミット対象にもならない
- サーバー側`GET /api/courses`（`server.js`）はリクエストの都度`fs.readFileSync`でファイルを直接読み込む方式（メモリキャッシュなし）のため、pm2再起動は不要。本番API (`https://dosuru.app/api/courses?city=sg&tab=community`) で修正内容が即座に反映されていることを確認済み
- `generate-model-courses.js`等のコース生成ロジック・スクリプトへの変更は一切なし。データファイルの直接修正のみ
- `data/sg/affiliate-links.json`は無関係（該当スポット未登録）のため無変更

## 承認状況
承認済み・実装完了（2026-07-13）

---

# 設計書26 — コミュニティコース4件の営業時間・開店時間・施設名不整合修正

## 発端
全18コース・60スポットを監査し、営業時間・開店時間・施設名の不整合4件をユーザーが承認。残った2つの確認事項もユーザーが回答済み。

## 対象
`data/sg/community-courses.json` の以下4コース（他14コースは無変更）:
- `course_sg_1783204698563`（Haji Lane、壁画と仲間のアート午後）
- `course_sg_1782614605087`（VivoCity×ハーバーフロントで家族アート探検）
- `course_sg_1782859119879`（Yishunの闇市で、夜の雑貨狩り）
- `course_sg_1782614507916`（Labrador Parkで夕日、Gillmanで現代アート → タイトル変更）

## 修正内容

### ①Haji Laneコース: Sultan Mosqueの見学時間帯（10:00-12:00/14:00-16:00、12:00-14:00は礼拝のため閉鎖）と訪問時刻の重複を解消
| スポット | 修正前 | 修正後 |
|---|---|---|
| Arab Street Area & Lunch | 12:00／60分 | 変更なし |
| Haji Lane Mural Walk | 13:45／75分 | **13:00**／75分 |
| Sultan Mosque (Masjid Sultan) | 13:00／45分 | **14:15**／45分（見学可能時間帯14:00-16:00内に収まる） |
| Malay Heritage Centre | 15:00／75分 | 変更なし |

結果: 12:00→13:00→14:15→15:00の順。**確認事項への回答**: `renderCourseDetail()`/`renderCourseResultHtml()`（`public/app.js`）はいずれも`(course.spots || []).map(...)`で配列順そのまま表示しており、`time`昇順ソートは行っていない。そのため`time`値の変更に加え、配列内のHaji Lane Mural WalkとSultan Mosqueの要素順序自体も入れ替えた（表示順が視覚的に正しくなるよう対応）。

### ②VivoCityコース: モール開店時刻（10:00）前の訪問を解消
| スポット | 修正前 | 修正後 |
|---|---|---|
| VivoCity (Rooftop Plaza & In-mall Art Tour) | 09:00 | **10:00** |
| Maritime Experiential Museum | 10:30 | **11:15** |
| VivoCity Food Court (Food Republic) | 12:00 | **12:30** |

duration・順序・descriptionは無変更。description内「午前中の」「朝の清涼な」等の文言、tagline「朝を楽しむ」は10:00開始でも許容範囲としてユーザー承認済み・変更なし。

### ③Yishunコース: 実在しない施設名の誤りを修正
3つ目のスポット`name`を`"Eunos Park Hawker Centre Night Walk & Craft Market Scout"`から`"Yishun Park Hawker Centre Night Walk & Craft Market Scout"`に修正。`time`/`duration`/`address`/`description`は無変更。他フィールドに「Eunos」の記載は無いことを確認済み（この1箇所のみで修正完結）。

### ④Labrador/Gillmanコース: Gillman Barracksの営業時間（火〜土11:00-19:00）に対し18:15到着では閉館直前だったため訪問順序を入れ替え
| スポット | 修正前 | 修正後 |
|---|---|---|
| Gillman Barracks | 18:15（2番目） | **16:00**（**1番目**、営業時間内） |
| Labrador Nature Reserve (Labrador Coast) | 17:00（1番目） | **17:15**（**2番目**） |
| VivoCity Food Republic | 19:45（3番目） | **18:15**（3番目のまま） |

結果: 16:00 Gillman[75分](〜17:15) → 17:15 Labrador[60分](〜18:15、日没18:45-19:15にはやや届かないが夕方の時間帯としてユーザー承認済み) → 18:15 VivoCity[75分](〜19:30)。配列順もGillman→Labrador→VivoCityに並び替え済み（①と同じ理由、配列順=表示順のため）。

**タイトル変更（ユーザー承認済み）**: `title`を「Labrador Parkで夕日、Gillmanで現代アート」→「Gillmanで現代アート、Labrador Parkで夕日」に変更。

**description変更**: コース本体`description`内の訪問順序の言及を、新しい訪問順（Gillman→Labrador→VivoCity）に合わせて並び替え。「まずシンガポール随一の夕日スポット・Labrador Nature Reserveで...その後、...Gillman Barracksへ」→「まずは...Gillman Barracksへ。...その後、シンガポール随一の夕日スポット・Labrador Nature Reserveで...」の順に書き換え。tagline「地元民だけが知る、静かな芸術の夕べ」は順序に言及していないため変更なし。

## 実装メモ
- `data/`ディレクトリは`.gitignore`で全体除外のため、`community-courses.json`の修正はgit管理外・コミット対象外
- サーバー側`GET /api/courses`は`fs.readFileSync`都度読み込み方式のためpm2再起動不要。`curl`で本番API（`GET /api/courses?city=sg&tab=community`）を確認し4件とも反映済み
- 修正対象4コース以外の14コース・コース総数18件は無変更（JSON全体のdiff検証で確認）
- JSON構文検証OK（`node -e "JSON.parse(require('fs').readFileSync('data/sg/community-courses.json'))"`）
- `generate-model-courses.js`等のコース生成ロジック・スクリプトへの変更は一切なし。データファイルの直接修正のみ
- `data/sg/affiliate-links.json`は調査済みで今回対象スポットの登録なし、変更なし

## 承認状況
承認済み・実装完了（2026-07-13）

---

# 設計書27 — コース生成ロジックの再発防止（プロンプト注意喚起 + 時刻重複の機械チェック）

## 発端
設計書25・26で、AIが生成したコースに(1)営業時間・見学可能時間帯との不整合、(2)開店時間より前の訪問、(3)実在しない施設名の生成（ハルシネーション）という3種の不具合が見つかり個別データ修正した。個別修正だけでは同じ問題が今後生成されるコースにも繰り返し発生しうるため、コース生成プロンプト自体に注意喚起を追加し、機械的な事後チェック（ログのみ）も併設する再発防止策を実施する。

## エントリーポイント調査結果
コース生成に関わるエントリーポイントは3つあり、それぞれ役割が異なる:
1. `POST /api/courses/generate`（`server.js`）: ユーザーがコース作成フローで最終的にフルコース（時刻・スポット名・description等）を生成するメインのAPI。今回の主対象
2. `scripts/generate-model-courses.js`のSG/BKK/SYD SYSTEM_PROMPT: 運営が事前生成する「モデルコース」（`model-courses.json`）用のプロンプト。ユーザーが直接叩くAPIではないが、生成されるコースの構造・spot情報は`POST /api/courses/generate`と同一形式のため、同じ不具合が起こりうる。BKK/SYDは現在サービス停止中（CLAUDE.md「都市対応状況」参照）だが、コードの一貫性維持のため3都市とも同じ対応をする
3. `POST /api/courses/candidates`（`server.js`）: コース作成フローの1段階目、タイトル・タグライン・説明のみを生成する候補提示API。時刻やスポット名を一切含まない設計のため、営業時間・実在性の問題がそもそも発生しえない。**変更対象外**

## 実装内容

### 1. `server.js` `POST /api/courses/generate` プロンプト追加
【スポット選定ルール】ブロック（既存3行）の末尾に以下を追加:
```
- 訪問時刻は施設の一般的な営業時間内に収まるよう配慮すること。公園・自然施設・宗教施設は早朝閉園や断続的な休止（礼拝等）があるため、早朝（9時より前）・閉園間際の訪問は避けること。スポット名は実在が確信できる正式名称のみを使用し、確信が持てない場合は創作せず、より確実に実在する近隣の代替スポットを選ぶこと
```
既存の食事スポット2行・ショッピング1行は無変更。

### 2. `scripts/generate-model-courses.js` SG/BKK/SYD各SYSTEM_PROMPT追加
各spotのフィールド列挙ブロック直後に以下を1段落追加（3プロンプト共通の文言）:
```
【注意】訪問時刻は施設の一般的な営業時間内に収まるよう配慮すること。公園・自然施設・宗教施設は早朝閉園や断続的な休止（礼拝等）があるため、早朝・夜間閉園間際の訪問は避けること。スポット名は実在が確信できる正式名称のみを使用し、確信が持てない場合は創作せず、より確実に実在するスポットを選ぶこと。
```
SG_SYSTEM_PROMPTのみ「8コースは以下の条件をバランスよくカバーすること」という条件一覧が後続するが、BKK/SYDにはこの一覧がなく直後に「JSON配列のみを返すこと」の指示文が続く（3プロンプトの構造差）。挿入位置はいずれも「各spotのフィールド列挙の直後・次の文の前」で統一。

### 3. `server.js` `POST /api/courses/generate` 時刻重複チェック（ログのみ）
Unsplash画像取得後・レスポンス構築前に、生成された`course.spots`配列を配列順（表示順と同じ。設計書26で確認済みの通り`time`昇順ソートではなく配列順そのまま表示されるため）に走査し、前のスポットの終了予定時刻（`time`+`duration`から分換算で算出）が次のスポットの開始時刻を超えていれば`console.warn()`でログ出力する。

```js
console.warn(`[course-generate] time overlap detected: courseId=${id}, spot="${prev.name}"の終了予定時刻が次の"${next.name}"の開始時刻を超えています`);
```

- APIレスポンス自体は変更しない（ログ出力のみ、生成・保存フローを止めない・リトライもしない）
- `time`のパース正規表現は`^(\d{1,2}):(\d{2})$`、`duration`は`/(\d+)/`で数字部分のみ抽出。パース失敗（`null`）の場合はエラーを投げずスキップ
- チェック全体を`try/catch`で囲み、想定外の例外が発生してもコース生成フロー自体には一切影響しないようにした

## リスク・トレードオフ
- プロンプトへの注意文追加はAIへの努力目標に過ぎず強制力がない。今回追加した文言だけで100%不具合が根絶される保証はない。時刻重複チェック（ログのみ）はその前提のもと、事後的に運用モニタリングできるようにする位置づけ
- 時刻重複チェックは「スポット間の時刻的な重複・矛盾」のみを検知し、(2)開店時間より前の訪問や(3)施設名のハルシネーションは機械的に検知できない（外部データソースとの照合が必要なため今回はスコープ外）。この2つは主にプロンプト側の注意喚起でのみ対応
- ログ出力先はPM2の標準ログ（`pm2 logs sg-weekend`）であり、専用のアラート通知や集計の仕組みは今回追加していない。将来的に不具合が頻発するようであれば、ログを定期的に確認するか、`_sendDebugLog`のような専用ログファイルへの記録に格上げすることを検討する

## CLAUDE.md記述との関係整理
- 「広告表示機能フェーズ1: Klookアフィリエイトリンク」セクションの「コース生成AIには一切手を加えていない」という記述は、広告要素とコース生成ロジックの分離方針を指したものであり、今回の設計書27（品質改善目的）とは無関係な文脈だったため、誤解を避けるため「広告目的の変更は一切加えていない（設計書27による変更は別件、無関係）」に文言を更新した
- 「コース機能」セクションに、今回のプロンプト追加・時刻重複チェックの内容を恒久情報として追記した

## 動作確認
- `node -c server.js` / `node -c scripts/generate-model-courses.js` いずれも構文エラーなし
- `pm2 restart sg-weekend`実行、オンライン状態確認済み
- `POST /api/courses/generate`を2回実際に呼び出し、いずれもHTTP 200・正常なコースが生成されることを確認。生成されたスポットは実在する著名スポット（Clarke Quay、Lau Pa Sat、Singapore Art Museum、Clementi Forest、West Coast Park等）で構成され、訪問開始時刻はいずれも9:00以降、スポット間の時刻重複なし
- 時刻重複検知ロジック自体は単体テスト（Node REPLでの模擬データ実行）で正しく動作することを別途確認

## 承認状況
承認済み・実装完了（2026-07-13）

# 設計書28 — 「人気コース」カード・コース詳細画面のいいねボタン欠落（押せない不具合）の調査

## 症状の説明
ユーザー報告: 「人気コースのハートが押せない気がするけど気のせい？」
コース画面「みんなのコース」タブ内の「🏆 人気コース」セクション（フルワイド横スクロールカルーセル、上位3件）で、❤️のいいねをタップ/クリックしても反応しない。

## 原因の特定（コード事実として確定。推測ではない）

コース画面は現在「みんなのコース」（`everyone`）と「マイコース」（`mylist`）の2タブ構成（`public/index.html` 140-142行目、`COURSE_TABS`は`public/app.js` 2737行目）。CLAUDE.md記載の「人気/公開コース/マイコースの3タブ」という表現は実態と乖離しており、実際は「みんなのコース」タブ内に「🏆 人気コース」という**セクション**（`renderEveryoneTab()`、`public/app.js` 2821-2837行目）が横スクロールカルーセルとして同居している。

いいねボタンの実装は**カード描画関数ごとに一貫していない**:

| カード描画関数 | 使用箇所 | いいねボタンの有無 |
|---|---|---|
| `renderCourseCard()`（`public/app.js` 2946-2979行目） | 旧・汎用一覧（現在は直接呼ばれていないが`renderCourseList`から利用可能） | ✅ `toggleLike`ボタンあり（2973-2976行目） |
| `renderCompactCourseCard()`（同2903-2941行目） | 「✨〇〇向け」「✨新着コース」「👑定番」等のセクション | ✅ `toggleLike`ボタンあり（2930-2937行目） |
| `renderPopularCourseCard()`（同2983-3007行目） | **「🏆 人気コース」カルーセル（バグ報告対象）** | ❌ **いいねボタンが存在しない**。`❤️ ${c.likes||0}`という静的テキスト（3004行目）のみで、`onclick`もカード全体の`openCourseDetail('${c.id}')`（2988行目）しかない |
| `renderCourseDetail()`（同3071-3120行目、コース詳細画面） | 上記どのカードからdetailを開いても遷移する共通詳細画面 | ❌ **いいねボタンが存在しない**。3072行目で`const liked = isLiked(course.id)`を計算しているが、以降のHTML生成で`liked`変数は一度も使われていない（3110-3112行目は`❤️ ${course.likes || 0}`という静的テキストのみ）。デッドコード化した変数 |

つまり「🏆 人気コース」カードのハートをタップしても、いいねボタンという要素自体が存在しないため、カード全体のクリック領域が反応してコース詳細画面に遷移するだけ（詳細画面側にもいいねボタンが無いため、そこでも押せない）。**ユーザー報告「押せない気がする」は気のせいではなく、UI上いいねボタンが実在しない事実に基づく正確な報告。**

### 原因の時系列（gitログで確認済み、事実）
1. `renderPopularCourseCard()`は2026-07-02 commit `27779ae`（ジャンル・興味機能実装コミット）で新規追加された当初から、一度も`toggleLike`ボタンを持ったことがない（実装当初からの欠落、リグレッションではない）
2. `renderCourseDetail()`は2026-07-02時点では`<button onclick="toggleLike('${course.id}')" id="like-btn-${course.id}" ...>${liked ? '❤️' : '🤍'}</button>`という正常ないいねボタンを持っていたが、2026-07-07 commit `4a3de4f`（「iOS v1.1 リリース準備 + 各種改善」、CLAUDE.md記載の「コース詳細ボタン: 予定表追加（メイン）/公開+タイトル変更（横2列）/削除（テキストリンク）」というアクションボタン行の再設計）で、アクションボタン行を作り直した際に**いいねボタンごと削除され、静的テキスト表示に置き換わった**（リグレッション）。この時`liked`変数だけが計算コードとして残置され、デッドコード化した
3. `toggleLike()`関数（3723-3751行目）内に`btn.id === `like-btn-${courseId}`` という分岐（3746行目）が残っているが、現在のコードベースに`id="like-btn-..."`を持つ要素は一切存在しない。詳細画面のいいねボタン削除時にこの分岐だけ取り残されたデッドコード

### 「ゴーストクリック」「二重発火」等のタッチイベント起因の可能性
CLAUDE.mdに記載のonclick/touchend二重登録問題や、直近commit `3294ee1`のアフィリエイトリンク不具合と同種の**タップイベント配送の問題である可能性は低いと判断する**。理由:
- `renderPopularCourseCard()`にはそもそも`toggleLike`を呼び出すボタン要素（`onclick`属性含む）自体が存在しない。イベント配送以前に、押す対象のDOM要素がない
- 他のカード（`renderCourseCard`/`renderCompactCourseCard`）のいいねボタンは`event.stopPropagation();toggleLike('${c.id}')`という一般的なonclick方式のみで、`touchend`ハンドラの二重登録やゴーストクリック対策（`_touchCapableDetected`ガード）の対象にもそもそも入っていない。CLAUDE.mdの「onclick属性＋touchendハンドラの二重登録」問題は主にボトムナビ・FAB等17箇所に限定された既知の話であり、いいねボタンはこのリストに含まれていない
- サーバー側`POST /api/courses/:id/like`（`server.js` 2245-2263行目）は動作確認済み（存在しないIDでも`{"ok":true}`を返す設計、正常応答）。ロジック自体に不具合はない

### 直近のイベントカードDOM差分キャッシュ（設計書21、`_cardElCache`）の影響
`renderEventCards()`（イベント画面）専用の仕組みであり、コース画面のカード描画（`renderEveryoneTab`/`renderCourseList`/`renderCompactCourseCard`/`renderPopularCourseCard`/`renderCourseDetail`）には一切同様のキャッシュ機構が導入されていないことをコード確認済み（`_cardElCache`の参照はコース関連コードに存在しない）。**今回の不具合とは無関係。**

### マイコースの❤️→公開バッジ変更の影響
`renderCourseCard()`内の`isOwn`分岐（2968-2977行目）で、自分のコース（マイコース）は公開状態バッジ、他人のコース（みんなのコースの一般カード）はいいねボタンという分岐は正しく実装されている。この分岐自体に漏れ・副作用は確認できず、**今回の不具合とは無関係**（そもそも「🏆 人気コース」カルーセルは`renderPopularCourseCard`を使っており`renderCourseCard`の分岐は通らない）。

## 修正方針（提案、未実装）

1. **`renderPopularCourseCard()`にいいねボタンを追加する**
   - 他のカード関数と同様、`<button onclick="event.stopPropagation();toggleLike('${c.id}')" data-like-id="${c.id}" data-likes="${c.likes||0}">`形式のボタンを、現在`❤️ ${c.likes||0}`と静的表示している箇所（3004行目）に組み込む
   - `isLiked(c.id)`を使って初期表示を❤️/🤍に出し分ける（他カード関数と同じパターンに合わせる）
   - カード全体のクリック領域（`openCourseDetail`）と競合しないよう`event.stopPropagation()`を必ず入れる（既存の他カードと同じ書き方を踏襲）

2. **`renderCourseDetail()`にいいねボタンを復元する**
   - 2026-07-07 commit `4a3de4f`で削除される前の実装（`id="like-btn-${course.id}"`付きボタン）を参考に、現在のアクションボタン行（3114-3119行目、「予定に追加」ボタンのみの行）に、いいねボタンを追加復元する
   - `toggleLike()`関数側に既に`isDetailBtn`分岐（3746行目）がありid規約`like-btn-${courseId}`を前提にしているため、**このid規約を維持したままボタンを復元すれば`toggleLike()`側のコード変更は不要**（デッドコードだった分岐が有効化されるだけ）
   - 既存の`const liked = isLiked(course.id)`（3072行目）はそのまま活用できる（現状デッドコードだが、ボタン復元により有効化される）
   - UIレイアウト（CLAUDE.md記載の「予定表追加（メイン）/公開+タイトル変更（横2列）/削除（テキストリンク）」という構成）を壊さないよう、いいねボタンの配置位置はplannerが別途デザイン検討する必要がある（例: 「予定に追加」ボタンの隣に小さく添える、❤️テキスト表示部分をボタン化する等）。承認前にユーザーへ配置案を確認することを推奨

3. **CLAUDE.mdの実態不一致箇所の是正（任意、低優先度）**
   - 「コース機能」セクションの「コース画面タブ: 人気（popular）/ 公開コース（community） / マイコース（mylist）の3タブ」という記述は、現行実装（「みんなのコース」＝popular+community統合表示 / マイコースの2タブ、`COURSE_TABS = ['everyone', 'mylist']`）と乖離している。今回の主目的ではないため、いいね修正のついでに実態に合わせて更新するか、別タスクとして切り出すか判断が必要

4. **`toggleLike()`関数内のデッドコード整理（任意、低優先度）**
   - 上記2番でid規約`like-btn-${courseId}`を維持したまま復元すれば対応不要。もし異なるid/構造で復元する場合は、`toggleLike()`の`isDetailBtn`分岐（3746-3749行目）も合わせて更新する必要がある

## 変更するファイル一覧（実装フェーズ向け、今回は変更しない）
- `public/app.js`
  - `renderPopularCourseCard()`（2983-3007行目）: いいねボタン追加
  - `renderCourseDetail()`（3071-3120行目）: いいねボタン復元
  - （分岐維持なら）`toggleLike()`（3723-3751行目）: 変更不要
- `public/index.html`: `app.js`のキャッシュバスティング用バージョンクエリ更新（CLAUDE.md「CSSキャッシュバスティング手順」に準拠、JS変更でも同様の運用が必要か既存パターンを確認して判断）
- `public/sw.js`: `CACHE_NAME`のバージョン更新（同上）
- `CLAUDE.md`: 「コース機能」セクションのタブ構成記述の是正（任意）

## 受け入れ基準（修正後にこうなればOK）
1. 「みんなのコース」タブの「🏆 人気コース」カルーセルで❤️/🤍アイコンをタップすると、即座に🤍→❤️（またはその逆）に切り替わり、件数が±1される
2. 上記操作後、`GET /api/courses?city=sg&tab=popular`のレスポンスで該当コースの`likes`が更新されていることをサーバー側で確認できる
3. 「🏆 人気コース」カードをタップして開いたコース詳細画面でも、❤️/🤍ボタンが表示され、タップでいいねのトグルができる
4. 詳細画面でいいねした状態が、詳細画面を閉じてカード一覧に戻った際も❤️（liked状態）として一貫して表示される（`localStorage`の`liked_courses`とカード側`isLiked()`判定が同期している）
5. 既存の「みんなのコース」内の他セクション（✨新着コース／👑定番／🏪ローカル／🔍穴场、`renderCompactCourseCard`使用箇所）のいいね機能に回帰がないこと
6. マイコースタブの公開状態バッジ表示（❤️の代わりに🌐公開中/🔒非公開）に影響がないこと（`renderCourseCard`の`isOwn`分岐は今回変更対象外のため通常は影響しないはずだが、念のため確認）
7. Web版・iOS版（TestFlight実機）の両方で動作確認する（本不具合はDOM要素の欠落が原因でありiOS WKWebView固有のタッチイベント配送問題ではないため、**Web版でも100%再現するはず**。Web版で先に確認できる）

## 再発防止策
- カード描画関数を複数用意する設計（`renderCourseCard`/`renderCompactCourseCard`/`renderPopularCourseCard`のように同じ「いいね」機能を持つべきカードが複数の関数に分散している）は、機能追加・削除時の当て漏れが起きやすい。将来的には、いいねボタン部分だけでも`renderLikeButton(course)`のような共通ヘルパー関数に切り出し、各カード関数はそれを呼び出すだけにすることを検討する（当て漏れの構造的なリスクを下げる）
- UIレイアウトの再設計（今回でいう2026-07-07のアクションボタン行変更）を行う際は、削除・置換する既存要素が持っていた**機能**（今回はいいねボタンのonclick）を、見た目の再設計と同時に失っていないか、diffを見て機能単位でチェックリスト化して確認する運用を徹底する

# 設計書29 — 広告表示機能フェーズ2: PRカード（スポンサー広告枠）実装

設計書23フェーズ2（2293〜2429行目付近に元設計あり）を、現在のコード行番号に合わせてplannerが再検証し、ユーザーが未決定事項2件・追加確認事項2件に回答して確定した設計。フェーズ1（Klookアフィリエイトリンク、`server.js`1636〜1681行目・`openAffiliateLink()`3176行目付近）は実装済み・稼働中で、参考パターンとして活用した。2026-07-13実装・完了。

## 決定事項（ユーザー回答）
- 表示位置: イベント一覧の3〜5枚目あたりに1件だけ差し込む（フィルタ・ソート確定後、DOM構築ループの前に`filtered`配列へ挿入）
- カテゴリ限定表示: `category`フィールドが`null`ならどのカテゴリ絞り込みでも常に対象、値ありなら`filterCats`との一致時のみ対象
- 選択ロジック: 日替わり固定（当日日付をシードに候補配列から`seed % length`で1件選択、リロードのたびに変わらない）
- おすすめモード中は非表示（`_recommendModeActive`時はPRカードの選択処理自体を呼ばない）

## データモデル（新規）
`data/{city}/sponsored-cards.json`（`data/`はgitignore対象、コミットしない）。配列。各要素:
```json
{
  "id": "string",
  "sponsorName": "string",
  "title": "string",
  "content": "string",
  "imageUrl": "string（空文字可、その場合フォールバックアイコン表示）",
  "url": "string（タップ時に開く遷移先）",
  "category": "event/show/gourmet/opening/sale のいずれか、または null（全カテゴリ共通枠）",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "priority": 1,
  "active": true
}
```
`data/sg/events.json`の実際の`type`値は`event/show/gourmet/opening/sale`の5種（`category`フィールドが取りうる値はこの5種＋`null`）。

## サーバー側（`server.js`）
`GET /api/sponsored-cards?city=sg`（528〜541行目、`GET /api/events`の直後・`GET /api/sales`の直前に配置）。既存の`resolveCity(req)`パターンを踏襲。`data/{city}/sponsored-cards.json`が存在しない場合は空配列を返す（エラーにしない）。既存`GET /api/events`は無変更。

## フロントエンド（`public/app.js`）
- `SPONSORED_CARDS`変数（985行目）: `loadEventData()`内（1019〜1023行目）で`/api/sponsored-cards`から取得
- `openSponsoredCardLink(url)`（1226行目）: フェーズ1の`openAffiliateLink()`と同じ`_isCapacitorApp`分岐（Capacitor環境は`Browser.open()`、Web環境は`window.open()`）
- `_matchesCurrentCategory(card)`（1237行目）: `category`がnull/undefinedなら常にtrue、`filterCats`が空（「すべて」）なら常にtrue、それ以外は`filterCats.has(card.category)`
- `_pickSponsoredCardForToday(cards)`（1244行目）: 有効期間（`startDate`/`endDate`）・`active`・`_matchesCurrentCategory`で候補を絞り込み、日付シード（`年*10000+月*100+日`）で`候補配列[seed % length]`を1件選択
- `renderSponsoredCard(card)`（1259行目）: `spot-card`ベースの見た目、左上に半透明黒背景の「PR」バッジ（`data-i18n="prBadgeLabel"`）、タップで`openSponsoredCardLink()`
- `renderEventCards()`内（1591〜1601行目）: ソート確定後、`!_recommendModeActive`ガード付きで`_pickSponsoredCardForToday()`を呼び、選ばれたカードを`{__sponsored:true, card}`マーカーとして`filtered`配列の4番目（0-indexed 3、配列長を超えない）に挿入
- DOM構築ループ（1613〜1631行目）: `forEach`内で`e.__sponsored`を検出したら専用の使い回しDOMコンテナ`_sponsoredCardTmpContainer`（1284行目）で`renderSponsoredCard()`から新規生成・挿入（既存のイベントIDベース`_cardElCache`とは完全に別系統、混在させない設計）
- PRカードが今回選ばれなかった場合、前回挿入分の`.sponsored-card`要素をDOMから除去（1661〜1663行目）
- 言語切替クリーンアップループ（1667〜1678行目）は`.sponsored-card`を対象外に除外（`_cardElCache`との誤混同防止）
- 件数表示・空状態判定（1680〜1683行目）はPRカードマーカーを除いた実イベント件数のみを対象に修正（実装時に発見・対応した設計外の考慮点）
- `STRINGS.ja`（411〜412行目）・`STRINGS.en`（607〜608行目）に`prBadgeLabel`（ja: "PR", en: "PR"）を同時追加

## キャッシュバスティング
- `public/index.html`: `app.js?v=20260713e` → `20260713f`
- `public/sw.js`: `CACHE_NAME`: `sg-weekend-v603` → `sg-weekend-v604`

## 厳守事項（遵守済み）
- `renderEventCard()`・`GET /api/events`・`_cardElCache`本体のロジックは無変更（新規関数の追加のみ、checkerが`git diff`で削除行2行のみ＝件数集計修正のみと確認済み）
- 動作確認完了後、`data/sg/sponsored-cards.json`のテストデータ（`sponsor_test_001`/`sponsor_test_002`）は空配列`[]`に戻し、本番ユーザーにダミーPR広告が見えたままにならないようにする

## 検証結果（checker実施済み）
- `GET /api/sponsored-cards?city=sg`が正しくJSON配列を返却、ファイル不在都市（bkk/syd）では`[]`を返却しエラーにならないことを確認
- Node上でロジックを切り出して再現テスト。「すべて」「グルメ・フェア」タブでは`category:null`と`category:"gourmet"`両方が候補になり日替わり選択、他カテゴリタブでは`category:null`のカードのみが候補になることを確認
- おすすめモードガードが正しく機能し、`_recommendModeActive`時はPRカード自体が生成されないことを確認
- PM2再起動後エラーログなし、既存イベント一覧・カテゴリ絞り込み・Instagram埋め込みに回帰なし

## スコープ外（今回未実装）
- PRカードのクリック計測（フェーズ1の`POST /api/affiliate-click`に相当する仕組み）は今回のスコープに含まれない
- 複数PRカード同時掲載・優先度（`priority`フィールド）による重み付け抽選は未実装（現状`priority`フィールドはデータに存在するが選択ロジックには未使用、将来の拡張余地として温存）
- 広告主向け管理画面・入稿フローは未整備（`sponsored-cards.json`の直接編集が現状唯一の運用手段）
- 変数を計算しておきながらHTML生成で使っていない（`const liked = ...`のみでその後未使用）ようなデッドコードは、機能欠落の隠れたサインになりうる。今回のように「変数は残っているのにUIに反映されていない」箇所は、リファクタリング時に見つけたら疑いの目を向けると良い

# 設計書30 — 広告表示機能・Klookアフィリエイトウィジェット試験導入（公式埋め込みコードそのまま利用）

## 背景・方針転換
直前に実装した設計書29（自前PRカード、`sponsored-cards.json`ベース）とは別に、ユーザーが「Klookアフィリエイトダッシュボードで生成した公式アクティビティバナーウィジェットをそのまま埋め込みたい」と方針転換。今回は「1回試してみる」という軽量な検証目的であり、複数スポンサーのローテーション・カテゴリ一致判定・クリック計測などのフル実装は行わない。設計書29のコード（`renderSponsoredCard()`/`_matchesCurrentCategory()`/`_pickSponsoredCardForToday()`/`openSponsoredCardLink()`）は削除・変更せず、そのまま共存させる方針（`data/sg/sponsored-cards.json`が空配列のままなら実害なし）。

## 埋め込み対象コード（ユーザー提供、そのまま使用）
Klook公式ウィジェット埋め込みコード（`<ins class="klk-aff-widget" data-wid="127020" data-adid="1337601" data-actids="117,127,119" data-prod="mul_act" data-price="true" data-lang="" data-width="336" data-height="280" data-currency="SGD">` + `https://affiliate.klook.com/widget/fetch-iframe-init.js`をロードする`<script>`）。

## 実装内容（`public/app.js`）
- `_klookWidgetInserted`（モジュールレベル`let`フラグ、1283行目付近）+ `_insertKlookWidget(containerEl)`関数（1286〜1313行目付近）を新規追加。`document.createElement`で`<ins>`・`<script>`をKlook提供仕様通りに動的生成し、引数のコンテナへ`appendChild`する
- `renderEventCards()`末尾、`if (hasNewCard) loadInstagramEmbeds();`の直後（1717〜1727行目付近）に、`!_klookWidgetInserted`ガード付きで一覧最下部（`#cards-grid`末尾）に専用コンテナ`#_klook-widget-container`を生成し、`_insertKlookWidget()`を呼ぶ処理を追加。フラグにより挿入は初回の1回のみ（カテゴリタブ切替のたびに再生成しない）
- 挿入位置は一覧グリッドの最下部固定（`grid.appendChild()`）。設計書29のPRカード（`grid.insertBefore()`でカード間に挿入）とは異なる位置・別ロジックのため競合しない
- `#_klook-widget-container`は`.spot-card`クラスを持たないため、既存の差分更新クリーンアップループ（1697〜1709行目付近、`.spot-card`クラス限定で判定）の対象外。フィルタ操作で誤って非表示・削除されることはない
- `_isCapacitorApp`による分岐は実装していない（ウィジェット自体のリンク処理はKlook側のiframe内で完結する想定のため、独自クリックハンドラは追加していない）

## キャッシュバスティング
- `public/index.html`: `app.js?v=20260713f` → `20260713g`
- `public/sw.js`: `CACHE_NAME`: `sg-weekend-v604` → `sg-weekend-v605`

## 厳守事項（遵守済み）
- 設計書29のコードは削除・変更していない（`git diff`で無変更を確認済み）
- `server.js`・データファイルは無変更（純粋にフロントエンドのみの変更）

## 検証結果（checker実施済み）
- コードレビューにより、重複生成防止（フラグ＋コンテナ存在チェックの二重ガード）・既存差分更新への非干渉・設計書29コードの無変更・外部リクエスト失敗時の非依存性を確認
- `pm2 restart sg-weekend`後エラーログなし、`app.js`/`sw.js`とも新バージョンで配信されていることを確認
- `affiliate.klook.com/widget/fetch-iframe-init.js`への疎通自体は200 OKを確認
- **未検証（サーバー環境の制約）**: サーバーにヘッドレスChromium実行に必要な共有ライブラリが不足しており実ブラウザでの目視確認ができなかったため、ウィジェットの実際の表示崩れの有無・タップ時の挙動（新規タブが開くかiframe内で完結するか）はユーザー自身のブラウザ確認が必要
- **未検証（実機）**: iOS版（Capacitor/TestFlight）でのiframe内リンクタップの挙動は未検証。iOS版への反映には別途TestFlightビルドが必要（Web版のみpm2再起動で反映済み）

## スコープ外（今回未実装）
- 複数スポンサーのローテーション、日替わり選択ロジック
- カテゴリ一致判定（設計書29の`_matchesCurrentCategory`相当の仕組み）
- クリック計測（フェーズ1の`POST /api/affiliate-click`に相当する仕組み）
- ウィジェット自体の表示位置カスタマイズ（Klook側テンプレートの見た目はダッシュボード側の設定に依存し、本実装からは制御しない）
- 変数を計算しておきながらHTML生成で使っていない（`const liked = ...`のみでその後未使用）ようなデッドコードは、機能欠落の隠れたサインになりうる。今回のように「変数は残っているのにUIに反映されていない」箇所は、リファクタリング時に見つけたら疑いの目を向けると良い

# 設計書31 — 広告表示機能・Klookアフィリエイトウィジェットの表示改善（カード化・PRラベル・カード間差し込み）

## 背景
直前に実装したKlook公式ウィジェット（設計書30、`_insertKlookWidget()`、イベント一覧最下部固定）が「素のiframeが浮いて見えて味気ない」とフィードバックがあり、以下3点の改善を実施した:
1. 他のイベントカードと揃えたラッパースタイル（角丸・背景・余白）
2. 小さな「PR」ラベル（既存i18nキー`prBadgeLabel`を再利用、新規キー追加なし）
3. 挿入位置を最下部固定から「他のカードの間」へ変更

自前PRカード機能（設計書29、`sponsored-cards.json`ベース、現在データ空で実質非表示）との同時表示時の間隔調整は、今回はユーザー判断により考慮不要（データが実際に入る段階で改めて調整する）。

## 実装内容

### `public/app.css`
`.spot-card`定義の直後に新規クラスを追加。`.spot-card`自体は付与しない（`fadeUp`アニメーション・`:active`時の`transform`等、iframeを含む要素に適用したくない既存ルールが多いため独立クラスとした）。
```css
.klook-widget-card { background: white; border-radius: var(--radius-card); box-shadow: var(--shadow-card); overflow: hidden; padding: 14px 14px 16px; }
.klook-widget-card__label { font-size: 11px; font-weight: 700; color: var(--warm-gray); letter-spacing: 0.05em; margin-bottom: 8px; }
.klook-widget-card__body { display: flex; justify-content: center; }
```

### `public/app.js`
- `_insertKlookWidget(containerEl)`を`_createKlookWidgetEl()`に置き換え。ラッパー`<div class="klook-widget-card">`＋ラベル`<div class="klook-widget-card__label" data-i18n="prBadgeLabel">`＋`<div class="klook-widget-card__body">`を生成し、bodyの中にKlook公式の`<ins>`+`<script>`（属性値は無変更）を`appendChild`する
- 「1回だけ生成し使い回す」方式に変更: `_klookWidgetInserted`フラグに加え、モジュールレベル変数`let _klookWidgetEl = null;`を新設。初回のみ`_createKlookWidgetEl()`を実行して`_klookWidgetEl`に保存し、以降は再生成せず`insertBefore`で位置を動かすだけにする（`_getOrCreateCardEl()`のパターンに近い）
- 挿入位置: `renderEventCards()`末尾の最下部固定挿入処理（旧1718〜1729行目）を削除。代わりに設計書29のPRカード位置決めロジックと同じパターンで、`filtered`配列に新規マーカーキー`__klookWidget`を`Math.min(7, filtered.length)`（8番目あたり）で`splice`挿入する。`filtered.forEach`のDOM構築ループに`__klookWidget`判定の分岐を追加し、未生成なら生成して`insertBefore`、生成済みならそのまま同じ要素を`insertBefore`で位置移動するだけ（再生成しない）
- おすすめモード中（`_recommendModeActive`が`true`）はKlookウィジェットのマーカー挿入自体をスキップし非表示にする（PRカードと同じ方針）
- 表示されなかった回（`klookWidgetUsed`が`false`）は`_klookWidgetEl`を`display:none`にするのみで、DOM要素・iframeは破棄しない
- `eventOnlyCount`の算出（件数表示・空状態判定）を`__sponsored`に加え`__klookWidget`も除外するよう修正（設計書30時点では最下部固定挿入で`filtered`に含まれなかったため対象外だったが、`filtered`に混入する方式へ変更したことに伴う必須修正）
- **既存の潜在バグの同時修正**: `loadEventData()`が都市切替・再フェッチ時に`grid.innerHTML`を再代入してDOM要素を破棄するが、`_klookWidgetInserted`フラグと`_klookWidgetEl`変数がクリアされない問題があった。`_cardElCache.clear()`と同じ箇所に`_klookWidgetInserted = false; _klookWidgetEl = null;`のリセット処理を追加

## キャッシュバスティング
- `public/index.html`: `app.js?v=20260713g→20260713h`、`app.css?v=20260712e→20260713h`
- `public/sw.js`: `CACHE_NAME`: `sg-weekend-v605→v606`

## 厳守事項（遵守済み）
- Klookの埋め込みコード自体（`data-wid`等の属性値、外部スクリプトURL）は無変更
- `.spot-card`クラス自体は付与していない（独立クラス`klook-widget-card`として実装）
- 設計書29のコード（`renderSponsoredCard()`等）・データは無変更（`git diff`で確認済み）

## 検証結果（checker実施済み）
- `git diff`で`_insertKlookWidget()`→`_createKlookWidgetEl()`関連以外の無関係な既存ロジック（`renderSponsoredCard()`等）が変更されていないことを確認
- `prBadgeLabel`が`STRINGS.ja`/`STRINGS.en`両方に既存定義済みであることを確認（新規i18nキー追加不要、i18n欠落なし）
- `.klook-widget-card`が`.spot-card`クラスを持たないため、既存の差分更新クリーンアップループ（`.spot-card`限定で判定）の対象外であることをコードレビューで確認
- `node --check public/app.js`で構文エラーなし
- `pm2 restart sg-weekend`後エラーログなし（既存の無関係な警告〈APNs未設定・course-validateスキップ〉のみ、新規エラーなし）
- 新バージョンの`app.js`/`app.css`が200 OKで配信され、更新後の`app.js`に`_createKlookWidgetEl`/`klook-widget-card`/`__klookWidget`が含まれることを確認
- **未検証（サーバー環境の制約、設計書30と同様）**: サーバーにヘッドレスChromium実行に必要な共有ライブラリが不足しており実ブラウザでの目視確認ができなかったため、カード風の見た目・PRラベルの表示位置・カード間差し込み位置の実際の見え方はユーザー自身のブラウザ確認が必要
- **未検証（実機）**: iOS版（Capacitor/TestFlight）での見た目・タップ挙動は未検証。iOS版への反映には別途TestFlightビルドが必要

## スコープ外（今回未実装）
- 自前PRカード（設計書29）とKlookウィジェット同時表示時の間隔調整（データが実際に入る段階で改めて調整）
- 複数スポンサーのローテーション、クリック計測、カテゴリ一致判定（設計書30から継続してスコープ外）

# 設計書32 — 広告表示機能フェーズ1「Klookアフィリエイトリンク」の一時停止（案A→案Bへ方針変更）

## 背景
コース詳細の「チケット情報」テキストリンク（フェーズ1、設計書23）について、当初はUI表示のみを非表示化しバックエンドは無変更とする案（案A）で進める予定だった。しかしユーザーが最終確認で「裏側のロジックは消さなくていいけど止めてください」と修正指示。これを受け、**バックエンドの処理自体（`GET /api/courses`が毎回`affiliateLink`を埋め込む計算・ファイル読み込み）を止める**方針（案B）に変更した。ただし関数定義・データファイル・スクリプトは削除しない。

## 実装内容（`server.js`）
`GET /api/courses`ハンドラ内、`community`/`popular`タブのレスポンス構築処理（1687行目・1692行目付近）で行われていた`embedAffiliateLinks(sorted, affiliateLinks)`の呼び出し2箇所を、単に`sorted`（`sorted.slice(0, 5)`）を返すよう変更した。`loadAffiliateLinks(city)`の呼び出し自体もコメントアウトし、無駄なファイル読み込みI/Oを止めた。

**関数定義は削除していない**:
- `loadAffiliateLinks(city)`（1650行目付近）: 関数定義そのまま残置。呼び出し元のみ停止
- `embedAffiliateLinks(courses, affiliateLinks)`（1662行目付近）: 関数定義そのまま残置。呼び出し元のみ停止
- 各関数の直前・呼び出し元コメントアウト箇所に「【設計書32】呼び出し元（GET /api/courses）は一時停止中。関数自体は削除せず残置（復活時はそのまま呼び出しを戻せる）。」というコメントを追加

### `public/app.js`は無変更
バックエンド側で`affiliateLink`フィールド自体がレスポンスに含まれなくなるため、フロントエンド側の既存の条件分岐（`renderCourseDetail()` 3293行目付近、`renderCourseResultHtml()` 3721行目付近の`s.affiliateLink ? ... : ''`）は自然に「リンクなし」側の分岐を通るようになり、コード変更なしで表示が消える。

## 変更しないもの（削除・変更しなかったもの）
- `loadAffiliateLinks()`/`embedAffiliateLinks()`の関数定義自体
- `POST /api/affiliate-click`エンドポイント（2297行目付近）
- `data/sg/affiliate-links.json`
- `scripts/match-affiliate-links.js`
- `public/app.js`の`openAffiliateLink()`関数、i18nキー`affiliateInfoLink`
- イベント一覧側のKlook公式ウィジェット関連コード（設計書30・31、別物のため対象外）

## 検証結果（checker実施済み）
- 🔴Critical: なし
- `GET /api/courses?city=sg&tab=community`・`?tab=popular`をcurlで確認、レスポンス内のスポットに`affiliateLink`フィールドが含まれなくなったことを確認（該当コース件数0件）
- 住所表示（`s.address`）は従来通り表示されることを確認
- `git diff`で`loadAffiliateLinks()`/`embedAffiliateLinks()`の関数定義が削除されておらずコメント追加のみであることを確認
- `data/sg/affiliate-links.json`・`scripts/match-affiliate-links.js`・`public/app.js`/`index.html`/`sw.js`が無変更であることを確認
- `POST /api/affiliate-click`をcurlで直接叩き、引き続き200応答・`data/affiliate-clicks.json`への追記が行われることを確認（検証用テストエントリは検証後に削除し元の状態へ復元済み）
- 他都市（bkk）の`GET /api/courses`にも回帰なし（200応答）
- 変更箇所（1650〜1695行目付近）がStripe無効化コメントブロック（47〜200行目付近）の外にあることを確認
- `node --check server.js`で構文エラーなし、`pm2 restart sg-weekend`後エラーログなし（既存の無関係な警告〈trust proxy, APNs未設定, course-validateスキップ〉のみ）

## デプロイ・申し送り
- `pm2 restart sg-weekend`実行済み
- ローカル`main`へのコミットのみ。**releaseブランチへのpush・TestFlightビルドはユーザーの明示指示があるまで実施しない**（今回の依頼にも含まれていない）
- CLAUDE.mdの「広告表示機能フェーズ1: Klookアフィリエイトリンク」セクションを、「バックエンド側の埋め込み処理を一時停止中（関数・データ・スクリプトは残置、復活は`embedAffiliateLinks()`呼び出しを戻すだけ）」という正確な状態に更新済み

---

# 設計書33: SGインスタグラム取り込みソースのトラブル調査（status制御バグ・履歴ゼロ9アカウント・filter-events.jsリトライ設計）

## 調査日
2026-07-14（デバッガーによる調査のみ、コード変更なし）

## 症状の説明
ユーザーから3件の依頼が発生した:
1. `uniqlosg`を正式に取得対象から外したい（累計106送信・採用4件、採用率4%）
2. `mujisg`に`pausedAt`/`pausedReason`が設定されているのに実際には07-08・07-12も取得され続けている（一時停止のつもりが機能していないバグ）
3. `data/source-history.json`に一度も登場しない9アカウント（`otokoramen_alexandra` `singaporezoo` `nationalgallerysg` `artscience_museum` `birdparadise_sg` `TheProjectorSG` `esplanadesingapore` `singaporeflyer` `marinabaysands`）の原因調査

加えて、`scripts/filter-events.js`のSonnet記事生成失敗時のリトライ・除外ロジック追加に向けた事前調査。

---

## A. ステータス制御ロジックの調査結果

### A-1. `status`フィールドの扱い（確定）
`scripts/fetch-events.js`の`loadActiveSources()`（91〜109行目）が全ソースの取得可否を決定している。

```js
const feeds = (cityConf.feeds || [])
  .filter(f => f.status === 'active')          // 100行目
  .map(f => ({ url: f.url, name: f.name, ...(f.options || {}) }));

const instagramAccounts = (cityConf.instagramAccounts || [])
  .filter(a => a.status === 'active')           // 104行目
  .map(a => a.username);
```

- 判定条件は**`status === 'active'`の1フィールドのみ**。それ以外の値（`'paused'`・`'retired'`・`'rejected'`・未設定等）はすべて取得対象から除外される
- `pausedAt`/`pausedReason`は`fetch-events.js`ではまったく参照されていない（grep結果でも該当なし）。**記録用メタデータであり、動作には一切影響しない設計**（ユーザーの推測どおり）
- `discover-sources.js`は`status`/`pausedAt`等を参照する処理が存在しない（grep結果0件、無関係）
- `scripts/analyze-sources.js`は`'active'`（175-176, 226-227行目）・`'paused'`（204-205行目）・`'rejected'`（226-227行目）の3値を正式にサポートしている。**つまり`"paused"`は本システムにおいて既存の正規サポート値**であり、新設不要
- `analyze-sources.js`の自動停止ロジック（298〜303行目）は、不良ソースを検出すると`status: 'paused'`・`pausedAt`・`pausedReason`の3つを**同時に**セットする実装になっている（バグの実装ではなく、正しい参照実装）
- 停止後7日経過かつ通算採用0件のソースは`analyze-sources.js`のStep0（206〜222行目）で自動的に`status: 'rejected'`へ昇格する仕組みも存在する

### A-2. mujisg/uniqlosgが止まらなかった理由（確定）
`data/sources.json`を確認したところ、両アカウントとも:
```json
{
  "username": "uniqlosg",
  "status": "active",       // ← 'paused'ではなくactiveのまま
  "pinned": true,
  "pausedAt": "2026-07-01",
  "pausedReason": "採用率ゼロ継続（0/8）プロモ投稿ばかり"
}
```
`status`が`"active"`のままなので、`fetch-events.js`の`loadActiveSources()`のフィルタを素通りし続けていた。

さらに、両アカウントとも`"pinned": true`が設定されている。`analyze-sources.js`の自動停止ロジック（Step1、252〜256行目）は`if (obj.pinned) { ... continue; }`で**pinnedなソースを自動停止の対象外**にしている。つまり:
- `analyze-sources.js`の自動処理によって`pausedAt`/`pausedReason`だけがセットされた可能性は構造上ありえない（pinnedゆえにこのロジックが素通りする）
- **推測**: 過去のセッションで人力（AIエージェントによる`data/sources.json`の直接編集、または類似の手動運用）により`pausedAt`/`pausedReason`のみが追記され、本来同時にセットすべき`status: 'paused'`の書き換えが漏れたと考えられる。ログ・コミット履歴等の直接証拠は確認していないため、この経緯自体は推測である

### A-3. 修正方針（推奨）
- 独自の新しい`status`値（例: `"stopped"`）を導入する必要はない。**既存の`"paused"`（一時停止・将来的な復活余地あり）または`"rejected"`（永久除外・analyze-sources.jsの命名慣習に合わせる）のいずれかを流用すれば足りる**
- **uniqlosg**（ユーザー意図: 正式に取得対象から外す・累計採用率4%と明確に不良）→ `status: "rejected"`が適切。`rejectedAt`・`rejectedReason`も併せて設定するとanalyze-sources.js側の記録慣習（217〜219行目）と一貫性が取れる
- **mujisg**（ユーザー意図: 一時停止のバグを直す。ユーザー文言は「一時停止バグを直す」であり永久除外とは言っていない点に注意）→ `status: "paused"`に修正するのがユーザー意図に忠実。既存の`pausedAt`/`pausedReason`はそのまま活かせる（値の再設定は不要、`status`フィールドの追加・修正のみで足りる）
- いずれの修正も`data/sources.json`内の該当2オブジェクトの`status`値を書き換えるだけで完結し、`fetch-events.js`/`analyze-sources.js`のロジック自体には変更不要（設計は健全で、単純なデータ側の入力漏れが原因のため）
- **再発防止の論点**: `pausedAt`/`pausedReason`を手動追記する運用がある場合、`status`とのセット漏れが今後も起こりうる。将来的な改善として、`analyze-sources.js`または別の軽量スクリプトに「`pausedAt`/`rejectedAt`等の日付メタデータが存在するのに`status`が`active`のまま」という不整合を検知するチェック処理を追加する案が考えられる（今回はユーザー依頼の範囲外のため、対応要否は次工程の判断に委ねる）

---

## B. 履歴ゼロ9アカウントの実地調査結果

`.env`のInstagram認証情報を用い、`fetch-events.js`の`fetchInstagramPosts()`と同じBusiness Discovery APIエンドポイント・パラメータで9アカウントすべてを実地確認した（認証情報の値自体は非出力）。

### B-1. API呼び出し結果一覧

| アカウント | API結果 | 判定 |
|---|---|---|
| `otokoramen_alexandra` | 成功（media 25件） | 投稿頻度の問題（詳細はB-2） |
| `singaporezoo` | エラー `Invalid user id` (subcode 2207013) | ユーザー名誤り（詳細はB-3） |
| `nationalgallerysg` | エラー `Invalid user id` | ユーザー名誤り（詳細はB-3） |
| `artscience_museum` | エラー `Invalid user id` | 原因不明（正しいユーザー名を特定できず） |
| `birdparadise_sg` | エラー `Invalid user id` | 原因不明（正しいユーザー名を特定できず） |
| `TheProjectorSG` | エラー `Invalid user id` | ユーザー名誤り（詳細はB-3） |
| `esplanadesingapore` | 成功（media 25件） | 正常稼働中（下記参照） |
| `singaporeflyer` | 成功（media 25件） | 正常稼働中（下記参照） |
| `marinabaysands` | 成功（media 25件） | 投稿頻度の問題（詳細はB-2） |
| （参考）`sciencecentresg` | 成功（media 25件） | 正常稼働の対照群 |

### B-2. API成功だが「0件取得」ログになっているアカウント（実地確認済み）
`fetch-events.js`の`fetchInstagramPosts()`（276〜277行目）は**直近4日以内**（`cutoff.setDate(cutoff.getDate() - 4)`）かつcaption必須で投稿をフィルタしている。

- **`otokoramen_alexandra`**: 取得した直近10投稿のtimestampは2026-05-25が最新で、以降2026-03、2026-01…と数ヶ月おきの低頻度更新。4日以内の投稿が構造的にほぼ存在しない。**アカウント自体の更新頻度が低いことが原因**。API・実装いずれの不具合でもない
- **`marinabaysands`**: 直近10投稿は2026-07-08が最新で、その後2026-07-02・07-01…とおよそ週1〜2本ペース。実行日（2026-07-13/14）から見て2026-07-08は5〜6日前となり、4日cutoffをわずかに外れている。**投稿頻度と実行タイミングの兼ね合いでたまたま連続してcutoff外になっている状態**。今後も同程度の投稿頻度が続く場合、恒常的にcutoff境界を外れやすい構造的リスクがある

実際に`logs/run-fetch-all.log`でも両アカウントとも「`✅ 0件取得`」（エラーではなく正常応答の0件）となっており、上記の実地確認結果と整合する。

### B-3. ユーザー名誤りと判定したアカウント（正しいユーザー名を特定・確認済み）

| 誤り（sources.json記載） | 正しいと推測されるユーザー名 | 確認結果 |
|---|---|---|
| `singaporezoo` | `mandaiwildlifereserve` | followers 191,427 / media 2,692件で正常応答 |
| `nationalgallerysg` | `nationalgallerysingapore` | followers 111,142 / media 2,973件で正常応答 |
| `TheProjectorSG` | `theprojectorsg`（大文字小文字違いの可能性） | followers 52,997 / media 5,237件で正常応答 |

これらは各施設の現行の公式Instagramハンドルが`sources.json`登録時と異なっている（またはリブランディング等でユーザー名が変更された）ものと推測される。**確度は高いが、これらが「本当にその施設の公式アカウントである」という最終確認はfollower数・投稿内容からの状況証拠であり、100%の確証ではない**（次工程で実際にInstagram上で公式アカウントであることを目視確認することを推奨）。

### B-4. 原因不明のアカウント
- **`artscience_museum`**（ArtScience Museum） / **`birdparadise_sg`**（Bird Paradise）
- 複数のユーザー名バリエーション（`artsciencemuseum`、`asmsingapore`、`birdparadise`、`mandaibirdparadise`、`mandai.birdparadise`等）を試したが、いずれも`Invalid user id`エラーで正しいユーザー名を特定できなかった
- 存在しない／非公開／Business・Creatorアカウントでない／単なる登録時のタイプミス、のいずれが真因かは今回の調査範囲では**不明**。断定は避ける

### B-5. 正常稼働している3アカウント（削除不要）
`esplanadesingapore`・`singaporeflyer`は`logs/run-fetch-all.log`で実際に投稿取得・スコアリングされている記録があり（例: `✅ 採用: ダーク演劇「Multiple Bad Things」...source: Instagram / @esplanadesingapore`）、正常に機能している。`data/source-history.json`に「一度も登場しない」というユーザー認識と実態がやや異なっており、直近のfetch実行では既に履歴が生成され始めている可能性がある（`source-history.json`の集計タイミング・範囲は今回未確認、次工程で要確認）。

### B-6. logs/配下のエラーログ確認結果
`logs/run-fetch-all.log`で9アカウント名をgrep確認:
- `singaporezoo`・`nationalgallerysg`・`artscience_museum`・`birdparadise_sg`・`TheProjectorSG`: 「⚠️ 取得失敗」ログあり（`fetchInstagramPosts()`309〜314行目の`catch`ブロック相当のログ出力パターンではなく、294〜297行目の`business_discovery.media.data`不在時の分岐ログ）。ただし**エラーメッセージの詳細（`Invalid user id`等）自体はログに出力されていない**（`console.log('取得失敗')`のみでAPIエラー内容を握りつぶしている）
- `otokoramen_alexandra`・`marinabaysands`: 「✅ 0件取得」の正常終了ログのみ、エラーログなし

### B-7. 削除推奨/様子見推奨の判定まとめ

| アカウント | 推奨 | 理由 |
|---|---|---|
| `singaporezoo` | **修正推奨**（削除ではなくユーザー名訂正） | `mandaiwildlifereserve`に訂正すれば取得可能と推定される |
| `nationalgallerysg` | **修正推奨**（削除ではなくユーザー名訂正） | `nationalgallerysingapore`に訂正すれば取得可能と推定される |
| `TheProjectorSG` | **修正推奨**（削除ではなくユーザー名訂正） | `theprojectorsg`に訂正すれば取得可能と推定される |
| `artscience_museum` | **様子見 or ユーザー本人による正しいハンドル確認待ち** | 正しいユーザー名が特定できず、削除するには判断材料不足 |
| `birdparadise_sg` | **様子見 or ユーザー本人による正しいハンドル確認待ち** | 同上 |
| `otokoramen_alexandra` | **様子見**（削除は時期尚早） | API疎通は正常。単に投稿頻度が低いだけで、アカウント自体は生きている。ただし4日cutoffとの相性が悪く実質的に取得され続けない可能性が高い点はユーザーに情報共有すべき |
| `marinabaysands` | **様子見**（削除は時期尚早） | API疎通は正常。投稿頻度がcutoff境界ギリギリで、実行タイミング次第では取得できる可能性が残る |
| `esplanadesingapore` | **削除不要（正常稼働）** | 実際に投稿取得・採用実績あり |
| `singaporeflyer` | **削除不要（正常稼働、ただし採用率は要観察）** | 取得実績はあるが07-13時点のログでは0/1・0/2と採用ゼロ継続。まだ判断するには早い（`analyze-sources.js`の`minRuns`閾値未達の可能性、閾値自体は今回未確認） |

---

## C. filter-events.js リトライ・除外ロジックの追加箇所（事前調査のみ）

ユーザー要望: 「Sonnet記事生成が失敗したら1回リトライし、それでもダメならイベント自体を保存しない」

### 現状のコード構造（確定・行番号はすべて`scripts/filter-events.js`）

1. **`enrichBatch(batch, cityKey)`関数**（235〜300行目）: Sonnetへバッチ単位でリクエストを送り、JSON配列をパースして返す。失敗時（API例外、JSON解析失敗等）は呼び出し元に例外がthrowされる（298行目`if (!match) return [];`のケースのみ空配列を返し例外にならない点に注意）
2. **呼び出しループ**（423〜433行目）:
   ```js
   for (let i = 0; i < enrichBatches.length; i++) {
     const batch = enrichBatches[i];
     try {
       const results = await enrichBatch(batch, cityKey);
       for (const r of results) enriched.set(r.index, r);
       if (i + 1 < enrichBatches.length) await new Promise(r => setTimeout(r, 1000));
     } catch (e) {
       console.error(`    ❌ 記事生成エラー: ${e.message}`);   // ← 431行目、エラーを握りつぶすのみ
     }
   }
   ```
   catch節（430〜432行目）はエラーログを出すだけで、リトライも例外の再送出も行っていない。バッチ全体が丸ごと失敗すると、そのバッチに含まれる全`_enrichPos`が`enriched` Mapに登録されないまま処理が次バッチへ進む
3. **結合ループ**（439〜477行目）: `filtered`配列（Haiku採否済みの全採用イベント）を無条件にすべて`newItems`へ積む。440行目`const enrich = enriched.get(f._enrichPos) || {};`により、enrichBatchが失敗して未登録だった`_enrichPos`は**空オブジェクト`{}`にフォールバック**し、462〜465行目で`content`/`content_en`/`tips`/`tips_en`が空文字・空配列のまま`newItems`に積まれ、507〜513行目で無条件に`events.json`へ書き込まれる。**これが「Sonnet失敗イベントが空contentのまま保存される」現象の直接原因**

### リトライ・除外ロジックを追加すべき箇所（要点）

- **リトライの追加**: 423〜433行目のループ内、`catch (e)`節（431行目）に1回リトライを追加する形が自然（`enrichBatch()`自体は副作用なしの純粋なAPI呼び出しなので再実行が安全）。実装方式としては「catch内でもう一度`await enrichBatch(batch, cityKey)`を試み、それも失敗したら諦める」という単純な形が既存コードの構造に最も馴染む
- **除外ロジックの追加**: 439行目の結合ループ内、440行目`enriched.get(f._enrichPos) || {}`の直後に、**enrichが空（＝リトライしても失敗した`_enrichPos`）の場合は`continue`でそのイベント自体を`newItems`にpushしない**分岐を追加するのが最小変更。ただし「空オブジェクト」と「Sonnetが返した結果だが偶然空文字だった」を区別する必要があるため、`enriched.has(f._enrichPos)`で判定する方が`|| {}`のフォールバック方式より安全（Mapに存在するかどうかで「試行して失敗したか」を正確に判定できる）
- **バッチ単位 vs イベント単位の粒度の注意点**: 現状`enrichBatch`は`ENRICH_BATCH_SIZE`件まとめて1回のAPI呼び出しをしている。バッチ全体を1回リトライしても、リトライ後も特定の1件だけJSON形式が崩れる／Sonnetが一部indexを返し忘れる、といった部分的失敗はありうる（298行目の`if (!match) return [];`は全滅パターンのみを扱っており、一部のindexだけ欠落するケースは現状の`enriched.set(r.index, r)`ループで自然に「該当indexだけ`enriched`未登録」になる）。「除外ロジック」を440行目・`enriched.has()`判定で実装しておけば、バッチ丸ごと失敗・一部index欠落のどちらのケースも自動的に同じ経路で「保存しない」扱いにできるため、対応漏れが少ない設計と考えられる
- **変更が必要な関数**: `enrichBatch()`（235行目、変更不要・現状のまま再利用可能）、呼び出しループ（423〜433行目、リトライ追加）、結合ループ（439〜477行目、除外判定追加）の3箇所。`filterBatch()`（Haiku側フィルタ、397〜408行目）は今回のユーザー要望の対象外（Sonnet段階のみが対象）
- 詳細な実装方式（リトライ回数・待機時間・ログ出力形式等）はここでは決定しない。後続のplanner/orchestratorフェーズで設計する前提

---

## 全体を通じた推奨対応（次工程への申し送り）

### 即実施可能（データ修正のみ、ロジック変更不要）
1. `data/sources.json`の`uniqlosg`の`status`を`"active"`→`"rejected"`に変更（`rejectedAt`/`rejectedReason`も追記推奨）
2. `data/sources.json`の`mujisg`の`status`を`"active"`→`"paused"`に変更（既存の`pausedAt`/`pausedReason`はそのまま活用）
3. `data/sources.json`の`singaporezoo`→`mandaiwildlifereserve`、`nationalgallerysg`→`nationalgallerysingapore`、`TheProjectorSG`→`theprojectorsg`へユーザー名訂正（訂正前に、これらが本当に該当施設の公式アカウントかInstagram上で目視確認することを推奨）

### 判断保留・様子見
4. `artscience_museum`・`birdparadise_sg`は正しいユーザー名が不明のため、ユーザー本人に正しいInstagramハンドルの確認を仰ぐか、削除するか判断が必要
5. `otokoramen_alexandra`・`marinabaysands`は技術的には正常だが、4日cutoffと投稿頻度の相性が悪く実質的に機能しにくい。cutoff日数の緩和（4日→7日等）を検討するか、このまま様子見するかはユーザー判断が必要（cutoff変更は他の全Instagramアカウントに影響する全体設定のため、変更する場合は影響範囲の検討が別途必要）

### 別タスクとして今後着手（設計要）
6. `filter-events.js`のSonnet記事生成リトライ・除外ロジック（C節の調査結果に基づき、次のplannerフェーズで詳細設計）

### 参考: 今回の調査で判明した副次的な設計事実（バグではないが記録推奨）
- `analyze-sources.js`は`status`に`active`/`paused`/`rejected`の3値運用が既に確立されている。今後`data/sources.json`を手動編集する際は、この3値の整合性（`status`と`pausedAt`/`rejectedAt`等のメタデータのセット漏れがないか）を毎回確認すべき
- `fetchInstagramPosts()`のBusiness Discovery APIエラー時、`console.log('取得失敗')`のみでエラー詳細（`Invalid user id`等）をログに残していないため、今回のような「なぜ取得できないか」の調査が都度API実地確認を要する状態になっている。エラーメッセージ自体をログ出力するよう改善すれば、今後同種の調査コストを下げられる（今回のユーザー依頼範囲外、次工程での検討事項として記録）

---

## 実装完了（2026-07-14、builder/checker/closer実施）

上記A・B節の調査結果に基づき、以下3タスクを実装した。

### タスク1: IGソースのステータス修正（`data/sources.json`）
- `uniqlosg`: `status: "active"` → `"rejected"`（`rejectedAt: "2026-07-14"`・`rejectedReason`追記）
- `mujisg`: `status: "active"` → `"paused"`（既存`pausedAt`/`pausedReason`はそのまま維持）
- `singaporezoo` → `mandaiwildlifereserve`、`nationalgallerysg` → `nationalgallerysingapore`、`TheProjectorSG` → `theprojectorsg`にusername訂正
- `artscience_museum`・`birdparadise_sg`は配列から削除（正しいユーザー名が特定できなかったため）
- `otokoramen_alexandra`・`marinabaysands`・`esplanadesingapore`・`singaporeflyer`は無変更
- `sg.instagramAccounts`は22件→20件に

### タスク2: `scripts/filter-events.js`にリトライ・除外ロジックを追加
- Sonnet記事生成ループの`catch`節に1回リトライを追加（`enrichBatch()`自体は無変更）
- 結合ループの判定を`enriched.get(f._enrichPos) || {}`（空オブジェクトへの無条件フォールバック）から`enriched.has(f._enrichPos)`に変更し、記事生成に最終的に失敗したイベントは`newItems`に追加せず除外するように修正
- 除外件数をログ出力（`⚠️ 記事生成に失敗したため${n}件のイベントを除外しました`）

### タスク3: 既存の空説明イベント6件の修復
- 使い捨てスクリプト`scripts/repair-empty-content.js`を作成し、`fetchArticleContent()`（OGP取得）+ Sonnet記事生成（1回リトライ込み）で6件全てを修復（削除0件）
- 対象6件（JOFA Coffee Shop Bedok / Xiang Xiang Hunan Cuisine / JUMBOREE Tai Seng / Four Points Eatery / QT Singapore・Cygnet Bar / Peach Garden）すべて`content`/`content_en`/`tips`/`tips_en`が正しく埋まったことを確認
- 対象外の102件は完全無変更（diffで確認済み）

### 検証結果（checker）
- `data/sources.json`・`data/sg/events.json`ともJSON構文OK
- `node -c scripts/filter-events.js`構文OK、diffは指示の3箇所のみに限定
- `GET /api/events?city=sg`はHTTP 200で正常応答
- `discover-sources.js`・`analyze-sources.js`・bkk/sydデータは無変更を確認
- 🔴Criticalなし。🟢Minor1件: `notify-fetch-summary.js`のLINE通知「◯件採用」合計値はHaikuフィルタ通過数ベースのままでSonnet失敗除外分が反映されない（通知ロジック自体は今回のスコープ外、対応不要）
- CLAUDE.mdの「イベント取り込みパイプライン構成」セクションに、`status`値運用の正しい意味とリトライ・除外ロジックを恒久情報として追記済み

---

# 設計書34 — iOS Push通知entitlements自動生成処理の復元

## 背景
`おでかけNavi`プロジェクトのiOS Push通知対応「フェーズ0」（Apple Developer PortalでのAPNs Auth Key発行・App ID `app.dosuru`のPush Notifications capability有効化・配布用Provisioning Profile再生成・GitHub Secrets `PROVISION_PROFILE_BASE64`更新・VPSの`.env`へのAPNs設定追加）が2026-07-14に全て完了した。これに伴い、`.github/workflows/ios-deploy.yml`内でコメントアウトされていたentitlements自動生成2ステップを復元する。

## 変更するファイル
`/home/masahiko/sg-weekend-app/.github/workflows/ios-deploy.yml` のみ。他のファイル（`capacitor.config.js`・`Fastfile`・`Appfile`・`package.json`・`server.js`）への変更は不要（plannerが調査済み、整合性確認済み）。

## 具体的な変更内容
1. **60〜78行目**: `Create App.entitlements (Push Notifications capability)` ステップのコメントアウトを解除する
   - 60〜68行目は「⚠️ 2026-07-11 一時無効化」という無効化理由の説明コメント（このコメントブロックは削除するか、「2026-07-14復元済み」という履歴コメントに書き換えるかはbuilderの裁量でよい）
   - 69〜78行目はステップ本体（`# - name: Create App.entitlements...` から `#     cat "$ENTITLEMENTS_PATH"` まで）。行頭の`#`（コメントアウト）を除去し、有効なYAMLステップとして復活させる
   - 配置位置: 「Set camera usage description in Info.plist」ステップの直後、「Select Xcode 26」ステップの直前（既存の位置のまま、移動不要）

2. **98〜115行目**: `Wire App.entitlements into Xcode project build settings` ステップのコメントアウトを解除する
   - 98〜100行目は無効化理由の説明コメント（同様に削除または書き換えはbuilder裁量）
   - 101〜115行目はステップ本体（`# - name: Wire App.entitlements...` から `#     '` まで）。行頭の`#`を除去する
   - 配置位置: 「Setup Ruby」ステップの直後、「Extract release notes from package.json」ステップの直前（既存の位置のまま、移動不要）

3. コメントを解除した後、YAMLとして正しくインデント・構文が保たれているか確認すること（元々有効なYAMLとして書かれていたものをコメントアウトしただけなので、単純に`#`とインデントを除去すれば有効なYAMLに戻るはずだが、必ず確認する）

## 受け入れ基準
- `.github/workflows/ios-deploy.yml`がYAMLとして正しくパースできること（`yamllint`や`python3 -c "import yaml; yaml.safe_load(open('...'))"`等で検証）
- 2つのステップが有効なステップとして復元されていること（`name:`フィールドがコメントでなくなっている）
- 他の既存ステップ（Info.plist操作、Xcode選択、Ruby setup、fastlane deploy等）の内容・順序は一切変更しないこと
- entitlementsファイルパス`ios/App/App/App.entitlements`、Xcodeプロジェクトパス`ios/App/App.xcodeproj`、ターゲット名`App`は変更しない（plannerが既存のFastfile等と整合していることを確認済み）

## スコープ外（今回変更しないこと）
- `ios-app/fastlane/Appfile`・`ios-app/README.md`に残る古い`app.dosuru.odenavi`表記の修正（既知の乖離だが実害なし、別タスク）
- `release`ブランチへのpush（今回は`main`ブランチでのコメントアウト解除のみ。実際にTestFlightビルドをトリガーするのは別途ユーザーの明示指示が必要というプロジェクトルールがあるため、pushしない）
- サーバー側（server.js）・フロントエンド（public/app.js）のAPNs関連コード変更（2026-07-10実装済み、無変更）

## 実装完了（2026-07-14、builder/checker/closer実施）
- `.github/workflows/ios-deploy.yml`の2箇所のコメントアウトを解除。無効化理由の説明コメントは「2026-07-11に一時無効化していたが、2026-07-14 フェーズ0完了に伴い復元済み（設計書34）」という趣旨の履歴コメントに書き換えた
- YAML構文検証済み（`python3 -c "import yaml; yaml.safe_load(...)"`でパース成功）。ステップ数13→15、`Create App.entitlements (Push Notifications capability)`・`Wire App.entitlements into Xcode project build settings`が有効なステップ名として復元されていることを確認
- 配置位置・entitlementsファイルパス・Xcodeプロジェクトパス・ターゲット名は変更なし。他の既存ステップの内容・順序も無変更（`git diff`で確認済み、変更ファイルは本ファイルのみ）
- checkerで🔴🟡🟢いずれもなし
- サーバーサイド（server.js）・フロントエンド（public/app.js）は無変更のため`pm2 restart`不要・未実施
- ローカル`main`へのコミットのみ。`release`ブランチへのpush・TestFlightビルドのトリガーは実施していない（次回のビルド時、このワークフローが自動的に使われる）
- ローカル`main`へのコミットのみ実施。GitHubへのpush・iOSリリースは含まない（`filter-events.js`はcronから直接実行されるスクリプトのためpm2再起動不要、`data/sources.json`・`data/sg/events.json`は`fs.readFileSync`都度読み込みのため即座に反映済み）


# 設計書35 — 設計書20（Google/Apple IDログイン）フェーズ分け再評価（フェーズ0解消 + 認証情報最小化方針を反映）

（2026-07-14 planner再調査。コード変更なし、設計のみ。設計書20〈1615〜1869行目〉の本文は削除・上書きせず、本設計書は差分更新として追記する）

## 0. 本設計書の位置づけ

設計書20は2026-07-12時点の調査に基づき、「Apple Developerアカウントの個人→法人切替審査未完了（フェーズ0）」を最大のブロッカーとして段階的フェーズ分けを提案していた。2026-07-14、このフェーズ0が完了したことが設計書34（同日、`.claude/plan.md` 3541〜3580行目）で実装確認済みである。本設計書は、この事実を踏まえて設計書20のうち何が変わり、何が変わらないかを再検証し、フェーズ分けを再提案する。あわせて、ユーザーとのすり合わせにより確定した「認証情報の最小化方針（個人情報を一切収集しない）」を設計書20 §5-1・§6-1への差分として反映する。**設計書20本文はそのまま保持し、本設計書はその上に乗る「差分パッチ」として扱うこと。**

## 1. 実コード再検証結果（2026-07-14時点）

### 1-1. フェーズ0の解消を確認（設計書20 §1-1の更新）

`.github/workflows/ios-deploy.yml`を実際に読み込み、以下を確認した。

- 64行目`Create App.entitlements (Push Notifications capability)`ステップ、94行目`Wire App.entitlements into Xcode project build settings`ステップの両方とも、行頭の`#`によるコメントアウトが解除され、**有効なYAMLステップとして復元済み**であることを確認した（設計書34の実装結果と一致）。
- 60〜63行目・93行目のコメントは「2026-07-11に一時無効化していたが、2026-07-14 フェーズ0完了…に伴い復元済み（設計書34）」という履歴コメントに書き換わっている。設計書20 §1-1が引用していた「Apple Developerアカウントを個人→法人へ切替登録中で、法人審査…完了までApp ID(app.dosuru)のPush Notifications capabilityを有効化できない」という無効化理由コメントは、**もはや存在しない（過去形の履歴コメントに置き換わっている）**。

設計書20 §1-1の「2026-07-12時点でも未解消と確認できた」という記述、およびこれに基づく「同一Apple Developer Portal・同一App IDの審査待ちでブロックされている実例が既にCI設定に存在する」という論拠は、**2026-07-14時点で解消され、事実と異なる（過去の状態の記述として履歴的価値はあるが、現状認識としては古い）**。

ユーザー提示の背景情報の通り、フェーズ0で実際に完了した内容は次の5点（設計書34より）:
1. Apple Developerアカウントの法人審査（WILLOA PTE. LTD.、Team ID: 4P3SWV4X5U）完了
2. App ID (`app.dosuru`) でPush Notifications capability有効化
3. 配布用Provisioning Profileの再生成（Push capability込み）
4. GitHub Secrets `PROVISION_PROFILE_BASE64` 更新
5. `ios-deploy.yml`のentitlements自動生成2ステップのコメントアウト解除・復元

### 1-2. Sign in with Apple capability・In-App Purchase capabilityへの波及見込み（再評価）

設計書20 §1-1・§9・§8-1は「Sign in with Apple capability・In-App Purchase capabilityも同じPortal・同じApp IDの操作であるため、Push Notifications capabilityが実際にブロックされていた実例から、これらも同様にブロックされる可能性が高い」という**推論**を根拠に、フェーズ1b・フェーズ3bをフェーズ0待ちにしていた。

今回、そのPush Notifications capability自体が実際に有効化できたことが確認された（法人審査完了後、capability追加・Provisioning Profile再生成・Secrets更新の一連の操作が現実に完了している）。これにより:

- 「法人審査未完了だからcapability追加ができない」という論拠は前提から崩れた。法人審査は既に完了しているため、Sign in with Apple capability・In-App Purchase capabilityの追加も、**Apple Developer Portalの操作としては今すぐ可能な状態にある**と判断してよい（推測ではなく、同一Portal・同一App IDでの類似操作が実際に成功したという直接的な実例による裏付け）。
- ただし、これは「capability自体を有効化する障害がなくなった」ことを意味するのみで、「Sign in with Apple・In-App Purchase機能自体の実装（コーディング・プラグイン導入・サーバー側検証ロジック等）が完了した」ことは意味しない。設計書20 §5〜§9で述べられている実装作業（クライアント側プラグイン導入、サーバー側JWT検証、`data/users.json`設計等）自体は**引き続き未着手**であり、これは今回のフェーズ0解消と無関係に今後発生する実装コストである。

### 1-3. その他の未着手事項の再確認（設計書20から変化なし）

- `ios-app/package.json`（現状: version 1.5、依存6パッケージ）にApple/Google Sign-In系プラグインは**引き続き存在しない**（未着手のまま）。
- ルート`package.json`（現状: dependencies 12種）に`jsonwebtoken`は**引き続き存在しない**（未導入のまま）。
- `ios-app/fastlane/Fastfile`は`fastlane match`を使わず、`DIST_CERT_BASE64`/`PROVISION_PROFILE_BASE64`の手動証明書・プロファイルBase64配布方式のまま変更なし。設計書20 §1-4・§9で指摘された「capability追加のたびにProvisioning Profileの手動再生成・GitHub Secrets手動更新が必要」という運用上の制約は**そのまま引き継がれる**（今回のPush Notifications capability追加時も実際にこの手動更新オペレーションが発生し、完了した実例が増えたのみ）。
- `ios-app/capacitor.config.js`にSign in with Apple関連の設定は引き続き存在しない（未着手のため当然、変化なし）。

### 1-4. コース関連エンドポイントの行番号更新（設計書20 §1-2）

設計書20 §1-2は「`server.js` 2154〜2217行目」としていたが、2026-07-14時点で`server.js`を実際に確認したところ、行番号が以下の通りズレていることを確認した（設計書23〈広告表示機能〉・設計書29〈PRカード〉等の追加により行数が増加したためと推測される）。

| エンドポイント | 設計書20記載の行番号 | 2026-07-14実測行番号 |
|---|---|---|
| `POST /api/courses/publish` | 2155行目 | **2233行目** |
| `DELETE /api/courses/:id` | （記載なし、2154〜2217範囲内） | **2251行目** |
| `POST /api/courses/:id/like` | （範囲外） | 2264行目（参考、変更対象外） |
| `POST /api/courses/:id/unpublish` | 2206行目 | **2284行目** |

**コードの中身自体（認証・所有権チェックの欠如）は設計書20 §1-2の記述と完全に一致しており、変わっていない**ことを実際に該当コードを読んで確認した。

`POST /api/courses/publish`（2233行目）も同様に`course.authorId`をそのまま保存するのみで検証なし。したがって**設計書20 §1-2・§6-4で指摘されたなりすまし脆弱性の評価・深刻度は完全に変更なしで引き継がれる**。行番号のみが古くなっていたため、本設計書で訂正する。

## 2. フェーズ0解消を踏まえたフェーズ分けの再評価

### 2-1. フェーズ1a/1b分割の要否（設計書20 §10-2の再検討）

設計書20は、フェーズ0未解消を前提に「フェーズ1a: Google Sign-Inのみ先行実装（審査と無関係）」「フェーズ1b: Sign in with Apple実装（フェーズ0待ち）」と分割していた。この分割の主目的は「フェーズ0という外部要因のブロッカーがある間も、無関係な部分だけでも着手を進められるようにする」ことだった。

フェーズ0が解消された今、**この分割の存在理由（外部ブロッカーの回避）は失われた**。

#### 案1（推奨）: フェーズ1a/1bを統合し、Google Sign-InとSign in with Appleを最初から同時に実装する一体型フェーズ1とする

**メリット**:
- Appleガイドライン4.8（サードパーティログイン提供時はSign in with Appleも同等提供必須）を最初から満たした状態で開発が進む。
- 「未リリースのコードをどれだけの期間メンテナンスし続けるか」（設計書20 §12リスク2）という開発運用リスクが原理的に生じない。
- Apple/Google両方の認証結果を受け取る`server.js`側の共通処理（JWT発行・`data/users.json`のupsertロジック・`authedFetch`ヘルパー等、設計書20 §5-2・§6-1）は、どのみちプロバイダ非依存の設計にする前提のため、最初から両プロバイダのテストケースを通して設計する方が手戻りが少ない。
- （本設計書3節で後述する認証最小化方針により、Apple側で取得・検証する情報が`sub`のみとさらに単純化されたため、Google Sign-Inとの実装差分自体が従来の想定より小さくなった。この点でも統合実装のハードルは下がっている）

**デメリット**: Sign in with Apple固有の実装とGoogle Sign-In固有の実装を並行して進める必要があり、一度に検証すべき項目が増える。

#### 案2: 引き続きGoogle Sign-In→Sign in with Appleの順で分割実装する

**メリット**: 実装難易度を分散できる。問題の切り分けがしやすい。
**デメリット**: フェーズ0解消により審査上のブロッカーがなくなったため、「フェーズ1aだけを先にリリースする」という選択肢は事実上使えない（4.8抵触のため）。分割の利点は「実装順序の管理」に限定される。

#### 推奨: 案1（統合）を基本方針としつつ、実装内部の作業順序としては案2の考え方（Google Sign-Inを先に通してから Apple を追加）を踏襲する

**リリース可能な成果物としては最初から両方揃った一体型フェーズ1として扱う**が、**実装作業の進め方としては、まずGoogle Sign-Inで認証基盤の骨格を完成させ、動作確認した上でSign in with Apple固有部分を追加する**という段取りにする。

この推奨案では、設計書20 §10-2の「フェーズ1a」「フェーズ1b」という**フェーズ名としての分割自体は廃止**し、単一の「フェーズ1: 認証基盤（Google Sign-In + Sign in with Apple 一体）」に統合する。ただしフェーズ1内部のマイルストーンとして「M1: Google Sign-In実装・動作確認」「M2: Sign in with Apple実装・動作確認」という順序管理は残す。

### 2-2. フェーズ3a/3b分割の要否（設計書20 §8・§10-2の再検討）

設計書20は「フェーズ3a: Stripe/Web版先行（フェーズ0に依存せず着手・検証可能）」「フェーズ3b: StoreKit/iOS版（フェーズ0完了＋In-App Purchase capability準備が依存）」と分割していた。

フェーズ1（認証）とは異なり、こちらは**Appleガイドライン4.8のような単独リリース禁止規定ではなく、3.1.3(b) "Multiplatform Services"（両チャネル提供の義務）**が関係する（設計書20 §8-0）。この規定は「iOSアプリ内で決済導線を見せる場合、App内課金と同等の代替決済手段をアプリ外に用意していれば良い」という性質のもので、「Web版決済とiOS内課金を必ず同時に実装しないと片方もリリースできない」という4.8ほど厳格な同時性を要求するものではない。

**この整理はフェーズ0解消の影響を受けない**。フェーズ0解消により変わるのは「フェーズ3b（StoreKit、In-App Purchase capability必要）が着手可能になるタイミング」のみであり、Stripe/Web版を先行させる合理性自体は変わらない。

**推奨: フェーズ3a/3bの分割は従来通り維持する**（統合はしない）。理由:
- 決済・サブスクリプションは金銭が絡む機能であり、認証基盤（フェーズ1）よりも慎重な段階的検証が正当化される領域である
- フェーズ0解消により「フェーズ3bがブロックされ続ける」リスクはなくなったが、これは「フェーズ3bにいつでも着手できる」という状態を意味するだけで、「フェーズ3aと同時に着手すべき」という理由にはならない
- StoreKitのレシート検証・Server Notifications V2実装は、Stripeとは技術的に独立した実装作業であり、無理に同時並行にする実装上のメリットが薄い

ただし、フェーズ0解消により「フェーズ3bはApple法人審査という外部要因では止まらない」ことが明確になったため、**フェーズ3bの着手判断は今後は純粋にプロジェクトの実装優先度（他機能との兼ね合い）の問題になる**、という点は明記しておく。

### 2-3. 新しいフェーズ分け（まとめ）

- **フェーズ0: 解消済み（2026-07-14、設計書34）**。以降のフェーズ分けからは前提条件として除外する
- **フェーズ1: 認証基盤（Google Sign-In + Sign in with Apple 一体）**: 旧フェーズ1a/1bを統合。実装順序はGoogle Sign-In→Sign in with Apple。JWT検証・`data/users.json`基盤・コース`authorId`真正性確保を実装。リリース判断は両方完成後にのみ行う（4.8対応のため部分リリースはしない）。**取得・保存する情報は最小化する（詳細は本設計書3節）**
- **フェーズ2: エンタイトルメント管理**（変更なし）: `subscriptions`配列でのプレミアム判定整備、`isSubscriptionActive(user)`共通ロジック実装
- **フェーズ3a: Stripe/Web版 先行**（変更なし、引き続き独立フェーズとして維持）
- **フェーズ3b: StoreKit/iOS版**（依存条件から「フェーズ0完了」を除去。「In-App Purchase capability有効化」自体はフェーズ0解消により今すぐ実施可能だが、フェーズ3aとの実装順序上、引き続き後続フェーズとして位置づける）
- 両者共通: フェーズ3b完了後（両チャネル揃った時点）に二重課金検出ロジック（設計書20 §6-5-3）を有効化。変更なし

## 3. 認証情報の最小化方針（ユーザーとのすり合わせにより確定、設計書20 §5-1・§6-1への差分）

### 3-0. 経緯

設計書20 §5-1・§6-1は、Google/Appleから取得する認証情報について具体的なスコープ・保存項目を明記していなかった（§6-1の`data/users.json`サンプルには`email`・`displayName`・`avatarEmoji`が含まれていた）。ユーザーとのすり合わせの結果、**最終的に「個人情報に該当しうる情報は一切収集しない」という方針が確定した**（検討の途中で「メールアドレスは保存する」という中間案が一度検討されたが、最終的にユーザー判断により撤回され、メールアドレスも含めて収集しない方針に確定している）。この節は今後の実装時に同じ論点が再燃しないよう、確定方針とその根拠・トレードオフを記録する。

### 3-1. 確定方針: 取得するのは`sub`（プラットフォームが発行するアカウント一意ID）のみ

- **Google Sign-In**: scopeは`openid`のみ要求する。`email`・`profile`スコープは要求しない。取得できるのは`sub`（Googleアカウントの一意識別子）のみになる
- **Sign in with Apple**: 追加スコープは何も要求しない（`email`・`fullName`のいずれも要求しない）。取得できるのは`sub`（Apple側が発行する一意識別子）のみになる
- **設計書20 §5-1への差分**: 「Sign in with Apple: `identityToken`/`authorizationCode`/`user`取得」「Google Sign-In: …」という記述はそのままだが、いずれも**取得したトークンから`sub`のみを取り出し、それ以外のクレーム（メール・氏名等）はサーバー側で保存・利用しない**ことを明記する
- **設計書20 §6-1への差分**: `data/users.json`のJSON例から`email`・`displayName`・`avatarEmoji`の3フィールドを**削除**する。更新後のデータモデル例は以下の通り:

```json
[{
  "userId": "usr_XXXXXXXXXX",
  "provider": "apple",
  "providerSub": "001234.abcdef...",
  "createdAt": "...", "lastLoginAt": "...",
  "subscriptions": []
}]
```

保存するのは、アプリ内部で発行する`userId`・`provider`（`apple`/`google`）・`providerSub`（Google/AppleのアカウントID）・`createdAt`・`lastLoginAt`・`subscriptions`のみ。メールアドレス・氏名・プロフィール画像は一切取得・保存しない。

### 3-2. 表示名・プロフィール画像・メールを取得しない理由

- **表示名・プロフィール画像**: このアプリには既に`localStorage.user_name`によるニックネーム機能（設定画面「ニックネーム」欄、`public/index.html` 188行目付近の`#nickname-input`、実在確認済み）が存在し、プロフィール画像を表示する仕組みも現状ない。ログイン機能とは独立してニックネームを名乗れる仕組みが既にあるため、認証プロバイダから表示名・画像を取得する必要性がない
- **メールアドレス**: 検討の初期段階では「サブスク関連の問い合わせ・不正対応時にユーザーを特定する手段として必要」という理由で保存する案があったが、ユーザーの最終判断により「個人情報に該当しないものだけ集める」という、より保守的な方針が優先され、メールアドレスの取得・保存も行わないことに確定した

### 3-3. `providerSub`自体の個人情報該当性についての整理（未確定の論点として明記）

`providerSub`（Google/AppleのアカウントIDそのもの）は、それ単体では氏名・連絡先のような直接的な個人識別情報ではなく、各プラットフォームが発行するランダムな内部IDである、という整理でユーザーとすり合わせ済みである。ただし**この整理が法的に妥当かどうか（個人情報保護関連法令上、`providerSub`が「個人情報」に該当するか否か）は、本設計書時点では確認していない。実装時に改めて確認した方がよい未解決の論点として残す**（プライバシーポリシーの記載内容・データ保持期間の方針にも影響しうるため、`data/users.json`の運用開始前に確認することが望ましい）。

### 3-4. サブスクリプション機能（設計書20 §6-5・§8節）との整合性（トレードオフとして明記）

認証情報を最小化しても、サブスクリプション管理の技術的な仕組み自体には支障がないことを確認済みである（ユーザーへの説明・了承済みの内容として記録）:

- **StoreKit（iOSアプリ内課金）**: 購入履歴はApple ID・取引ID（`originalTransactionId`等、設計書20 §6-5-1参照）ベースで管理される。ユーザーの氏名・メールアドレスは技術的に不要
- **Stripe（Web版）**: 設計書20 §8-2「案W1」は「Web版はログインUIを作らず、Stripe Checkout時のメールアドレスを識別子にする」という設計であり、これは**Google/Appleログインから取得するメールとは完全に別経路**（Stripe Checkout画面自体にユーザーが直接入力するメールアドレス）である。したがって、Google/Appleログイン側でメールアドレスを収集しない方針にしても、Stripe側の識別子運用には一切影響しない

**一方で、以下のトレードオフ（制約）が生じることを明記する**:

1. **サポート対応時にメールで検索・連絡ができない**: メールアドレスを保持しないため、サブスク関連の問い合わせ対応時、運営側は`userId`・`providerSub`でしかユーザーを特定できない
2. **ユーザー側からの識別子提示が前提の運用になる**: ユーザーからの問い合わせ時は、アプリ内に表示される`userId`のような識別子をユーザー自身に問い合わせフォーム等で伝えてもらう運用が必要になる。**現時点でアプリ内に「サポート用ID」を表示するUIは存在せず、本設計書のスコープにも含まれない**。今後、サブスク機能（フェーズ2・3）に着手する際に、設定画面等に`userId`（またはその一部）を表示する機能を別途検討する必要がある課題として明記する
3. **運用是正連絡はアプリ内通知が前提になる**: 二重課金検知（設計書20 §6-5-3、「検知時にフラグ記録＋次回ログイン時にユーザーへ通知」という方針）等、運営側からユーザーへの連絡が必要になる場面は、メールではなくアプリ内通知（プッシュ通知等、既存のAPNs/Web Push基盤を流用）で行う前提とする

## 4. リスク・未解決の質問の再評価（設計書20 §12の差分）

### 解消済みとして扱ってよいリスク

- **リスク1「Apple法人審査完了タイミングへの依存」（設計書20 §12-1）**: フェーズ0が2026-07-14に完了したため**解消**。「フェーズ1a（Google Sign-Inのみ）は先行着手可能だがAppleガイドライン4.8により単独リリース不可」という後半の記述は、本設計書2-1節の統合方針によりフェーズ1a/1bという区分自体を廃止したため、リスクとしての意味を失う
- **リスク2「フェーズ1aを先行着手はするがリリースはしない場合の開発運用リスク」（設計書20 §12-2）**: 本設計書2-1節の推奨（案1採用）により、この状況自体が発生しなくなるため**解消**
- **リスク12「App Store Server API利用のApple Developer Portal追加設定も法人審査待ちの影響を受ける可能性」（設計書20 §12-12）**: フェーズ0完了により法人審査自体は完了しているため、この意味での依存は**解消**。ただしApp Store Server API用キー（`.p8`）生成というPortal操作自体は今後もフェーズ3b着手時に必要な作業として残る
- **リスク15「手動証明書配布方式であることの運用負荷」（設計書20 §12-15）の性質変化**: リスクの内容自体は**解消されず引き続き残る**が、Push Notifications capability分については設計書34で実際に運用を経験済み（実例が1件増えた）。Sign in with Apple・In-App Purchase capability追加時も同種の手動オペレーションが今後発生することに変わりはない

### 変更なしで引き継ぐリスク（本設計書のスコープ外、そのまま設計書20参照）

- 6-3節データ移行方針（案A/B/Cのどれを採用するか）は**未決定のまま引き継ぐ**
- 6-4節「不正投稿対策の実効性の限界」は**未決定のまま引き継ぐ**
- JWTの有効期限・リフレッシュ方式（設計書20 §12-7）は**未確定のまま引き継ぐ**
- 同一人物が複数ログイン方法を使った場合の別アカウント扱い（§12-5）、2台目端末からの再ログイン時のUX（§12-6）、二重課金検知・通知フロー（§12-10、ただし本設計書3-4節により「通知手段はアプリ内通知前提」という制約が追加）、チャネル間ポリシー差異によるUX不整合（§12-11）、`appAccountToken`とuserIdの紐付け詳細（§12-13）は**いずれも変更なしでそのまま引き継ぐ**
- Google Sign-InのiOS向けOAuthクライアントID発行作業の担当・アカウント用意状況（§12-4）は**引き続き不明のまま**

### 本設計書により内容が変わったリスク

- **§12-14「Web版のセッション/状態確認方式が未確定」**: 案W1自体は変更しないため未確定のまま引き継ぐが、本設計書3-4節の通り、これはGoogle/Appleログイン側のメール非収集方針とは無関係な別経路であることを明記する

### 本設計書で新たに追加するリスク

16. **サポート識別子UIの欠如（本設計書3-4節）**: メールアドレスを保持しない方針の結果、ユーザーが問い合わせ時に自分の`userId`を運営側に伝える手段が必要になるが、そのためのUIは現時点で存在せず、本設計書のスコープにも含まれない。フェーズ2・3着手時に合わせて検討する必要がある
17. **`providerSub`の個人情報該当性の法的整理が未確認（本設計書3-3節）**: ユーザーとは「個人情報に該当しない」という前提ですり合わせ済みだが、法的な確認は行っていない。プライバシーポリシーの記載・データ保持方針に影響しうるため、`data/users.json`運用開始前に確認が望ましい

## 5. 変更するファイル一覧（フェーズ1: Google Sign-In + Sign in with Apple 一体実装、認証情報最小化を反映 想定）

- `package.json`（ルート）: `jsonwebtoken`追加
- `server.js`: `POST /api/auth/google`・`POST /api/auth/apple`・`GET /api/auth/me`の3エンドポイント新設。トークン検証時は`sub`クレームのみを取り出して使用し、`email`・`name`・`picture`等の他クレームは受け取っても保存・利用しない実装にする。`data/users.json`読み書き（`withFileLock`パターン）、`POST /api/courses/publish`（現在**2233行目**）・`DELETE /api/courses/:id`（現在**2251行目**）・`POST /api/courses/:id/unpublish`（現在**2284行目**）への任意Authorizationヘッダー対応（後方互換）。**実装時、行番号は本設計書執筆時点の実測値からさらにズレている可能性が高いため、実装直前に必ず`grep -n`で再確認すること**
- `data/users.json`（新規。保存情報最小化のため個人情報保護の懸念は軽減されるが、`providerSub`の個人情報該当性が未確認のため、**引き続きgitignore対象とする方針を維持することを推奨**）
- `ios-app/package.json`: Apple Sign-In系・Google Sign-In系Capacitorプラグイン両方を追加
- `.github/workflows/ios-deploy.yml`: Sign in with Apple capability用entitlements（`com.apple.developer.applesignin`キー）追加ステップの新設が必要。既存のPush Notifications capability追加時のパターン（設計書34）をそのまま参考にできる
- `ios-app/fastlane/Fastfile`・GitHub Secrets: capability追加に伴うProvisioning Profile再生成・`PROVISION_PROFILE_BASE64`手動更新が必要
- `public/app.js`・`public/index.html`: 設定画面ログインUI（Google/Apple両方のボタン）、i18n文言追加。ログイン後の表示は「ユーザー名・メールアドレス表示」ではなく、既存のニックネーム機能と「プロバイダ名のみの簡易表示」を組み合わせた表示に変更する必要がある
- CLAUDE.md: 新機能の記録、フェーズ状況の追記

## 6. 受け入れ基準への差分（設計書20 §3の修正が必要な箇所）

設計書20 §3「正常系」の2番目の項目「設定画面にユーザー名・メールアドレス表示。アプリ再起動後もログイン状態保持」は、本設計書3節の最小化方針と矛盾する。本設計書により以下に読み替える:

- **修正後**: 「設定画面にログイン状態（例: プロバイダ名＋ログイン中である旨）を表示。氏名・メールアドレスは表示しない（そもそも取得していないため）。既存のニックネーム機能（`user_name`、ログイン機能とは独立した仕組み）を使ってユーザーが自分の名乗りたい名前を設定できる状態は維持する。アプリ再起動後もログイン状態保持」

## 承認状況
2026-07-14 planner再評価（2回のすり合わせを反映した最終版）。**実装は未着手**。設計書20本文は削除・上書きせず保持。ユーザーの意思決定待ち（2-1節フェーズ1統合方針の承認、2-2節フェーズ3a/3b維持方針の承認、3節認証情報最小化方針の最終確認〈特に3-3節`providerSub`の法的整理〉、6節受け入れ基準修正の承認、フェーズ1着手可否・時期の判断）。2026-07-14 ユーザー承認済み。

---

# 設計書36 — Web版へのログインUI追加（設計書20/35のスコープ拡大）

（2026-07-14 planner設計。コード変更なし、設計のみ。設計書20〈1615〜1869行目〉・設計書35の本文は削除・上書きせず、本設計書は差分・追加として記述する）

## 0. 本設計書の位置づけと前提の変更

設計書20 §4（スコープ外）は「Android版ログイン対応、Web版へのログインUI提供（サーバーAPIは将来Web展開しやすい形で設計）」として、**Web版へのログインUI提供を明示的にスコープ外**としていた。設計書35 §5（変更するファイル一覧）・設計書20 §11（フロントエンドの変更）も同様に「`_isCapacitorApp`判定でCapacitor環境限定表示（Web版には出さない）」という前提だった。

ユーザーの最終判断により、この前提を撤回し、**iOS版・Web版の両方にGoogle/Apple IDログインを実装する**方針に変更する。本設計書はこのスコープ拡大に伴う技術要件・設計差分を記述する。設計書35で確定した「認証情報最小化方針（`sub`のみ保存、メール・氏名は一切取得しない）」は本設計書でも維持し、変更しない。

## 1. Google Sign-In（Web版）の技術要件

### 1-1. Web用OAuthクライアントIDの新規発行が必要

Google Cloud Consoleにおいて、iOS版で使うOAuthクライアントID（設計書20 §9・§12-4で「発行が別途必要」と記載、2026-07-14時点でも未着手）とは**別に、Web用（種類: "ウェブ アプリケーション"）のOAuthクライアントIDを新規発行する必要がある**。Googleの認証基盤はクライアントの種類（iOS/Web/Android等）ごとに別々のクライアントIDを要求する設計のため、1つのクライアントIDをiOS・Web共用にすることはできない。

Web用クライアントID発行時には、承認済みJavaScript生成元（Authorized JavaScript origins）に`https://dosuru.app`を登録する必要がある。

### 1-2. Google Identity Services（JS SDK）によるWebフロントエンド実装

iOS版はCapacitorネイティブプラグイン（`@capacitor-community/google-signin`等）経由で`idToken`を取得する設計だった（設計書20 §5-1）のに対し、Web版は**Google Identity Services（GIS）のJavaScript SDK**（`https://accounts.google.com/gsi/client`を読み込み、`google.accounts.id.initialize()`＋ワンタップ/ボタン表示）を使う実装になる。実装方法（プラグイン呼び出し vs JS SDK呼び出し）はプラットフォームごとに完全に異なる。

**ユーザー提示の理解（「サーバー側で受け取るのは同じ`idToken`（JWT）であり、`POST /api/auth/google`エンドポイントはプラットフォーム非依存で共用できる」）は正しい。** GIS JS SDKのコールバック（`google.accounts.id.initialize({ callback: ... })`）で受け取る`credential`は、iOSネイティブプラグインが返す`idToken`と同じ形式のGoogle発行JWT（`sub`・`aud`・`iss`等の標準クレームを含む）であり、サーバー側の検証ロジック（Googleの公開鍵で署名検証し`sub`を取り出す）は共通化できる。

**ただし1点注意が必要**: JWTの`aud`（audience）クレームには、そのトークンを要求したOAuthクライアントIDが入る。iOS用クライアントIDで発行されたトークンとWeb用クライアントIDで発行されたトークンでは`aud`の値が異なる。サーバー側の検証時、**`aud`が「iOS用クライアントID」または「Web用クライアントID」のいずれかに一致することを許容する**実装にする必要がある（単一の`aud`値のみ許可する実装だと、片方のプラットフォームからのログインが検証エラーになる）。この点は設計書20 §5-2「Apple/GoogleのJWTをそれぞれの公開鍵で検証」に対する追加の実装注意点として明記する。

## 2. Sign in with Apple（Web版）の技術要件

### 2-1. Services IDの新規発行・ドメイン確認

Apple Developer Portalにおいて、iOS版で使うApp ID（`app.dosuru`）とは**別に「Services ID」を新規発行する必要がある**（Web版のSign in with Appleは、App IDではなくServices IDに対して設定する識別子体系）。Services ID発行時には以下が必要:

- ドメイン確認（`dosuru.app`の所有権証明。Apple指定の検証ファイルをサーバーの所定パスに設置する形式が一般的）
- リダイレクトURL（Return URL）の登録（例: `https://dosuru.app/api/auth/apple/callback`）

**フェーズ0（Apple法人審査）は設計書34（2026-07-14）で既に完了しているため、この設定作業自体は今すぐ着手可能である**。Services ID発行・ドメイン確認は法人審査完了後のApple Developer Portal操作の一種であり、設計書35 §1-2で確認した「Push Notifications capability実例による裏付け」と同様、Portal操作としてのブロッカーは存在しない。

### 2-2. "Sign in with Apple JS"のWebフローはiOSネイティブと経路が異なる

**ユーザー提示の技術理解は正確であり、そのまま設計に反映する。**

- iOS版（設計書20 §5-1）: Capacitorネイティブプラグイン経由で`identityToken`（JWT）・`authorizationCode`・`user`（初回のみ）をクライアント側で直接取得し、クライアントから`POST /api/auth/apple`にJSONボディとして送信する方式
- Web版（"Sign in with Apple JS"）: 一般的な実装は`response_mode: 'form_post'`を指定し、認証成功後に**Apple側のサーバーからブラウザ経由でフォームPOSTが行われ、`server.js`側の新規コールバックエンドポイントに`id_token`・`code`・（設定によっては）`user`・`state`が直接届く**方式になる。クライアントJSがトークンを受け取って能動的に送信するのではなく、**サーバーが受動的にPOSTを受信する**という経路の違いがある

### 2-3. 同一エンドポイントで吸収できるか、Web版専用ルートが必要か

この経路の違いにより、**`POST /api/auth/apple`をそのままWeb版と共用することはできない**と判断する。理由:

- iOS版の`POST /api/auth/apple`は、クライアント（Capacitorアプリ）からのJSON POSTを前提とした設計
- Web版のApple側コールバックは、Appleのサーバーから`application/x-www-form-urlencoded`形式でPOSTされる（`form_post`モードのため）。受け取った後、サーバー側で検証・ユーザーupsertを行った上で、**JSONレスポンスではなくブラウザをリダイレクトさせる**必要がある

**推奨案**: 新規に`POST /api/auth/apple/callback`（Web版専用、`form_post`受信・`state`検証・ユーザーupsert・その後リダイレクト）を新設し、既存想定の`POST /api/auth/apple`（iOSネイティブ向け、JSON受信・JSON応答）とは別ルートとして扱う。**サーバー内部の共通処理（Appleの公開鍵でJWT検証し`sub`を取り出す部分、`data/users.json`のupsert処理、JWT発行処理）は共通関数として切り出し、2つのルートの薄いラッパーから呼び出す**ことで、認証コアロジックの重複は避ける。

### 2-4. CSRF対策（`state`パラメータ）

Web版のOAuthフロー（Apple・Google Web SDKいずれも）では、認証開始時にサーバー側でランダムな`state`値を生成し、セッション（またはCookie等の一時保存手段）に保持した上で認証リクエストに含める。認証完了後のコールバックで返ってきた`state`が、保持していた値と一致するか検証し、不一致の場合は処理を中断する（CSRF対策の標準パターン）。

**このプロジェクトはサーバー側セッションの仕組みを持たない**（`data/`配下のファイルベース管理のみ、Express session等のミドルウェアは`server.js`に存在しない）ため、`state`の一時保持先として何を使うかは実装時の検討事項となる。候補: (a) 短命なCookie（`state`値のみ、`httpOnly`）に保存し、コールバック時にCookie値とPOSTされた`state`を突き合わせる、(b) サーバー側の短命インメモリMap（`state`値→有効期限）で管理する。いずれも新規の仕組みが必要であり、既存コードベースに流用できるパターンは現状存在しない（**未解決事項として8節に追記**）。

## 3. JWT/セッションの保存方法（iOS版とWeb版の差異）

### 3-1. iOS版（変更なし）

設計書20 §5-2の通り、Capacitor `Preferences`にJWTを保存し、`Authorization: Bearer`ヘッダーで送信する方式を維持する。

### 3-2. Web版の保存方法（新規検討）

このプロジェクトの既存パターン（CLAUDE.md記載の`app_who`/`app_age`/`user_name`/`app_genres`等）はすべて**`localStorage`ベース**であり、Cookieは`server.js`側にも`document.cookie`操作にも一切使われていないことを実コード確認済み。

この既存の一貫性を踏まえ、以下の2案を比較する。

#### 案W-A（推奨）: Web版もlocalStorageにJWTを保存し、`Authorization: Bearer`ヘッダーで送信する（iOS版と同じ方式）

**メリット**:
- 既存コードベース全体の一貫したパターン（`localStorage`ベースの状態管理）を踏襲でき、`authedFetch`ヘルパー（設計書20 §5-2）をiOS版・Web版で完全共通化できる
- 新規のCookie関連セキュリティ設定を導入しなくてよい

**デメリット**: `localStorage`はXSSに対して`httpOnly` Cookieより脆弱。ただしこのプロジェクトは静的なVanilla JS構成でサードパーティスクリプトの混入経路が限定的であり、既存のニックネーム等の個人設定も同様に`localStorage`で管理されている実態と整合する

#### 案W-B: Web版は`httpOnly` Cookieにセッション情報を保存する

**メリット**: XSSからのトークン窃取リスクを`httpOnly`属性により軽減できる
**デメリット**: 既存コードベースに一切存在しないセッション管理の仕組みを新規に導入する必要があり、実装コストが大きい。`secure`・`sameSite`等の設定を都度正しく行う必要があり、設定ミスによる脆弱性混入のリスクが増える。iOS版との実装非対称性が大きくなり、`authedFetch`の共通化が難しくなる

#### 推奨: 案W-A（localStorage + Authorization Bearerヘッダー、iOS版と同一方式）

理由: 既存コードベースの一貫性、`authedFetch`共通化のしやすさ、実装コストの小ささを優先する。XSSリスクについては、このプロジェクトが外部広告スクリプト（Klookウィジェット等）を埋め込んでいる実態があるため、**完全にリスクゼロではない点は明記しておく**（今後、外部スクリプトの埋め込みを増やす際は、localStorage内のJWTが読み取られるリスクを考慮する必要がある）。

**Cookieを使わない方針のため、`httpOnly`/`secure`/`sameSite`の設定は不要**（案W-A採用前提）。ただし2-4節のCSRF対策用`state`一時保持にCookieを使う場合は、その`state`用Cookieに限り`httpOnly`・`secure`・`sameSite=Lax`程度の設定を検討する（これはJWT本体の保存方式とは別の話であり、混同しないよう注記する）。

## 4. 設定画面UIの`_isCapacitorApp`限定表示の撤回

設計書20 §11・設計書35 §5は「`_isCapacitorApp`判定でCapacitor環境限定表示（Web版には出さない）」としていたが、本設計書によりこれを撤回する。

- **表示自体**: Web版・iOS版の両方の設定画面に同じログインセクション（Google/Appleボタン）を表示する。`_isCapacitorApp`による表示・非表示の分岐は不要になる
- **ボタン押下後の処理**: プラットフォームによる分岐は形を変えて残る。表示するかどうかではなく、**ボタンを押した後にどの認証フローを起動するか**が`_isCapacitorApp`で分岐する:
  - iOS版（`_isCapacitorApp === true`）: Capacitorネイティブプラグイン（Apple/Google Sign-Inプラグイン）を呼び出し、`identityToken`/`idToken`取得後にクライアントから`POST /api/auth/{provider}`にJSON送信
  - Web版（`_isCapacitorApp === false`）: Google Sign-InはGIS JS SDK呼び出し（`idToken`取得後、同じく`POST /api/auth/google`にJSON送信で共用可）。Apple Sign-InはWeb版専用のリダイレクトフロー（`response_mode:'form_post'`、2-3節の`POST /api/auth/apple/callback`）を起動する

この結果、**Googleログインボタンの押下後フローはiOS/Web共通のエンドポイント（`POST /api/auth/google`）に収束するが、Appleログインボタンの押下後フローはiOS/Webでエンドポイントごと分岐する**、という非対称な設計になる点を明記しておく（実装時に見落としやすいポイントのため）。

## 5. `data/users.json`・認証情報最小化方針（設計書35 §3）への影響

**影響なし。最小化方針（`sub`のみ保存、メール・氏名・プロフィール画像は一切取得・保存しない）はWeb版追加後もそのまま維持する。**

- Web版のGoogle Sign-In・Apple Sign-InもiOS版と同様、要求スコープを最小に絞る方針を踏襲する
- **同一プロバイダ・同一ユーザーであれば、iOS版でログインした場合とWeb版でログインした場合の`sub`は同一の値になる**。したがって設計書20 §6-2「`provider`+`providerSub`をユニークキーに」という設計はそのまま機能し、**iOS版でログイン済みのユーザーが同じGoogle/Appleアカウントで後からWeb版にログインした場合、自動的に同一ユーザー（同一`userId`）として扱われる**
- ただし、`providerSub`が同一でも、iOS版とWeb版はそれぞれ別の`localStorage`にJWTを保存するため、**「同一ユーザーとしてサーバー側で認識される」ことと「複数端末・複数プラットフォームで自動的にログイン状態が同期される」ことは別物**である。後者は引き続き「端末ごとに個別にログイン操作が必要」という体験のままである（設計書20 §12-6と同種の論点がWeb版でも生じる。新規リスクとして追記）

## 6. フェーズ分け（設計書35 §2-3）への影響

### 6-1. フェーズ1の対象範囲拡大

設計書35 §2-3「フェーズ1: 認証基盤（Google Sign-In + Sign in with Apple 一体）」の対象範囲に、**Web版フロントエンド実装**（`public/index.html`・`public/app.js`のログインUI、GIS JS SDK読み込み、Sign in with Apple JS読み込み、`POST /api/auth/apple/callback`受信後のリダイレクト⇄フロントエンド連携処理）を追加する。

### 6-2. 作業順序案

サーバー側APIをプラットフォーム非依存の共通基盤として先に固め、その後にiOS/Web両方のフロントエンドを実装する順序を推奨する。

具体的なマイルストーン案:
- **M1**: サーバー側共通処理（JWT検証・`data/users.json`基盤・JWT発行・`authedFetch`相当のクライアント共通ヘルパー設計）
- **M2**: Google Sign-In実装（iOS版・Web版同時。`POST /api/auth/google`は両者から共用できるため、フロントエンド実装をほぼ並行して進められる）
- **M3**: Sign in with Apple実装（iOS版: `POST /api/auth/apple`。Web版: Services ID発行・ドメイン確認・`POST /api/auth/apple/callback`新設。**iOS版とWeb版で経路が分岐するため、M2よりも作業量が多く、iOS版を先に動作確認してからWeb版のコールバックフローに着手する、という内部順序が現実的**）
- **M4**: 設定画面UIの統合（Web版・iOS版共通のログインセクション表示、プラットフォーム分岐ロジックの実装）

## 7. 変更するファイル一覧への追加（設計書35 §5への追記）

- **Google Cloud Console**（コード変更ではない設定作業）: Web用OAuthクライアントID新規発行、承認済みJavaScript生成元に`https://dosuru.app`登録
- **Apple Developer Portal**（コード変更ではない設定作業）: Services ID新規発行、ドメイン確認ファイルの設置、リダイレクトURL登録
- `server.js`: 新規`POST /api/auth/apple/callback`（Web版専用、`form_post`受信・`state`検証・共通処理呼び出し・リダイレクト）。既存想定の`POST /api/auth/google`・`POST /api/auth/apple`から呼び出す共通関数（JWT検証・`sub`抽出・`data/users.json`のupsert）の切り出し。`state`一時保持の仕組み（新規）
- `public/index.html`: Google Identity Services SDK・Sign in with Apple JS SDKの`<script>`タグ追加。設定画面ログインセクションのHTML（Web版・iOS版共通）
- `public/app.js`: GIS SDK初期化・コールバック処理、Apple Sign-In JSのWeb版フロー起動処理、`_isCapacitorApp`によるボタン押下後の処理分岐
- ルートドメインの静的ファイル配信箇所: Appleドメイン確認ファイルの設置場所として、既存の`public/`直下配信の仕組みがそのまま使えるか確認が必要（未確認、実装時に要調査）

## 8. リスク・未解決の質問（本設計書で新たに追加する項目）

18. **Web版の`state`一時保持の仕組みが未確定（2-4節）**: サーバー側セッションの仕組みが存在しないため、CSRF対策用`state`の保持先は実装時に新規検討が必要。インメモリMapを選ぶ場合、PM2再起動でログイン試行中のフローが失敗する可能性がある点も考慮する必要がある
19. **`aud`クレーム検証の実装漏れリスク（1-2節）**: iOS用・Web用で異なるGoogle OAuthクライアントIDを使うため、サーバー側のJWT検証で`aud`を単一値に固定してしまうと片方のプラットフォームのログインが失敗する
20. **localStorage保存方式のXSSリスク（3-2節）**: 案W-A採用によりJWTがブラウザの`localStorage`に保存される。今後、外部広告スクリプトや新規サードパーティ連携を追加する際、XSS経由でのトークン窃取リスクが増える可能性がある
21. **Appleドメイン確認ファイルの配置方法が未確認（7節）**: `server.js`の静的ファイル配信設定・nginx設定のいずれで対応するのが適切か、実装時に確認が必要
22. **複数端末・複数プラットフォームでのログイン状態非同期は解消されない（5節）**: `provider`+`providerSub`が同一なら同一ユーザーとして扱われるが、ユーザー体験としては引き続き端末・プラットフォームごとに個別ログイン操作が必要

## 承認状況
2026-07-14 planner設計。**実装は未着手**。設計書20・設計書35本文は削除・上書きせず保持。2026-07-14 ユーザー承認済み。

---

# 設計書37 — 予定表データ・共有カレンダーのログインユーザー紐づけ（設計書20/35/36のスコープ拡大）

（2026-07-14 planner設計。コード変更なし、設計のみ。設計書20〈1615〜1869行目〉・設計書35・設計書36の本文は削除・上書きせず、本設計書は差分・追加として記述する）

## 0. 本設計書の位置づけとユーザー要望

ユーザーから「予定表の情報とかもこのユーザーに紐づく形になると思います。それも対応するようにして。共有したときはサーバ側ですが、予定表IDのようなものDBなどでユーザーと紐づけて管理する方法が必要になるかもしれません。」という追加要望があった。本設計書は、設計書20〜36で確立した認証基盤（Google/Apple IDログイン、`data/users.json`、認証情報最小化方針）を土台に、(1) 個人予定表データ（現状localStorageのみ）、(2) 共有カレンダー（現状`groupId`のみで無認証アクセス）の2つを、ログインユーザーに紐づける設計を検討する。

## 1. 事実確認（実コードで裏付け済み）

### 1-1. 個人予定表データは現状サーバー未保存・localStorageのみ

- `getCustomPlans()`/`saveCustomPlans(arr)`（`public/app.js` 4057〜4059行目）: `localStorage['custom_plans']`（都市共通、キー名は旧`{city}_custom_plans`から統一移行済み、1972〜1982行目に移行ロジックあり）
- `getEventPlans()`/`saveEventPlans(arr)`（`public/app.js` 4062〜4064行目）: `localStorage[getCity()+'_event_plans']`（都市別）
- いずれも`server.js`側に対応する永続化APIは存在しない

### 1-2. 共有カレンダーは`groupId`のみで無認証アクセス

`server.js` 1464〜1622行目付近を確認した。

- `generateGroupId()`（1471〜1477行目）: 紛らわしい文字を除いた32文字から6文字ランダム生成
- `POST /api/calendar/create`（1484行目）: `city`・`encryptedData`のみを受け取り`groupId`を発行。**作成者を識別する情報は一切保存されない**
- `GET/PUT /api/calendar/:groupId`（1505行目・1512行目）: `groupId`が有効な形式でファイルが存在すればレスポンスを返す。認証ヘッダー・権限チェックは一切なし
- `POST /api/calendar/:groupId/join`（1533行目）以下、push-subscribe系・notify系エンドポイントもすべて同様に`groupId`のみで識別

**確認結果: 「予定表データを『ユーザー』に紐づける仕組みは現状一切存在しない」という結論は実コードと一致する。**

## 2. 個人予定表データのログインユーザー紐づけ設計

### 2-1. 設計書20 §6-3（データ移行方針3案）との関係の再整理

設計書20 §6-3は以下の3案を比較していた:
- 案A: ログイン時に自動アップロード・サーバーマージ。機種変更引き継ぎ可だが実装コスト高
- 案B: ログインは識別子取得のみ、マイコース等は端末データのまま
- 案C（推奨）: フェーズ1は案B、フェーズ2以降でサブスク加入者限定に選択的に案Aへ拡張

この3案は主に「マイコース」（コース作成データ）を念頭に議論されていたが、**今回のユーザー要望は予定表データについても同種の紐づけ・同期を求めるものであり、対象範囲が広がる**。

**再整理**: 予定表データについても、案A（自動アップロード・サーバーマージ、機種変更・複数端末引き継ぎ可）を採用する方向で設計する。理由:

- 予定表は「複数端末で見比べたい」「PCのWeb版で確認しつつスマホのiOSアプリでも見たい」という利用シーンが、コースのお気に入り・マイコース以上に強く想定される
- ユーザーの発言自体が、単なる識別子取得（案B）ではなく、データそのものの同期・引き継ぎを念頭に置いた発言と解釈できる

ただし、設計書20 §6-3が示した「案Cのように段階的に広げる」という慎重な考え方自体は否定しない。**予定表データについては設計書20の一般方針から一歩踏み込み、フェーズ1の時点で予定表データの同期（案A相当）まで含める**、という位置づけの変更を本設計書で明記する。マイコース・コミュニティコースへの案Aの適用可否は本設計書のスコープ外とし、設計書20 §6-3の議論のまま維持する。

### 2-2. データモデル案の比較

#### 案P-A: `data/users.json`の各ユーザーレコードに`customPlans`/`eventPlans`配列を追加する

**メリット**: ユーザー情報と予定データが1ファイルにまとまり、読み書きの実装がシンプル
**デメリット**: `data/users.json`はユーザー数が増えるほど1ファイルが肥大化する。予定表データはユーザーごとの更新頻度が高いため、認証情報のみを持つ他ユーザーのレコードまで含めて`withFileLock`でファイル全体をロック・読み書きすることになり、**同時アクセス時のロック待ちがユーザー数増加に伴い相対的に長くなる懸念**がある

#### 案P-B（推奨）: `data/user-plans/{userId}.json`のようにユーザーごとに別ファイルへ分離する

```json
// data/user-plans/usr_XXXXXXXXXX.json
{
  "userId": "usr_XXXXXXXXXX",
  "customPlans": [],
  "eventPlans": { "sg": [], "bkk": [], "syd": [] },
  "updatedAt": "..."
}
```

**メリット**:
- 既存の`data/shared-calendars/{groupId}.json`と全く同じ「1エンティティ=1ファイル」方式であり、コードベースに既に実例がある一貫した設計
- ユーザーごとに独立したファイル・独立した`withFileLock`ロックになるため、あるユーザーの予定更新が他ユーザーの読み書きを一切妨げない
- `data/users.json`（認証情報本体）と予定データという性質の異なる情報を分離でき、`data/users.json`自体は認証情報最小化方針（設計書35 §3）に沿った小さいファイルのまま保てる

**デメリット**: ファイル数がユーザー数分増える（ただし`data/shared-calendars/`で既に同種の運用実績がある）

**推奨: 案P-B**。既存の`data/shared-calendars/{groupId}.json`パターンをそのまま踏襲でき、実装の一貫性・スケーラビリティの両面で有利なため。

### 2-3. 未ログイン時の予定表機能維持（設計書20 §3ユーザーストーリーとの整合）

- **未ログイン状態**: 現行通り`localStorage['custom_plans']`/`localStorage['{city}_event_plans']`のみで動作する。サーバーへの同期は一切発生しない（現状維持）
- **ログイン状態**: `localStorage`への保存は引き続き行いつつ、`data/user-plans/{userId}.json`への同期を追加で行う「ローカル優先＋バックグラウンド同期」方式とする。設計書22（共有カレンダーのforce quitデータ消失バグ修正）で採用された「ローカル保存優先、`syncToServer()`は`await`しつつ失敗してもローカル保存を優先しUIをハングさせない」という既存の確立されたパターンをそのまま踏襲できる

### 2-4. 初回ログイン時の一括アップロード・マージフロー

1. ユーザーが初めてログインした端末で、その時点の端末ローカル`custom_plans`/`{city}_event_plans`の内容を`data/user-plans/{userId}.json`へ**初回アップロード**する（サーバー側に該当ファイルが存在しない場合は新規作成、無条件アップロード）
2. 既にサーバー側に`data/user-plans/{userId}.json`が存在する場合は、設計書22で確立した`mergeArr(localData, serverData)`（idベース和集合、サーバー優先）と同じマージロジックを適用する。個人予定表の`id`は既存の生成方式（ランダムID）でユニーク性が保たれているため、コース・共有カレンダーで実績のあるマージパターンがそのまま流用できる
3. 2台目以降の端末でログインした場合も同じマージロジックが適用され、双方の予定が失われず統合される

### 2-5. ログアウト時の挙動（未解決事項として明記）

ログアウトした場合、端末の`localStorage`データをどう扱うか（サーバー同期済みデータを残すか、匿名状態に戻すか）は本設計書時点で未決定。設計書20 §12-6と類似の論点であり、本設計書のリスク欄に新規リスクとして追記する。

## 3. 共有カレンダーのユーザーアカウント紐づけ設計

### 3-1. 現状の設計思想（無認証・URLベースの気軽さ）の尊重

現状の共有カレンダーは「`groupId`を知っていれば誰でも参加・読み書き可能」という設計であり、これは意図的にシンプルにした設計と考えられる。ユーザーからの追加要望も「認証を必須化してほしい」ではなく「アカウントに紐づけて、別端末でQR読み取りをし直さなくても復元できるようにしたい」という**利便性向上の要望**であるため、既存の招待の気楽さを損なわない設計を優先する。

### 3-2. 案C-A（認証必須化）vs 案C-B（紐づけ追加、既存の無認証アクセスは維持）の比較

#### 案C-A: 共有カレンダーへの参加・読み書きにログインを必須化する

**デメリット**: 既存の「URLひとつで気軽に招待できる」という利便性を大きく損なう。ユーザーストーリー「ログインしなくても引き続き匿名で基本機能を使い続けられてほしい」（設計書20 §3）に真っ向から反する。**不採用**

#### 案C-B（推奨）: 既存の無認証アクセス方式は完全に維持しつつ、ログイン済みユーザーの`data/users.json`（または関連ファイル）に「参加済みgroupId一覧」を追加で記録する

- `POST /api/calendar/:groupId/join`（既存、1533行目）に、**任意で**`Authorization`ヘッダーが付与されている場合のみ、そのユーザーの参加済みグループ一覧に`groupId`を追記する処理を追加する。ヘッダーがない場合は現状の挙動を完全維持
- `POST /api/calendar/create`（既存、1484行目）にも同様に、ログイン済みであれば作成者として参加済みグループ一覧に追記する
- 別端末から同じアカウントでログインした場合、`GET /api/auth/me`のレスポンスに参加済み`groupId`一覧を含め、クライアント側で「QRコードを再度読み取らなくても参加済みグループが復元できる」体験を実現する
- **既存の「groupIdを知っていれば誰でも参加できる」という無認証アクセスの権限モデル自体は一切変更しない**。ログインは「便利な記録・復元手段」として上乗せするだけであり、セキュリティモデルの変更ではない

**推奨: 案C-B**。ユーザーの要望（別端末での復元利便性）を満たしつつ、既存の気軽な招待という価値を損なわない。

### 3-3. 参加済みgroupId一覧のデータモデル

`data/users.json`の各ユーザーレコードに以下を追加する案:

```json
{
  "userId": "usr_XXXXXXXXXX",
  "provider": "apple",
  "providerSub": "...",
  "joinedCalendarGroups": [
    { "groupId": "AB3XY9", "city": "sg", "joinedAt": "..." }
  ],
  "subscriptions": []
}
```

これは2-2節で議論した「予定表データ本体」とは性質が異なり、**「参加した」という単純な記録の追記のみ**（暗号化された予定内容自体は引き続き`data/shared-calendars/{groupId}.json`側）。追記頻度が予定データ本体より大幅に低いため、`data/users.json`本体に含めても2-2節で懸念したロック競合の問題は生じにくいと判断する。

### 3-4. 権限に関する注意点（暗号化キーの扱い）

共有カレンダーのURLは`https://dosuru.app/?join={groupId}&city={city}#{encryptionKey}`という形式で、**暗号化キーはURLのフラグメント（`#`以降）に含まれ、サーバーには送信されない**。

`joinedCalendarGroups`に`groupId`だけを記録する場合、**別端末で復元できるのは「参加した事実（groupId）」のみであり、暗号化キー自体はサーバーに保存されないため復元できない**可能性が高い。この場合、別端末でログインしても、参加済みグループ一覧は表示できても、実際にデータを復号して見るには改めて暗号化キー（フラグメント付きURL）が必要になる、という制約が生じる可能性がある。**この点は暗号化方式の実装詳細に依存するため未確認・未解決事項として明記する。**

## 4. 「DBなどで管理」という表現についての整理（ユーザーへの回答用）

ユーザーは「予定表IDのようなものDBなどでユーザーと紐づけて管理する方法が必要になるかもしれません」と述べているが、このプロジェクトの鉄則（CLAUDE.md「やってはいけないこと」）は「DBを勝手に導入しない」であり、既存アーキテクチャルールも「DBは使わない、JSONファイルで管理する」である。

**本設計書の結論: 新規のデータベース（PostgreSQL・MongoDB等）を導入する必要はない。** 理由:

- 2-2節の案P-B（`data/user-plans/{userId}.json`）・3-3節の`joinedCalendarGroups`配列はいずれも、既存の`data/shared-calendars/{groupId}.json`・`data/users.json`と全く同じ「単一JSONファイル＋`withFileLock`」パターンで実現できる
- 「ユーザーと予定表IDを紐づけて管理する」というユーザーが表現したかった要件自体は、リレーショナルDBの外部キーのような仕組みがなくても、JSONファイル内の配列フィールドやファイル名規則で十分に表現できる
- ユーザーが「DB」という言葉を使ったのは「何らかの形でユーザーと紐づけて永続化する必要がある」という要件を指していると解釈するのが妥当であり、実装手段としてのDB導入そのものを要求しているわけではないと判断する

## 5. フェーズ分けへの位置づけ（設計書35 §2-3への追加）

### 5-1. 「フェーズ1」に含めるか、独立フェーズ（フェーズ1.5）とするか

**推奨: 独立した「フェーズ1.5」として切り出す。**

理由:
- 認証基盤自体がなければ本設計書の機能は成立しないため、**フェーズ1完了が前提条件**という依存関係がある
- 一方で、機能としての独立性は高い。コースの`authorId`真正性確保（設計書20 §6-4）が「認証基盤ができた後の応用」という位置づけだったのと同様の関係性
- 予定表データの同期は、共有カレンダーのforce quitバグ修正（設計書22）で確立したマージ・非同期同期パターンを流用するとはいえ、新規のAPI・新規のクライアント側同期ロジックの実装が必要であり、認証基盤本体とは別のまとまった実装単位として扱う方が進捗管理しやすい

### 5-2. フェーズ1.5の内容（まとめ）

- **フェーズ1.5-A**: 個人予定表データの同期（2節、`data/user-plans/{userId}.json`、初回アップロード・マージフロー）
- **フェーズ1.5-B**: 共有カレンダーの参加済みgroupId記録・復元（3節、`joinedCalendarGroups`、暗号化キーの扱いは別途要検討）

両者は技術的に独立しているため、1.5-Aを先に実装し動作確認した後、1.5-Bに着手する順序を推奨する（1.5-Bは3-4節の暗号化キー扱いという未解決の設計判断を含むため、より単純な1.5-Aから着手する方が手戻りが少ない）。

## 6. 変更するファイル一覧（フェーズ1.5想定）

- `server.js`: 新規`GET/PUT /api/user-plans/:userId`（または`Authorization`ヘッダーから`userId`を解決する`GET/PUT /api/user-plans/me`形式、要検討）。`POST /api/calendar/create`・`POST /api/calendar/:groupId/join`への任意Authorizationヘッダー対応（`joinedCalendarGroups`追記、後方互換）
- `data/user-plans/`（新規ディレクトリ、`{userId}.json`形式でユーザーごとに分離、gitignore対象）
- `data/users.json`: `joinedCalendarGroups`フィールド追加（設計書35 §3-1のスキーマへの追加差分）
- `public/app.js`: `saveCustomPlans`/`saveEventPlans`に、ログイン状態の場合の`data/user-plans`同期処理を追加（設計書22の`syncToServer()`パターンを流用）。ログイン時の初回マージフロー。共有カレンダー参加時の`joinedCalendarGroups`連携、`GET /api/auth/me`から参加済みグループ一覧を受け取っての復元UI
- CLAUDE.md: 予定表データ・共有カレンダーのユーザー紐づけ方針の恒久記録

## 7. リスク・未解決の質問（本設計書で新たに追加する項目）

23. **ログアウト時の端末ローカルデータの扱いが未決定（2-5節）**: サーバー同期済みの予定データをログアウト後も端末に残すか、匿名状態にリセットするかは要議論
24. **共有カレンダーの暗号化キーがサーバーに保存されない設計との整合（3-4節）**: `joinedCalendarGroups`に`groupId`を記録しても、暗号化キー自体は復元できない可能性が高い。ログインユーザー向けに鍵の復元手段を用意するか否かは、既存の暗号化方式のセキュリティモデルに関わる重要な意思決定であり未解決
25. **予定表データの同期タイミングと設計書22の教訓の適用範囲**: 設計書22のfire-and-forget問題・全置換問題の教訓（`await syncToServer()`・`mergeArr`必須）を実装時に確実に踏襲することをレビュー観点として明記する
26. **`data/user-plans/`ディレクトリのファイル数増加**: `data/shared-calendars/`と同様、ユーザー数増加に伴いファイル数が増える。ローテーション・アーカイブの要否は運用開始後に検討する
27. **`GET/PUT /api/user-plans/:userId`のエンドポイント設計詳細**: `:userId`をURLパスに含める方式は、他人の`userId`を推測して読み取りを試みられるリスクがある。`Authorization`ヘッダーから復号した`userId`のみを使う`/api/user-plans/me`形式の方が安全であり、実装時にはこちらを採用することを推奨として明記する

## 承認状況
2026-07-14 planner設計。**実装は未着手**。設計書20・35・36本文は削除・上書きせず保持。2026-07-14 ユーザー承認済み。

# 設計書38 — Googleログインボタンのタッチ操作不具合修正

## 背景・ユーザーストーリー
2026-07-14に実装したGoogle Sign-In機能（Web版）の「Googleでログイン」ボタン・「ログアウト」ボタンが、スマートフォン・タブレットのタッチ操作でタップしても反応しない不具合が報告された。ユーザーとしては、PC・スマホ・タブレットいずれの環境でも設定画面からログイン・ログアウト操作が問題なく行える状態にしたい。

## 原因（確認済み）
CLAUDE.mdに記録された既知の設計パターン「onclick属性＋touchendハンドラの二重登録」が、今回新規追加したログイン関連ボタンにのみ不完全に適用されていた。

- iOS WKWebView・一部モバイルブラウザでは、タッチ操作後に発生する遅延・ゴーストのclickイベントの誤発火に対処するため、`onclick="if(!_touchCapableDetected) 関数呼び出し(...)"`という個別ガードと、タッチ操作検出後の代替経路となる専用`touchend`リスナー登録の、2つがセットで必要（CLAUDE.md「onclick属性＋touchendハンドラの二重登録とゴースト遅延クリック」節）
- `public/index.html` 305行目 `<button id="google-login-btn" onclick="if(!_touchCapableDetected) handleGoogleLoginClick()">`、313行目 `<button id="logout-btn" onclick="if(!_touchCapableDetected) handleLogoutClick()">`は、いずれも1番目（onclickガード）のみ実装されており、2番目（touchend代替リスナー）が欠落している
- タッチ操作を一度でも検出した端末（`_touchCapableDetected === true`、`public/app.js` 72〜73行目で定義）では、この2ボタンの`onclick`が常に無効化される。代替のtouchend処理も無いため、タッチ環境では両ボタンとも一切反応しない状態になっていた（PCブラウザ・マウス操作環境では`_touchCapableDetected`が`false`のままなので影響なし）

### 位置関係の確認（既存パターンに乗せられるかの検証）
`#google-login-btn`・`#logout-btn`は以下の階層に属する。

```
#screen-settings（176行目）
  └─ .screen-scroll-content（180行目）
       └─ .settings-section「2. ログイン」（301行目）
            ├─ #login-section-logged-out（304行目）→ #google-login-btn（305行目）
            └─ #login-section-logged-in（311行目）→ #logout-btn（313行目）
```

`public/app.js` 1938〜1953行目の既存「設定画面 即時タップ対応」ブロックは、`document.getElementById('screen-settings')`に対して`touchend`リスナーを1つ登録し、内部で`e.target.closest('#要素id')`により対象ボタンを判定する方式。両ボタンとも`#screen-settings`の子孫であるため、このリスナーの捕捉範囲内にあり、既存パターンに追加するだけで機能する。

## 修正方針
`public/app.js` 1945〜1952行目の`touchend`ハンドラ内、既存の`if (e.target.closest(...))`の並びに以下2行を追加する（末尾、`#push-toggle-btn`判定の後）。

```javascript
if (e.target.closest('#google-login-btn')) { e.preventDefault(); handleGoogleLoginClick(); return; }
if (e.target.closest('#logout-btn'))       { e.preventDefault(); handleLogoutClick();      return; }
```

- 挿入位置: 既存ブロック内、`#push-toggle-btn`の行の直後
- 既存の8px縦移動判定（スクロール操作との誤判定防止）・`passive:false`の設定はそのまま適用される（変更不要）
- `handleGoogleLoginClick()`・`handleLogoutClick()`は既存関数をそのまま呼び出すのみで、関数自体の実装変更は不要
- `onclick`属性側（`index.html` 305行目・313行目）は変更不要（PCブラウザ用の経路として現状のまま維持）

## 他に見落としがないかの確認結果
今回のGoogle Sign-In実装差分（`public/index.html` 300〜318行目、ログインセクション一式）を全体確認した。新規追加されたクリック可能要素は`#google-login-btn`・`#logout-btn`の2つのみで、他に同種の見落としはない。

### スコープ外（今回対応しない、参考情報として記録）
調査の過程で、無関係の既存要素`#dark-mode-toggle-btn`（`public/index.html` 326行目、`onclick="toggleDarkMode()"`）が、`_touchCapableDetected`によるガード自体が付いていない状態であることを発見した。これは今回のGoogle Sign-In実装の変更差分に含まれない、既存の別問題の可能性がある。今回の修正スコープには含めず、別途調査・対応が必要であれば次回以降のタスクとする。

## 受け入れ基準

### 正常系
- PCブラウザ（マウス操作、`_touchCapableDetected === false`のまま）: 「Googleでログイン」「ログアウト」ボタンがクリックで従来通り動作すること
- タッチ操作環境: 一度でも画面をタッチした後、「Googleでログイン」ボタンタップで`handleGoogleLoginClick()`が呼ばれ、Google認証フローが起動すること
- 同条件で「ログアウト」ボタンタップで`handleLogoutClick()`が呼ばれ、ログアウト処理が実行されること

### 失敗系・エッジケース
- タップ位置が縦方向に8pxを超えてズレた場合、誤ってログイン/ログアウト処理が発火しないこと
- ログイン状態に応じた表示切替（`display:none`制御）が従来通り機能すること
- ゴーストクリック発生時も、ログイン処理が二重に呼ばれないこと

## スコープ外（今回作らないもの）
- `#dark-mode-toggle-btn`のガード追加・touchend対応（既存の別問題として次回対応）
- Sign in with Apple関連のUI
- 「オーバーレイ背景タップで閉じる系」の残り8箇所のtouchend統一対応

## 変更するファイル一覧
- `public/app.js`（1945〜1952行目付近の「設定画面 即時タップ対応」touchendハンドラに2行追加）
- `public/sw.js`（`CACHE_NAME`のバージョン番号インクリメントが必要かbuilder実装時に既存運用を確認）
- `public/index.html`（変更なし、確認のみ）

## データモデルの変更
なし。

## APIの変更
なし。

## 承認状況
2026-07-15 planner設計。2026-07-15 ユーザー承認済み。

# 設計書39 — Google Sign-Inのスコープ最小化に関する技術的制約の訂正

## 0. 本設計書の位置づけ

実装後、実機でGoogleの同意画面を確認したところ、設計書35 §3-1「Google Sign-In: scopeは`openid`のみ要求する。`email`・`profile`スコープは要求しない」という記述が、Google Identity Servicesという製品の仕様上、実現不可能であることが判明した。本設計書は、この事実誤りを訂正する差分パッチとして追記する。**設計書35・36本文は削除・上書きせず保持し、本設計書はその上に乗る訂正として扱う。**

## 1. 実コード監査結果（2026-07-15時点）

### 1-1. Web版（`public/app.js` `_handleGoogleLoginWeb()`、2504〜2523行目）

```javascript
window.google.accounts.id.initialize({
  client_id: _googleWebClientId,
  callback: (response) => { _submitGoogleIdToken(response.credential); },
});
window.google.accounts.id.prompt();
```

- 実装は`google.accounts.id.initialize()`（Google Identity Services「Sign In With Google」ボタン/One Tap方式のAPI）を使用しており、渡しているオプションは`client_id`と`callback`のみ。**`scope`パラメータは実装上そもそも指定されていない。**
- これはコードの実装漏れではなく、**`google.accounts.id.initialize()`というAPI自体に`scope`オプションが存在しない**ため（Google公式ドキュメントで確認済み）。このAPIを使う限り、開発者側がスコープを制御する余地がそもそもない。
- Google公式ドキュメントによれば、`email`・`profile`・`openid`は「サインインスコープ」としてバンドルされており、アプリがこれらのみを要求する場合は粒度の細かい許可画面ではなく、ユーザーは全体をまとめて許可/拒否するのみになる。より低レベルの`google.accounts.oauth2.initTokenClient`に切り替え`scope: 'openid'`のみを指定しても、同じ「サインインスコープはバンドル」という制約が適用され、email/profileへのアクセス許可表示は回避できないとGoogle公式ドキュメントに明記されている。
- **結論: どのGoogle Identity Services APIを使っても、「Sign In With Google」機能を使う限り、同意画面での名前・メールへのアクセス許可表示は回避不可能。** 設計書35 §3-1の「scopeは`openid`のみ要求する」という表現は、実現不可能な誤った前提だったことになる。

### 1-2. iOS版（`ios-app/capacitor.config.js` `GoogleAuth`プラグイン設定）

```javascript
GoogleAuth: {
  // scopes: 認証情報最小化方針（設計書35）により openid のみ要求（email/profileは要求しない）
  scopes: ['openid'],
  iosClientId: '928776929755-...apps.googleusercontent.com',
  grantOfflineAccess: false,
},
```

- `@codetrix-studio/capacitor-google-auth`プラグインの`scopes: ['openid']`設定自体は、Web版と異なり実際に`scopes`というオプションが存在するAPI（プラグインがラップするネイティブGoogle Sign-In SDK、`GIDSignIn`系）に渡されている。
- ただし、**ネイティブGoogle Sign-In SDK側も、Web版のGISと同根の「サインインスコープ（openid, email, profile）はバンドル」という仕様上の制約が及ぶ可能性が高い**と推測される（Web版とAndroid/iOSネイティブSDKはいずれもGoogle Identity Platformという同一の認証基盤上に構築されているため）。
- **しかし、この推測はコードレビューのみでは検証できない。** プラグイン内部のネイティブ実装は本リポジトリの`node_modules`が未インストール状態のため確認できず、**iOS版実機での同意画面の表示内容は2026-07-15時点で未確認**。
- **本設計書での結論: iOS版についても「同意画面でemail/profileへのアクセス許可表示が出る可能性が高い」という前提で運用し、`capacitor.config.js`のコメント（「openidのみ要求のため email/profile は求めない」）は事実と異なる可能性がある前提として扱う。実機確認済みになるまでは未確定情報として扱うこと。**

### 1-3. サーバー側（`server.js` `POST /api/auth/google`・`upsertUser()`）の再監査結果

- `POST /api/auth/google`（1465〜1489行目）: `idToken`を`googleOAuthClient.verifyIdToken()`で検証し、`payload.sub`のみを取り出して`upsertUser('google', sub)`に渡している。`payload`の他のクレーム（`email`・`name`・`picture`等、`idToken`に含まれていたとしても）は一切参照・保存していないことをコードで確認した。
- `upsertUser()`（307〜330行目）: 新規ユーザー作成時のオブジェクトは`{ userId, provider, providerSub, createdAt, lastLoginAt, subscriptions }`のみで構成されており、`email`/`displayName`/`avatarEmoji`等のフィールドは存在しない。既存ユーザー更新時も`lastLoginAt`の更新のみ。
- **結論: 設計書35 §3-1の「サーバー側は`sub`のみ保存・利用する」という約束は、実装後のコードにおいても完全に守られている。** ここは訂正不要（既に正しく実装済み）。

## 2. 訂正内容（設計書35 §3-1・§5への差分）

### 2-1. 撤回する記述

設計書35 §3-1のうち、以下の2文を**撤回**する（誤りだったため）。

> - **Google Sign-In**: scopeは`openid`のみ要求する。`email`・`profile`スコープは要求しない。取得できるのは`sub`（Googleアカウントの一意識別子）のみになる

### 2-2. 訂正後の記述(設計書35 §3-1の置き換え)

- **Google Sign-In**: Google Identity Servicesの仕様上、「Sign In With Google」機能を使う限り、**同意画面には`email`・`profile`スコープへのアクセス許可（「名前とプロフィール写真」「メールアドレス」）が表示されることは技術的に回避不可能**である（`google.accounts.id.initialize()`にはそもそも`scope`パラメータ自体が存在せず、より低レベルの`google.accounts.oauth2.initTokenClient`を使っても、Google公式ドキュメントに明記された「サインインスコープ（openid, email, profile）はバンドル」という仕様上の制約により回避できない）。
- **一方、サーバー側（`POST /api/auth/google`）は、受け取ったIDトークンのペイロードから`sub`のみを取り出し、`email`・`name`・`picture`等の他クレームは一切保存・ログ出力・利用しない実装を維持する**（本設計書1-3節でコード監査済み、既に実装済みで訂正不要）。
- 方針の転換: 「(Googleに)取得させない」ことは技術的に不可能なため断念し、代わりに「(サーバー側で)保存・利用しない」ことを個人情報保護の実質的な担保手段とする。**データそのものへのアクセス経路（Googleの同意画面表示）は避けられないが、サーバー側で保存・利用されない、漏洩リスクの起点にならない、という実質的な保護効果は維持される。**

### 2-3. `data/users.json`のスキーマ例（設計書35 §3-1、変更なし・再確認のみ）

設計書35 §3-1が示した以下のスキーマ例は、本設計書1-3節のコード監査により**実装済みのコードと完全に一致していることを確認した。訂正不要。**

```json
[{
  "userId": "usr_XXXXXXXXXX",
  "provider": "apple",
  "providerSub": "001234.abcdef...",
  "createdAt": "...", "lastLoginAt": "...",
  "subscriptions": []
}]
```

### 2-4. 設計書35 §5（変更するファイル一覧）への差分

設計書35 §5の以下の記述は、実装済みのコードと照合したところ**そのまま実現されている**ことを確認した（訂正不要、再確認事項として記録）。

> `server.js`: ... トークン検証時は`sub`クレームのみを取り出して使用し、`email`・`name`・`picture`等の他クレームは受け取っても保存・利用しない実装にする。

## 3. ユーザーとの合意事項（記録）

上記の技術的制約をユーザーに説明したところ、以下の回答を得た。

> 「しょうがないね。個人情報は当面持ちたくないです」

これにより、以下の方針が確定した。

1. **同意画面の表示自体（Googleが「名前・メールへのアクセスを許可します」と表示すること）は、Google製品の仕様上の制約として受け入れる。** これ以上の回避策（例: 独自のOAuth 2.0フローを`google.accounts.oauth2`ベースで完全に自前実装する等）は、本設計書時点では検討・提案しない（Google Identity Services自体の仕様である以上、代替APIに切り替えても同じ制約に当たることが確認済みのため、追加の技術検討をしても解決しない可能性が高いとplannerは判断する）。
2. **一方、dosuru.appのサーバー側（`POST /api/auth/google`）は、既存の実装通り、受け取ったペイロードから`sub`のみを取り出し、`email`・`name`・`picture`は一切保存・ログ出力・利用しない方針を維持する。** この部分は本設計書1-3節の監査により、既にコード変更不要でそのまま実装済みであることを確認済み。
3. 方針転換のまとめ: 「(Googleに)取得させない」から「(サーバー側で)保存・利用しない」に変更する。データそのものへのアクセス経路（同意画面での許可要求）は技術的に避けられないが、実質的な個人情報保護の効果（サーバーに保存されない・利用されない・漏洩リスクの起点にならない）は維持される。

## 4. iOS版（`@codetrix-studio/capacitor-google-auth`）への言及

- `ios-app/capacitor.config.js`の`GoogleAuth.scopes: ['openid']`設定は、Web版のGIS `google.accounts.id.initialize()`とは異なり、実際に`scopes`オプションが存在するAPI（プラグインがラップするネイティブGoogle Sign-In SDK）に渡されている。
- しかし、ネイティブGoogle Sign-In SDKも同一のGoogle Identity Platform基盤上にあるため、**Web版と同様に「サインインスコープ（openid, email, profile）はバンドル」という制約が及び、`scopes: ['openid']`のみを指定していても同意画面にemail/profileへのアクセス許可が表示される可能性が高い**と推測される。
- **ただし、この推測は本設計書執筆時点で実機・プラグイン内部実装のいずれによっても検証できていない。**
- **未解決事項として明記**: iOS版（TestFlight実機）でのGoogle同意画面の表示内容が2026-07-15時点で未検証である。次回のTestFlightビルド時に、実際に同意画面でemail/profileへのアクセス許可が表示されるかどうかを確認する必要がある。表示される場合、`capacitor.config.js`の`scopes: ['openid']`設定コメント（「email/profileは要求しない」という趣旨）も、本設計書2-2節と同様の訂正が必要になる。

## 5. Apple Sign-In（設計書35 §3-1、未実装）への言及

- Apple Sign-In（Sign in with Apple）は、Googleとは異なる認可モデルを採用しており、**アプリ側が要求するスコープ（`email`・`fullName`）をそれぞれ個別に指定でき、ユーザーは同意画面上でこれらを個別にオン/オフ可能、かつ`email`については「実メールアドレスを共有」または「メールを非公開（Appleのプライベートリレーメールアドレスを使用）」を選択できる**、というのが一般に知られているAppleの認可フローの仕様である。これはGoogleの「サインインスコープはバンドルで一括許可/拒否のみ」という制約とは異なる設計思想である。
- **ただし、この認識は本設計書時点でApple公式ドキュメントを一次情報として調査・確認したものではなく、一般的な技術知識に基づく記述である。実際にAppleの`ASAuthorizationAppleIDProvider`（iOSネイティブ）・"Sign in with Apple JS"（Web版、設計書36 §2）の`requestedScopes`設定でどこまで個別制御可能か、また現行のApple仕様が変わっていないかは、本設計書では未確認であり、Apple Sign-In実装着手時に公式ドキュメントで再確認が必要な事項として明記する。**
- Apple Sign-Inは設計書35 §2-1・§2-3で「フェーズ1」の対象として位置づけられているが、2026-07-15時点で**実装未着手**。実装時には、本設計書で指摘した「Googleとは異なりスコープを個別制御できる可能性が高い」という前提が実際に成立するか、着手前にApple公式ドキュメントで検証することを推奨する。もし成立するなら、Apple Sign-InはGoogle Sign-Inよりも「認証情報最小化」を同意画面レベルでも実現しやすい認証方式ということになり、設計書35 §3全体の説明にも「GoogleとAppleで同意画面の挙動が異なる」という非対称性を明記した方がよい。

## 6. スコープ外（今回訂正しないもの）

- Google Identity Servicesの代替実装（完全自前のOAuth 2.0フロー等）の検討・提案は行わない（1-1節参照、制約の根本回避にならないと判断）
- iOS版の実機確認自体（本設計書はあくまで技術的制約の記述訂正であり、実機確認作業は次回のTestFlightビルド時に別途実施）
- Apple Sign-Inの実装そのもの（設計書36の対象、未着手のまま）
- サーバー側コードの変更（本設計書の監査により変更不要と判明したため）

## 7. リスク・未解決の質問

28. **iOS版のGoogle同意画面表示内容が未検証（4節）**: 次回TestFlightビルド時に実機確認が必要。表示内容次第で`capacitor.config.js`のコメントも訂正が必要になる
29. **Apple Sign-Inのスコープ個別制御可否が一次情報で未確認（5節）**: 実装着手前にApple公式ドキュメントでの再確認を推奨。仮に「Googleはバンドル、Appleは個別制御可能」という非対称性が事実なら、ユーザー向け説明（プライバシーポリシー等）にも反映すべき論点になりうる
30. **プライバシーポリシー等ユーザー向け説明文への反映要否**: 「Googleでログイン」ボタン利用時、同意画面にemail/profileへのアクセス許可が表示されるがサーバーには保存されない、という説明を、アプリ内のどこか（設定画面のログインセクション付近、あるいはプライバシーポリシーページ）にユーザー向けに明記すべきか否かは、本設計書では検討していない未解決の論点として残す

## 変更するファイル一覧

本設計書は**ドキュメント（`.claude/plan.md`）の訂正のみ**であり、コード変更は伴わない。

- `.claude/plan.md`: 本設計書（設計書39）を末尾に追記
- CLAUDE.mdの「Google Sign-In認証基盤」相当セクション: 本設計書の訂正内容（同意画面の表示は回避不可能、サーバー側保存方針は維持）を反映する追記が今後必要

## データモデルの変更・APIの変更

なし。本設計書はコード変更を伴わない、既存設計書の記述訂正のみ。

## 承認状況
2026-07-15 planner設計。**実装は不要（ドキュメント訂正のみ）**。設計書35・36本文は削除・上書きせず保持。2026-07-15 ユーザー承認済み。

# 設計書40 — GoogleログインボタンをrenderButton方式に変更（One Tap再表示不可問題の修正）

## 0. 背景・不具合の症状

Web版（dosuru.app）のGoogle Sign-Inで、以下の手順で不具合が再現する。

1. 設定画面で「Googleでログイン」ボタンをタップ → Google One Tap（または関連プロンプトUI）が表示されサインインに成功する
2. 「ログアウト」ボタンをタップしてログアウトする
3. 同一ページをリロードせずに、再度「Googleでログイン」ボタンをタップする
4. **何も起こらない（プロンプトが一切表示されない）**

### 原因

現在の実装（`public/app.js` `_handleGoogleLoginWeb()`、2504〜2523行目）は、自前デザインのボタン（`public/index.html` 305〜308行目の`#google-login-btn`）のクリックハンドラ内で`google.accounts.id.prompt()`（Google One Tap）を呼び出す方式になっている。

Google Identity Servicesの仕様として、One Tapは「一度サインインが完了する（またはユーザーが明示的に閉じる）と、そのページをリロードするまで内部的に抑制状態（dismissed/skipped momentの記録）が残り、`prompt()`を再度呼んでも表示されなくなる」という、過剰表示を避けるための意図的な仕様がある（Google公式ドキュメントに記載）。ログアウト操作はこの内部抑制状態を一切リセットしないため、症状の「再クリックで反応しない」は`prompt()`の仕様通りの挙動であり、バグというよりAPI選定の誤りに起因する。

### Google公式の推奨解決策（採用決定）

`prompt()`（受動的・自動サジェスト前提の一時的UI）に依存するのではなく、`google.accounts.id.renderButton(container, options)`でGoogle公式ボタンをコンテナ要素内にその場で描画する方式に切り替える。ユーザーの能動的クリックを前提とした恒久的なボタンであり、クリックのたびに確実にアカウント選択ポップアップ（またはOne Tap相当のUI）が起動し、`prompt()`のような抑制ロジックの影響を受けない。

ボタンの見た目がGoogle標準デザインに寄る（一部カスタマイズは可能だが完全な既存デザイン踏襲は不可）ことは許容済み。

## 1. 設計方針

### 1-1. HTML変更: `#google-login-btn`を空のコンテナ要素に置き換え

```html
<div id="login-section-logged-out" class="settings-item" style="padding:14px 18px;">
  <div id="google-login-btn-container" style="display:flex;justify-content:center;width:100%;"></div>
</div>
```

`onclick`属性・`<span data-i18n="loginWithGoogle">`（ボタン内テキスト）は撤去する。ボタンのラベル文言はGoogle側の`text`オプションが描画するため、既存の`data-i18n="loginWithGoogle"`キー・翻訳文字列は死にキーになるが、STRINGS定義自体は削除せず残置する。

`#logout-btn`（ログアウトボタン）は自前ボタンのまま変更なし。

### 1-2. JS変更: `_handleGoogleLoginWeb()`相当のロジックを`renderButton()`呼び出しに置き換え

```javascript
function _initGoogleButtonWeb() {
  if (!window.google?.accounts?.id) return;
  if (!_googleAuthInited) {
    window.google.accounts.id.initialize({
      client_id: _googleWebClientId,
      callback: (response) => { _submitGoogleIdToken(response.credential); },
    });
    _googleAuthInited = true;
  }
  const container = document.getElementById('google-login-btn-container');
  if (container && !container.dataset.rendered) {
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: 280,
    });
    container.dataset.rendered = 'true';
  }
}
```

- `initialize()`自体・`_googleWebClientId`の取得（`GET /api/config`）ロジックは現行のまま流用する
- `_initGoogleButtonWeb()`は「ページ初期化時に一度だけ、ログイン状態に関わらず呼んでおく」方式にする（ログイン中はコンテナごと`display:none`になるので、描画済みでも実害がない）。既存のアプリ起動時初期化フロー内（例: `refreshLoginUI()`が最初に呼ばれる箇所付近、または独立した初期化呼び出し）に追加する
- `_googleWebClientId`が未取得の場合は`GET /api/config`を先に呼んで取得してから`renderButton()`を呼ぶガードを入れる（現行の`_handleGoogleLoginWeb()`冒頭のチェックと同等のロジックを踏襲）
- `handleGoogleLoginClick()`のiOS分岐（`_handleGoogleLoginIOS()`）は無変更。Web版分岐は上記`_initGoogleButtonWeb()`に置き換わるため、`handleGoogleLoginClick()`関数自体はiOS専用に絞り込むか、Web版呼び出し時は何もしない（ボタンクリック自体をGoogleが処理するため）ように調整する

### 1-3. `renderButton()`のオプション（3-3節、上記コード参照）

`type:'standard'` `theme:'outline'` `size:'large'` `text:'signin_with'` `shape:'pill'` `logo_alignment:'left'` `width:280`。既存デザインに完全一致はしないが、pill形状・控えめなoutlineスタイルで可能な範囲で寄せる。

### 1-4. onclick/touchendガードパターンの削除

- `public/index.html` 305行目: `<button id="google-login-btn" onclick="...">`ごと撤去（1-1節のコンテナ`<div>`に置き換わるため自然に消える）
- `public/app.js` 1938〜1955行目「設定画面 即時タップ対応」ブロック内、`if (e.target.closest('#google-login-btn')) { e.preventDefault(); handleGoogleLoginClick(); return; }`の行を削除する（`#google-login-btn`というID自体がDOM上から無くなるため）
- `#logout-btn`側のonclick/touchendガードは変更不要（現状維持）

### 1-5. ログアウト時の`disableAutoSelect()`追加

`handleLogoutClick()`内、`clearAuthToken()`の前後に以下を追加する:

```javascript
window.google?.accounts?.id?.disableAutoSelect?.();
```

オプショナルチェイニングにより、GIS未ロード時・iOS環境実行時にエラーにならない（`window.google`が存在しない場合は単に何もしない）。

### 1-6. ダークモード・言語切替への非追従（スコープ外として許容）

`renderButton()`の`theme`オプションは初回描画時に固定され、ダークモード切替に自動追従しない。同様に、ボタンの表示言語もページ言語切替に自動追従しない。いずれも今回のスコープでは対応せず、許容する。

## 2. 影響範囲・受け入れ基準

### 正常系
- Web版（PCブラウザ）: 設定画面「ログイン」セクションにGoogle公式デザインのボタンが表示され、クリックでGoogleアカウント選択ポップアップが起動し、サインインが完了すること
- 同一ページをリロードせずに「ログイン→ログアウト→再度ログイン」を繰り返しても、2回目以降もボタンクリックでアカウント選択ポップアップが確実に起動すること（**今回の主目的、最重要の受け入れ基準**）
- ログイン成功後、`#login-section-logged-out`が非表示・`#login-section-logged-in`が表示されること（`refreshLoginUI()`の既存ロジックを踏襲）
- タッチ操作環境でもGoogle公式ボタンのタップでポップアップが起動すること
- ログアウトボタン（自前ボタン）はPCブラウザ・タッチ環境の両方で従来通り動作すること（設計書38の修正がそのまま活きる）
- 日英切り替え時、`#logout-btn`・「ログイン中」ラベルは従来通り正しく切り替わること

### 失敗系・エッジケース
- GIS SDKロード失敗時、`renderButton()`呼び出し自体がガードされコンテナが空のまま残ってもエラーにならないこと
- `_googleWebClientId`未取得時は`renderButton()`を呼ばないこと
- 設定画面を何度開いてもGoogleボタンが多重描画されないこと（`container.dataset.rendered`ガード）

### iOS版への影響確認
`_handleGoogleLoginIOS()`（Capacitorネイティブプラグイン経由）は今回の変更対象外。無変更であることを確認すること。

## 3. 変更するファイル一覧
- `public/index.html`: 305〜308行目のボタンをコンテナdivに置き換え
- `public/app.js`: `_handleGoogleLoginWeb()`相当ロジックの置き換え、`handleGoogleLoginClick()`のWeb分岐調整、1938〜1955行目のtouchendブロックから該当行削除、`handleLogoutClick()`に`disableAutoSelect()`追加
- `public/sw.js`: `CACHE_NAME`インクリメント（キャッシュバスティング、CLAUDE.md記載の既存運用パターン）
- `public/index.html`: `app.js?v=...`のバージョンクエリ更新

## 4. データモデル・APIの変更
なし。認証フロー（`POST /api/auth/google`、JWT発行・`data/users.json`）は無変更。Web版フロントエンドのボタン描画方式のみが対象。

## 承認状況
2026-07-15 planner設計。2026-07-15 ユーザー承認済み（`disableAutoSelect()`追加含む）。
