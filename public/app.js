    // ─── CAPACITOR DETECTION ───
    const _isCapacitorApp = !!(window.Capacitor?.isNativePlatform?.());
    const API_BASE = _isCapacitorApp ? 'https://dosuru.app' : '';

    // ─── DEBUG: 実機デバッグ用サーバーログ送信（原因特定後に削除すること）───
    function _sendDebugLog(event, data) {
      try {
        fetch(API_BASE + '/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, ...data, ts: Date.now(), isCapacitor: _isCapacitorApp }),
        }).catch(() => {});
      } catch (_) {}
    }

    // ─── モーダル/シートを閉じる際、内部にフォーカスが残っていたら外す共通ヘルパー ───
    // フォーカスが残ったまま非表示化されたinput/textareaが、iOS WKWebView側のタッチイベント
    // 配送を阻害する可能性があるための対策（2026-07-11、設計書7）。
    // 渡された要素（複数可）のいずれかの内部に document.activeElement がある場合のみ blur する。
    function _blurIfFocusInside(...containers) {
      try {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        const isInside = containers.some(c => {
          if (!c) return false;
          const el = typeof c === 'string' ? document.getElementById(c) : c;
          return el && el.contains(active);
        });
        if (isInside) active.blur();
      } catch (_) {}
    }

    // ─── CAPACITOR: GA4スキップ・外部リンク制御・overscroll防止 ───
    if (_isCapacitorApp) {
      window.gtag = function() {};
      document.addEventListener('click', e => {
        const anchor = e.target.closest('a[target="_blank"]');
        if (!anchor) return;
        e.preventDefault();
        if (window.Capacitor?.Plugins?.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: anchor.href });
        }
      });
      // WKWebViewのゴムバンドスクロールを上下両方向で禁止（ナビバーのずれ防止）
      let _capTouchStartY = 0;
      document.addEventListener('touchstart', e => {
        _capTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      document.addEventListener('touchmove', e => {
        const dy = e.touches[0].clientY - _capTouchStartY;
        let el = e.target;
        while (el && el !== document.documentElement) {
          const ov = window.getComputedStyle(el).overflowY;
          if (ov === 'auto' || ov === 'scroll') {
            // 実際に縦スクロール可能な要素のみ対象（overflow-x:autoの副作用でoverflow-y:autoになる要素を除外）
            if (el.scrollHeight > el.clientHeight) {
              const atTop    = el.scrollTop <= 0;
              const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
              if (dy > 0 && atTop)    { e.preventDefault(); return; }
              if (dy < 0 && atBottom) { e.preventDefault(); return; }
              return; // スクロール余地あり → 許可
            }
          }
          el = el.parentElement;
        }
        e.preventDefault();
      }, { passive: false });

    }

    // ─── タッチ端末検出（onclick属性のゴーストクリックガードで使用）───
    let _touchCapableDetected = false;
    document.addEventListener('touchstart', () => { _touchCapableDetected = true; }, { passive: true, capture: true });

    // ─── パスフレーズ入力シート（バックアップ/共有カレンダー）フォーカス中はbottom-navを一時的に隠す（設計書60）───
    // Web版Safari・iOS版共通（Capacitor限定にしない）。モバイルSafariのキーボード表示時、独立したposition:fixed;bottom:0
    // 要素同士（.bottom-nav と #backup-passphrase-sheet/#cal-passphrase-sheet）の可視領域追従がズレ、
    // ボタン行がボトムナビと重なる不具合の対策。対象を2シート内のinput/textareaに厳密に限定する。
    document.addEventListener('focusin', (e) => {
      try {
        const t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        if (!t.closest('#backup-passphrase-sheet, #cal-passphrase-sheet')) return;
        const nav = document.querySelector('.bottom-nav');
        if (nav) nav.style.visibility = 'hidden';
      } catch (_) {}
    });
    document.addEventListener('focusout', (e) => {
      try {
        const t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        if (!t.closest('#backup-passphrase-sheet, #cal-passphrase-sheet')) return;
        const nav = document.querySelector('.bottom-nav');
        if (nav) nav.style.visibility = '';
      } catch (_) {}
    });

    // ─── 設定画面のキーボード被り対策（軽量フォールバックのみ。2026-07-11設計書15で刷新）───
    // かつての .plan-modal / .plan-sheet を縮小・移動する複雑なJS一式（_adjustSheetForKb等）は撤去した。
    // ビューポート固着バグの真因は capacitor.config.js の contentInset:'always' 側にあり、
    // これらのシート操作JSは無害な被害者だったと判明したため（設計書15）。
    // シート系のキーボード回避は .plan-modal-body{overflow-y:auto} の内部スクロールとネイティブに委ねる。
    //
    // ただし「設定画面直下の入力欄（#feedback-text / #nickname-input など、.plan-modal/.plan-sheetの外側）」は
    // 内部スクロールコンテナを持たずキーボードに隠れやすいため、この軽量関数だけ温存する（回帰防止）。
    // フォーカス要素が .plan-modal / .plan-sheet の外にあるときだけスクロールで逃がす。
    function _scrollFocusedIntoViewOnKb(kbHeight) {
      setTimeout(() => {
        const focused = document.activeElement;
        if (!focused || (focused.tagName !== 'INPUT' && focused.tagName !== 'TEXTAREA')) return;

        const screenH = window.innerHeight;
        const rect = focused.getBoundingClientRect();
        const visibleBottom = screenH - kbHeight - 80; // キーボード上に見た目の余白80pxを確保
        const overflow = rect.bottom - visibleBottom;
        if (overflow <= 0) return;

        let container = focused.parentElement;
        while (container && container !== document.body) {
          const cs = getComputedStyle(container);
          if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
            // 既存padding-bottomだけでは実際に必要なスクロール量に足りず、scrollTopが
            // scrollHeight-clientHeightで頭打ちになるケースがあるため、キーボード表示中のみ
            // 一時的にpadding-bottomを拡張して伸びしろを確保してから加算する。
            // （2026-07-11: 当初 .screen-scroll-content 限定だったが、.plan-modal-body
            //  （コース作成・予定作成シート等）でも同じ頭打ちが起きるため全スクロールコンテナに汎用化）
            if (!container.dataset.kbOrigPaddingBottom) {
              container.dataset.kbOrigPaddingBottom = getComputedStyle(container).paddingBottom;
            }
            container.style.paddingBottom = (kbHeight + 80) + 'px';
            container.scrollTop += overflow;
            break;
          }
          container = container.parentElement;
        }
        // overflow-y:auto の祖先スクロールコンテナが見つからない場合は何もしない
        // （設計書59・案C：scrollIntoView フォールバックは .plan-modal のような position:fixed
        //  要素配下で iOS WKWebView のレイアウト再計算ズレを誘発する副作用があったため撤去）
      }, 80);
    }

    // キーボードが閉じたら、上で一時付与した padding-bottom を元に戻す（戻し忘れ防止）
    function _resetScrollPaddingAfterKb() {
      document.querySelectorAll('[data-kb-orig-padding-bottom]').forEach(container => {
        container.style.paddingBottom = container.dataset.kbOrigPaddingBottom;
        delete container.dataset.kbOrigPaddingBottom;
      });
    }

    // ─── PULL TO REFRESH（設計書19、2026-07-12再実装）───
    // iOS版のみ有効化。スクロールコンテナ内部の先頭に置いたインジケーター要素の
    // height/opacityのみをJSで操作する。ヘッダー・スクリーンコンテナ・html/bodyの
    // position/overflow/heightは一切変更しない。
    const PTR_THRESHOLD = 60;   // これ以上引っ張って離したらリフレッシュ確定
    const PTR_MAX_PULL   = 90;  // インジケーターの最大高さ（クランプ）

    // container: スクロールコンテナ要素（#home-scroll-content / #course-screen-content）
    // indicatorId: インジケーター要素のid
    // onRefresh: async関数。データ再取得処理
    // watchSwipeIntent: true の場合のみ、既存の横スワイプ機構（ホーム画面限定の _swipeIntent 変数）を
    //   参照して衝突を回避する。コース画面には横スワイプ機構自体が存在しないため false にする
    //   （設計書19 4.1節: コース画面側は _swipeIntent のような共有判定を作らず単独判定にする方針）。
    function _initPtr(container, indicatorId, onRefresh, watchSwipeIntent) {
      if (!_isCapacitorApp) return; // Web版は対象外（設計書19、デフォルト方針）
      if (!container || container._ptrInit) return;
      container._ptrInit = true;

      const indicator = document.getElementById(indicatorId);
      if (!indicator) return;

      let startY = 0;
      let pulling = false;
      let refreshing = false;

      container.addEventListener('touchstart', e => {
        if (refreshing) return;
        // 横スワイプ機構（ホーム画面）と衝突する場合は、そちら側の _swipeIntent 判定に委ねる。
        // ここでは単純にドラッグ開始位置だけ記録する。
        startY = e.touches[0].clientY;
        pulling = false;
      }, { passive: true });

      container.addEventListener('touchmove', e => {
        if (refreshing) return;
        // ホーム画面のみ: 横スワイプと判定された場合はPTR側は即座に何もしない
        // （既にインジケーターを引っ張り始めていた場合は取り消してリセットする）
        if (watchSwipeIntent && typeof _swipeIntent !== 'undefined' && _swipeIntent === 'h') {
          if (pulling) {
            pulling = false;
            indicator.style.height = '0px';
            indicator.style.opacity = '0';
          }
          return;
        }

        const dy = e.touches[0].clientY - startY;
        if (dy <= 0) { // 上方向 or 動きなし → 通常のスクロールに委ねる
          if (pulling) {
            pulling = false;
            indicator.style.height = '0px';
            indicator.style.opacity = '0';
          }
          return;
        }
        if (container.scrollTop > 0) return; // 最上部でない → PTR対象外

        pulling = true;
        e.preventDefault(); // 引っ張り中はスクロールコンテナのバウンスを起こさない
        const pull = Math.min(dy, PTR_MAX_PULL);
        indicator.style.height = pull + 'px';
        indicator.style.opacity = String(Math.min(pull / PTR_THRESHOLD, 1));
      }, { passive: false });

      container.addEventListener('touchend', async () => {
        if (refreshing || !pulling) { pulling = false; return; }
        pulling = false;
        const curHeight = parseFloat(indicator.style.height) || 0;
        if (curHeight >= PTR_THRESHOLD) {
          refreshing = true;
          indicator.classList.add('ptr-refreshing');
          indicator.style.height = PTR_THRESHOLD + 'px';
          indicator.style.opacity = '1';
          try {
            await onRefresh();
          } catch (_) {
            // 失敗してもインジケーターは必ず消す（無限ローディング防止）
          } finally {
            indicator.classList.remove('ptr-refreshing');
            indicator.style.height = '0px';
            indicator.style.opacity = '0';
            refreshing = false;
          }
        } else {
          indicator.style.height = '0px';
          indicator.style.opacity = '0';
        }
      }, { passive: true });
    }

    if (_isCapacitorApp) {
      // Capacitor環境: @capacitor/keyboard のネイティブイベントで正確なキーボード高さを取得
      // Capacitor 6: Plugins.Keyboard ではなく registerPlugin() 経由でないと addListener が動かない場合があるため優先し、失敗時は従来方式にフォールバック
      let _CapKB = null;
      try {
        if (window.Capacitor?.registerPlugin) {
          _CapKB = window.Capacitor.registerPlugin('Keyboard');
        }
      } catch (_) {}
      if (!_CapKB) _CapKB = window.Capacitor?.Plugins?.Keyboard;
      if (_CapKB?.addListener) {
        _CapKB.addListener('keyboardWillShow', (info) => {
          _scrollFocusedIntoViewOnKb(info.keyboardHeight);
          document.getElementById('toast')?.classList.add('kb-open');
        });
        _CapKB.addListener('keyboardWillHide', () => {
          _resetScrollPaddingAfterKb();
          document.getElementById('toast')?.classList.remove('kb-open');
        });
      } else {
        // フォールバック: keyboardプラグイン未検出時は focusin/focusout で近似
        document.addEventListener('focusin', e => {
          const el = e.target;
          if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
          setTimeout(() => {
            const kbHeight = window.innerHeight - window.visualViewport.height;
            if (kbHeight > 50) {
              _scrollFocusedIntoViewOnKb(kbHeight);
              document.getElementById('toast')?.classList.add('kb-open');
            }
          }, 350);
        }, true);
        document.addEventListener('focusout', e => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            setTimeout(_resetScrollPaddingAfterKb, 100);
            document.getElementById('toast')?.classList.remove('kb-open');
          }
        }, true);
      }
    } else {
      // Web環境（iOS Safari / Android Chrome 含む）: position:fixed;bottom:0 要素は
      // モバイルブラウザのネイティブ挙動でvisualViewportに自動追従するため、JS制御は一切行わない
    }

    // ─── GENRE MASTER ───
    const GENRE_LIST = [
      { id: 'gourmet',  emoji: '🍜', label: 'グルメ・食べ歩き',    labelEn: 'Food & Dining' },
      { id: 'nature',   emoji: '🌿', label: '自然・公園',          labelEn: 'Nature & Parks' },
      { id: 'art',      emoji: '🎨', label: 'アート・文化',        labelEn: 'Art & Culture' },
      { id: 'shopping', emoji: '🛍', label: 'ショッピング',        labelEn: 'Shopping' },
      { id: 'workshop', emoji: '🎡', label: '体験・ワークショップ', labelEn: 'Experiences' },
      { id: 'music',    emoji: '🎵', label: '音楽・エンタメ',      labelEn: 'Music & Entertainment' },
      { id: 'kids',     emoji: '👶', label: '子ども向け',          labelEn: 'Kids' },
      { id: 'sports',   emoji: '🏃', label: 'スポーツ・アウトドア', labelEn: 'Sports & Outdoors' },
      { id: 'theater',  emoji: '🎬', label: '映画・舞台',          labelEn: 'Movies & Shows' },
      { id: 'learning', emoji: '📚', label: '学び・教育',          labelEn: 'Learning' },
      { id: 'wellness', emoji: '💆', label: 'ウェルネス・スパ',    labelEn: 'Wellness & Spa' },
      { id: 'festival', emoji: '🎪', label: '祭り・マーケット',    labelEn: 'Festivals & Markets' },
      { id: 'animals',  emoji: '🐾', label: '動物・ペット',        labelEn: 'Animals & Pets' },
    ];

    // ─── I18N ───
    const STRINGS = {
      ja: {
        headerSubtitle: 'シンガポール在住者の週末おでかけガイド', // city-specific: overridden by updateCityUI()
        labelCity: '都市',
        shareLabel: 'シェア',
        tabsLabel: 'いつ行く？',
        tabWeekend: '今週',
        tabNextWeekend: '来週',
        tabAfterWeekend: '2週後',
        tabThreeWeeks: '3週後',
        sectionTitle: '絞り込む',
        tabAll: '指定なし',
        catAll: 'すべて',
        catRecommend: 'おすすめ',
        addToPlanBtnShort: '予定追加',
        courseCreateBtnShort: 'コース作成',
        catEvent: 'イベント',
        catShow: '展示・公演',
        catGourmet: 'グルメ・フェア',
        catSale: 'プロモ・お得',
        catOpening: '新規オープン',
        catStarting: '🆕 今週から',
        catEnding: '🔥 今週まで',
        labelWhen: 'いつ行く？',
        labelWhat: 'どこ行く？',
        emptyTitle: 'まだスポット準備中！',
        emptyDesc: 'このカテゴリのおでかけ先は<br>近日公開予定です。<br>タブを切り替えて他の候補を見てみましょう。',
        pinScreenTitle: '📌 ピン留め',
        calScreenTitle: '📅 カレンダー',
        homeScreenTitle: 'イベント情報',
        settingsTitle: '設定',
        secProfile: 'プロフィール',
        secAppSettings: 'アプリ設定',
        labelLang: '表示言語',
        secData: 'データ',
        secSupport: 'サポート・情報',
        clearPins: 'ピン留めをすべて削除',
        resetBtn: 'リセット',
        secFeedback: 'フィードバック',
        feedbackPlaceholder: '改善要望・バグ報告・スポット追加リクエストなど、なんでもどうぞ！',
        feedbackSend: '📨 送信する',
        supportDesc: 'このアプリは無料で運営しています。気に入っていただけたら、コーヒー1杯分で応援していただけると嬉しいです',
        supportLabel: 'アプリを応援する',
        supportBtn: 'アプリを応援する（SGD 5）',
        secAbout: 'アプリ情報',
        aboutAppName: 'アプリ名',
        aboutVersion: 'バージョン',
        navHome: 'イベント',
        navPlan: '予定表',
        navSettings: '設定',
        pinBtn: 'ピン留め',
        pinnedBtn: '外す ✓',
        shareBtn: '📤 共有する',
        articleLink: '元記事を見る',
        tipsLabel: '🎒 ひとことメモ',
        hintLabel: '💡 ヒント',
        tabWeekendBadge: '今週',
        tabNextWeekendBadge: '来週',
        tabAfterWeekendBadge: '2週後',
        tabThreeWeeksBadge: '3週後',
        whoFamilyBadge: '👨‍👩‍👧‍👦 ファミリー',
        whoCoupleBadge: '👫 カップル',
        whoSoloBadge: '🧑‍💼 ひとり',
        whoGroupBadge: '👥 グループ',
        ageBabyBadge: '🍼 0〜2歳',
        agePreschoolBadge: '🚀 3〜6歳',
        ageSchoolBadge: '📚 小学生',
        confirmClearPins: 'ピン留めをすべて削除しますか？',
        confirmLogout: 'アカウント連携を解除しますか？',
        toastPinned: '📌 ピン留めしました！',
        toastUnpinned: '📌 ピン留めを外しました',
        toastFeedbackSent: '📨 フィードバックを送信しました！',
        toastFeedbackError: '⚠️ 送信に失敗しました。もう一度お試しください',
        toastFeedbackNetError: '⚠️ 送信に失敗しました。ネットワークを確認してください',
        toastFeedbackEmpty: '💬 メッセージを入力してください',
        toastClearedPins: 'ピン留めをすべて削除しました',
        toastUrlCopied: '🔗 URLをコピーしました！',
        loadingEvents: 'おでかけ情報を読み込み中...',
        labelPush: 'イベント更新の通知',
        pushOn: 'ON',
        pushOff: 'OFF',
        pushDenied: '許可が必要',
        pushUnsupported: '非対応',
        toastPushOn: '🔔 プッシュ通知をONにしました！',
        toastPushOff: '🔕 プッシュ通知をOFFにしました',
        toastPushDenied: '⚙️ 設定アプリから通知を許可してください',
        toastPushError: '⚠️ 通知の設定に失敗しました',
        countSuffix: '件',
        pinEmpty: 'まだピン留めがありません',
        pinEmptyDesc: '気になるスポットのカードから<br>📌ピン留めしてみましょう！',
        shareSettingsDesc: 'シンガポール在住の友達にこのアプリを紹介しよう！',
        shareSettingsBtn: '友達にシェアする',
        bannerToday: '⏰ 本日まで',
        bannerTomorrow: '⏰ 明日まで',
        bannerDaysLeft: '⏰ あと{d}日',
        toastProfileSet: '✅ {label} に設定しました',
        profileLabelAll: '指定なし（すべて）',
        planModalDateLabel: '日付を選ぶ',
        planModalSlotLabel: '時間帯を選ぶ',
        planModalDateLabelReq: '日付を選ぶ <span style="color:var(--terracotta)">*</span>',
        planModalSlotLabelReq: '時間帯を選ぶ <span style="color:var(--terracotta)">*</span>',
        planModalMemoLabel: 'メモ',
        planModalAddBtn: '追加する',
        planModalSaveBtn: '保存する',
        planModalCustomTitle: '予定を追加',
        planMemoPlaceholder: '例：予約済み、持ち物メモなど',
        addToPlanBtn: '📅 予定に追加',
        customPlanEmpty: '右の ＋ から習い事・誕生日・用事などを追加できます',
        pinnedEventsEmpty: '探索タブで 📌 をタップするとここに表示されます',
        toastPlanAdded: '📅 プランに追加しました',
        toastPlanDeleted: '🗑 削除しました',
        toastPlanUpdated: '✅ 保存しました',
        scheduleNoPlans: '予定なし',
        customPlanTitlePlaceholder: 'タイトルを入力',
        navCourse: '制覇',
        courseScreenTitle: 'スタンプラリー',
        courseTabEveryone: 'みんなのコース',
        courseTabMylist: 'マイコース',
        courseTabStampMap: 'スタンプラリー',
        stampMapLoginRequired: 'スタンプラリーの進捗を記録するには、アカウント連携が必要です。設定画面から連携してください。',
        stampLevelStandard: '定番',
        stampLevelLocal: 'ローカル',
        stampLevelNiche: 'ニッチ',
        stampLevelSpecial: 'スペシャル',
        stampProgressSummary: '{unlocked}レベル解禁中・{checked}/{total}スポット制覇',
        stampCheckedInBadge: '✓ 制覇済み',
        stampCheckinBtn: '現在地を確認中…',
        stampCheckinBtnReady: 'チェックインする',
        stampCheckinBtnTooFar: '近づくとチェックインできます',
        stampCheckinBtnNoLocation: '位置情報を取得できません',
        stampCheckinBtnLocked: 'このスポットはまだロックされています',
        toastStampCheckinSuccess: '🎉 スタンプを獲得しました！',
        toastStampCheckinError: 'チェックインに失敗しました。もう一度お試しください。',
        toastStampLevelUnlocked: '🔓 新しいレベルが解禁されました！',
        stampLocationPermDenied: '位置情報の利用が許可されていません。端末の設定から許可してください。',
        stampViewToggleMap: '🗺️ 地図で見る',
        stampViewToggleList: '📖 一覧で見る',
        stampCollectionLockedNote: 'このレベルはまだロック中です',
        stampNextTargetLabel: '次はここ！',
        stampLevelUnlockModalTitle: '新しいレベルが解禁されました！',
        stampLevelUnlockModalClose: '閉じる',
        courseSheetTitle: 'コースを作る',
        coursePinsLabel: '軸にするイベント',
        coursePinsHint: '軸にするイベントをタップして選んでください',
        courseDepartLabel: '出発時間',
        courseReturnLabel: '帰宅時間',
        courseTimeAny: '指定なし',
        courseNoteLabel: 'ひとこと',
        courseNoteOptional: '（任意）',
        courseNotePlaceholder: '例）記念日なので特別感がほしい、穴場スポットで行きたい…',
        courseOptionsToggle: '🎛 こだわり設定',
        coursePurposeLabel: 'おでかけの目的',
        courseAreaLabel: 'エリア',
        courseOccasionLabel: '特別感',
        courseStyleLabel: 'スタイル',
        courseFoodLabel: '食の比重',
        courseTransportLabel: '移動スタイル',
        courseGenerateBtn: 'コースを作る ✨',
        courseLoadingMsg: 'コースを考えています…',
        courseSaveBtn: 'マイコースに保存',
        courseRegenerateBtn: '🔄 作り直す',
        coursePublishBtn: 'みんなに公開する',
        courseDetailAttraction: '📝 このコースの魅力',
        courseDetailRoute: '🗺️ コース',
        courseDetailAuthor: '作者:',
        affiliateInfoLink: 'チケット情報',
        prBadgeLabel: 'PR',
        courseAddToPlanBtn: '📅 予定表に追加',
        coursePublishAction: 'みんなに公開する',
        courseUnpublishAction: '🌐 公開中（非公開に）',
        courseEditTitleBtn: 'タイトルを変更する',
        courseDeleteBtn: '🗑️ このコースを削除する',
        courseEmpty: 'コースがありません',
        courseSpotsCount: '{n}スポット',
        titleEditLabel: 'タイトルを編集',
        titleEditCancel: 'キャンセル',
        titleEditSave: '保存',
        toastCourseSaved: 'マイコースに保存しました',
        toastCoursePublished2: 'みんなに公開しました',
        toastCourseTitleSaved: 'タイトルを変更しました',
        toastCourseDeleted: 'コースを削除しました',
        toastCoursePublished: 'コースを公開しました！',
        toastCoursePublishErr: '公開に失敗しました。',
        toastCourseUnpublish: '非公開にしました',
        toastCourseFailed: '失敗しました。もう一度お試しください。',
        toastCourseGenFailed: '生成に失敗しました。もう一度お試しください。',
        toastCourseAddPlan: '{n}件のスポットを予定に追加しました',
        labelNickname: 'ニックネーム',
        labelDarkMode: 'ダークモード',
        nicknamePlaceholder: '匿名',
        labelStartTime: '開始時刻',
        labelMembers: '参加メンバー',
        labelImportant: '⭐ 重要イベント',
        labelNotify: '🔔 メンバー通知',
        labelAllday: '終日',
        labelTitle: 'タイトル',
        scheduleDayCount: '{n}件',
        scheduleHolidayBadge: '🎌 連休',
        labelWhoWith: '一緒に行く人',
        labelWhoSolo: '🚶 ひとりで',
        labelWhoCouple: '💑 夫婦・カップル',
        labelWhoGroup: '👥 グループ',
        labelWhoFamily: '👨‍👩‍👧 ファミリー',
        labelChildAge: '子どもの年齢',
        labelAgeBaby: '👶 0〜2歳',
        labelAgePreschool: '🧒 3〜6歳',
        labelAgeSchool: '🎒 小学生以上',
        labelGenres: 'ジャンル・興味',
        genreStatusUnset: '未設定',
        genreStatusSet: '{n}件設定済み',
        genreHint: '好きなジャンルを選ぶと「⭐ おすすめ」で表示されます',
        labelVersion: 'バージョン',
        labelOfficialX: 'SNS',
        labelAboutApp: 'アプリについて',
        labelOfficialSite: '公式サイト',
        labelAboutSns: '公式サイト・SNS',
        supportBtn: '$5 を贈る',
        scheduleMakePlan: '予定を立てる',
        courseCreateBtn: '🗺 コース作成',
        secAccount: 'アカウント',
        loginWithGoogle: 'Googleでログイン',
        loginWithApple: 'Appleでサインイン',
        loginStatusGoogle: 'Google連携中',
        loginStatusApple: 'Apple連携中',
        logoutBtn: '連携解除',
        toastLoginSuccess: '連携しました',
        toastLoginError: '連携に失敗しました。もう一度お試しください',
        toastLogoutSuccess: '連携を解除しました',
        deleteAccountBtn: 'アカウントを削除',
        confirmDeleteAccount: 'アカウントを削除しますか？\nこの操作は取り消せません。予定表のバックアップデータもすべて削除されます。',
        toastDeleteAccountSuccess: 'アカウントを削除しました',
        toastDeleteAccountError: 'アカウントの削除に失敗しました。時間をおいて再度お試しください',
        // データバックアップ（端末移行用。設計書54 → 設計書58で全データ対応に拡張）
        backupLoginRequired: 'バックアップを利用するにはアカウント連携が必要です',
        backupDisabledDesc: 'パスフレーズを設定すると、予定表・マイコースなどのデータをサーバーに暗号化してバックアップできます。パスフレーズを知っている本人以外は内容を読めません。',
        backupEnabledDesc: 'バックアップは有効です。予定表・マイコースなどのデータの変更は自動的に暗号化して同期されます。',
        backupFoundExistingDesc: '別の端末で作成済みのバックアップが見つかりました。パスフレーズを入力して復元するか、新しくバックアップを作成できます。',
        backupExcludesCalendarNote: '※ 共有カレンダーへの参加状態は引き継がれません',
        backupEnable: 'バックアップを有効にする',
        backupDisable: 'バックアップを無効にする',
        backupChangePassphrase: 'パスフレーズを変更',
        backupSetupTitle: 'バックアップ用パスフレーズを設定',
        backupRestoreTitle: 'パスフレーズを入力',
        backupPassphraseWarning: '⚠️ パスフレーズを忘れるとバックアップは復元できません。安全な場所に控えてください。',
        backupPassphrasePlaceholder: 'パスフレーズ',
        backupPassphraseConfirmPlaceholder: 'パスフレーズ（確認）',
        backupPassphraseSubmit: '確定',
        backupPassphraseEmpty: 'パスフレーズを入力してください',
        backupPassphraseMismatch: 'パスフレーズが一致しません',
        confirmBackupDisable: 'バックアップを無効にしますか？サーバー上のデータはこの端末からは同期されなくなります。',
        toastBackupEnabled: '🔒 バックアップを有効にしました',
        toastBackupDisabled: 'バックアップを無効にしました',
        toastBackupRestored: '✅ バックアップから復元しました',
        toastBackupError: '⚠️ 処理に失敗しました。もう一度お試しください',
        toastBackupPassphraseWrong: 'パスフレーズが正しくありません',
        // 共有カレンダーのパスフレーズ方式（設計書55）
        calPassphraseSetupTitle: '共有用パスフレーズを設定',
        calPassphraseJoinTitle: 'パスフレーズを入力',
        calPassphraseWarning: '⚠️ パスフレーズを忘れると共有カレンダーは復元できません。参加者に別途お伝えください。',
        toastCalGroupCreateError: 'グループ作成に失敗しました',
        toastCalJoinError: '参加に失敗しました。グループIDをご確認ください。',
        toastCalPassphraseWrong: 'パスフレーズが正しくありません',
      },
      en: {
        headerSubtitle: 'Weekend guide for Japanese in Singapore', // city-specific: overridden by updateCityUI()
        labelCity: 'City',
        shareLabel: 'Share',
        tabsLabel: 'When?',
        tabWeekend: 'This Week',
        tabNextWeekend: 'Next Week',
        tabAfterWeekend: 'In 2 Weeks',
        tabThreeWeeks: 'In 3 Weeks',
        sectionTitle: 'Filter',
        tabAll: 'All dates',
        catAll: 'All',
        catRecommend: 'Recommended',
        addToPlanBtnShort: 'Add Plan',
        courseCreateBtnShort: 'Create Course',
        catEvent: 'Events',
        catShow: 'Shows & Exhibitions',
        catGourmet: 'Food & Fairs',
        catSale: 'Promos & Deals',
        catOpening: 'Grand Openings',
        catStarting: '📅 This Week',
        catEnding: '⏰ Ending Soon',
        labelWhen: 'When?',
        labelWhat: 'Where to go?',
        emptyTitle: 'Coming soon!',
        emptyDesc: 'No spots in this category yet.<br>Check back soon or try another tab.',
        pinScreenTitle: '📌 Pinned',
        calScreenTitle: '📅 Calendar',
        homeScreenTitle: 'Event Info',
        settingsTitle: 'Settings',
        secProfile: 'Profile',
        secAppSettings: 'App Settings',
        labelLang: 'Display Language',
        secData: 'Data',
        secSupport: 'Support & Info',
        clearPins: 'Clear all pins',
        resetBtn: 'Reset',
        secFeedback: 'Feedback',
        feedbackPlaceholder: 'Suggestions, bug reports, spot requests — anything welcome!',
        feedbackSend: '📨 Send',
        supportDesc: 'This app is free to use. If you enjoy it, buying us a coffee would mean a lot.',
        supportLabel: 'Support the app',
        supportBtn: 'Support the app (SGD 5)',
        secAbout: 'About',
        aboutAppName: 'App',
        aboutVersion: 'Version',
        navHome: 'Event',
        navPlan: 'Schedule',
        navSettings: 'Settings',
        pinBtn: 'Pin',
        pinnedBtn: 'Unpin ✓',
        shareBtn: '📤 Share',
        articleLink: 'Source article',
        tipsLabel: '🎒 Tips',
        hintLabel: '💡 Hint',
        tabWeekendBadge: 'This Wk',
        tabNextWeekendBadge: 'Next Wk',
        tabAfterWeekendBadge: '+2 Wks',
        tabThreeWeeksBadge: '+3 Wks',
        whoFamilyBadge: '👨‍👩‍👧‍👦 Family',
        whoCoupleBadge: '👫 Couple',
        whoSoloBadge: '🧑‍💼 Solo',
        whoGroupBadge: '👥 Group',
        ageBabyBadge: '🍼 0–2 yrs',
        agePreschoolBadge: '🚀 3–6 yrs',
        ageSchoolBadge: '📚 School age',
        confirmClearPins: 'Clear all pins?',
        confirmLogout: 'Disconnect your linked account?',
        toastPinned: '📌 Pinned!',
        toastUnpinned: '📌 Unpinned',
        toastFeedbackSent: '📨 Feedback sent!',
        toastFeedbackError: '⚠️ Failed to send. Please try again.',
        toastFeedbackNetError: '⚠️ Failed to send. Check your network.',
        toastFeedbackEmpty: '💬 Please enter a message',
        toastClearedPins: 'All pins cleared',
        toastUrlCopied: '🔗 URL copied!',
        loadingEvents: 'Loading events...',
        labelPush: 'Update Notifications',
        pushOn: 'ON',
        pushOff: 'OFF',
        pushDenied: 'Permission needed',
        pushUnsupported: 'Not supported',
        toastPushOn: '🔔 Push notifications enabled!',
        toastPushOff: '🔕 Push notifications disabled',
        toastPushDenied: '⚙️ Please allow notifications in Settings',
        toastPushError: '⚠️ Failed to configure notifications',
        countSuffix: '',
        pinEmpty: 'No pins yet',
        pinEmptyDesc: 'Tap 📌 on any card to pin it!',
        shareSettingsDesc: 'Share this app with your friends in Singapore!',
        shareSettingsBtn: 'Share with Friends',
        bannerToday: '⏰ Today only',
        bannerTomorrow: '⏰ Until tomorrow',
        bannerDaysLeft: '⏰ {d} days left',
        toastProfileSet: '✅ Set to: {label}',
        profileLabelAll: 'All (no preference)',
        planModalDateLabel: 'Select Date',
        planModalSlotLabel: 'Select Time',
        planModalDateLabelReq: 'Select Date <span style="color:var(--terracotta)">*</span>',
        planModalSlotLabelReq: 'Select Time <span style="color:var(--terracotta)">*</span>',
        planModalMemoLabel: 'Memo',
        planModalAddBtn: 'Add',
        planModalSaveBtn: 'Save',
        planModalCustomTitle: 'Add to schedule',
        planMemoPlaceholder: 'e.g. booked, bring umbrella, etc.',
        addToPlanBtn: '📅 Add to Plan',
        customPlanEmpty: 'Tap + to add activities, birthdays, or appointments.',
        pinnedEventsEmpty: 'Tap 📌 on events in the Explore tab to pin them here.',
        toastPlanAdded: '📅 Added to plan!',
        toastPlanDeleted: '🗑 Deleted',
        toastPlanUpdated: '✅ Saved',
        scheduleNoPlans: 'No plans',
        customPlanTitlePlaceholder: 'Enter title',
        navCourse: 'Conquer',
        courseScreenTitle: 'Stamp Rally',
        courseTabEveryone: 'Explore',
        courseTabMylist: 'My Courses',
        courseTabStampMap: 'Stamp Rally',
        stampMapLoginRequired: 'To save your stamp rally progress, please link your account from Settings.',
        stampLevelStandard: 'Standard',
        stampLevelLocal: 'Local',
        stampLevelNiche: 'Niche',
        stampLevelSpecial: 'Special',
        stampProgressSummary: '{unlocked} level(s) unlocked · {checked}/{total} spots collected',
        stampCheckedInBadge: '✓ Collected',
        stampCheckinBtn: 'Checking your location…',
        stampCheckinBtnReady: 'Check in',
        stampCheckinBtnTooFar: 'Get closer to check in',
        stampCheckinBtnNoLocation: 'Unable to get your location',
        stampCheckinBtnLocked: 'This spot is still locked',
        toastStampCheckinSuccess: '🎉 Stamp collected!',
        toastStampCheckinError: 'Check-in failed. Please try again.',
        toastStampLevelUnlocked: '🔓 A new level has been unlocked!',
        stampLocationPermDenied: 'Location access is not allowed. Please enable it in device settings.',
        stampViewToggleMap: '🗺️ Map view',
        stampViewToggleList: '📖 List view',
        stampCollectionLockedNote: 'This level is still locked',
        stampNextTargetLabel: 'Next up!',
        stampLevelUnlockModalTitle: 'New level unlocked!',
        stampLevelUnlockModalClose: 'Close',
        courseSheetTitle: 'Create Course',
        coursePinsLabel: 'Base pinned event',
        coursePinsHint: 'Tap to select',
        courseDepartLabel: 'Departure',
        courseReturnLabel: 'Return',
        courseTimeAny: 'Any',
        courseNoteLabel: 'Note',
        courseNoteOptional: '(optional)',
        courseNotePlaceholder: 'e.g. Special occasion, prefer hidden gems…',
        courseOptionsToggle: '🎛 More options',
        coursePurposeLabel: 'Purpose',
        courseAreaLabel: 'Area',
        courseOccasionLabel: 'Occasion',
        courseStyleLabel: 'Style',
        courseFoodLabel: 'Food focus',
        courseTransportLabel: 'Getting around',
        courseGenerateBtn: 'Create Course ✨',
        courseLoadingMsg: 'Planning your course…',
        courseSaveBtn: 'Save to My Courses',
        courseRegenerateBtn: '🔄 Try again',
        coursePublishBtn: 'Share with everyone',
        courseDetailAttraction: '📝 Highlights',
        courseDetailRoute: '🗺️ Route',
        courseDetailAuthor: 'By:',
        affiliateInfoLink: 'Ticket info',
        prBadgeLabel: 'PR',
        courseAddToPlanBtn: '📅 Add to Schedule',
        coursePublishAction: 'Share with everyone',
        courseUnpublishAction: 'Published ✓ &nbsp;(Make private)',
        courseEditTitleBtn: 'Edit title',
        courseDeleteBtn: '🗑️ Delete course',
        courseEmpty: 'No courses yet',
        courseSpotsCount: '{n} spots',
        titleEditLabel: 'Edit title',
        titleEditCancel: 'Cancel',
        titleEditSave: 'Save',
        toastCourseSaved: 'Saved to My Courses',
        toastCoursePublished2: 'Published!',
        toastCourseTitleSaved: 'Title updated',
        toastCourseDeleted: 'Course deleted',
        toastCoursePublished: 'Course published!',
        toastCoursePublishErr: 'Failed to publish.',
        toastCourseUnpublish: 'Made private',
        toastCourseFailed: 'Failed. Please try again.',
        toastCourseGenFailed: 'Generation failed. Please try again.',
        toastCourseAddPlan: 'Added {n} spots to schedule',
        labelNickname: 'Nickname',
        labelDarkMode: 'Dark Mode',
        nicknamePlaceholder: 'Anonymous',
        labelStartTime: 'Start time',
        labelMembers: 'Members',
        labelImportant: '⭐ Important',
        labelNotify: '🔔 Notify members',
        labelAllday: 'All day',
        labelTitle: 'Title',
        scheduleDayCount: '{n}',
        scheduleHolidayBadge: '🎌 Long Weekend',
        labelWhoWith: 'Who to go with',
        labelWhoSolo: '🚶 Solo',
        labelWhoCouple: '💑 Couple',
        labelWhoGroup: '👥 Group',
        labelWhoFamily: '👨‍👩‍👧 Family',
        labelChildAge: "Kids' age",
        labelAgeBaby: '👶 0–2 yrs',
        labelAgePreschool: '🧒 3–6 yrs',
        labelAgeSchool: '🎒 School age+',
        labelGenres: 'Genres & Interests',
        genreStatusUnset: 'Not set',
        genreStatusSet: '{n} selected',
        genreHint: 'Select genres to enable ⭐ Recommended',
        labelVersion: 'Version',
        labelOfficialX: 'SNS',
        labelAboutApp: 'About',
        labelOfficialSite: 'Official Site',
        labelAboutSns: 'Official Site & SNS',
        supportBtn: 'Gift $5',
        scheduleMakePlan: 'Plan a trip',
        courseCreateBtn: '🗺 Course',
        secAccount: 'Account',
        loginWithGoogle: 'Sign in with Google',
        loginWithApple: 'Sign in with Apple',
        loginStatusGoogle: 'Linked with Google',
        loginStatusApple: 'Linked with Apple',
        logoutBtn: 'Unlink',
        toastLoginSuccess: 'Account linked',
        toastLoginError: 'Linking failed. Please try again',
        toastLogoutSuccess: 'Account unlinked',
        deleteAccountBtn: 'Delete account',
        confirmDeleteAccount: 'Delete your account?\nThis action cannot be undone. Your backed-up schedule data will also be permanently deleted.',
        toastDeleteAccountSuccess: 'Account deleted',
        toastDeleteAccountError: 'Failed to delete account. Please try again later',
        // Data backup for device migration (design doc 54 -> expanded to all data in design doc 58)
        backupLoginRequired: 'Please link your account to use backup',
        backupDisabledDesc: 'Set a passphrase to back up your plans, my courses, and other data to the server, encrypted so only you can read them.',
        backupEnabledDesc: 'Backup is enabled. Changes to your plans, my courses, and other data are automatically encrypted and synced.',
        backupFoundExistingDesc: 'An existing backup from another device was found. Enter your passphrase to restore it, or create a new backup.',
        backupExcludesCalendarNote: '* Shared calendar memberships are not included in this backup',
        backupEnable: 'Enable Backup',
        backupDisable: 'Disable Backup',
        backupChangePassphrase: 'Change Passphrase',
        backupSetupTitle: 'Set a Backup Passphrase',
        backupRestoreTitle: 'Enter Passphrase',
        backupPassphraseWarning: '⚠️ If you forget your passphrase, the backup cannot be recovered. Please keep it somewhere safe.',
        backupPassphrasePlaceholder: 'Passphrase',
        backupPassphraseConfirmPlaceholder: 'Confirm Passphrase',
        backupPassphraseSubmit: 'Confirm',
        backupPassphraseEmpty: 'Please enter a passphrase',
        backupPassphraseMismatch: 'Passphrases do not match',
        confirmBackupDisable: 'Disable backup? This device will stop syncing with the server.',
        toastBackupEnabled: '🔒 Backup enabled',
        toastBackupDisabled: 'Backup disabled',
        toastBackupRestored: '✅ Restored from backup',
        toastBackupError: '⚠️ Something went wrong. Please try again',
        toastBackupPassphraseWrong: 'Incorrect passphrase',
        // Shared calendar passphrase mode (design doc 55)
        calPassphraseSetupTitle: 'Set a Sharing Passphrase',
        calPassphraseJoinTitle: 'Enter Passphrase',
        calPassphraseWarning: '⚠️ If the passphrase is forgotten, the shared calendar cannot be recovered. Please share it with participants separately.',
        toastCalGroupCreateError: 'Failed to create group',
        toastCalJoinError: 'Failed to join. Please check the group ID.',
        toastCalPassphraseWrong: 'Incorrect passphrase',
      }
    };

    function getLang() { return localStorage.getItem('sg_lang') || 'ja'; }
    function t(key) { const s = STRINGS[getLang()]; return (s && s[key] !== undefined) ? s[key] : (STRINGS.ja[key] || key); }

    // ─── DARK MODE ───
    function getDarkMode() { return localStorage.getItem('sg_theme') || 'auto'; }
    function applyTheme() {
      const mode = getDarkMode();
      const html = document.documentElement;
      if (mode === 'dark') {
        html.setAttribute('data-theme', 'dark');
      } else if (mode === 'light') {
        html.removeAttribute('data-theme');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) html.setAttribute('data-theme', 'dark');
        else html.removeAttribute('data-theme');
      }
      updateDarkModeUI();
    }
    function updateDarkModeUI() {
      const el = document.getElementById('dark-mode-label');
      if (!el) return;
      const mode = getDarkMode();
      const isJa = getLang() === 'ja';
      const labels = isJa ? { auto: '自動', dark: 'ダーク', light: 'オフ' } : { auto: 'Auto', dark: 'Dark', light: 'Off' };
      el.textContent = labels[mode] || labels.auto;
    }
    function toggleDarkMode() {
      const cycle = { auto: 'dark', dark: 'light', light: 'auto' };
      const next = cycle[getDarkMode()] || 'dark';
      localStorage.setItem('sg_theme', next);
      applyTheme();
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (getDarkMode() === 'auto') applyTheme();
    });

    // ─── CITY ───
    const CITY_META = {
      sg: { code: 'SG', flag: '🇸🇬', nameJa: 'シンガポール', nameEn: 'Singapore', subtitleJa: 'シンガポール在住者の週末おでかけガイド', subtitleEn: 'Weekend guide for Japanese in Singapore' },
      bkk: { code: 'BKK', flag: '🇹🇭', nameJa: 'バンコク',         nameEn: 'Bangkok',       subtitleJa: 'バンコク在住者の週末おでかけガイド',         subtitleEn: 'Weekend guide for Japanese in Bangkok' },
      syd: { code: 'SYD', flag: '🇦🇺', nameJa: 'シドニー',         nameEn: 'Sydney',        subtitleJa: 'シドニー在住者の週末おでかけガイド',         subtitleEn: 'Weekend guide for Japanese in Sydney' },
    };

    const CITY_COURSE_AREAS = {
      sg: [
        { val: 'Central',     label: '🏙 Central' },
        { val: 'East',        label: '🌅 East' },
        { val: 'West',        label: '🌇 West' },
        { val: 'North',       label: '🌿 North' },
        { val: 'North-East',  label: '🌳 North-East' },
        { val: 'Island-wide', label: '🗺️ Island-wide' },
        { val: 'Sentosa',     label: '🏖 Sentosa' },
      ],
      bkk: [
        { val: 'Sukhumvit',   label: '🌆 Sukhumvit' },
        { val: 'Silom',       label: '🏢 Silom' },
        { val: 'Siam',        label: '🛍️ Siam' },
        { val: 'Riverside',   label: '🌊 Riverside' },
        { val: 'Old Town',    label: '🛕 Old Town' },
        { val: 'City-wide',   label: '🗺️ City-wide' },
      ],
      syd: [
        { val: 'CBD',              label: '🏙 CBD' },
        { val: 'Inner West',       label: '🌿 Inner West' },
        { val: 'Eastern Suburbs',  label: '🌅 Eastern Suburbs' },
        { val: 'North Shore',      label: '🌉 North Shore' },
        { val: 'Western Sydney',   label: '🏘️ Western Sydney' },
        { val: 'City-wide',        label: '🗺️ City-wide' },
      ],
    };

    // BKK/SYD 一時停止中。復活時は ACTIVE_CITIES に 'bkk', 'syd' を追加
    const ACTIVE_CITIES = ['sg'];

    function buildCitySelect() {
      const sel = document.getElementById('city-select');
      if (!sel) return;
      const city = getCity();
      sel.innerHTML = ACTIVE_CITIES.map(key => {
        const m = CITY_META[key];
        return `<option value="${key}">${m.flag} ${m.code}</option>`;
      }).join('');
      sel.value = ACTIVE_CITIES.includes(city) ? city : ACTIVE_CITIES[0];
    }

    function escapeHtml(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getCity() {
      const c = localStorage.getItem('app_city') || 'sg';
      return ACTIVE_CITIES.includes(c) ? c : ACTIVE_CITIES[0];
    }

    function selectCity(city) {
      if (!CITY_META[city]) return;
      localStorage.setItem('app_city', city);
      updateCityUI();
      updateTabLabels();
      renderScheduleTab();
      const meta = CITY_META[city];
      showToast(`${meta.flag} ${getLang() === 'en' ? meta.nameEn : meta.nameJa}に切り替えました`);
    }

    function updateCityUI() {
      const city = getCity();
      const meta = CITY_META[city] || CITY_META.sg;
      const lang = getLang();

      buildCitySelect();

      const shareDescEl = document.getElementById('share-settings-desc');
      if (shareDescEl) {
        const descJa = { sg: 'シンガポール在住の友達にこのアプリを紹介しよう！', bkk: 'バンコク在住の友達にこのアプリを紹介しよう！', syd: 'シドニー在住の友達にこのアプリを紹介しよう！' };
        const descEn = { sg: 'Share this app with your friends in Singapore!', bkk: 'Share this app with your friends in Bangkok!', syd: 'Share this app with your friends in Sydney!' };
        shareDescEl.textContent = lang === 'en' ? (descEn[city] || descEn.sg) : (descJa[city] || descJa.sg);
      }
    }

    function applyI18n() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const v = t(el.dataset.i18n);
        if (typeof v === 'string' && v.includes('<')) el.innerHTML = v;
        else if (typeof v === 'string') el.textContent = v;
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPh);
      });
      const isEn = getLang() === 'en';
      const langFlag = document.getElementById('lang-toggle-flag');
      const langName = document.getElementById('lang-toggle-name');
      if (langFlag) langFlag.textContent = isEn ? '🇬🇧' : '🇯🇵';
      if (langName) langName.textContent = isEn ? 'English' : '日本語';
      buildCitySelect();
      updateTabLabels();
      _syncRecommendChip();
      updateDarkModeUI();
      if (typeof initSettingsProfile === 'function') initSettingsProfile();
      if (typeof initSettingsGenres === 'function') initSettingsGenres();
    }

    function setLang(lang) {
      localStorage.setItem('sg_lang', lang);
      applyI18n();
      updateCityUI();
      updateDarkModeUI();
      renderEventCards();
      renderScheduleTab();
      showToast(lang === 'en' ? '🇬🇧 Switched to English' : '🇯🇵 日本語に切り替えました');
    }

    // ─── HOLIDAY / LONG VACATION CONFIG ───
    const LONG_VACATIONS_BY_CITY = {
      sg: [
        { name: '春休み',            start: new Date(2026, 2, 13), end: new Date(2026, 3, 11) },
        { name: 'ゴールデンウィーク', start: new Date(2026, 3, 29), end: new Date(2026, 4, 5)  },
        { name: '夏休み',            start: new Date(2026, 7, 1),  end: new Date(2026, 7, 31) },
        { name: '冬休み',            start: new Date(2026, 11, 24), end: new Date(2027, 0, 6) },
      ],
      bkk: [
        { name: '春休み',            start: new Date(2026, 2, 20), end: new Date(2026, 3, 6)  },
        { name: 'ゴールデンウィーク', start: new Date(2026, 3, 29), end: new Date(2026, 4, 5)  },
        { name: '夏休み',            start: new Date(2026, 7, 1),  end: new Date(2026, 7, 31) },
        { name: '冬休み',            start: new Date(2026, 11, 25), end: new Date(2027, 0, 6) },
      ],
      syd: [
        { name: '秋休み', start: new Date(2026, 3, 10),  end: new Date(2026, 3, 26)  },
        { name: '冬休み', start: new Date(2026, 6, 4),   end: new Date(2026, 6, 20)  },
        { name: '春休み', start: new Date(2026, 8, 26),  end: new Date(2026, 9, 11)  },
        { name: '夏休み', start: new Date(2026, 11, 19), end: new Date(2027, 0, 28)  },
      ],
    };
    function getLongVacations() { return LONG_VACATIONS_BY_CITY[getCity()] || LONG_VACATIONS_BY_CITY.sg; }
    // 後方互換
    const LONG_VACATIONS = LONG_VACATIONS_BY_CITY.sg;

    // 都市別祝日
    const CITY_HOLIDAYS = {
      sg: [
        new Date(2026, 0, 1),   // 元日
        new Date(2026, 1, 17),  // 旧正月1日
        new Date(2026, 1, 18),  // 旧正月2日
        new Date(2026, 2, 21),  // ハリラヤ・プアサ
        new Date(2026, 3, 3),   // 聖金曜日
        new Date(2026, 4, 1),   // 労働者の日
        new Date(2026, 4, 27),  // ハリラヤ・ハジ
        new Date(2026, 4, 31),  // ウェサク（日曜）
        new Date(2026, 5, 1),   // ウェサク振替休日
        new Date(2026, 7, 9),   // 建国記念日（日曜）
        new Date(2026, 7, 10),  // 建国記念日振替休日
        new Date(2026, 10, 8),  // ディパバリ（日曜）
        new Date(2026, 10, 9),  // ディパバリ振替休日
        new Date(2026, 11, 25), // クリスマス
      ],
      bkk: [
        new Date(2026, 0, 1),   // 元日
        new Date(2026, 2, 3),   // 万仏節（マカブーチャー）
        new Date(2026, 3, 6),   // チャクリー記念日
        new Date(2026, 3, 13),  // ソンクラーン1日目
        new Date(2026, 3, 14),  // ソンクラーン2日目
        new Date(2026, 3, 15),  // ソンクラーン3日目
        new Date(2026, 4, 1),   // 労働者の日
        new Date(2026, 4, 4),   // 戴冠記念日
        new Date(2026, 4, 31),  // ウィサーカブーチャー（日曜）
        new Date(2026, 5, 1),   // ウィサーカブーチャー振替休日
        new Date(2026, 5, 3),   // スティダー王妃誕生日
        new Date(2026, 6, 28),  // ワチラロンコン国王誕生日
        new Date(2026, 6, 29),  // アサラハブーチャー
        new Date(2026, 7, 12),  // 母の日（王母誕生日）
        new Date(2026, 9, 13),  // ラーマ9世崩御記念日
        new Date(2026, 9, 23),  // チュラロンコン記念日
        new Date(2026, 11, 5),  // 父の日（ラーマ9世誕生日・土曜）
        new Date(2026, 11, 7),  // 父の日振替休日
        new Date(2026, 11, 10), // 憲法記念日
        new Date(2026, 11, 31), // 大晦日
      ],
      syd: [
        new Date(2026, 0, 1),   // 元日
        new Date(2026, 0, 26),  // オーストラリアデー（月曜）
        new Date(2026, 3, 3),   // 聖金曜日
        new Date(2026, 3, 4),   // イースターサタデー
        new Date(2026, 3, 5),   // イースターサンデー
        new Date(2026, 3, 6),   // イースターマンデー
        new Date(2026, 3, 25),  // ANZACデー（土曜）
        new Date(2026, 3, 27),  // ANZACデー振替休日
        new Date(2026, 5, 8),   // 国王誕生日（NSW）
        new Date(2026, 7, 3),   // 銀行休業日（NSW）
        new Date(2026, 9, 5),   // 労働者の日（NSW）
        new Date(2026, 11, 25), // クリスマス
        new Date(2026, 11, 26), // ボクシングデー（土曜）
        new Date(2026, 11, 28), // ボクシングデー振替休日
      ],
    };
    function getCityHolidays() { return CITY_HOLIDAYS[getCity()] || CITY_HOLIDAYS.sg; }

    const CITY_HOLIDAY_NAMES = {
      sg: {
        '2026-01-01': { ja: '元日',               en: "New Year's Day" },
        '2026-02-17': { ja: '旧正月1日',           en: 'CNY Day 1' },
        '2026-02-18': { ja: '旧正月2日',           en: 'CNY Day 2' },
        '2026-03-21': { ja: 'ハリラヤ・プアサ',    en: 'Hari Raya Puasa' },
        '2026-04-03': { ja: '聖金曜日',            en: 'Good Friday' },
        '2026-05-01': { ja: '労働者の日',          en: 'Labour Day' },
        '2026-05-27': { ja: 'ハリラヤ・ハジ',      en: 'Hari Raya Haji' },
        '2026-05-31': { ja: 'ウェサク',            en: 'Vesak Day' },
        '2026-06-01': { ja: 'ウェサク振替',        en: 'Vesak (in lieu)' },
        '2026-08-09': { ja: '建国記念日',          en: 'National Day' },
        '2026-08-10': { ja: '建国記念日振替',      en: 'National Day (in lieu)' },
        '2026-11-08': { ja: 'ディパバリ',          en: 'Deepavali' },
        '2026-11-09': { ja: 'ディパバリ振替',      en: 'Deepavali (in lieu)' },
        '2026-12-25': { ja: 'クリスマス',          en: 'Christmas' },
      },
      bkk: {
        '2026-01-01': { ja: '元日',                   en: "New Year's Day" },
        '2026-03-03': { ja: '万仏節',                 en: 'Makha Bucha' },
        '2026-04-06': { ja: 'チャクリー記念日',       en: 'Chakri Day' },
        '2026-04-13': { ja: 'ソンクラーン',           en: 'Songkran' },
        '2026-04-14': { ja: 'ソンクラーン',           en: 'Songkran' },
        '2026-04-15': { ja: 'ソンクラーン',           en: 'Songkran' },
        '2026-05-01': { ja: '労働者の日',             en: 'Labour Day' },
        '2026-05-04': { ja: '戴冠記念日',             en: 'Coronation Day' },
        '2026-05-31': { ja: 'ウィサーカブーチャー',   en: 'Visakha Bucha' },
        '2026-06-01': { ja: 'ウィサーカブーチャー振替', en: 'Visakha Bucha (in lieu)' },
        '2026-06-03': { ja: '王妃誕生日',             en: "Queen's Birthday" },
        '2026-07-28': { ja: '国王誕生日',             en: "King's Birthday" },
        '2026-07-29': { ja: 'アサラハブーチャー',     en: 'Asalha Bucha' },
        '2026-08-12': { ja: '母の日',                 en: "Mother's Day" },
        '2026-10-13': { ja: 'ラーマ9世崩御記念日',   en: 'Passing of Rama IX' },
        '2026-10-23': { ja: 'チュラロンコン記念日',   en: 'Chulalongkorn Day' },
        '2026-12-05': { ja: '父の日',                 en: "Father's Day" },
        '2026-12-07': { ja: '父の日振替',             en: "Father's Day (in lieu)" },
        '2026-12-10': { ja: '憲法記念日',             en: 'Constitution Day' },
        '2026-12-31': { ja: '大晦日',                 en: "New Year's Eve" },
      },
      syd: {
        '2026-01-01': { ja: '元日',                   en: "New Year's Day" },
        '2026-01-26': { ja: 'オーストラリアデー',     en: 'Australia Day' },
        '2026-04-03': { ja: '聖金曜日',               en: 'Good Friday' },
        '2026-04-04': { ja: 'イースター土曜',         en: 'Easter Saturday' },
        '2026-04-05': { ja: 'イースター日曜',         en: 'Easter Sunday' },
        '2026-04-06': { ja: 'イースターマンデー',     en: 'Easter Monday' },
        '2026-04-25': { ja: 'ANZACデー',              en: 'ANZAC Day' },
        '2026-04-27': { ja: 'ANZACデー振替',          en: 'ANZAC Day (in lieu)' },
        '2026-06-08': { ja: '国王誕生日',             en: "King's Birthday" },
        '2026-08-03': { ja: '銀行休業日',             en: 'Bank Holiday' },
        '2026-10-05': { ja: '労働者の日',             en: 'Labour Day' },
        '2026-12-25': { ja: 'クリスマス',             en: 'Christmas' },
        '2026-12-26': { ja: 'ボクシングデー',         en: 'Boxing Day' },
        '2026-12-28': { ja: 'ボクシングデー振替',     en: 'Boxing Day (in lieu)' },
      },
    };
    function getCityHolidayName(d) {
      const names = CITY_HOLIDAY_NAMES[getCity()] || {};
      const entry = names[fmtDateKey(d)];
      if (!entry) return null;
      return getLang() === 'en' ? entry.en : entry.ja;
    }

    // ─── NEXT LONG HOLIDAY CALCULATION ───

    function sameDay(a, b) {
      return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
    }

    // ─── UPDATE TAB LABELS (タブ廃止のため空関数として残す) ───
    function updateTabLabels() { /* tabs-section removed */ }
    // ─── EVENT LIST STATE ───
    const emptyState = document.getElementById('empty-state');
    const resultCount = document.getElementById('result-count');

    let EVENT_DATA = [];
    let EVENT_REGISTRY = {};
    let SPONSORED_CARDS = []; // PRカード（スポンサー広告枠）一覧（設計書29）
    let eventSortOrder = 'desc'; // desc = 新しい開始日が上
    let calSortOrder = 'desc';

    // ─── フィルター変数 ───
    let filterCats    = new Set();
    let filterWeek    = '';
    let filterWho     = new Set();
    let filterAreas   = new Set();
    let filterKeyword = '';
    let filterEnding  = false;
    let filterNew     = false;
    let _recommendModeActive = false;
    let _draftFilterWeek    = '';
    let _draftFilterWho     = new Set();
    let _draftFilterAreas   = new Set();
    let _draftFilterKeyword = '';

    // ─── おでかけデータ読み込み ───
    async function loadEventData() {
      const grid = document.getElementById('cards-grid');
      // データを丸ごと入れ替えるため、カードDOMキャッシュも破棄する（設計書21: キャッシュ無効化条件）
      // これから grid.innerHTML を再代入して既存カードを破棄するので、キャッシュ内の参照も併せて捨てる
      _cardElCache.clear();
      // Klookウィジェット（設計書31）もこの再代入で破棄されるため、フラグ・保持していたDOM要素参照をリセットする
      _klookWidgetInserted = false;
      _klookWidgetEl = null;
      grid.innerHTML = `<div id="_events-loading-placeholder" style="text-align:center;padding:40px 20px;color:var(--warm-gray);">
        <div style="font-size:28px;margin-bottom:8px;">⏳</div>
        <div style="font-size:15px;">${t('loadingEvents')}</div>
      </div>`;
      try {
        const res = await fetch(API_BASE + `/api/events?city=${getCity()}`);
        EVENT_DATA = res.ok ? await res.json() : [];
      } catch(e) {
        EVENT_DATA = [];
      }
      try {
        const spRes = await fetch(API_BASE + `/api/sponsored-cards?city=${getCity()}`);
        SPONSORED_CARDS = spRes.ok ? await spRes.json() : [];
      } catch (e) {
        SPONSORED_CARDS = [];
      }
      EVENT_DATA.forEach(e => { EVENT_REGISTRY[e.id] = e; });
      if (EVENT_DATA.length > 0) {
        const pins = getPins();
        const cleaned = Object.fromEntries(Object.entries(pins).filter(([id]) => EVENT_REGISTRY[id]));
        if (Object.keys(cleaned).length < Object.keys(pins).length) {
          savePins(cleaned);
        }
      }
      renderEventCards();
      renderPinnedEventsList();
    }

    const BG_CLASSES = ['kite','jewel','science','gardens','sentosa','safari','aquarium','haji','eastcoast','botanical','cafe','ramen','park'];
    function getBgClass(id) {
      if (!id) return 'cafe';
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
      return BG_CLASSES[Math.abs(h) % BG_CLASSES.length];
    }

    function getInstagramShortcode(url) {
      const m = (url || '').match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    }

    function loadInstagramEmbeds() {
      if (window.instgrm?.Embeds?.process) {
        window.instgrm.Embeds.process();
      } else {
        // embed.js がまだ読み込み中なら 2.5 秒後にリトライ
        setTimeout(() => window.instgrm?.Embeds?.process?.(), 2500);
      }
    }

    function renderEventCard(e, i) {
      const pins = getPins();
      const pinned = !!pins[e.id];

      // 言語対応コンテンツ
      const lang = getLang();
      const displayContent = (lang === 'en' && e.content_en) ? e.content_en : (e.content || '');
      const rawTips = (lang === 'en' && Array.isArray(e.tips_en) && e.tips_en.length) ? e.tips_en : e.tips;

      // タブラベル
      const tabLabels = {
        weekend:      { label: t('tabWeekendBadge'),      style: 'background:rgba(200,128,74,0.9);color:white;' },
        nextweekend:  { label: t('tabNextWeekendBadge'),  style: 'background:rgba(110,158,136,0.9);color:white;' },
        afterweekend: { label: t('tabAfterWeekendBadge'),  style: 'background:rgba(122,173,204,0.9);color:white;' },
        threeweeks:   { label: t('tabThreeWeeksBadge'),   style: 'background:rgba(150,130,200,0.9);color:white;' },
      };
      const tabInfo = tabLabels[e.tab] || { label: e.tab || '', style: '' };

      // 星（major_score）
      const stars = Array.from({length: 5}, (_, idx) =>
        `<span class="star${idx < (e.major_score || 3) ? ' filled' : ''}">★</span>`
      ).join('');

      // tipsリスト（初期非表示、トグル展開）
      const tipsInner = Array.isArray(rawTips) && rawTips.length
        ? `<ul class="tips-list">${rawTips.map(tip => `<li>${tip}</li>`).join('')}</ul>`
        : e.tip ? `<ul class="tips-list"><li>${e.tip}</li></ul>` : '';
      const tipsBtn = tipsInner
        ? `<button class="tips-toggle-btn" onclick="toggleCardTips('${e.id}')" id="tips-btn-${e.id}">${t('tipsLabel')}<span class="tips-arrow">▽</span></button>`
        : '';
      const tipsContent = tipsInner
        ? `<div class="tips-box tips-box--collapsible" id="tips-${e.id}" style="display:none;">${tipsInner}</div>`
        : '';
      const tipsList = tipsBtn;

      // プロフィールバッジ
      const whoLabels = { family: t('whoFamilyBadge'), couple: t('whoCoupleBadge'), solo: t('whoSoloBadge'), group: t('whoGroupBadge') };
      const ageLabels = { baby: t('ageBabyBadge'), preschool: t('agePreschoolBadge'), school: t('ageSchoolBadge') };
      const styleLabels = { beginner: '✈️ 移住したて', resident: '🏠 定住', local: '🦁 地元民' };
      const whoBadgeHtml = (Array.isArray(e.who) ? e.who : [])
        .map(w => whoLabels[w]).filter(Boolean)
        .map(l => `<span class="profile-badge who-badge">${l}</span>`).join('');
      const ageBadgeHtml = (Array.isArray(e.age) ? e.age : []).filter(a => a !== 'all')
        .map(a => ageLabels[a]).filter(Boolean)
        .map(l => `<span class="profile-badge age-badge">${l}</span>`).join('');
      const styleBadgeHtml = (Array.isArray(e.style) ? e.style : [])
        .map(s => styleLabels[s]).filter(Boolean)
        .map(l => `<span class="profile-badge style-badge">${l}</span>`).join('');
      const profileBadges = (whoBadgeHtml || ageBadgeHtml || styleBadgeHtml)
        ? `<div class="profile-badges-row">${whoBadgeHtml}${ageBadgeHtml}${styleBadgeHtml}</div>`
        : '';

      const bgClass = e.bgClass || getBgClass(e.id || e.store || '');
      const safeTitle = (e.store || e.title || '').replace(/'/g, "\\'");
      const safeLocation = (e.location || '').replace(/'/g, "\\'");
      const safePeriod = (e.period || e.hours || '').replace(/'/g, "\\'");
      const safeEmoji = (e.emoji || '📍').replace(/'/g, "\\'");
      const safeTip = (Array.isArray(e.tips) && e.tips.length ? e.tips[0] : (e.tip || '')).replace(/'/g, "\\'");
      const safeUrl = (e.url || '').replace(/'/g, "\\'");;
      const eAgeAttr = Array.isArray(e.age) ? e.age.join(',') : (e.age || 'all');

      // 新着リボン（3日以内に登録）
      const newRibbon = (() => {
        if (!e.fetched_at) return '';
        const fetched = new Date(e.fetched_at + 'T00:00:00');
        const now = new Date(); now.setHours(0,0,0,0);
        const days = Math.round((now - fetched) / 86400000);
        const isEn = getLang() === 'en';
        if (days <= 3) return `<div class="card-new-ribbon card-new-ribbon--today">New</div>`;
        return '';
      })();
      const hasRibbon = newRibbon !== '';

      // 今週まで／今週から判定（7日以内）
      const _today = new Date(); _today.setHours(0,0,0,0);
      const _weekEnd = new Date(_today); _weekEnd.setDate(_today.getDate() + 7);
      const _endDate   = e.end_date   ? new Date(e.end_date   + 'T00:00:00') : null;
      const _startDate = e.start_date ? new Date(e.start_date + 'T00:00:00') : null;
      const isEndingSoon = !!(_endDate && _endDate >= _today && _endDate <= _weekEnd);
      let bannerLabel = '';
      if (isEndingSoon && e.type !== 'opening') {
        const d = Math.round((_endDate - _today) / 86400000);
        if (d === 0)      bannerLabel = t('bannerToday');
        else if (d === 1) bannerLabel = t('bannerTomorrow');
        else              bannerLabel = t('bannerDaysLeft').replace('{d}', d);
      }

      const igSc = getInstagramShortcode(e.url);
      const metaInImage = (e.location || e.period || e.hours)
        ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;opacity:0.92;">
            ${e.location ? `<span style="font-size:14px;color:rgba(255,255,255,0.95);text-shadow:0 1px 3px rgba(0,0,0,.4);">📍 ${e.location}</span>` : ''}
            ${(e.period || e.hours) ? `<span style="font-size:14px;color:rgba(255,255,255,0.95);text-shadow:0 1px 3px rgba(0,0,0,.4);">📅 ${e.period || e.hours}</span>` : ''}
          </div>` : '';
      const heroOverlayContent = `
        <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.78) 100%);pointer-events:none;"></div>
        <div style="position:absolute;bottom:0;left:0;right:0;padding:10px 14px 13px;">
          ${bannerLabel ? `<div style="display:inline-block;font-size:11px;font-weight:700;color:white;background:var(--terracotta);border-radius:4px;padding:2px 7px;margin-bottom:5px;">${bannerLabel}</div>` : ''}
          <h2 style="font-family:'Kaisei Opti',serif;font-size:18px;font-weight:700;color:white;margin:0;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.45);">${e.store || e.title || ''}</h2>
          ${metaInImage}
        </div>
        ${newRibbon}`;

      return `
        <article class="spot-card${isEndingSoon ? ' ending-soon' : ''}" data-tab="${e.tab || 'weekend'}" data-age="${eAgeAttr}"
                 data-id="${e.id}">
          ${igSc ? (() => {
            const igEmbedUrl = (e.url || '').replace(/\/$/, '') + '/?utm_source=ig_embed';
            const igMetaHtml = `
              <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.78) 100%);pointer-events:none;z-index:2;"></div>
              <div style="position:absolute;bottom:0;left:0;right:0;padding:10px 14px 13px;pointer-events:none;z-index:3;">
                ${bannerLabel ? `<div style="display:inline-block;font-size:11px;font-weight:700;color:white;background:var(--terracotta);border-radius:4px;padding:2px 7px;margin-bottom:5px;">${bannerLabel}</div>` : ''}
                <h2 style="font-family:'Kaisei Opti',serif;font-size:18px;font-weight:700;color:white;margin:0;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.45);${hasRibbon ? 'padding-right:44px;' : ''}">${e.store || e.title || ''}</h2>
                ${(e.location || e.period || e.hours) ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;opacity:0.92;">
                  ${e.location ? `<span style="font-size:14px;color:rgba(255,255,255,0.95);text-shadow:0 1px 3px rgba(0,0,0,.4);">📍 ${e.location}</span>` : ''}
                  ${(e.period || e.hours) ? `<span style="font-size:14px;color:rgba(255,255,255,0.95);text-shadow:0 1px 3px rgba(0,0,0,.4);">📅 ${e.period || e.hours}</span>` : ''}
                </div>` : ''}
              </div>`;
            return `${newRibbon}<div class="card-body">
              <div style="position:relative;margin:-18px -18px 12px;">
                <div class="ig-embed-wrap">
                  <blockquote class="instagram-media"
                    data-instgrm-permalink="${igEmbedUrl}"
                    data-instgrm-version="14"
                    style="margin:0;max-width:100%;min-width:unset;width:100%;border-radius:0;">
                  </blockquote>
                </div>
                ${igMetaHtml}
              </div>`;
          })() : (() => {
            const imgHtml = (e.image && !e.image.includes('cdninstagram.com') && !/\.(mp4|mov|webm)(\?|$)/i.test(e.image))
              ? `<img src="${e.image}" alt="${(e.store || '').replace(/"/g,'&quot;')}"
                      style="width:100%;height:220px;object-fit:cover;display:block;"
                      onerror="handleImgError(this,'${bgClass}','${safeEmoji}')" />`
              : `<div class="card-image-bg ${bgClass}" style="height:220px;">${e.emoji || '📍'}</div>`;
            return `<div class="card-hero" style="position:relative;overflow:hidden;">
              ${imgHtml}
              ${heroOverlayContent}
            </div>
            <div class="card-body" style="padding-top:12px;">`;
          })()}
            ${displayContent ? `<p style="font-size:15px;color:var(--warm-gray);line-height:1.65;margin-bottom:10px;">${displayContent}</p>` : ''}
            <div class="card-sub-row">
              ${tipsList}
              ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener" class="card-detail-link">🔗 ${t('articleLink')}</a>` : ''}
            </div>
            ${tipsContent}
            <div class="card-action-row">
              <button class="card-action-btn${pinned ? ' pinned' : ''}" id="pin-${e.id}" onclick="togglePinById('${e.id}')">
                <span class="card-action-icon">📌</span>
                <span id="pin-label-${e.id}">${pinned ? t('pinnedBtn') : t('pinBtn')}</span>
              </button>
              <button class="card-action-btn" onclick="openEventPlanModal('${e.id}')">
                <span class="card-action-icon">📅</span>
                <span>${t('addToPlanBtnShort')}</span>
              </button>
              <button class="card-action-btn" onclick="openCourseSheetFromEvent('${e.id}')">
                <span class="card-action-icon">🗺</span>
                <span>${t('courseCreateBtnShort')}</span>
              </button>
            </div>
          </div>
        </article>`;
    }

    // ─── PRカード（スポンサー広告枠、設計書29） ───

    // PRカードを開く（Klookアフィリエイトリンクの openAffiliateLink() と同じ分岐パターン）
    function openSponsoredCardLink(url) {
      if (!url) return;
      if (_isCapacitorApp && window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
      } else {
        window.open(url, '_blank', 'noopener');
      }
    }

    // カードのcategoryが現在の絞り込み条件（filterCats）にマッチするか
    // category が null/undefined ならどのカテゴリでも常に対象（全カテゴリ共通枠）
    function _matchesCurrentCategory(card) {
      if (card.category === null || card.category === undefined) return true;
      if (filterCats.size === 0) return true;
      return filterCats.has(card.category);
    }

    // 日替わり固定選択: 当日の日付をシードに、有効期間内・カテゴリ一致の候補から1件だけ選ぶ
    function _pickSponsoredCardForToday(cards) {
      const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      const candidates = cards.filter(c =>
        c.active &&
        (!c.startDate || c.startDate <= todayStr) &&
        (!c.endDate || c.endDate >= todayStr) &&
        _matchesCurrentCategory(c)
      );
      if (candidates.length === 0) return null;
      const today = new Date();
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      return candidates[seed % candidates.length];
    }

    // PRカード1件のHTML生成（spot-card ベースの見た目を踏襲、左上に「PR」バッジ）
    function renderSponsoredCard(card) {
      const safeUrl = (card.url || '').replace(/'/g, "\\'");
      const imgHtml = card.imageUrl
        ? `<img src="${card.imageUrl}" alt="${(card.sponsorName || '').replace(/"/g, '&quot;')}"
                style="width:100%;height:220px;object-fit:cover;display:block;" />`
        : `<div class="card-image-bg" style="height:220px;display:flex;align-items:center;justify-content:center;background:var(--sand);">📢</div>`;
      return `
        <article class="spot-card sponsored-card" data-sponsored="1" data-id="${card.id}" onclick="openSponsoredCardLink('${safeUrl}')" style="cursor:pointer;">
          <div class="card-hero" style="position:relative;overflow:hidden;">
            ${imgHtml}
            <div style="position:absolute;top:10px;left:10px;font-size:11px;font-weight:700;color:white;background:rgba(0,0,0,0.55);border-radius:4px;padding:2px 8px;letter-spacing:0.05em;" data-i18n="prBadgeLabel">${t('prBadgeLabel')}</div>
          </div>
          <div class="card-body" style="padding-top:12px;">
            <div style="font-size:12px;color:var(--warm-gray);margin-bottom:4px;">${escapeHtml(card.sponsorName || '')}</div>
            <h2 style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;color:var(--midnight);margin:0 0 8px;line-height:1.3;">${escapeHtml(card.title || '')}</h2>
            ${card.content ? `<p style="font-size:14px;color:var(--warm-gray);line-height:1.6;margin:0;">${escapeHtml(card.content)}</p>` : ''}
          </div>
        </article>`;
    }

    // イベントカードDOM要素キャッシュ（設計書21: カテゴリタブ切り替え時のInstagram埋め込み再読み込み防止）
    // key: `${e.id}::${lang}` → 生成済みの <article class="spot-card"> 要素
    const _cardElCache = new Map();
    let _cardTmpContainer = null;
    let _sponsoredCardTmpContainer = null; // PRカード（設計書29）専用の使い回しDOMコンテナ

    // Klookアフィリエイトウィジェット（設計書30、軽量な試験導入 → 設計書31でカード風の見た目・カード間差し込みに改善）
    // 公式ダッシュボードが提供する <ins> + <script> をそのまま埋め込む。ローテーション等は行わず1回だけ生成し使い回す
    let _klookWidgetInserted = false;
    let _klookWidgetEl = null; // 生成済みのラッパーDOM要素（.klook-widget-card）。以降は再生成せず insertBefore で位置を動かすだけにする
    function _createKlookWidgetEl() {
      const wrapper = document.createElement('div');
      wrapper.className = 'klook-widget-card';
      wrapper.id = '_klook-widget-container';

      const label = document.createElement('div');
      label.className = 'klook-widget-card__label';
      label.setAttribute('data-i18n', 'prBadgeLabel');
      label.textContent = t('prBadgeLabel');

      const body = document.createElement('div');
      body.className = 'klook-widget-card__body';

      const ins = document.createElement('ins');
      ins.className = 'klk-aff-widget';
      ins.setAttribute('data-wid', '127020');
      ins.setAttribute('data-adid', '1337601');
      ins.setAttribute('data-actids', '117,127,119');
      ins.setAttribute('data-prod', 'mul_act');
      ins.setAttribute('data-price', 'true');
      ins.setAttribute('data-lang', '');
      ins.setAttribute('data-width', '336');
      ins.setAttribute('data-height', '280');
      ins.setAttribute('data-currency', 'SGD');
      const insLink = document.createElement('a');
      insLink.href = '//www.klook.com/';
      insLink.textContent = 'Klook.com';
      ins.appendChild(insLink);

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = 'https://affiliate.klook.com/widget/fetch-iframe-init.js';

      body.appendChild(ins);
      body.appendChild(script);

      wrapper.appendChild(label);
      wrapper.appendChild(body);
      return wrapper;
    }

    // 既存キャッシュがあれば再利用（新規要素は生成しない）、無ければ renderEventCard() の文字列から新規生成する。
    // 戻り値: { el, isNew }
    function _getOrCreateCardEl(e, i, cacheKey) {
      const cached = _cardElCache.get(cacheKey);
      if (cached) {
        return { el: cached, isNew: false };
      }
      if (!_cardTmpContainer) _cardTmpContainer = document.createElement('div');
      _cardTmpContainer.innerHTML = renderEventCard(e, i);
      const el = _cardTmpContainer.firstElementChild;
      _cardElCache.set(cacheKey, el);
      return { el, isNew: true };
    }

    let showPinnedOnly = false;

    function toggleCalSort() {
      calSortOrder = calSortOrder === 'desc' ? 'asc' : 'desc';
      const isEn = getLang() === 'en';
      document.getElementById('cal-sort-btn').textContent = isEn ? (calSortOrder === 'desc' ? 'Start↓' : 'Start↑') : (calSortOrder === 'desc' ? '開始日↓' : '開始日↑');
      renderCalPopupEvents();
    }

    function _setIconFilter(type) {
      const wasActive = type === 'pin' ? showPinnedOnly : type === 'ending' ? filterEnding : filterNew;
      showPinnedOnly = false; filterEnding = false; filterNew = false;
      document.getElementById('pin-filter-btn')?.classList.remove('active');
      document.getElementById('ending-filter-btn')?.classList.remove('active');
      document.getElementById('new-filter-btn')?.classList.remove('active');
      if (!wasActive) {
        if (type === 'pin')    { showPinnedOnly = true; document.getElementById('pin-filter-btn')?.classList.add('active'); }
        if (type === 'ending') { filterEnding   = true; document.getElementById('ending-filter-btn')?.classList.add('active'); }
        if (type === 'new')    { filterNew      = true; document.getElementById('new-filter-btn')?.classList.add('active'); }
      }
      updateFilterBadge();
      document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
      renderEventCards();
    }

    function togglePinFilter()    { _setIconFilter('pin'); }
    function toggleEndingFilter() { _setIconFilter('ending'); }
    function toggleNewFilter()    { _setIconFilter('new'); }

    function toggleCardTips(id) {
      const box = document.getElementById('tips-' + id);
      const btn = document.getElementById('tips-btn-' + id);
      if (!box || !btn) return;
      const open = box.style.display === 'none';
      box.style.display = open ? 'block' : 'none';
      btn.classList.toggle('active', open);
      const arrow = btn.querySelector('.tips-arrow');
      if (arrow) arrow.textContent = open ? '△' : '▽';
    }

    function toggleCatFilter(val) {
      if (val === 'all') {
        filterCats.clear();
        _recommendModeActive = false;
      } else if (val === 'recommend') {
        if (getGenreList().length === 0) {
          // ジャンル未設定時は「おすすめ」チップ自体が非表示のため、
          // ONにせず即座に抜ける（表示中カテゴリの状態を変更しない）
          return;
        }
        filterCats.clear();
        _recommendModeActive = !_recommendModeActive;
      } else {
        if (filterCats.has(val) && !_recommendModeActive) {
          // 既にアクティブなカテゴリを再タップしても何もしない（タブとして選択状態を維持する。
          // 「すべて」に戻ってしまうトグル解除の挙動は意図しない誤動作だったため撤回）
          return;
        }
        _recommendModeActive = false;
        filterCats.clear();
        filterCats.add(val);
      }
      _syncCatChips();
      _syncRecommendChip();
      updateFilterBadge();
      document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
      renderEventCards();
    }

    function _syncCatChips() {
      const isAll = filterCats.size === 0;
      document.querySelectorAll('#filter-row-category .filter-chip').forEach(b => {
        if (b.dataset.cat === 'all') b.classList.toggle('active', isAll && !_recommendModeActive);
        else if (b.dataset.cat === 'recommend') b.classList.toggle('active', _recommendModeActive);
        else b.classList.toggle('active', filterCats.has(b.dataset.cat));
      });
    }

    function isEventInWeek(e, weekKey) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToSat = (6 - dayOfWeek + 7) % 7 || 7;
      const weekOffsets = { weekend: 0, nextweekend: 7, afterweekend: 14, threeweeks: 21 };
      const offset = weekOffsets[weekKey] ?? 0;
      const sat = new Date(now); sat.setDate(now.getDate() + daysToSat + offset); sat.setHours(0,0,0,0);
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
      const mon = new Date(sat); mon.setDate(sat.getDate() - 5);
      const evStart = e.start_date ? new Date(e.start_date) : null;
      const evEnd   = e.end_date   ? new Date(e.end_date)   : evStart;
      if (!evStart) return true;
      return evStart <= sun && evEnd >= mon;
    }

    function isEndingSoon(e) {
      if (e.type === 'opening') return false;
      const today = new Date(); today.setHours(0,0,0,0);
      const dow = today.getDay();
      const thisSun = new Date(today); thisSun.setDate(today.getDate() + (dow === 0 ? 0 : 7 - dow));
      const cutoff = new Date(thisSun.getTime() + 5 * 86400000);
      const ed = e.end_date ? new Date(e.end_date) : null;
      return ed && ed >= today && ed <= cutoff;
    }

    function updateFilterBadge() {
      // シートで設定したフィルターのみカウント（カテゴリ・アイコンは除外）
      const sheetCount = (filterWeek ? 1 : 0) + filterWho.size + filterAreas.size + (filterKeyword ? 1 : 0);
      const badge = document.getElementById('event-filter-badge');
      if (badge) {
        badge.style.display = sheetCount > 0 ? '' : 'none';
        badge.textContent = '+' + sheetCount;
      }
      document.getElementById('event-filter-btn')?.classList.toggle('active', sheetCount > 0);
    }

    function openEventFilterSheet() {
      _draftFilterWeek    = filterWeek;
      _draftFilterWho     = new Set(filterWho);
      _draftFilterAreas   = new Set(filterAreas);
      _draftFilterKeyword = filterKeyword;
      document.querySelectorAll('#event-filter-sheet .ef-chip').forEach(b => {
        const key = b.dataset.key;
        const val = b.dataset.val;
        let active = false;
        if (key === 'week')  active = _draftFilterWeek === val;
        if (key === 'who')   active = _draftFilterWho.has(val);
        if (key === 'area')  active = _draftFilterAreas.has(val);
        b.classList.toggle('active', active);
      });
      const kw = document.getElementById('ef-keyword-input');
      if (kw) kw.value = _draftFilterKeyword;
      _updateEfClearBtn();
      document.getElementById('event-filter-overlay').style.display = 'block';
      document.getElementById('event-filter-sheet').style.display = 'block';
      lockScroll();
    }

    function closeEventFilterSheet() {
      _blurIfFocusInside('event-filter-sheet');
      document.getElementById('event-filter-overlay').style.display = 'none';
      document.getElementById('event-filter-sheet').style.display = 'none';
      unlockScroll();
    }

    function toggleEfChip(btn) {
      const key = btn.dataset.key;
      const val = btn.dataset.val;
      if (key === 'week') {
        const already = _draftFilterWeek === val;
        document.querySelectorAll('#event-filter-sheet .ef-chip[data-key="week"]').forEach(b => b.classList.remove('active'));
        _draftFilterWeek = already ? '' : val;
        if (!already) btn.classList.add('active');
      } else if (key === 'who') {
        if (_draftFilterWho.has(val)) _draftFilterWho.delete(val);
        else _draftFilterWho.add(val);
        btn.classList.toggle('active', _draftFilterWho.has(val));
      } else if (key === 'area') {
        if (_draftFilterAreas.has(val)) _draftFilterAreas.delete(val);
        else _draftFilterAreas.add(val);
        btn.classList.toggle('active', _draftFilterAreas.has(val));
      }
      _updateEfClearBtn();
    }

    function _updateEfClearBtn() {
      const kw = (document.getElementById('ef-keyword-input')?.value || '').trim();
      const hasAny = _draftFilterWeek !== '' || _draftFilterWho.size > 0 || _draftFilterAreas.size > 0 || kw !== '';
      const btn = document.getElementById('event-filter-clear-btn');
      if (btn) btn.style.display = hasAny ? '' : 'none';
    }

    function applyEventFilter() {
      filterWeek    = _draftFilterWeek;
      filterWho     = new Set(_draftFilterWho);
      filterAreas   = new Set(_draftFilterAreas);
      filterKeyword = (document.getElementById('ef-keyword-input')?.value || '').trim();
      updateFilterBadge();
      closeEventFilterSheet();
      renderEventCards();
    }

    function clearEventFilter() {
      _draftFilterWeek    = '';
      _draftFilterWho     = new Set();
      _draftFilterAreas   = new Set();
      _draftFilterKeyword = '';
      document.querySelectorAll('#event-filter-sheet .ef-chip').forEach(b => b.classList.remove('active'));
      const kw = document.getElementById('ef-keyword-input');
      if (kw) kw.value = '';
      _updateEfClearBtn();
      applyEventFilter();
    }

    function genreMatch(e) {
      const selected = getGenreList();
      if (!Array.isArray(e.genres) || e.genres.length === 0) return false;
      return e.genres.some(g => selected.includes(g));
    }

    function renderEventCards() {
      const grid = document.getElementById('cards-grid');

      // loadEventData() が表示したローディングプレースホルダーは .spot-card クラスを持たないため
      // 下記の差分更新クリーンアップ処理の対象外になり、放置すると一覧の末尾に永久に残ってしまう（要削除）
      document.getElementById('_events-loading-placeholder')?.remove();

      // おすすめモードON かつジャンル未設定 → グリッド内に案内を表示
      // 注意: grid.innerHTML を丸ごと再代入すると、キャッシュ済みカード（Instagram埋め込みiframe含む）が
      // documentから切り離されて破棄されてしまうため、既存カードは display:none で隠すだけに留め、
      // 専用のバナー要素だけを個別に挿入/更新する（設計書21）
      if (_recommendModeActive && getGenreList().length === 0) {
        Array.from(grid.children).forEach(child => {
          if (child.id === '_recommend-genre-banner') return;
          child.style.display = 'none';
        });
        let banner = document.getElementById('_recommend-genre-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = '_recommend-genre-banner';
          grid.appendChild(banner);
        }
        banner.style.display = '';
        banner.innerHTML = `<div style="padding:48px 24px 32px;text-align:center;">
          <div style="font-size:40px;margin-bottom:16px;">⭐</div>
          <div style="font-size:15px;font-weight:700;color:var(--midnight);margin-bottom:8px;">あなた好みのイベントを表示</div>
          <div style="font-size:13px;color:var(--warm-gray);line-height:1.6;margin-bottom:24px;">
            好きなジャンルを設定すると<br>マッチするイベントだけ表示されます
          </div>
          <button onclick="switchNav('settings')" style="padding:12px 32px;border-radius:50px;border:none;
            background:var(--caramel);color:#fff;font-size:14px;font-weight:700;cursor:pointer;
            font-family:'Noto Sans JP',sans-serif;">ジャンルを設定する</button>
        </div>`;
        document.getElementById('event-count-label') && (document.getElementById('event-count-label').textContent = '');
        return;
      }
      // バナーが残っていれば隠す（おすすめモード解除後の再描画時）
      const _existingBanner = document.getElementById('_recommend-genre-banner');
      if (_existingBanner) _existingBanner.style.display = 'none';

      const filtered = EVENT_DATA.filter(e => {
        // ピン留めフィルター
        const pinMatch = !showPinnedOnly || !!getPins()[e.id];

        // 年齢フィルターはフィルターシートのみ（プロフィール設定は影響しない）
        const ageMatch = true;

        // カテゴリ（filterCats 空=すべて）
        const catMatch = filterCats.size === 0 || filterCats.has(e.type);

        // 誰と（filterWho 空=すべて）
        const eWho = Array.isArray(e.who) ? e.who : null;
        const whoFilterMatch = filterWho.size === 0 || !eWho || eWho.some(w => filterWho.has(w));

        // 週（filterWeek 空=すべて）
        const weekMatch = filterWeek === '' || isEventInWeek(e, filterWeek);

        // エリア（filterAreas 空=すべて）
        const areaMatch = filterAreas.size === 0 || filterAreas.has(e.area);

        // 終了間近
        const endingMatch = !filterEnding || isEndingSoon(e);

        // 新着（3日以内）
        const newMatch = !filterNew || (() => {
          if (!e.fetched_at) return false;
          const fetched = new Date(e.fetched_at + 'T00:00:00');
          const now = new Date(); now.setHours(0,0,0,0);
          return Math.round((now - fetched) / 86400000) <= 3;
        })();

        // キーワード
        const kw = filterKeyword.toLowerCase();
        const kwMatch = kw === ''
          || (e.store   || '').toLowerCase().includes(kw)
          || (e.content || '').toLowerCase().includes(kw)
          || (e.title   || '').toLowerCase().includes(kw)
          || (e.tips    || []).some(t => (t || '').toLowerCase().includes(kw));

        // おすすめモード（ジャンルフィルター）
        const isRecommendMode = _recommendModeActive && filterCats.size === 0;
        const recommendMatch = !isRecommendMode || genreMatch(e);

        return pinMatch && ageMatch && catMatch && whoFilterMatch && weekMatch && areaMatch && endingMatch && newMatch && kwMatch && recommendMatch;
      });

      const CATEGORY_ORDER = { event: 0, show: 1, gourmet: 2, opening: 3, sale: 4 };
      filtered.sort((a, b) => {
        const fa = a.fetched_at || '0000-00-00';
        const fb = b.fetched_at || '0000-00-00';
        if (fb !== fa) return fb.localeCompare(fa);
        return (CATEGORY_ORDER[a.type] ?? 99) - (CATEGORY_ORDER[b.type] ?? 99);
      });

      // PRカード（スポンサー広告枠、設計書29）: おすすめモード中は非表示。3〜5枚目あたりに1件だけ差し込む
      // 独自のマーカーオブジェクトとして filtered に挿入し、下の forEach 内で分岐処理する
      // （イベントIDベースの _cardElCache とは無関係の別データソースのため、専用のDOM要素1つを使い回す）
      let _sponsoredCard = null;
      if (!_recommendModeActive) {
        _sponsoredCard = _pickSponsoredCardForToday(SPONSORED_CARDS);
      }
      if (_sponsoredCard && filtered.length > 0) {
        const insertAt = Math.min(3, filtered.length);
        filtered.splice(insertAt, 0, { __sponsored: true, card: _sponsoredCard });
      }

      // Klookアフィリエイトウィジェット（設計書31）: おすすめモード中は非表示。8枚目あたりに1件だけ差し込む
      // 設計書29のPRカードと同時表示時の間隔調整は今回スコープ外（ユーザー判断、データが実際に入る段階で改めて調整）
      // 【設計書47で一時停止】広告掲載準備が整うまでKlookウィジェットのマーカー挿入を止める。
      // 関数定義・DOM構築ループ側の分岐・リセット処理は残置しているため、下記コメントアウトを解除するだけで再開できる（設計書32と同じ思想）。
      // if (!_recommendModeActive && filtered.length > 0) {
      //   const klookInsertAt = Math.min(7, filtered.length);
      //   filtered.splice(klookInsertAt, 0, { __klookWidget: true });
      // }

      // 設計書21: DOM要素キャッシュによる差分更新（Instagram埋め込みiframeの再読み込み防止）
      // キャッシュキーは id + 言語（言語切替時は必ず作り直す）
      const lang = getLang();
      const usedKeys = new Set();
      let hasNewCard = false;
      let anchor = null; // 直前に配置した可視カード（この直後に次のカードを挿入する）
      let sponsoredUsed = false;
      let klookWidgetUsed = false;

      filtered.forEach((e, i) => {
        // PRカード用マーカー: 専用のDOM要素1つを毎回再生成して使い回す（_cardElCache非対象）
        if (e && e.__sponsored) {
          if (!_sponsoredCardTmpContainer) _sponsoredCardTmpContainer = document.createElement('div');
          _sponsoredCardTmpContainer.innerHTML = renderSponsoredCard(e.card);
          const el = _sponsoredCardTmpContainer.firstElementChild;
          sponsoredUsed = true;
          el.style.display = '';
          el.style.animationDelay = (i * 0.06) + 's';
          const desiredNext = anchor ? anchor.nextSibling : grid.firstChild;
          grid.insertBefore(el, desiredNext);
          anchor = el;
          return;
        }
        // Klookウィジェット用マーカー: 初回のみ生成し、以降は同じDOM要素を insertBefore で位置移動するだけ（再生成しない）
        if (e && e.__klookWidget) {
          if (!_klookWidgetEl) {
            _klookWidgetEl = _createKlookWidgetEl();
          }
          klookWidgetUsed = true;
          _klookWidgetEl.style.display = '';
          const desiredNext = anchor ? anchor.nextSibling : grid.firstChild;
          if (desiredNext !== _klookWidgetEl) {
            grid.insertBefore(_klookWidgetEl, desiredNext);
          }
          _klookWidgetInserted = true;
          anchor = _klookWidgetEl;
          return;
        }
        const cacheKey = e.id + '::' + lang;
        const { el, isNew } = _getOrCreateCardEl(e, i, cacheKey);
        el.dataset.lang = lang;
        usedKeys.add(cacheKey);
        el.style.display = '';
        if (isNew) {
          hasNewCard = true;
          el.classList.remove('spot-card--reused');
          el.style.animationDelay = (i * 0.06) + 's';
        } else {
          // 既存カードは即時表示（再アニメーションしない）
          el.classList.add('spot-card--reused');
          el.style.animationDelay = '';
          // tips展開状態はタブ切り替えのたびに閉じた状態へリセットする（2026-07-12ユーザー決定）
          const tipsBox = document.getElementById('tips-' + e.id);
          if (tipsBox && tipsBox.style.display !== 'none') {
            tipsBox.style.display = 'none';
            const tipsBtn = document.getElementById('tips-btn-' + e.id);
            if (tipsBtn) {
              tipsBtn.classList.remove('active');
              const arrow = tipsBtn.querySelector('.tips-arrow');
              if (arrow) arrow.textContent = '▽';
            }
          }
        }
        // 直前の可視カードの直後に配置（非表示カードやバナーの位置は無視し、可視順序だけを基準にする）
        // 既に正しい位置にあれば insertBefore/appendChild はノードの再生成を伴わない = iframe維持
        const desiredNext = anchor ? anchor.nextSibling : grid.firstChild;
        if (desiredNext !== el) {
          grid.insertBefore(el, desiredNext);
        }
        anchor = el;
      });

      // PRカードが今回表示されなかった場合、前回挿入されたPRカードDOM要素が残っていれば除去する
      if (!sponsoredUsed) {
        grid.querySelectorAll('.sponsored-card').forEach(n => n.remove());
      }

      // Klookウィジェットが今回表示されなかった場合（おすすめモード中等）、DOM要素は破棄せず display:none で隠すのみ（iframe維持）
      if (!klookWidgetUsed && _klookWidgetEl) {
        _klookWidgetEl.style.display = 'none';
      }

      // フィルタで表示対象から外れたカードは破棄せず display:none であとに残す（同一言語の場合のみ再利用対象として保持）。
      // 言語切替で無効化された旧言語のカードは、貯まり続けないようDOM・キャッシュ双方から完全に削除する
      // PRカード（.sponsored-card）は _cardElCache の対象外・別ロジックで管理しているためこのループの対象外
      Array.from(grid.children).forEach(child => {
        if (!child.classList || !child.classList.contains('spot-card')) return;
        if (child.classList.contains('sponsored-card')) return;
        const id = child.dataset.id;
        const key = id + '::' + lang;
        if (usedKeys.has(key)) return;
        if (child.dataset.lang && child.dataset.lang !== lang) {
          _cardElCache.delete(id + '::' + child.dataset.lang);
          child.remove();
        } else {
          child.style.display = 'none';
        }
      });

      // 件数表示・空状態判定は PR カードマーカー・Klookウィジェットマーカーを除いたイベント件数のみを対象にする
      const eventOnlyCount = filtered.filter(e => !(e && (e.__sponsored || e.__klookWidget))).length;
      resultCount.textContent = eventOnlyCount + t('countSuffix');
      emptyState.classList.toggle('visible', eventOnlyCount === 0);
      updatePinButtons();
      if (hasNewCard) loadInstagramEmbeds();
    }

    function applyFilters() {
      renderEventCards();
    }

    // ─── カテゴリフィルターチップ 即時タップ対応（スクロール中は無視）───
    {
      let _catTouchStartX = 0, _catTouchStartY = 0;
      document.getElementById('filter-row-category')?.addEventListener('touchstart', e => {
        _catTouchStartX = e.touches[0].clientX;
        _catTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      document.getElementById('filter-row-category')?.addEventListener('touchend', e => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        const dx = Math.abs(e.changedTouches[0].clientX - _catTouchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - _catTouchStartY);
        if (dx > 8 || dy > 8) return;
        e.preventDefault();
        toggleCatFilter(chip.dataset.cat);
      }, { passive: false });
    }

    // ─── カード領域スワイプでタブ切り替え ───
    // _swipeStartX/_swipeStartY/_swipeIntent はPTR（設計書19）からも参照するため、
    // このブロック内に閉じずモジュールスコープの let にしている（2026-07-12）。
    // 既存の横スワイプ機構自体のロジックは変更していない。
    let _swipeStartX = 0, _swipeStartY = 0, _swipeIntent = null, _swipeOnHeaderScroll = false;
    {
      // 現在DOM上に表示中（display:noneでない）のチップの data-cat を、表示順で取得する。
      // 固定配列を使わないことで、チップの表示/非表示状態の変化に自動追従する。
      function _visibleCatOrder() {
        return [...document.querySelectorAll('#filter-row-category .filter-chip')]
          .filter(b => b.offsetParent !== null)
          .map(b => b.dataset.cat);
      }

      function _currentCatIdx(order) {
        if (_recommendModeActive) return order.indexOf('recommend');
        if (filterCats.size === 0) return order.indexOf('all');
        const cat = [...filterCats][0];
        return order.indexOf(cat);
      }

      function _switchCatBySwipe(dir) {
        const order = _visibleCatOrder();
        const idx = _currentCatIdx(order);
        const next = idx + dir;
        if (idx === -1 || next < 0 || next >= order.length) return;
        toggleCatFilter(order[next]);
        const chip = document.querySelector(`#filter-row-category .filter-chip[data-cat="${order[next]}"]`);
        chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }

      const homeEl = document.getElementById('screen-home');
      homeEl?.addEventListener('touchstart', e => {
        // ヘッダーのカテゴリチップ行(#filter-row-category)は独自の横スクロール・タップ判定を持つため、
        // ここで始まったタッチはカード領域スワイプ判定の対象から除外する（チップ行を横スクロールした
        // だけでカテゴリが切り替わってしまう誤爆を防ぐ。コース画面の#course-everyone-carouselと同じパターン）
        _swipeOnHeaderScroll = !!e.target.closest('#filter-row-category');
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
        _swipeIntent = null;
      }, { passive: true });

      homeEl?.addEventListener('touchmove', e => {
        if (_swipeOnHeaderScroll || _swipeIntent) return;
        const dx = Math.abs(e.touches[0].clientX - _swipeStartX);
        const dy = Math.abs(e.touches[0].clientY - _swipeStartY);
        if (dx > 6 || dy > 6) _swipeIntent = dx > dy ? 'h' : 'v';
      }, { passive: true });

      homeEl?.addEventListener('touchend', e => {
        if (_swipeOnHeaderScroll || _swipeIntent !== 'h') return;
        const dx = e.changedTouches[0].clientX - _swipeStartX;
        if (Math.abs(dx) < 50) return;
        _switchCatBySwipe(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    // ─── ボトムナビ 即時タップ対応（iOS Safari scroll-offset click mismatch 回避）───
    {
      let _navTouchStartX = 0, _navTouchStartY = 0;
      ['home', 'course', 'plan', 'settings'].forEach(s => {
        const btn = document.getElementById('nav-' + s);
        if (!btn) return;
        btn.addEventListener('touchstart', e => {
          _navTouchStartX = e.touches[0].clientX;
          _navTouchStartY = e.touches[0].clientY;
        }, { passive: true });
        btn.addEventListener('touchend', e => {
          const dx = Math.abs(e.changedTouches[0].clientX - _navTouchStartX);
          const dy = Math.abs(e.changedTouches[0].clientY - _navTouchStartY);
          if (dx > 10 || dy > 10) return;
          e.preventDefault();
          switchNav(s);
        }, { passive: false });
      });

      // ─── DEBUG/FIX: .bottom-nav 座標ベースのフォールバックハンドラ（原因特定後に削除を検討すること。2026-07-11設計書9 方針C）───
      // iOS WKWebView固有の現象: キーボード表示→非表示の過渡期間中、window.innerHeight/visualViewportが
      // 実際の値に戻るまでの間、ネイティブタッチイベントが .nav-item（個別ボタン）ではなく
      // 親の <nav class="bottom-nav"> へ配送されることがある（document.elementFromPoint()は常に正確なまま）。
      // このハンドラは .bottom-nav 自体がタッチイベントのターゲットになった場合のみ、タップ座標から
      // document.elementFromPoint() で実際の対象ボタンを特定し switchNav() を呼ぶ「保険」。
      // e.target が既に .nav-item（個別ボタン）自身/子孫の場合は何もしない（上記の個別ハンドラが処理するため、二重発火を防ぐ）。
      const bottomNavEl = document.querySelector('.bottom-nav');
      if (bottomNavEl) {
        bottomNavEl.addEventListener('touchend', e => {
          // 個別 .nav-item ハンドラが処理するケースはスキップ（二重発火防止）
          if (e.target.closest && e.target.closest('.nav-item')) return;

          const touch = e.changedTouches[0];
          const hitEl = document.elementFromPoint(touch.clientX, touch.clientY);
          const navBtn = hitEl && hitEl.closest ? hitEl.closest('.nav-item') : null;
          if (!navBtn) return;

          const screen = navBtn.id.replace('nav-', '');
          e.preventDefault();
          switchNav(screen);
        }, { passive: false });
      }
    }

    // ─── FAB 即時タップ対応（iOS Safari scroll-offset click mismatch 回避）───
    {
      let _fabTx = 0, _fabTy = 0;
      [
        { id: 'course-fab', fn: () => openCourseSheet() },
        { id: 'fab-plan',   fn: () => openCustomPlanModal() },
        { id: 'fab-top',    fn: () => fabScrollTop() },
      ].forEach(({ id, fn }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('touchstart', e => {
          _fabTx = e.touches[0].clientX;
          _fabTy = e.touches[0].clientY;
        }, { passive: true });
        btn.addEventListener('touchend', e => {
          const dx = Math.abs(e.changedTouches[0].clientX - _fabTx);
          const dy = Math.abs(e.changedTouches[0].clientY - _fabTy);
          if (dx > 10 || dy > 10) return;
          e.preventDefault();
          fn();
        }, { passive: false });
      });
    }

    // ─── Section Header ボタン 即時タップ対応 ───
    document.querySelector('.section-header')?.addEventListener('touchend', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      if (btn.id === 'ending-filter-btn') toggleEndingFilter();
      else if (btn.id === 'pin-filter-btn') togglePinFilter();
      else if (btn.id === 'new-filter-btn') toggleNewFilter();
      else if (btn.id === 'event-filter-btn') openEventFilterSheet();
    }, { passive: false });

    // ─── 設定画面 即時タップ対応 ───
    {
      const settingsEl = document.getElementById('screen-settings');
      let settingsTouchStartY = 0;
      settingsEl.addEventListener('touchstart', e => {
        settingsTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      settingsEl.addEventListener('touchend', e => {
        if (Math.abs(e.changedTouches[0].clientY - settingsTouchStartY) > 8) return;
        if (e.target.closest('#clear-pins-item'))   { e.preventDefault(); clearPins();    return; }
        if (e.target.closest('#do-share-btn'))      { e.preventDefault(); doShare();      return; }
        if (e.target.closest('#feedback-send-btn')) { e.preventDefault(); sendFeedback(); return; }
        if (e.target.closest('#lang-toggle-btn'))   { e.preventDefault(); setLang(getLang() === 'ja' ? 'en' : 'ja'); return; }
        if (e.target.closest('#push-toggle-btn'))   { e.preventDefault(); togglePush(); return; }
        if (e.target.closest('#google-login-btn'))  { e.preventDefault(); handleGoogleLoginClick(); return; }
        if (e.target.closest('#apple-login-btn'))    { e.preventDefault(); handleAppleLoginClick();  return; }
        if (e.target.closest('#logout-btn'))        { e.preventDefault(); handleLogoutClick();      return; }
        if (e.target.closest('#delete-account-btn')) { e.preventDefault(); handleDeleteAccountClick(); return; }
        if (e.target.closest('#backup-section-content button')) {
          const btn = e.target.closest('button');
          e.preventDefault();
          _runBackupAction(btn && btn.dataset.backupAction);
          return;
        }
      }, { passive: false });
    }

    // ─── データバックアップセクション ボタン共通処理（設計書58）───
    // タッチ環境はtouchendデリゲーション（上記）から、PC/マウス環境は下記clickリスナーから呼ばれる。
    function _runBackupAction(action) {
      if (action === 'setup') openBackupPassphraseSheet('setup');
      else if (action === 'change') openBackupPassphraseSheet('change');
      else if (action === 'restore') openBackupPassphraseSheet('restore');
      else if (action === 'disable') disableBackup();
    }
    {
      const backupSectionEl = document.getElementById('backup-section-content');
      if (backupSectionEl) {
        backupSectionEl.addEventListener('click', e => {
          if (_touchCapableDetected) return; // タッチ環境ではtouchend側で処理済み（二重発火防止）
          const btn = e.target.closest('button');
          if (!btn) return;
          _runBackupAction(btn.dataset.backupAction);
        });
      }
    }

    // ─── カレンダーポップアップ 即時タップ対応 ───
    document.getElementById('cal-popup-filter-row').addEventListener('touchend', e => {
      const chip = e.target.closest('.sale-filter-chip');
      if (!chip) return;
      e.preventDefault();
      setCalPopupFilter(chip.dataset.cat);
    }, { passive: false });



    // ─── 閉じる✕ボタン 即時タップ対応（data-close 属性で一括登録） ───
    document.addEventListener('touchend', e => {
      const btn = e.target.closest('[data-close]');
      if (!btn) return;
      e.preventDefault();
      btn.click();
    }, { passive: false });

    // ─── オーバーレイ・モーダル閉じる 即時タップ対応 ───
    [
      ['pin-detail-overlay', () => closePinDetail()],
      ['pin-picker-overlay',   () => closePinPicker()],
      ['emoji-picker-overlay',    () => closeEmojiPicker()],
      ['schedule-action-overlay', () => closeScheduleActionSheet()],
      ['cal-popup-overlay',       () => closeCalPopup()],
      ['backup-passphrase-overlay', () => closeBackupPassphraseSheet()],
      ['cal-passphrase-overlay',    () => closeCalPassphraseSheet()],
      ['backup-passphrase-submit-btn', () => submitBackupPassphrase()],
      ['cal-passphrase-submit-btn',    () => submitCalPassphrase()],
      ['stamp-spot-detail-overlay', () => closeStampSpotDetail()],
      ['stamp-checkin-btn', () => doStampCheckin()],
      ['stamp-view-toggle-btn', () => toggleStampViewMode()],
      ['stamp-level-unlock-overlay', () => closeStampLevelUnlockModal()],
    ].forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('touchend', e => { e.preventDefault(); fn(); }, { passive: false });
    });


    // 旧キー (sg_custom_plans etc.) → 統一キー (custom_plans) への一回限り移行
    (function migrateCustomPlans() {
      if (localStorage.getItem('_custom_plans_migrated')) return;
      const unified = JSON.parse(localStorage.getItem('custom_plans') || '[]');
      const seen = new Set(unified.map(p => p.id));
      ['sg', 'bkk', 'syd'].forEach(c => {
        const old = JSON.parse(localStorage.getItem(c + '_custom_plans') || '[]');
        old.forEach(p => { if (!seen.has(p.id)) { unified.push(p); seen.add(p.id); } });
      });
      localStorage.setItem('custom_plans', JSON.stringify(unified));
      localStorage.setItem('_custom_plans_migrated', '1');
    })();

    // app-headerはscreen-home内のstickyヘッダーになったためsyncHeaderHeightは不要
    function syncHeaderHeight() {}

    // ─── AUTH（Google/Apple Sign-In。iOS版・Web版共通。設計書20/35/36/44/49） ───
    // 【重要】この変数宣言ブロックは、下記 _initAuthToken IIFE（起動時に即実行される）が
    // これらの let/const を参照するため、必ず初期化フロー（loadEventData()）より前に置くこと。
    // 元は関数定義群の直前（getAuthToken() の上）にあったが、宣言より前に参照される
    // TDZ（Temporal Dead Zone）実行時 ReferenceError が発生したため、ここへ移動した（設計書49・TDZ修正）。
    const AUTH_TOKEN_KEY = 'app_auth_token';
    let _googleWebClientId = null; // GET /api/config で起動時に取得（Web版GISの初期化用）
    let _googleAuthInited = false; // Web/iOS共通、各プラットフォームの初期化を一度だけ行うためのフラグ
    let _appleServiceId = null; // GET /api/config で起動時に取得（Web版Sign in with Apple JSの初期化用）
    let _appleRedirectUri = null; // GET /api/config で起動時に取得（Web版のredirectURI）
    let _appleAuthInited = false; // Web版のみ、AppleID.auth.init()を一度だけ行うためのフラグ

    // JWT保存: iOS版はlocalStorage単独だとWKWebView再起動で消えることがあるため、
    // @capacitor/preferences（ネイティブ永続領域）をソースオブトゥルースにするハイブリッド方式（設計書49）。
    // localStorage はミラー、_authTokenCache は getAuthToken() を同期のまま維持するための同期読み取り元。
    let _authTokenCache = null;        // getAuthToken() が同期で返す唯一の読み取り元
    let _prefsReady = false;           // 起動時 Preferences 読み出しが完了したか（診断用）
    let _CapPrefs = null;              // @capacitor/preferences プラグイン（iOS版のみ非null想定）
    if (_isCapacitorApp) {
      try {
        if (window.Capacitor?.registerPlugin) _CapPrefs = window.Capacitor.registerPlugin('Preferences');
      } catch (_) {}
      if (!_CapPrefs) _CapPrefs = window.Capacitor?.Plugins?.Preferences || null;
    }

    // iOS版プッシュトークン: initPushState()→_initNativePush()が起動時に参照するため、
    // 呼び出し（下記 initPushState()）より前に宣言する。元は下部の PUSH セクションにあったが、
    // 設計書50でPreferences復元＋計装を _initNativePush 冒頭に追加した際、TDZ回避のためここへ移動した。
    let _nativeDeviceToken = localStorage.getItem('app_ios_push_token') || null;
    // iOS版プッシュ状態フラグ／プラグイン参照も、起動時フロー（initPushState()→_initNativePush()
    // →_getCapPushPlugin()）が同期実行部で参照するため、呼び出しより前に宣言する（設計書51・TDZ回避）。
    // 元は下部の PUSH セクション（_getCapPushPlugin 直前）にあったが、設計書50で _nativeDeviceToken だけ
    // 移動し、同じ起動時経路で参照されるこの2変数の移動を忘れてTDZ ReferenceErrorになっていたのを修正。
    let _nativePushDenied = false;
    let _CapPush = null;

    loadEventData();
    initPushState();
    initSettingsProfile();
    initSettingsGenres();
    // JWTトークンの初期化（設計書49）。iOS版は @capacitor/preferences から読み出し、
    // 読み出し完了「後」に refreshLoginUI() を呼ぶ（同期 localStorage が空でも連携中を維持するため）。
    (async function _initAuthToken() {
      try {
        if (_CapPrefs) {
          let prefsToken = null;
          try {
            const r = await _CapPrefs.get({ key: AUTH_TOKEN_KEY });
            prefsToken = (r && typeof r.value === 'string') ? r.value : null;
          } catch (_) {}
          if (prefsToken) {
            _authTokenCache = prefsToken;
            try { localStorage.setItem(AUTH_TOKEN_KEY, prefsToken); } catch (_) {} // localStorageミラー
          } else {
            // Preferencesに無くlocalStorageにある場合（旧バージョンからの移行）はPreferencesへ書き込む
            const lsToken = localStorage.getItem(AUTH_TOKEN_KEY);
            _authTokenCache = lsToken;
            if (lsToken) _CapPrefs.set({ key: AUTH_TOKEN_KEY, value: lsToken }).catch(() => {});
          }
        } else {
          // Web版 or プラグイン取得失敗: 従来通り localStorage をキャッシュへ
          _authTokenCache = localStorage.getItem(AUTH_TOKEN_KEY);
        }
      } catch (_) {
        _authTokenCache = localStorage.getItem(AUTH_TOKEN_KEY);
      }
      _prefsReady = true;
      _sendDebugLog('auth_prefs_init', { hasPrefs: !!_CapPrefs, hasToken: !!_authTokenCache }); // 一時計装（原因確定後に削除）
      refreshLoginUI();
    })();
    // Web版: Google/Apple公式ログインボタンを描画。各SDKは<script async>読み込みのため
    // 未ロードの場合に備えて一定回数リトライする（iOS版はネイティブフローのため対象外、下記else分岐で自前ボタンを挿入する）。
    if (!_isCapacitorApp) {
      let _googleBtnRetries = 0;
      const _tryInitGoogleBtn = () => {
        if (window.google?.accounts?.id) { _initGoogleButtonWeb(); return; }
        if (_googleBtnRetries++ < 20) setTimeout(_tryInitGoogleBtn, 300);
      };
      _tryInitGoogleBtn();

      let _appleBtnRetries = 0;
      const _tryInitAppleBtn = () => {
        if (window.AppleID?.auth) { _initAppleButtonWeb(); return; }
        if (_appleBtnRetries++ < 20) setTimeout(_tryInitAppleBtn, 300);
      };
      _tryInitAppleBtn();
    } else {
      // iOS版: #google-login-btn-container / #apple-login-btn-container はWeb版のみが使う
      // 公式SDK描画用の空コンテナのため、iOS版では自前ボタンを動的に挿入する（設計書44、Googleボタン非表示バグの修正）
      const gc = document.getElementById('google-login-btn-container');
      if (gc) {
        // 公式4色「G」ロゴ（Google Branding Guidelines準拠、viewBox 0 0 48 48の4パス）をインライン埋め込み
        gc.innerHTML = `<button id="google-login-btn" onclick="if(!_touchCapableDetected) handleGoogleLoginClick()" class="oauth-btn oauth-btn--google">
          <svg class="oauth-btn__logo" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
          <span data-i18n="loginWithGoogle">${t('loginWithGoogle')}</span>
        </button>`;
      }
      const ac = document.getElementById('apple-login-btn-container');
      if (ac) {
        // 公式Appleロゴ（Sign in with Apple HIG準拠、fill白）をインライン埋め込み
        ac.innerHTML = `<button id="apple-login-btn" onclick="if(!_touchCapableDetected) handleAppleLoginClick()" class="oauth-btn oauth-btn--apple">
          <svg class="oauth-btn__logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#fff" d="M17.05 12.54c-.03-2.9 2.37-4.29 2.48-4.36-1.35-1.98-3.46-2.25-4.21-2.28-1.79-.18-3.5 1.05-4.41 1.05-.91 0-2.31-1.03-3.8-1-1.96.03-3.77 1.14-4.78 2.9-2.04 3.53-.52 8.76 1.46 11.62.97 1.4 2.12 2.97 3.63 2.91 1.46-.06 2.01-.94 3.77-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.56-1.42 3.52-2.83 1.11-1.62 1.57-3.19 1.59-3.27-.03-.02-3.05-1.17-3.08-4.64zM14.13 4.03c.81-.98 1.35-2.34 1.2-3.7-1.16.05-2.57.77-3.4 1.75-.75.86-1.4 2.25-1.23 3.58 1.29.1 2.62-.66 3.43-1.63z"/></svg>
          <span data-i18n="loginWithApple">${t('loginWithApple')}</span>
        </button>`;
      }
    }

    // Pull to Refresh（設計書19、イベント画面。iOS版のみ有効化。既存の横スワイプ機構と共存させるためwatchSwipeIntent=true）
    _initPtr(document.getElementById('home-scroll-content'), 'ptr-indicator-home', async () => {
      await loadEventData();
    }, true);

    // バージョン表示
    (async () => {
      const el = document.getElementById('app-version-label');
      if (!el) return;
      try {
        const _sb = window.Capacitor?.Plugins?.App;
        if (_isCapacitorApp && _sb) {
          const info = await _sb.getInfo();
          el.textContent = `v${info.version} (${info.build})`;
        } else {
          const r = await fetch(`${API_BASE}/api/version`);
          const d = await r.json();
          el.textContent = `v${d.version}`;
        }
      } catch(e) { el.textContent = '-'; }
    })();

    _recommendModeActive = false;
    _syncRecommendChip();

    // ─── FAB ───
    (function() {
      const fab = document.getElementById('fab-top');
      document.getElementById('home-scroll-content').addEventListener('scroll', () => {
        fab.classList.toggle('visible', document.getElementById('home-scroll-content').scrollTop > 300);
      }, { passive: true });

      const calFab = document.getElementById('cal-popup-fab');
      document.getElementById('cal-popup-events').addEventListener('scroll', () => {
        calFab.classList.toggle('visible', document.getElementById('cal-popup-events').scrollTop > 150);
      }, { passive: true });
    })();
    function fabScrollTop() {
      document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function calPopupScrollTop() {
      document.getElementById('cal-popup-events').scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── VOICE INPUT ───
    let voiceRecognition = null;
    let isVoiceRecording = false;

    (function initVoiceMic() {
      if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        ['course-note-mic-btn'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.style.display = 'none';
        });
      }
    })();

    function stopVoiceInput() {
      if (voiceRecognition) voiceRecognition.stop();
    }

    function toggleCourseNoteVoice() {
      if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) return;
      if (isVoiceRecording) { stopVoiceInput(); return; }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      voiceRecognition = new SR();
      voiceRecognition.lang = getLang() === 'en' ? 'en-US' : 'ja-JP';
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = true;

      const micBtn  = document.getElementById('course-note-mic-btn');
      const textarea = document.getElementById('course-note');
      const origPlaceholder = textarea.placeholder;

      voiceRecognition.onstart = () => {
        isVoiceRecording = true;
        micBtn.classList.add('recording');
        textarea.placeholder = getLang() === 'en' ? 'Listening...' : '聴いています...';
      };

      voiceRecognition.onresult = (e) => {
        textarea.value = Array.from(e.results).map(r => r[0].transcript).join('');
      };

      voiceRecognition.onend = () => {
        isVoiceRecording = false;
        micBtn.classList.remove('recording');
        textarea.placeholder = origPlaceholder;
        voiceRecognition = null;
      };

      voiceRecognition.onerror = () => {
        isVoiceRecording = false;
        micBtn.classList.remove('recording');
        textarea.placeholder = origPlaceholder;
        voiceRecognition = null;
      };

      voiceRecognition.start();
    }

    // ─── PIN LOGIC ───
    function pinsKey() { return `${getCity()}_pins`; }
    function getPins() {
      try { return JSON.parse(localStorage.getItem(pinsKey()) || '{}'); } catch { return {}; }
    }
    function savePins(pins) {
      localStorage.setItem(pinsKey(), JSON.stringify(pins));
    }

    function togglePinById(id) {
      const pins = getPins();
      if (pins[id]) {
        delete pins[id];
        showToast(t('toastUnpinned'));
      } else {
        const e = EVENT_REGISTRY[id] || {};
        pins[id] = {
          id,
          title:    e.store || e.title || id,
          location: e.location || '',
          hours:    e.period || e.hours || '',
          emoji:    e.emoji || '📌',
          tip:      Array.isArray(e.tips) && e.tips.length ? e.tips[0] : (e.tip || ''),
          content:  e.content || '',
          tips:     Array.isArray(e.tips) ? e.tips : [],
          image:    e.image || null,
          url:      e.url || '',
          area:     e.area || '',
          type:     e.type || 'event',
        };
        showToast(t('toastPinned'));
      }
      savePins(pins);
      updatePinButtons();
    }

    function updatePinButtons() {
      const pins = getPins();
      document.querySelectorAll('.spot-card').forEach(card => {
        const id = card.dataset.id;
        const btn = card.querySelector('#pin-' + id);
        const label = card.querySelector('#pin-label-' + id);
        if (!btn || !label) return;
        if (pins[id]) {
          btn.classList.add('pinned');
          label.textContent = t('pinnedBtn');
        } else {
          btn.classList.remove('pinned');
          label.textContent = t('pinBtn');
        }
      });
    }

    function renderPinList() {
      const container = document.getElementById('pin-list-content');
      if (!container) return;
      const pins = getPins();
      const entries = Object.values(pins);
      if (entries.length === 0) {
        container.innerHTML = `
          <div class="pin-empty">
            <div class="pin-empty-emoji">📌</div>
            <div class="pin-empty-title">${t('pinEmpty')}</div>
            <div class="pin-empty-desc">${t('pinEmptyDesc')}</div>
          </div>`;
        return;
      }
      container.innerHTML = entries.map((p, i) => `
        <div class="pin-card" style="animation-delay:${i * 0.07}s; cursor:pointer;" onclick="openPinDetail('${p.id}')">
          <div class="pin-card-emoji">${p.emoji}</div>
          <div class="pin-card-info">
            <div class="pin-card-title">${p.title}</div>
            <div class="pin-card-meta">📍 ${p.location}　📅 ${p.hours}</div>
          </div>
          <button class="pin-remove-btn" onclick="event.stopPropagation(); removePin('${p.id}'); renderPinList();">✕</button>
        </div>`).join('');
    }

    function openPinDetail(id) {
      const pins = getPins();
      const p = pins[id];
      if (!p) return;
      lockScroll();

      const fullEvent = EVENT_REGISTRY[p.id];
      const bgClass = (fullEvent && fullEvent.bgClass) ? fullEvent.bgClass : getBgClass(p.id || p.store || '');
      const rawTips = Array.isArray(p.tips) && p.tips.length ? p.tips : (p.tip ? [p.tip] : []);
      const tipsList = rawTips.length
        ? `<div class="tips-box">
            <div class="tips-label">${t('tipsLabel')}</div>
            <ul class="tips-list">${rawTips.map(tip => `<li>${tip}</li>`).join('')}</ul>
          </div>`
        : '';
      const safeTitle = (p.title || '').replace(/'/g, "\\'");
      const safeUrl = (p.url || '').replace(/'/g, "\\'");
      const pinSafeEmoji = p.emoji || '📌';

      // モーダルをカードレイアウト用にリセット
      const modal = document.getElementById('pin-detail-modal');
      modal.style.padding = '0';
      const pinHeader = modal.querySelector('.pin-detail-header');
      if (pinHeader) pinHeader.style.display = 'none';
      const pinActions = document.getElementById('pin-detail-actions');
      if (pinActions) pinActions.style.display = 'none';

      const scroll = document.getElementById('pin-detail-scroll');
      scroll.style.overflow = 'auto';
      scroll.style.flex = '1';
      scroll.style.minHeight = '0';
      scroll.style.maxHeight = 'none';
      scroll.style.marginBottom = '0';
      scroll.style.webkitOverflowScrolling = 'touch';
      scroll.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:flex-end;padding:12px 16px 8px;">
          <button onclick="closePinDetail()"
            style="background:var(--sand);border:none;border-radius:50%;width:32px;height:32px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="padding:0 20px 12px;">
          <div style="font-size:16px;font-weight:700;color:var(--midnight);line-height:1.35;">${p.title || ''}</div>
        </div>
        <div>
          ${p.image
            ? `<img src="${p.image}" alt="${(p.title || '').replace(/"/g,'&quot;')}"
                     style="width:100%;height:170px;object-fit:cover;display:block;"
                     onerror="handleImgError(this,'${bgClass}','${pinSafeEmoji}')" />`
            : `<div class="card-image-bg ${bgClass}" style="height:170px;">${p.emoji || '📌'}</div>`
          }
        </div>
        <div style="padding:12px 20px calc(20px + env(safe-area-inset-bottom));">
          <div class="card-meta" style="margin-bottom:12px;">
            ${p.location ? `<span class="meta-item"><span class="meta-icon">📍</span>${p.location}</span>` : ''}
            ${p.hours ? `<span class="meta-item"><span class="meta-icon">📅</span>${p.hours}${p.url ? `　<a href="${p.url}" target="_blank" rel="noopener" style="color:var(--caramel);font-size:15px;font-weight:300;text-decoration:none;white-space:nowrap;">🔗 ${t('articleLink')}</a>` : ''}</span>` : ''}
          </div>
          ${p.content ? `<p style="font-size:15px;color:var(--warm-gray);line-height:1.65;margin-bottom:12px;">${p.content}</p>` : ''}
          ${tipsList}
          <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap;">
            <button class="sale-pin-btn pinned"
              onclick="removePin('${id}'); closePinDetail(); renderPinList();">
              📌 ピン留めを外す
            </button>
            ${safeUrl ? `<button class="sale-pin-btn"
              onclick="shareApp('${safeTitle}', '${safeUrl}')">
              ${t('shareBtn')}
            </button>` : ''}
            <button class="sale-pin-btn" onclick="openCourseSheetFromEvent('${id}'); closePinDetail();">
              ${t('courseCreateBtn')}
            </button>
          </div>
        </div>`;

      modal.classList.add('visible');
      document.getElementById('pin-detail-overlay').classList.add('visible');
    }

    function closePinDetail() {
      unlockScroll();
      const modal = document.getElementById('pin-detail-modal');
      modal.classList.remove('visible');
      document.getElementById('pin-detail-overlay').classList.remove('visible');
      modal.style.padding = '';
      const pinHeader = modal.querySelector('.pin-detail-header');
      if (pinHeader) pinHeader.style.display = '';
      const pinActions = document.getElementById('pin-detail-actions');
      if (pinActions) pinActions.style.display = '';
      const scroll = document.getElementById('pin-detail-scroll');
      if (scroll) { scroll.style.maxHeight = ''; scroll.style.marginBottom = ''; scroll.style.overflow = ''; }
    }

    function openEventDetailFromSchedule(eventId, planId, planType) {
      const event = EVENT_REGISTRY[eventId];
      if (!event) return;
      lockScroll();
      const bgClass = event.bgClass || getBgClass(event.id || event.store || '');
      const isEn = getLang() === 'en';
      const content = (isEn && event.content_en) ? event.content_en : (event.content || '');
      const tipsArr = (isEn && Array.isArray(event.tips_en) && event.tips_en.length)
        ? event.tips_en : (Array.isArray(event.tips) ? event.tips : []);
      const tipsList = tipsArr.length
        ? `<div class="tips-box"><div class="tips-label">${t('tipsLabel')}</div><ul class="tips-list">${tipsArr.map(tip => `<li>${tip}</li>`).join('')}</ul></div>`
        : '';
      const modal = document.getElementById('pin-detail-modal');
      modal.style.padding = '0';
      const pinHeader = modal.querySelector('.pin-detail-header');
      if (pinHeader) pinHeader.style.display = 'none';
      const pinActions = document.getElementById('pin-detail-actions');
      if (pinActions) pinActions.style.display = 'none';
      const scroll = document.getElementById('pin-detail-scroll');
      scroll.style.overflow = 'auto'; scroll.style.flex = '1'; scroll.style.minHeight = '0';
      scroll.style.maxHeight = 'none'; scroll.style.marginBottom = '0';
      scroll.style.webkitOverflowScrolling = 'touch'; scroll.scrollTop = 0;
      const safePlanId = planId.replace(/'/g, "\\'");
      const safePlanType = planType.replace(/'/g, "\\'");
      const emojiSafe = (event.emoji || '🎡').replace(/'/g, "\\'");
      scroll.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:flex-end;padding:12px 16px 8px;">
          <button onclick="closePinDetail()" style="background:var(--sand);border:none;border-radius:50%;width:32px;height:32px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="padding:0 20px 12px;">
          <div style="font-size:16px;font-weight:700;color:var(--midnight);line-height:1.35;">${event.store||''}</div>
        </div>
        <div>
          ${event.image
            ? `<img src="${event.image}" alt="${(event.store||'').replace(/"/g,'&quot;')}" style="width:100%;height:170px;object-fit:cover;display:block;" onerror="handleImgError(this,'${bgClass}','${emojiSafe}')" />`
            : `<div class="card-image-bg ${bgClass}" style="height:170px;">${event.emoji||'🎡'}</div>`
          }
        </div>
        <div style="padding:12px 20px calc(20px + env(safe-area-inset-bottom));">
          <div class="card-meta" style="margin-bottom:12px;">
            ${event.location?`<span class="meta-item"><span class="meta-icon">📍</span>${event.location}</span>`:''}
            ${event.period?`<span class="meta-item"><span class="meta-icon">📅</span>${event.period}${event.url?`　<a href="${event.url}" target="_blank" rel="noopener" style="color:var(--caramel);font-size:15px;text-decoration:none;">🔗 ${t('articleLink')}</a>`:''}</span>`:''}
          </div>
          ${content?`<p style="font-size:15px;color:var(--warm-gray);line-height:1.65;margin-bottom:12px;">${content}</p>`:''}
          ${tipsList}
        </div>`;
      modal.classList.add('visible');
      document.getElementById('pin-detail-overlay').classList.add('visible');
    }

    function removePin(id) {
      const pins = getPins();
      delete pins[id];
      savePins(pins);
      updatePinButtons();
      renderPinList();
      renderPinnedEventsList();
    }

    function clearPins() {
      if (!confirm(t('confirmClearPins'))) return;
      localStorage.removeItem(pinsKey());
      updatePinButtons();
      renderPinList();
      renderPinnedEventsList();
      showToast(t('toastClearedPins'));
    }

    updatePinButtons();

    // ─── PROFILE SETTINGS ───
    function getWhoList() {
      try { return JSON.parse(localStorage.getItem('app_who') || localStorage.getItem('sg_who') || '[]'); } catch { return []; }
    }

    function toggleWhoPanel() {
      const panel = document.getElementById('settings-who-panel');
      const arrow = document.getElementById('settings-who-arrow');
      if (!panel) return;
      const open = panel.style.display === 'block';
      panel.style.display = open ? 'none' : 'block';
      if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
    }

    function toggleSettingsWho(val) {
      const who = getWhoList();
      const next = who.includes(val) ? [] : [val];
      localStorage.setItem('app_who', JSON.stringify(next));
      if (next.length === 0 || val !== 'family') {
        localStorage.setItem('app_age_list', JSON.stringify([]));
      }
      initSettingsProfile();
      _syncBackupToServer();
    }

    function getAgeList() {
      const v = localStorage.getItem('app_age_list');
      try { return v ? JSON.parse(v) : []; } catch { return []; }
    }

    function selectSettingsAge(val) {
      const ages = getAgeList();
      if (ages.includes(val)) {
        localStorage.setItem('app_age_list', JSON.stringify([]));
      } else {
        localStorage.setItem('app_age_list', JSON.stringify([val]));
      }
      initSettingsProfile();
      _syncBackupToServer();
    }

    // ─── GENRE SETTINGS ───
    function getGenreList() {
      try { return JSON.parse(localStorage.getItem('app_genres') || '[]'); } catch { return []; }
    }

    function saveGenreList(ids) {
      localStorage.setItem('app_genres', JSON.stringify(ids));
      _syncBackupToServer();
    }

    function toggleGenre(id) {
      const current = getGenreList();
      const next = current.includes(id) ? current.filter(g => g !== id) : [...current, id];
      saveGenreList(next);
      document.querySelectorAll('#genre-chips-container .genre-chip').forEach(btn => {
        btn.classList.toggle('selected', next.includes(btn.dataset.genre));
      });
      _syncRecommendChip();
    }

    function getAuthToken() {
      if (_authTokenCache !== null) return _authTokenCache;
      return localStorage.getItem(AUTH_TOKEN_KEY);
    }
    function setAuthToken(token) {
      _authTokenCache = token;
      try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch (_) {}
      if (_CapPrefs) {
        _CapPrefs.set({ key: AUTH_TOKEN_KEY, value: token }).catch(() => {});
      }
    }
    function clearAuthToken() {
      _authTokenCache = null;
      try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (_) {}
      if (_CapPrefs) {
        _CapPrefs.remove({ key: AUTH_TOKEN_KEY }).catch(() => {});
      }
    }

    // Authorizationヘッダーを自動付与するfetchヘルパー（未ログイン時は通常のfetchと同じ挙動）
    async function authedFetch(url, options = {}) {
      const token = getAuthToken();
      const headers = Object.assign({}, options.headers || {});
      if (token) headers['Authorization'] = 'Bearer ' + token;
      return fetch(url, Object.assign({}, options, { headers }));
    }

    // サーバーに idToken を送信し、自前JWTを保存する共通処理（iOS/Web共通）
    async function _submitGoogleIdToken(idToken) {
      try {
        const res = await fetch(API_BASE + '/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (!res.ok) throw new Error('auth failed');
        const data = await res.json();
        if (!data.token) throw new Error('no token');
        setAuthToken(data.token);
        showToast(t('toastLoginSuccess'));
        await refreshLoginUI();
      } catch (e) {
        showToast(t('toastLoginError'));
      }
    }

    // サーバーに identityToken を送信し、自前JWTを保存する共通処理（iOS版のみ。Web版はform_postリダイレクト経由のため別経路）
    async function _submitAppleIdentityToken(identityToken) {
      try {
        const res = await fetch(API_BASE + '/api/auth/apple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identityToken }),
        });
        if (!res.ok) throw new Error('auth failed');
        const data = await res.json();
        if (!data.token) throw new Error('no token');
        setAuthToken(data.token);
        showToast(t('toastLoginSuccess'));
        await refreshLoginUI();
      } catch (e) {
        showToast(t('toastLoginError'));
      }
    }

    // トークンがある前提で「連携中」表示に切り替える楽観的ヘルパー（設計書48・課題2）
    // providerが確定できない状況（通信エラー・500系）で呼ぶため、ラベルは既存の汎用キーを流用する。
    // provider が分かる正常時（refreshLoginUI 内 res.ok 経路）のみ正確なラベルへ更新される。
    function _showLoggedInOptimistic(loggedInEl, loggedOutEl, labelEl) {
      if (labelEl && !labelEl.getAttribute('data-i18n')) {
        labelEl.setAttribute('data-i18n', 'loginStatusGoogle');
        labelEl.textContent = t('loginStatusGoogle');
      }
      loggedOutEl.style.display = 'none';
      loggedInEl.style.display = '';
      const deleteSectionEl = document.getElementById('delete-account-section');
      if (deleteSectionEl) deleteSectionEl.style.display = '';
    }

    // 設定画面のログインセクション表示をログイン状態に合わせて更新する
    async function refreshLoginUI() {
      const loggedOutEl = document.getElementById('login-section-logged-out');
      const loggedInEl = document.getElementById('login-section-logged-in');
      const labelEl = document.getElementById('login-status-label');
      const deleteSectionEl = document.getElementById('delete-account-section');
      if (!loggedOutEl || !loggedInEl) return;
      const token = getAuthToken();
      if (!token) {
        loggedOutEl.style.display = '';
        loggedInEl.style.display = 'none';
        if (deleteSectionEl) deleteSectionEl.style.display = 'none';
        return;
      }
      try {
        const res = await authedFetch(API_BASE + '/api/auth/me');
        // 明確に失効を示す 401 のときだけトークンを破棄して匿名表示に戻す（設計書48・課題2）
        if (res.status === 401) {
          clearAuthToken();
          loggedOutEl.style.display = '';
          loggedInEl.style.display = 'none';
          if (deleteSectionEl) deleteSectionEl.style.display = 'none';
          return;
        }
        // 401 以外の失敗（500系など）はトークンを消さず、楽観的に「連携中」を維持する。
        // iOS版は起動直後にネットワーク未確立・サーバー一時エラーが起きやすく、
        // 有効なトークンを誤って破棄すると再起動のたびに連携が切れて見えるため。
        if (!res.ok) {
          _showLoggedInOptimistic(loggedInEl, loggedOutEl, labelEl);
          return;
        }
        const data = await res.json();
        // メールアドレス・氏名は一切表示しない（認証情報最小化方針）。プロバイダのみ表示
        if (labelEl) {
          const key = data.provider === 'apple' ? 'loginStatusApple' : 'loginStatusGoogle';
          labelEl.setAttribute('data-i18n', key);
          labelEl.textContent = t(key);
        }
        loggedOutEl.style.display = 'none';
        loggedInEl.style.display = '';
        if (deleteSectionEl) deleteSectionEl.style.display = '';
      } catch (e) {
        // 通信エラー・fetch自体の失敗ではトークンを消さず、楽観的に「連携中」を維持する（設計書48・課題2）
        _showLoggedInOptimistic(loggedInEl, loggedOutEl, labelEl);
      }
      if (typeof renderBackupSection === 'function') renderBackupSection();
    }

    function handleLogoutClick() {
      if (!confirm(t('confirmLogout'))) return;
      window.google?.accounts?.id?.disableAutoSelect?.();
      clearAuthToken();
      showToast(t('toastLogoutSuccess'));
      refreshLoginUI();
      // ログアウト時、バックアップの鍵material自体はローカルに残す（設計書54 §8-5、未解決事項として明示。
      // 再ログイン時に同じ端末なら鍵を保持したまま同期を再開できるようにするための保守的な選択）。
      // 表示のみ「未ログイン」向けの案内に更新する。
      renderBackupSection();
    }

    // アカウント削除（設計書65）: JWT・バックアップ鍵material・saltを全てクリアする共通ヘルパー
    function _clearAllAccountLocalState() {
      clearAuthToken();
      _clearBackupKeyMaterial();
      try { localStorage.removeItem('app_backup_salt'); } catch (_) {}
    }

    async function handleDeleteAccountClick() {
      if (!confirm(t('confirmDeleteAccount'))) return;
      try {
        const token = getAuthToken();
        if (!token) { showToast(t('toastLoginError')); return; }
        const res = await authedFetch(API_BASE + '/api/auth/me', { method: 'DELETE' });
        if (res.status === 401) {
          // 既に失効している場合はローカル状態のみクリアして終える
          _clearAllAccountLocalState();
          refreshLoginUI();
          if (typeof renderBackupSection === 'function') renderBackupSection();
          showToast(t('toastDeleteAccountSuccess'));
          return;
        }
        if (!res.ok) { showToast(t('toastDeleteAccountError')); return; }
        // サーバー側削除確認後にローカル状態をクリア（中途半端な状態を残さない）
        window.google?.accounts?.id?.disableAutoSelect?.();
        _clearAllAccountLocalState();
        showToast(t('toastDeleteAccountSuccess'));
        refreshLoginUI();
        if (typeof renderBackupSection === 'function') renderBackupSection();
      } catch (e) {
        showToast(t('toastDeleteAccountError'));
      }
    }

    // iOS版: Capacitorネイティブプラグイン経由でGoogleサインインを起動
    async function _handleGoogleLoginIOS() {
      try {
        let GoogleAuthPlugin = null;
        try {
          if (window.Capacitor?.registerPlugin) GoogleAuthPlugin = window.Capacitor.registerPlugin('GoogleAuth');
        } catch (_) {}
        if (!GoogleAuthPlugin) GoogleAuthPlugin = window.Capacitor?.Plugins?.GoogleAuth;
        if (!GoogleAuthPlugin) { showToast(t('toastLoginError')); return; }
        if (!_googleAuthInited) {
          try { await GoogleAuthPlugin.initialize?.(); } catch (_) {}
          _googleAuthInited = true;
        }
        const result = await GoogleAuthPlugin.signIn();
        const idToken = result?.authentication?.idToken || result?.idToken;
        if (!idToken) { showToast(t('toastLoginError')); return; }
        await _submitGoogleIdToken(idToken);
      } catch (e) {
        showToast(t('toastLoginError'));
      }
    }

    // Web版: Google公式ボタン（renderButton）をコンテナ内に描画する。
    // One Tap（prompt()）は一度サインインに成功するとページリロードまで内部的に抑制され、
    // 再度呼んでも表示されなくなる仕様のため、確実にクリックのたびに起動するrenderButton方式に統一する（設計書40）。
    async function _initGoogleButtonWeb() {
      try {
        if (!_googleWebClientId) {
          const res = await fetch(API_BASE + '/api/config');
          const conf = await res.json();
          _googleWebClientId = conf.googleWebClientId;
        }
        if (!_googleWebClientId || !window.google?.accounts?.id) return;
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
      } catch (e) {
        // GIS SDK未ロード等の失敗時はコンテナが空のまま残るだけで実害なし
      }
    }

    function handleGoogleLoginClick() {
      if (_isCapacitorApp) _handleGoogleLoginIOS();
      // Web版はrenderButton()が描画したGoogle公式ボタンがクリックを直接処理するため、ここでは何もしない
    }

    // iOS版: Capacitorネイティブプラグイン経由でSign in with Appleを起動。スコープは要求しない（同意画面を出さずsub相当のみ取得、設計書44）
    async function _handleAppleLoginIOS() {
      try {
        let AppleAuthPlugin = null;
        try {
          if (window.Capacitor?.registerPlugin) AppleAuthPlugin = window.Capacitor.registerPlugin('SignInWithApple');
        } catch (_) {}
        if (!AppleAuthPlugin) AppleAuthPlugin = window.Capacitor?.Plugins?.SignInWithApple;
        if (!AppleAuthPlugin) { showToast(t('toastLoginError')); return; }
        const result = await AppleAuthPlugin.authorize({
          clientId: 'app.dosuru',
          redirectURI: 'https://dosuru.app/api/auth/apple/callback',
          scopes: '',
        });
        const identityToken = result?.response?.identityToken;
        if (!identityToken) { showToast(t('toastLoginError')); return; }
        await _submitAppleIdentityToken(identityToken);
      } catch (e) {
        showToast(t('toastLoginError'));
      }
    }

    // Web版: Sign in with Apple JS SDKを初期化し、公式ボタン（appleid-signin-button）をコンテナ内に描画する。
    // response_mode:'form_post'によるフルページリダイレクト方式（設計書44）。scopeは要求しない。
    async function _initAppleButtonWeb() {
      try {
        if (!_appleServiceId) {
          const res = await fetch(API_BASE + '/api/config');
          const conf = await res.json();
          _appleServiceId = conf.appleServiceId;
          if (conf.appleRedirectUri) _appleRedirectUri = conf.appleRedirectUri;
        }
        if (!_appleServiceId || !window.AppleID?.auth) return;
        const stateRes = await fetch(API_BASE + '/api/auth/apple/state');
        const stateData = await stateRes.json();
        if (!stateData.state) return;
        window.AppleID.auth.init({
          clientId: _appleServiceId,
          scope: '',
          redirectURI: _appleRedirectUri || (API_BASE + '/api/auth/apple/callback'),
          state: stateData.state,
          usePopup: false,
        });
        _appleAuthInited = true;
      } catch (e) {
        // Sign in with Apple JS SDK未ロード等の失敗時はコンテナが空のまま残るだけで実害なし
      }
    }

    function handleAppleLoginClick() {
      if (_isCapacitorApp) { _handleAppleLoginIOS(); return; }
      // Web版はAppleID公式ボタン（<div id="apple-login-btn-container">に描画されたappleid-signin-button）が
      // クリックを検知しAppleID.auth.init()済みの設定でリダイレクトを開始するため、初期化未完了時のみ再試行する
      if (!_appleAuthInited) _initAppleButtonWeb();
    }

    // Web版起動時、URLフラグメントに auth_token が含まれる場合（Apple form_post callbackからの中継後）保存して除去する
    (function _consumeAppleAuthTokenFromHash() {
      if (_isCapacitorApp) return;
      const hash = window.location.hash || '';
      const m = hash.match(/auth_token=([^&]+)/);
      if (!m) return;
      setAuthToken(decodeURIComponent(m[1]));
      history.replaceState(null, '', window.location.pathname + window.location.search);
    })();

    function initSettingsGenres() {
      const container = document.getElementById('genre-chips-container');
      if (!container) return;
      const selected = new Set(getGenreList());
      const isEn = getLang() === 'en';
      container.innerHTML = GENRE_LIST.map(g => `
        <button class="genre-chip${selected.has(g.id) ? ' selected' : ''}"
          data-genre="${g.id}"
          onclick="toggleGenre('${g.id}')">${g.emoji} ${isEn ? g.labelEn : g.label}</button>
      `).join('');
      _syncGenreStatusBadge();
    }

    function toggleGenrePanel() {
      const panel = document.getElementById('genre-panel');
      if (!panel) return;
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      const arrow = document.getElementById('genre-status-arrow');
      if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
    }

    function _syncGenreStatusBadge() {
      const label = document.getElementById('genre-status-label');
      if (!label) return;
      const count = getGenreList().length;
      label.textContent = count === 0 ? t('genreStatusUnset') : t('genreStatusSet').replace('{n}', count);
    }

    function _syncRecommendChip() {
      // ジャンル未設定時は「おすすめ」チップ自体を非表示にする（設定済みなら表示）
      const hasGenres = getGenreList().length > 0;
      const recommendChip = document.querySelector('#filter-row-category .filter-chip[data-cat="recommend"]');
      if (recommendChip) recommendChip.style.display = hasGenres ? '' : 'none';
      // おすすめモードON中にジャンルが0件になった場合は強制的にモードを解除して再描画する
      if (!hasGenres && _recommendModeActive) {
        _recommendModeActive = false;
        if (typeof renderEventCards === 'function') renderEventCards();
      }
      _syncCatChips();
      _syncGenreStatusBadge();
    }

    function initSettingsProfile() {
      const who = getWhoList();
      const ages = getAgeList();
      const isEn = getLang() === 'en';
      const whoMap = isEn
        ? { solo: 'Solo', couple: 'Couple', family: 'Family', group: 'Group' }
        : { solo: 'ひとりで', couple: '夫婦・カップル', family: 'ファミリー', group: 'グループ' };
      const ageMap = isEn
        ? { baby: '0–2 yrs', preschool: '3–6 yrs', school: 'School age+' }
        : { baby: '0〜2歳', preschool: '3〜6歳', school: '小学生以上' };

      ['solo', 'couple', 'family', 'group'].forEach(w => {
        const dot = document.getElementById('who-dot-' + w);
        if (!dot) return;
        dot.classList.toggle('active', who.includes(w));
        dot.textContent = who.includes(w) ? '✓' : '';
      });

      const ageSection = document.getElementById('settings-age-section');
      if (ageSection) ageSection.style.display = who.includes('family') ? '' : 'none';

      ['baby', 'preschool', 'school'].forEach(a => {
        const dot = document.getElementById('age-dot-' + a);
        if (!dot) return;
        dot.classList.toggle('active', ages.includes(a));
        dot.textContent = ages.includes(a) ? '✓' : '';
      });

      // サマリー表示
      const labelEl = document.getElementById('settings-who-label');
      if (labelEl) {
        let parts = who.map(w => whoMap[w]).filter(Boolean);
        if (who.includes('family') && ages.length) {
          const ageLabel = ageMap[ages[0]];
          if (ageLabel) {
            parts = parts.filter(p => p !== whoMap['family']);
            parts.push(isEn ? `Family (${ageLabel})` : `ファミリー（${ageLabel}）`);
          }
        }
        labelEl.textContent = parts.length ? parts.join(isEn ? ', ' : '・') : t('genreStatusUnset');
      }
    }

    function getProfile() {
      const ages = getAgeList();
      return {
        who: getWhoList(),
        ages,
        age: ages[0] || localStorage.getItem('app_age') || localStorage.getItem('sg_age') || 'all',
      };
    }


    function toggleAvatarPicker() {
      const picker = document.getElementById('avatar-picker');
      picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    }

    function selectAvatar(emoji) {
      localStorage.setItem('user_avatar', emoji);
      document.getElementById('avatar-preview').textContent = emoji;
      document.querySelectorAll('.avatar-chip').forEach(b => {
        b.classList.toggle('selected', b.dataset.emoji === emoji);
      });
      document.getElementById('avatar-picker').style.display = 'none';
      _syncBackupToServer();
    }

    function getUserAvatar() {
      return localStorage.getItem('user_avatar') || '🙂';
    }

    function initProfileChips() {
      const savedName = localStorage.getItem('user_name');
      const input = document.getElementById('nickname-input');
      if (input && savedName) input.value = savedName;
      const savedAvatar = getUserAvatar();
      const preview = document.getElementById('avatar-preview');
      if (preview) preview.textContent = savedAvatar;
      document.querySelectorAll('.avatar-chip').forEach(b => {
        b.classList.toggle('selected', b.dataset.emoji === savedAvatar);
      });
    }

    // プロフィールに基づいてカードをソート
    function applyProfileSort() {
      const { who, age } = getProfile();
      const grid = document.getElementById('cards-grid');
      const cards = Array.from(grid.querySelectorAll('.spot-card'));

      cards.sort((a, b) => {
        const scoreA = profileScore(a, who, age);
        const scoreB = profileScore(b, who, age);
        return scoreB - scoreA;
      });
      cards.forEach(c => grid.appendChild(c));
      applyFilters();
    }

    function profileScore(card, who, age) {
      let score = 0;
      const cardAge = card.dataset.age;
      const cardWho = card.dataset.who || 'family';

      // 誰と行くか（空＝指定なし＝全マッチ）
      if (who.length === 0) score += 1;
      else if (who.includes(cardWho)) score += 3;
      else if (cardWho === 'all') score += 1;

      // 年齢（ファミリー選択中 or 未指定の場合）
      if (who.length === 0 || who.includes('family')) {
        if (age !== 'all' && cardAge === age) score += 2;
        if (age === 'all') score += 1;
      }

      return score;
    }

    // ─── AREA SETTING ───
    const AREAS = ['Central', 'East', 'West', 'North', 'North-East'];

    initProfileChips();
    applyProfileSort();
    applyI18n();
    updateCityUI();
    applyTheme();

    async function doShare() {
      const cityMeta = CITY_META[getCity()] || CITY_META.sg;
      const data = {
        title: 'おでかけNavi',
        text: `${cityMeta.subtitleJa}！週末どうする？はここで決まる👇`,
        url: 'https://apps.apple.com/app/id6787159354',
      };
      if (navigator.share) {
        try { await navigator.share(data); } catch(e) {}
      } else {
        await navigator.clipboard.writeText(data.url);
        showToast(t('toastUrlCopied'));
      }
    }

    async function sendFeedback() {
      const text = document.getElementById('feedback-text').value.trim();
      if (!text) { showToast(t('toastFeedbackEmpty')); return; }
      try {
        const res = await fetch(API_BASE + '/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        if (res.ok) {
          document.getElementById('feedback-text').value = '';
          showToast(t('toastFeedbackSent'));
        } else {
          showToast(t('toastFeedbackError'));
        }
      } catch(e) {
        showToast(t('toastFeedbackNetError'));
      }
    }

    // ─── PUSH NOTIFICATIONS（Web版） ───
    let _pushSubscription = null;

    // Web版・iOS版共通: 現在プッシュ通知が有効かどうか（グループ通知登録の可否判定に使用）
    function _hasActivePushSub() {
      return _isCapacitorApp ? !!_nativeDeviceToken : !!_pushSubscription;
    }

    // Web版・iOS版共通: 「通知をオンにしましょう」プロンプトを表示すべきか
    // （iOS版は `Notification`（Web API）がWKWebView上で信頼できないため、ネイティブプラグインの許可状態を使う）
    function _shouldShowPushPrompt() {
      if (_isCapacitorApp) return !_nativeDeviceToken && !!_getCapPushPlugin() && !_nativePushDenied;
      return !_pushSubscription && 'PushManager' in window && Notification.permission !== 'denied';
    }

    function _urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    async function initPushState() {
      const item = document.getElementById('push-setting-item');
      if (!item) return;
      if (_isCapacitorApp) { await _initNativePush(); return; }
      if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
        item.style.display = 'none';
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        _pushSubscription = await reg.pushManager.getSubscription();
      } catch(e) {}
      _updatePushBtn();
    }

    function _updatePushBtn() {
      const btn = document.getElementById('push-toggle-btn');
      if (!btn) return;
      const denied = _isCapacitorApp ? _nativePushDenied : Notification.permission === 'denied';
      const on = _isCapacitorApp ? !!_nativeDeviceToken : !!_pushSubscription;
      btn.textContent = denied ? t('pushDenied') : on ? t('pushOn') : t('pushOff');
    }

    async function togglePush() {
      if (_isCapacitorApp) { await _toggleNativePush(); return; }
      if (!('PushManager' in window)) { showToast(t('toastPushError')); return; }
      if (Notification.permission === 'denied') { showToast(t('toastPushDenied')); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const gid = getSharedGroupId();
        if (_pushSubscription) {
          if (gid) await _deregisterGroupPush(gid);
          await _pushSubscription.unsubscribe();
          await fetch(API_BASE + '/api/push-subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: _pushSubscription.endpoint }),
          });
          _pushSubscription = null;
          showToast(t('toastPushOff'));
        } else {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') { _updatePushBtn(); showToast(t('toastPushDenied')); return; }
          const res = await fetch(API_BASE + '/api/vapid-public-key');
          const { publicKey } = await res.json();
          _pushSubscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array(publicKey),
          });
          await fetch(API_BASE + '/api/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: _pushSubscription }),
          });
          if (gid) await _registerGroupPush(gid);
          showToast(t('toastPushOn'));
        }
      } catch(e) {
        showToast(t('toastPushError'));
      }
      _updatePushBtn();
    }

    async function enablePushForCalendar() {
      await togglePush();
      if (getSharedGroupId()) renderCalSyncModal();
    }

    // ─── PUSH NOTIFICATIONS（iOSアプリ/Capacitor版・APNs） ───
    // Web版のtogglePush()（Promiseベース、PushManager経由）とは別に、
    // @capacitor/push-notificationsはコールバック/イベント形式のため独立実装する
    // （_nativeDeviceToken／_nativePushDenied／_CapPush の宣言は起動時参照のTDZ回避のため
    //  上部のAUTHブロック直後へ移動済み・設計書50/51）
    function _getCapPushPlugin() {
      if (_CapPush) return _CapPush;
      try {
        if (window.Capacitor?.registerPlugin) {
          _CapPush = window.Capacitor.registerPlugin('PushNotifications');
        }
      } catch (_) {}
      if (!_CapPush) _CapPush = window.Capacitor?.Plugins?.PushNotifications;
      return _CapPush;
    }

    let _nativePushListenersBound = false;
    let _nativePushRegisterIntent = null; // 'init' | 'toggle-on' | null（registrationイベント発火時にどちらの操作起因かを判別）
    // ユーザーがアプリ内トグルで表明したON/OFF意思を永続化（OS許可granted/deniedとは別軸。設計書52）。
    // localStorage＋Preferences（_CapPrefs）ハイブリッド。起動時_initNativePush()がこれを見てregister要否を決める。
    function _setPushIntent(enabled) {
      try { localStorage.setItem('app_push_enabled', enabled ? 'true' : 'false'); } catch (_) {}
      if (_CapPrefs) _CapPrefs.set({ key: 'app_push_enabled', value: enabled ? 'true' : 'false' }).catch(() => {});
    }
    function _bindNativePushListenersOnce(plugin) {
      if (_nativePushListenersBound) return;
      _nativePushListenersBound = true;
      plugin.addListener('registration', (token) => {
        _sendDebugLog('push_registration_event', { tokenLength: token?.value?.length });
        _nativeDeviceToken = token.value;
        _nativePushDenied = false;
        localStorage.setItem('app_ios_push_token', token.value);
        // Preferences（ネイティブ永続領域）へもミラー保存（localStorage揮発対策・設計書50）
        if (_CapPrefs) _CapPrefs.set({ key: 'app_ios_push_token', value: token.value }).catch(() => {});
        _setPushIntent(true); // ON確定の共通合流点（toggle-on/init両方をカバー・設計書52）
        _registerNativePushToken(token.value);
        if (_nativePushRegisterIntent === 'toggle-on') {
          const gid = getSharedGroupId();
          if (gid) _registerGroupPush(gid);
          showToast(t('toastPushOn'));
        }
        _nativePushRegisterIntent = null;
        _updatePushBtn();
      });
      plugin.addListener('registrationError', (error) => {
        _sendDebugLog('push_registration_error_event', { err: JSON.stringify(error) });
        if (_nativePushRegisterIntent === 'toggle-on') showToast(t('toastPushError'));
        _nativePushRegisterIntent = null;
        _updatePushBtn();
      });
      // 通知タップでアプリが起動/フォアグラウンド化した際の遷移（共有カレンダー通知なら参加ダイアログ、それ以外はトップ画面へ）
      plugin.addListener('pushNotificationActionPerformed', (action) => {
        try {
          const url = action?.notification?.data?.url;
          if (url) {
            const u = new URL(url, 'https://dosuru.app');
            const joinId = u.searchParams.get('join');
            if (joinId && /^[A-Z2-9]{6}$/.test(joinId)) {
              _pendingJoinGroupId = joinId;
              _pendingJoinKey = u.hash.replace('#', '') || null;
              const desc = document.getElementById('cal-join-desc');
              if (desc) desc.innerHTML = `グループ <strong>${joinId}</strong> に参加しますか？<br><br>現在の予定データと統合されます。`;
              document.getElementById('cal-join-overlay').classList.add('visible');
              document.getElementById('cal-join-modal').classList.add('visible');
            }
          }
        } catch (e) {}
        switchNav('home');
      });
    }

    async function _initNativePush() {
      const item = document.getElementById('push-setting-item');
      const plugin = _getCapPushPlugin();
      // ユーザーのON/OFF意思フラグを復元（Preferences優先→localStorageフォールバック。逐次await・設計書52）。
      // トークン復元より前に読む（OFF意思なら復元・register自体を抑止するため）。
      let pushIntent = null; // 'true' | 'false' | null（未設定）
      if (_CapPrefs) {
        try {
          const ri = await _CapPrefs.get({ key: 'app_push_enabled' });
          pushIntent = (ri && typeof ri.value === 'string') ? ri.value : null;
        } catch (_) {}
      }
      if (pushIntent === null) { try { pushIntent = localStorage.getItem('app_push_enabled'); } catch (_) {} }
      // Preferencesからトークン復元（localStorage揮発対策、設計書49と同型・設計書50）。
      // ただしOFF意思（pushIntent==='false'）なら復元しない（起動時にON表示へ戻さない・設計書52）。
      if (pushIntent !== 'false' && _CapPrefs) {
        try {
          const r = await _CapPrefs.get({ key: 'app_ios_push_token' });
          const prefsToken = (r && typeof r.value === 'string' && r.value) ? r.value : null;
          if (prefsToken) {
            _nativeDeviceToken = prefsToken;
            try { localStorage.setItem('app_ios_push_token', prefsToken); } catch (_) {}
          } else if (_nativeDeviceToken) {
            // Preferencesに無くlocalStorageにある場合（旧バージョンからの移行）はPreferencesへ書き込む
            _CapPrefs.set({ key: 'app_ios_push_token', value: _nativeDeviceToken }).catch(() => {});
          }
        } catch (_) {}
      }
      _sendDebugLog('push_init_start', { pluginExists: !!plugin, hasToken: !!_nativeDeviceToken, intent: pushIntent }); // 一時計装（原因確定後に削除）
      _updatePushBtn(); // 復元したトークンでON表示を即反映（プラグイン未取得でも維持）
      if (!plugin) { if (item) item.style.display = 'none'; return; }
      _bindNativePushListenersOnce(plugin);
      try {
        const permStatus = await plugin.checkPermissions();
        _sendDebugLog('push_init_perm', { perm: permStatus.receive }); // 一時計装（原因確定後に削除）
        _nativePushDenied = permStatus.receive === 'denied';
        // OS許可granted かつ ユーザーがONを望んでいる場合のみ register()（設計書52）。
        // 後方互換: 意思フラグ未設定（null）でもトークンがあれば以前ONとみなす。
        const wantOn = (pushIntent === 'true') || (pushIntent === null && !!_nativeDeviceToken);
        if (permStatus.receive === 'granted' && wantOn) {
          _nativePushRegisterIntent = 'init';
          _sendDebugLog('push_init_register_call', {}); // 一時計装（原因確定後に削除）
          await plugin.register();
        } else {
          // 未許可 or 拒否済み or OFF意思。起動時registerせず、OFF表示に統一
          _nativeDeviceToken = null;
        }
      } catch (e) { _sendDebugLog('push_init_exception', { err: String(e) }); } // 一時計装（原因確定後に削除）
      _updatePushBtn();
    }

    async function _toggleNativePush() {
      const plugin = _getCapPushPlugin();
      _sendDebugLog('push_toggle_start', { hasToken: !!_nativeDeviceToken, pluginExists: !!plugin });
      if (!plugin) { showToast(t('toastPushError')); return; }
      _bindNativePushListenersOnce(plugin);
      try {
        if (_nativeDeviceToken) {
          const gid = getSharedGroupId();
          if (gid) await _deregisterGroupPush(gid);
          await _deregisterNativePushToken(_nativeDeviceToken);
          _nativeDeviceToken = null;
          localStorage.removeItem('app_ios_push_token');
          if (_CapPrefs) _CapPrefs.remove({ key: 'app_ios_push_token' }).catch(() => {}); // Preferencesからも削除（設計書50）
          _setPushIntent(false); // OFF意思を永続化。起動時自己回復で勝手にON表示に戻るのを防ぐ（設計書52）
          showToast(t('toastPushOff'));
        } else {
          const permStatus = await plugin.checkPermissions();
          let perm = permStatus.receive;
          if (perm !== 'granted') {
            const req = await plugin.requestPermissions();
            perm = req.receive;
          }
          _sendDebugLog('push_perm_result', { perm });
          _nativePushDenied = perm === 'denied';
          if (perm !== 'granted') { showToast(t('toastPushDenied')); _updatePushBtn(); return; }
          _nativePushRegisterIntent = 'toggle-on';
          _sendDebugLog('push_register_call', {});
          await plugin.register();
        }
      } catch (e) {
        _sendDebugLog('push_toggle_exception', { err: String(e) });
        showToast(t('toastPushError'));
      }
      _updatePushBtn();
    }

    async function _registerNativePushToken(deviceToken) {
      try {
        await fetch(API_BASE + '/api/push-subscribe-ios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceToken }),
        });
      } catch (e) {}
    }

    async function _deregisterNativePushToken(deviceToken) {
      try {
        await fetch(API_BASE + '/api/push-subscribe-ios', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceToken }),
        });
      } catch (e) {}
    }

    // ─── NAV LOGIC ───
    function closeAllPopups() {
      closeCalPopup();
      closePinDetail();
      closePinPicker();
      closeEmojiPicker();
      closeScheduleActionSheet();
      closeEventFilterSheet();
      closeCourseDetail();
      closeCourseSheet();
      closeDatePickerSheet();
      closePlanModal();
      const detail = document.getElementById('detail-screen');
      if (detail) detail.classList.remove('visible');
    }

    const FAB_HIDDEN_SCREENS = new Set(['plan', 'settings', 'course']);

    let _loadedCity = getCity();

    function switchNav(screen) {
      // 画面遷移直前にフォーカスが残っていれば無条件で外す（モーダル閉じ忘れ等でinput/textareaに
      // フォーカスが残ったまま遷移すると、iOS WKWebViewでボトムナビのタップが効かなくなる不具合の対策。2026-07-11）
      if (document.activeElement && document.activeElement !== document.body && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      closeAllPopups();
      ['home','course','plan','settings'].forEach(s => {
        document.getElementById('nav-' + s).classList.remove('active');
        const el = document.getElementById('screen-' + s);
        if (el) {
          el.classList.remove('visible');
          el.style.display = 'none';
        }
      });
      document.getElementById('nav-' + screen).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'instant' });

      const hideFabs = FAB_HIDDEN_SCREENS.has(screen);
      document.getElementById('fab-top').style.display = hideFabs ? 'none' : '';
      // スクロールトップは scrollY リセット後なので非表示に戻す
      document.getElementById('fab-top').classList.remove('visible');
      const fabPlanGroup = document.getElementById('fab-plan-group');
      if (fabPlanGroup) {
        fabPlanGroup.classList.toggle('visible', screen === 'plan');
        if (screen !== 'plan') fabPlanGroup.classList.remove('open');
      }

      const cityChanged = getCity() !== _loadedCity;
      const appHeader = document.querySelector('.app-header');
      if (screen === 'home') {
        document.getElementById('screen-home').style.display = 'flex';
        if (appHeader) appHeader.style.display = 'block';
        filterCats.clear();
        _recommendModeActive = false;
        _syncCatChips();
        _syncRecommendChip();
        // チップ行を左端にスクロール
        const chipRow = document.getElementById('filter-row-category');
        if (chipRow) chipRow.scrollLeft = 0;
        // イベント一覧自体は#home-scroll-contentが内部スクロールしているため、window.scrollTo（上のline 2666）は効かない
        document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
        if (cityChanged) { _loadedCity = getCity(); loadEventData(); }
        else { renderEventCards(); }
      } else {
        document.getElementById('screen-home').style.display = 'none';
        if (appHeader) appHeader.style.display = 'none';
        const el = document.getElementById('screen-' + screen);
        if (el) {
          el.style.display = 'flex';
          el.classList.add('visible');
        }
        if (screen === 'plan') {
          renderScheduleTab();
          if (getSharedGroupId()) fetchFromServer().then(ok => { if (ok) renderScheduleTab(); });
        }
        if (screen === 'course') {
          const csc = document.querySelector('#screen-course .screen-content');
          if (csc) csc.scrollTop = 0;
          initCourseScreen();
        }
        if (screen === 'settings') {
          initSettingsProfile();
          initSettingsGenres();
          renderBackupSection();
          checkExistingBackupOnOpen();
        }
      }
    }

    // ─── COURSE FEATURE ───

    let currentCourseTab = 'popular';
    let currentGeneratedCourse = null;
    const LOADING_MSGS = [
      'スポットを探しています...',
      'ルートを組み立てています...',
      'グルメ情報をチェック中...',
      'コースが完成しました！'
    ];

    // コース画面初期化
    const COURSE_TABS = ['everyone', 'mylist'];
    let _courseSwipeStartX = 0;

    async function initCourseScreen() {
      // 設計書72: ボトムナビ「コース」タップ経由の新規進入時のみ一覧表示にリセットする（画面内タブ切り替えではリセットしない）
      _stampViewMode = 'list';
      // 設計書71: スタンプラリーがメイン機能という位置づけのため、初期表示タブをスタンプマップに変更
      await switchCourseTab('map');

      // スワイプでタブ切り替え（初回のみ登録）
      const sc = document.querySelector('#screen-course .screen-content');
      if (sc && !sc._swipeInit) {
        sc._swipeInit = true;
        let _courseSwipeOnHScroll = false;
        sc.addEventListener('touchstart', e => {
          _courseSwipeStartX = e.touches[0].clientX;
          _courseSwipeOnHScroll = !!e.target.closest('#course-everyone-carousel');
        }, { passive: true });
      }

      // Pull to Refresh（設計書19、初回のみ登録。iOS版のみ有効化。
      // コース画面には横スワイプ機構が存在しないため watchSwipeIntent=false で単独判定。
      // スタンプマップタブでは地図操作とPTRが競合するため、そのタブの間はリフレッシュ処理自体を何もしない（設計書69）
      _initPtr(sc, 'ptr-indicator-course', async () => {
        if (currentCourseTab === 'map') return;
        await switchCourseTab(currentCourseTab);
      }, false);
    }

    // タブ切り替え
    async function switchCourseTab(tab) {
      currentCourseTab = tab;
      document.querySelectorAll('.course-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tab));

      const city = getCity();

      // 既存2タブ（コース一覧）とスタンプマップは表示領域自体が別（副作用ゼロの追加分岐、設計書69）
      const courseListEl = document.getElementById('course-list');
      const stampMapViewEl = document.getElementById('stamp-map-view');
      const courseFabEl = document.getElementById('course-fab');
      if (tab === 'map') {
        if (courseListEl) courseListEl.style.display = 'none';
        if (stampMapViewEl) stampMapViewEl.style.display = 'block';
        if (courseFabEl) courseFabEl.style.display = 'none';
        await initStampMapTab();
        return;
      } else {
        if (courseListEl) courseListEl.style.display = 'flex';
        if (stampMapViewEl) stampMapViewEl.style.display = 'none';
        if (courseFabEl) courseFabEl.style.display = '';
      }

      if (tab === 'mylist') {
        const courses = JSON.parse(localStorage.getItem(city + '_my_courses') || '[]');
        // 作成日が古い順（一番上が最初に作ったコース）
        const sorted = [...courses].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        renderCourseList(sorted, false, true);
        return;
      }

      try {
        if (tab === 'everyone') {
          const [popRes, comRes] = await Promise.all([
            fetch(API_BASE + `/api/courses?city=${city}&tab=popular`),
            fetch(API_BASE + `/api/courses?city=${city}&tab=community`)
          ]);
          const [popular, community] = await Promise.all([popRes.json(), comRes.json()]);
          renderEveryoneTab(popular, community);
        }
      } catch(e) {
        document.getElementById('course-list').innerHTML =
          `<div style="text-align:center;padding:40px;color:var(--warm-gray);">${t('courseEmpty')}</div>`;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // スタンプラリー機能（設計書69）
    // 既存コース機能（community-courses.json等）とはデータ・ロジックとも完全に独立。
    // コースタブ「スタンプマップ」の入口のみ共有する。
    // ═══════════════════════════════════════════════════════════
    const STAMP_LEVEL_META = {
      standard: { labelKey: 'stampLevelStandard', color: '#C8804A', emoji: '📍' },
      local:    { labelKey: 'stampLevelLocal',     color: '#7A9B6E', emoji: '🏘' },
      niche:    { labelKey: 'stampLevelNiche',      color: '#9370B0', emoji: '🔎' },
      special:  { labelKey: 'stampLevelSpecial',    color: '#C4705A', emoji: '✨' },
    };

    let _stampLeafletMap = null;
    let _stampMarkersLayer = null;
    let _stampSpots = [];
    let _stampProgress = { checkedInSpotIds: [], unlockedLevels: ['standard'] };
    let _stampCurrentPos = null; // { lat, lng } 直近の現在地取得結果
    let _stampSelectedSpot = null;
    let _stampMapInitialized = false;
    let _stampLocationWatchStarted = false;
    let _stampViewMode = 'list'; // 'map' | 'list'（設計書71改善3、ユーザーフィードバックによりデフォルトをリスト表示に変更。地図はトグルボタンで切替）

    // Capacitor Geolocationプラグイン取得（registerPlugin優先→Pluginsフォールバック、既存Keyboard/PushNotificationsと同じ防御的パターン）
    let _CapGeo = null;
    function _getCapGeoPlugin() {
      if (_CapGeo) return _CapGeo;
      try {
        if (window.Capacitor?.registerPlugin) {
          _CapGeo = window.Capacitor.registerPlugin('Geolocation');
        }
      } catch (_) {}
      if (!_CapGeo) _CapGeo = window.Capacitor?.Plugins?.Geolocation;
      return _CapGeo;
    }

    // 現在地を1回取得する共通ヘルパー（iOS版はCapacitorプラグイン、Web版はnavigator.geolocationにフォールバック）
    // 権限拒否・取得失敗時は null を返す（例外を投げない）
    async function _getCurrentPositionOnce() {
      try {
        if (_isCapacitorApp) {
          const plugin = _getCapGeoPlugin();
          if (!plugin?.getCurrentPosition) return null;
          const pos = await plugin.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
          return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } else {
          if (!navigator.geolocation) return null;
          return await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 10000 }
            );
          });
        }
      } catch (_) {
        return null;
      }
    }

    // Haversine距離（メートル）
    function _haversineDistanceM(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const toRad = (d) => d * Math.PI / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // コースタブ「スタンプマップ」表示時のエントリポイント
    async function initStampMapTab() {
      const loginEl = document.getElementById('stamp-map-login-required');
      const contentEl = document.getElementById('stamp-map-content');
      if (!getAuthToken()) {
        if (loginEl) loginEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        return;
      }
      if (loginEl) loginEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';

      await _loadStampSpotsAndProgress();
      _applyStampViewMode();
      _ensureStampLeafletMap();
      _renderStampMarkers();
      _renderStampFog();
      _renderStampLevelLegend();
      _renderStampProgressSummary();
      _renderStampCollectionList();

      // 現在地を取得しておく（詳細シートを開いた際のチェックインボタン活性判定に使う）。
      // 権限リクエストのタイミングはマップタブオープン時に一括で行う設計（実装判断、設計書69未解決事項8）
      _getCurrentPositionOnce().then(pos => { _stampCurrentPos = pos; });
    }

    // ─── マップ⇄一覧 表示切り替え（設計書70改善1） ───
    // マップは一度初期化したLeafletインスタンスを破棄せず display:none にするのみ（既存の
    // 「タブ切替でdisplay:noneから復帰した直後はコンテナサイズが正しく取得できない」注意点を踏襲し、
    // 一覧⇄マップ切り替え時も invalidateSize() を呼ぶ）
    function toggleStampViewMode() {
      _stampViewMode = _stampViewMode === 'map' ? 'list' : 'map';
      _applyStampViewMode();
      if (_stampViewMode === 'map') {
        setTimeout(() => { _stampLeafletMap && _stampLeafletMap.invalidateSize(); }, 60);
      }
    }

    function _applyStampViewMode() {
      const mapEl = document.getElementById('stamp-map-view-inner');
      const legendEl = document.getElementById('stamp-level-legend');
      const listEl = document.getElementById('stamp-collection-list');
      const toggleBtn = document.getElementById('stamp-view-toggle-btn');
      const isMap = _stampViewMode === 'map';
      if (mapEl) mapEl.style.display = isMap ? 'block' : 'none';
      if (legendEl) legendEl.style.display = isMap ? 'flex' : 'none';
      if (listEl) listEl.style.display = isMap ? 'none' : 'block';
      if (toggleBtn) toggleBtn.textContent = t(isMap ? 'stampViewToggleList' : 'stampViewToggleMap');
    }

    // ─── 「次はここ」判定（設計書70改善2） ───
    // 解禁済みレベルを STAMP_LEVEL_ORDER_CLIENT の順に見ていき、そのレベル内で order 最小から
    // 順に未チェックのスポットを探索し、最初に見つかったものを「次に狙うべきスポット」とする。
    // 全解禁済みレベルを制覇済みの場合は null を返す（コンプリート状態、今回は特別演出なしの最小対応）
    function _computeStampNextTarget() {
      for (const level of STAMP_LEVEL_ORDER_CLIENT) {
        if (!_stampProgress.unlockedLevels.includes(level)) continue;
        const spotsInLevel = _stampSpots
          .filter(s => s.level === level)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const next = spotsInLevel.find(s => !_stampSpotIsChecked(s.id));
        if (next) return next;
      }
      return null;
    }

    async function _loadStampSpotsAndProgress() {
      try {
        const city = getCity();
        const [spotsRes, progressRes] = await Promise.all([
          fetch(API_BASE + `/api/stamp-spots?city=${city}`),
          authedFetch(API_BASE + `/api/stamp-progress/me?city=${city}`),
        ]);
        const spotsData = await spotsRes.json();
        _stampSpots = Array.isArray(spotsData.spots) ? spotsData.spots : [];
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          _stampProgress = {
            checkedInSpotIds: progressData.checkedInSpotIds || [],
            unlockedLevels: progressData.unlockedLevels || ['standard'],
          };
        }
      } catch (_) {
        _stampSpots = [];
      }
    }

    // Leafletマップの初期化（初回のみ、以降はinvalidateSize()のみ呼ぶ。設計書69未解決事項4への実装判断）
    function _ensureStampLeafletMap() {
      const mapEl = document.getElementById('stamp-leaflet-map');
      if (!mapEl || typeof L === 'undefined') return;
      if (!_stampLeafletMap) {
        _stampLeafletMap = L.map(mapEl, { zoomControl: true, attributionControl: true })
          .setView([1.3521, 103.8198], 12); // シンガポール中心
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(_stampLeafletMap);
        _stampMarkersLayer = L.layerGroup().addTo(_stampLeafletMap);
        _stampMapInitialized = true;
      }
      // タブ切替でdisplay:noneから復帰した直後はコンテナサイズが正しく取得できないことがあるため、
      // 描画完了後に再計算させる
      setTimeout(() => { _stampLeafletMap && _stampLeafletMap.invalidateSize(); }, 60);
    }

    function _stampSpotIsChecked(spotId) {
      return _stampProgress.checkedInSpotIds.includes(spotId);
    }

    function _renderStampMarkers() {
      if (!_stampMarkersLayer) return;
      _stampMarkersLayer.clearLayers();
      const nextTarget = _computeStampNextTarget();
      _stampSpots.forEach(spot => {
        const checked = _stampSpotIsChecked(spot.id);
        const isNext = !!nextTarget && nextTarget.id === spot.id;
        const meta = STAMP_LEVEL_META[spot.level] || STAMP_LEVEL_META.standard;
        const badgeHtml = (typeof spot.order === 'number')
          ? `<div class="stamp-marker-badge">${spot.order}</div>`
          : '';
        const icon = L.divIcon({
          className: '',
          html: `<div class="stamp-marker-icon ${checked ? 'stamp-marker-icon--checked' : 'stamp-marker-icon--unchecked'} ${isNext ? 'stamp-marker-icon--next' : ''}" style="position:relative;"><span>${meta.emoji}</span>${badgeHtml}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        });
        const marker = L.marker([spot.lat, spot.lng], { icon }).addTo(_stampMarkersLayer);
        marker.on('click', () => openStampSpotDetail(spot.id));
      });
    }

    // フォグ・オブ・ウォー: チェックイン済みスポット周辺だけ霧を透明にする穴を開ける。
    // mask-image/mask-composite（ブラウザ間の挙動差・iOS WKWebView実機での動作が未検証でリスクが高い）は使わず、
    // 各穴をradial-gradientの「不透明→透明」のグラデーションをそのままbackgroundに複数枚重ねる、
    // より枯れたシンプルな方式にする（設計書69未解決事項5への実装判断）。
    // 霧本体の色（rgba(44,36,32,0.55)）を土台に、穴の部分だけ同じ色→透明のグラデーションを上書き合成する。
    function _renderStampFog() {
      const fogEl = document.getElementById('stamp-fog-overlay');
      if (!fogEl || !_stampLeafletMap) return;
      const FOG_COLOR = '44,36,32';
      const checkedSpots = _stampSpots.filter(s => _stampSpotIsChecked(s.id));
      if (!checkedSpots.length) {
        fogEl.style.background = `rgba(${FOG_COLOR},0.55)`;
        return;
      }
      const holes = checkedSpots.map(spot => {
        const pt = _stampLeafletMap.latLngToContainerPoint([spot.lat, spot.lng]);
        return `radial-gradient(circle 90px at ${pt.x}px ${pt.y}px, transparent 0%, transparent 55%, rgba(${FOG_COLOR},0.55) 100%)`;
      });
      // 穴のグラデーションを手前に重ね、一番奥に霧の地色を敷く
      fogEl.style.background = `${holes.join(', ')}, rgba(${FOG_COLOR},0.55)`;
    }

    function _renderStampLevelLegend() {
      const el = document.getElementById('stamp-level-legend');
      if (!el) return;
      el.innerHTML = STAMP_LEVEL_ORDER_CLIENT.map(level => {
        const meta = STAMP_LEVEL_META[level];
        const unlocked = _stampProgress.unlockedLevels.includes(level);
        return `<div class="stamp-level-chip ${unlocked ? '' : 'stamp-level-chip--locked'}">
          <span class="stamp-level-chip-dot" style="background:${meta.color};"></span>
          ${meta.emoji} ${t(meta.labelKey)}${unlocked ? '' : ' 🔒'}
        </div>`;
      }).join('');
    }
    const STAMP_LEVEL_ORDER_CLIENT = ['standard', 'local', 'niche', 'special'];

    function _renderStampProgressSummary() {
      const el = document.getElementById('stamp-progress-summary');
      if (!el) return;
      const checked = _stampProgress.checkedInSpotIds.length;
      const total = _stampSpots.length;
      const unlockedCount = _stampProgress.unlockedLevels.length;
      el.textContent = t('stampProgressSummary')
        .replace('{unlocked}', String(unlockedCount))
        .replace('{checked}', String(checked))
        .replace('{total}', String(total));
    }

    // ─── コレクション一覧ビュー（設計書70改善1・2） ───
    // レベルごとにグルーピングし、各グループ内は order 昇順で表示。番号バッジ・「次はここ」ハイライトを併記する。
    // special レベルは既存サーバー仕様（未解禁時は GET /api/stamp-spots のレスポンス自体から除外）をそのまま踏襲するため、
    // フロント側で追加のフィルタ処理は不要（_stampSpots に含まれているものだけを描画すれば良い）
    function _renderStampCollectionList() {
      const el = document.getElementById('stamp-collection-list');
      if (!el) return;
      const nextTarget = _computeStampNextTarget();
      const lang = getLang();

      const groups = STAMP_LEVEL_ORDER_CLIENT
        .map(level => ({ level, spots: _stampSpots.filter(s => s.level === level) }))
        .filter(g => g.spots.length > 0);

      el.innerHTML = groups.map(({ level, spots }) => {
        const meta = STAMP_LEVEL_META[level];
        const unlocked = _stampProgress.unlockedLevels.includes(level);
        const sorted = [...spots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const cardsHtml = sorted.map(spot => {
          const checked = _stampSpotIsChecked(spot.id);
          const isNext = unlocked && !!nextTarget && nextTarget.id === spot.id;
          const name = (lang === 'ja' ? (spot.nameJa || spot.name) : (spot.name || spot.nameJa)) || '';
          const cls = ['stamp-collection-card'];
          if (!unlocked) cls.push('stamp-collection-card--locked');
          if (checked) cls.push('stamp-collection-card--checked');
          if (isNext) cls.push('stamp-collection-card--next');
          const tagHtml = checked
            ? `<span class="stamp-collection-card-tag stamp-collection-card-tag--checked">${t('stampCheckedInBadge')}</span>`
            : isNext
              ? `<span class="stamp-collection-card-tag stamp-collection-card-tag--next">${t('stampNextTargetLabel')}</span>`
              : !unlocked ? `<span>🔒</span>` : '';
          return `<div class="${cls.join(' ')}" ${unlocked ? `onclick="openStampSpotDetail('${spot.id}')"` : ''}>
            <div class="stamp-collection-card-badge">${typeof spot.order === 'number' ? spot.order : '?'}</div>
            <div class="stamp-collection-card-body">
              <div class="stamp-collection-card-name">${name}</div>
              <div class="stamp-collection-card-area">${spot.area || ''}</div>
            </div>
            ${tagHtml}
          </div>`;
        }).join('');
        return `<div class="stamp-collection-group ${unlocked ? '' : 'stamp-collection-group--locked'}">
          <div class="stamp-collection-group-title">${meta.emoji} ${t(meta.labelKey)}${unlocked ? '' : ' 🔒 ' + t('stampCollectionLockedNote')}</div>
          ${cardsHtml}
        </div>`;
      }).join('');
    }

    // ─── スポット詳細シート ───
    function openStampSpotDetail(spotId) {
      const spot = _stampSpots.find(s => s.id === spotId);
      if (!spot) return;
      _stampSelectedSpot = spot;

      const meta = STAMP_LEVEL_META[spot.level] || STAMP_LEVEL_META.standard;
      const badgeEl = document.getElementById('stamp-spot-detail-level-badge');
      if (badgeEl) {
        badgeEl.textContent = `${meta.emoji} ${t(meta.labelKey)}`;
        badgeEl.style.background = meta.color + '22';
        badgeEl.style.color = meta.color;
      }
      const lang = getLang();
      const displayName = (lang === 'ja' ? (spot.nameJa || spot.name) : (spot.name || spot.nameJa)) || '';
      document.getElementById('stamp-spot-detail-name').textContent = displayName;
      document.getElementById('stamp-spot-detail-area').textContent = spot.area || '';
      document.getElementById('stamp-spot-detail-desc').textContent = spot.description || '';

      // 画像は他3箇所（イベントカード/コース詳細/マイコースカード）と同じ「モーダルを開くたびに
      // <img>要素を新規生成する」方式に統一（設計書75 §4-2）。静的要素へのsrc再代入方式は
      // 同一URLを連続して開いた際にload/errorイベントが発火しない既知のブラウザ挙動リスクがあった。
      const imgContainer = document.getElementById('stamp-spot-detail-image-container');
      if (imgContainer) {
        if (spot.imageUrl) {
          imgContainer.innerHTML = `<img src="${spot.imageUrl}" alt="${escapeHtml(displayName)}"
            style="width:100%;height:200px;object-fit:cover;border-radius:14px;margin-bottom:12px;display:block;">`;
          const imgEl = imgContainer.querySelector('img');
          if (imgEl) {
            imgEl.onerror = () => {
              imgEl.style.display = 'none';
            };
          }
        } else {
          imgContainer.innerHTML = '';
        }
      }

      const checked = _stampSpotIsChecked(spot.id);
      const checkedEl = document.getElementById('stamp-spot-detail-checked');
      if (checkedEl) checkedEl.style.display = checked ? 'block' : 'none';

      _updateStampCheckinButton();

      lockScroll();
      document.getElementById('stamp-spot-detail-overlay').classList.add('visible');
      document.getElementById('stamp-spot-detail-sheet').classList.add('visible');

      // シートを開いたタイミングで現在地を再取得し、距離判定を最新化する
      _getCurrentPositionOnce().then(pos => {
        _stampCurrentPos = pos;
        if (_stampSelectedSpot && _stampSelectedSpot.id === spot.id) _updateStampCheckinButton();
      });
    }

    function closeStampSpotDetail() {
      _blurIfFocusInside('stamp-spot-detail-sheet');
      unlockScroll();
      document.getElementById('stamp-spot-detail-overlay').classList.remove('visible');
      document.getElementById('stamp-spot-detail-sheet').classList.remove('visible');
      _stampSelectedSpot = null;
    }

    function _updateStampCheckinButton() {
      const btn = document.getElementById('stamp-checkin-btn');
      const distEl = document.getElementById('stamp-spot-detail-distance');
      if (!btn || !_stampSelectedSpot) return;
      const spot = _stampSelectedSpot;
      const checked = _stampSpotIsChecked(spot.id);
      const unlocked = _stampProgress.unlockedLevels.includes(spot.level);

      if (checked) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.textContent = t('stampCheckedInBadge');
        if (distEl) distEl.textContent = '';
        return;
      }
      if (!unlocked) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.textContent = t('stampCheckinBtnLocked');
        if (distEl) distEl.textContent = '';
        return;
      }
      if (!_stampCurrentPos) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.textContent = t('stampCheckinBtnNoLocation');
        if (distEl) distEl.textContent = t('stampLocationPermDenied');
        return;
      }
      const distanceM = _haversineDistanceM(_stampCurrentPos.lat, _stampCurrentPos.lng, spot.lat, spot.lng);
      const radius = spot.checkinRadiusM || 200;
      if (distEl) distEl.textContent = `📍 ${Math.round(distanceM)}m`;
      if (distanceM <= radius) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = t('stampCheckinBtnReady');
      } else {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.textContent = t('stampCheckinBtnTooFar');
      }
    }

    async function doStampCheckin() {
      if (!_stampSelectedSpot || !_stampCurrentPos) return;
      const spot = _stampSelectedSpot;
      // タッチ環境ではtouchendハンドラがボタンのdisabled状態を経由せず直接この関数を呼ぶため、
      // ここで改めて「制覇済み・未解禁・遠すぎる」の3条件を再検証する（disabled属性頼みにしない）
      if (_stampSpotIsChecked(spot.id)) return;
      if (!_stampProgress.unlockedLevels.includes(spot.level)) return;
      const distanceM = _haversineDistanceM(_stampCurrentPos.lat, _stampCurrentPos.lng, spot.lat, spot.lng);
      if (distanceM > (spot.checkinRadiusM || 200)) return;
      const btn = document.getElementById('stamp-checkin-btn');
      if (btn) btn.disabled = true;
      try {
        const city = getCity();
        const res = await authedFetch(API_BASE + `/api/stamp-progress/checkin?city=${city}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spotId: spot.id, lat: _stampCurrentPos.lat, lng: _stampCurrentPos.lng }),
        });
        if (!res.ok) throw new Error('checkin failed');
        const data = await res.json();
        const prevUnlockedCount = _stampProgress.unlockedLevels.length;
        _stampProgress = {
          checkedInSpotIds: data.checkedInSpotIds || [],
          unlockedLevels: data.unlockedLevels || _stampProgress.unlockedLevels,
        };
        showToast(t('toastStampCheckinSuccess'));
        if (_stampProgress.unlockedLevels.length > prevUnlockedCount) {
          // 新しく解禁されたレベル（複数レベルが一度に解禁されるケースは想定しないが、念のため配列末尾＝最新を採用）
          const newlyUnlockedLevel = _stampProgress.unlockedLevels[_stampProgress.unlockedLevels.length - 1];
          setTimeout(() => openStampLevelUnlockModal(newlyUnlockedLevel), 1600);
        }
        _renderStampMarkers();
        _renderStampFog();
        _renderStampLevelLegend();
        _renderStampProgressSummary();
        _renderStampCollectionList();
        const checkedEl = document.getElementById('stamp-spot-detail-checked');
        if (checkedEl) checkedEl.style.display = 'block';
        _updateStampCheckinButton();
      } catch (_) {
        showToast(t('toastStampCheckinError'));
        if (btn) btn.disabled = false;
      }
    }

    // ─── レベル解禁演出モーダル（設計書70改善3） ───
    function openStampLevelUnlockModal(level) {
      const meta = STAMP_LEVEL_META[level] || STAMP_LEVEL_META.standard;
      const emojiEl = document.getElementById('stamp-level-unlock-emoji');
      const nameEl = document.getElementById('stamp-level-unlock-name');
      if (emojiEl) {
        emojiEl.textContent = meta.emoji;
        // 同じレベルが連続で解禁演出されることは想定しないが、再生成でアニメーションを再生させる保険
        emojiEl.style.animation = 'none';
        void emojiEl.offsetWidth;
        emojiEl.style.animation = '';
      }
      if (nameEl) nameEl.textContent = t(meta.labelKey);
      lockScroll();
      document.getElementById('stamp-level-unlock-overlay').classList.add('visible');
      document.getElementById('stamp-level-unlock-modal').classList.add('visible');
    }

    function closeStampLevelUnlockModal() {
      unlockScroll();
      document.getElementById('stamp-level-unlock-overlay').classList.remove('visible');
      document.getElementById('stamp-level-unlock-modal').classList.remove('visible');
    }

    // コース一覧レンダリング
    const _rankLineColor = ['#C0903A','#9BA5B0','#B07040',null,null];
    function renderCourseList(courses, withRank = false, isOwn = false) {
      const container = document.getElementById('course-list');
      if (!courses.length) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--warm-gray);">${t('courseEmpty')}</div>`;
        return;
      }
      container.innerHTML = courses.map((c, i) => renderCourseCard(c, withRank ? i : null, isOwn)).join('');
    }

    // みんなのコースタブ レンダリング
    const WHO_JA_MAP = { family: 'ファミリー', couple: 'カップル', solo: 'ひとり', group: '友人グループ' };

    function getPersonalizedCourses(community, popular) {
      const who = (getWhoList() || [])[0];
      const whoJa = WHO_JA_MAP[who] || null;
      if (!whoJa) return { courses: popular.slice(0, 3), personalized: false };

      const scored = community.map(c => {
        const withVal = c.conditions?.with || '';
        const match = withVal === whoJa ? 3 : withVal.includes(whoJa) ? 1 : 0;
        return { c, score: match * 10 + (c.likes || 0) };
      });
      scored.sort((a, b) => b.score - a.score);
      const top6 = scored.slice(0, 6).map(s => s.c);
      return { courses: top6.length ? top6 : popular.slice(0, 3), personalized: !!whoJa };
    }

    function renderEveryoneTab(popular, community) {
      const container = document.getElementById('course-list');
      let html = '';

      // ─── 1. 人気コース（常時・いいね上位3件） ───
      if (popular.length) {
        html += `<div style="font-family:'Kaisei Opti',serif;font-size:17px;font-weight:700;
          color:var(--midnight);padding:4px 0 10px;">🏆 人気コース</div>
          <div id="course-everyone-carousel"
            style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x proximity;
              scroll-padding-left:16px;padding:0 16px 8px;box-sizing:border-box;
              width:100vw;margin-left:-16px;
              scrollbar-width:none;-webkit-overflow-scrolling:touch;">
            ${popular.slice(0, 3).map((c, i) => renderPopularCourseCard(c, i)).join('')}
            <div style="flex-shrink:0;width:16px;"></div>
          </div>`;
      }

      // ─── 2. プロフィール別おすすめ or 新着コース ───
      const whoLabel = WHO_JA_MAP[(getWhoList() || [])[0]] || null;
      const all = [...community, ...popular.filter(p => !community.find(c => c.id === p.id))];
      const { courses: personalizedCourses, personalized } = getPersonalizedCourses(all, popular);

      if (personalized && whoLabel) {
        html += `<div style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;
          color:var(--midnight);padding:20px 0 8px;">✨ ${whoLabel}向け</div>
          <div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;
            scroll-padding-left:16px;padding:0 16px 6px;box-sizing:border-box;
            width:100vw;margin-left:-16px;
            scrollbar-width:none;-webkit-overflow-scrolling:touch;">
            ${personalizedCourses.map(c => `<div style="flex-shrink:0;width:160px;scroll-snap-align:start;">${renderCompactCourseCard(c)}</div>`).join('')}
            <div style="flex-shrink:0;width:16px;"></div>
          </div>`;
      } else {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentCommunity = community.filter(c => new Date(c.createdAt) >= oneWeekAgo).slice(0, 6);
        if (recentCommunity.length) {
          html += `<div style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;
            color:var(--midnight);padding:20px 0 8px;">✨ 新着コース</div>
            <div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;
              scroll-padding-left:16px;padding:0 16px 6px;box-sizing:border-box;
              width:100vw;margin-left:-16px;
              scrollbar-width:none;-webkit-overflow-scrolling:touch;">
              ${recentCommunity.map(c => `<div style="flex-shrink:0;width:160px;scroll-snap-align:start;">${renderCompactCourseCard(c)}</div>`).join('')}
              <div style="flex-shrink:0;width:16px;"></div>
            </div>`;
        }
      }

      // ─── 3. スタイル別 ───
      {
        const styleGroups = [
          { key: '定番',   label: '👑 定番',   desc: '王道・安心定番コース' },
          { key: 'ローカル', label: '🏪 ローカル', desc: '地元民視点のコース' },
          { key: 'ニッチ',  label: '🔍 穴場',   desc: '混まない・こだわりコース' },
        ];
        for (const sec of styleGroups) {
          const filtered = community.filter(c => c.conditions?.style === sec.key);
          if (!filtered.length) continue;
          html += `
            <div style="display:flex;align-items:baseline;gap:8px;padding:20px 0 8px;">
              <div style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;color:var(--midnight);">${sec.label}</div>
              <div style="font-size:12px;color:var(--warm-gray);">${sec.desc}</div>
            </div>
            <div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;
              scroll-padding-left:16px;padding:0 16px 6px;box-sizing:border-box;
              width:100vw;margin-left:-16px;
              scrollbar-width:none;-webkit-overflow-scrolling:touch;">
              ${filtered.map(c => `<div style="flex-shrink:0;width:160px;scroll-snap-align:start;">${renderCompactCourseCard(c)}</div>`).join('')}
              <div style="flex-shrink:0;width:16px;"></div>
            </div>`;
        }
      }

      if (!html) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--warm-gray);">${t('courseEmpty')}</div>`;
        return;
      }
      container.innerHTML = html;
    }

    // 2カラム用コンパクトカード（みんなのコース・新着）
    function renderCompactCourseCard(c) {
      const liked = isLiked(c.id);
      const cond = c.conditions || {};
      const areaTag = cond.area || cond.with || cond.style || '';
      return `
        <div onclick="openCourseDetail('${c.id}')"
          style="height:240px;border-radius:12px;overflow:hidden;cursor:pointer;
                 box-shadow:0 2px 6px rgba(0,0,0,0.07);background:var(--warm-white);
                 display:flex;flex-direction:column;">
          ${c.imageUrl
            ? `<img src="${c.imageUrl}" style="width:100%;height:100px;object-fit:cover;display:block;flex-shrink:0;">`
            : `<div style="width:100%;height:100px;flex-shrink:0;background:linear-gradient(135deg,var(--caramel-pale),var(--sand));
                 display:flex;align-items:center;justify-content:center;font-size:28px;">✨</div>`
          }
          <div style="padding:8px 9px 10px;display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;">
            <div style="font-family:'Kaisei Opti',serif;font-size:14px;font-weight:700;
              line-height:1.4;overflow:hidden;display:-webkit-box;
              -webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(c.title)}</div>
            ${c.tagline ? `<div style="font-size:11px;color:var(--warm-gray);line-height:1.4;
              overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
              ${escapeHtml(c.tagline)}</div>` : ''}
            ${areaTag ? `<span style="display:inline-block;padding:1px 7px;background:var(--sand);
              border-radius:20px;font-size:11px;color:var(--warm-gray);align-self:flex-start;">${escapeHtml(areaTag)}</span>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
              <div style="font-size:11px;color:var(--light-gray);">
                ${t('courseSpotsCount').replace('{n}', c.spots?.length||0)}
              </div>
              <button onclick="event.stopPropagation();toggleLike('${c.id}')"
                data-like-id="${c.id}" data-likes="${c.likes||0}"
                style="font-size:12px;padding:2px 4px;background:none;border:none;
                       cursor:pointer;border-radius:6px;font-family:inherit;line-height:1;"
                ontouchstart="this.style.transform='scale(0.85)'"
                ontouchend="this.style.transform='scale(1)'">
                ${liked ? '❤️' : '🤍'} ${c.likes||0}
              </button>
            </div>
          </div>
        </div>`;
    }

    // マガジン型カード（みんなのコース・新着）

    // コースカード HTML
    function renderCourseCard(c, rank = null, isOwn = false) {
      const liked = isLiked(c.id);
      const cond = c.conditions || {};
      const tag = cond.with || cond.area || cond.style || '';
      const lineColor = rank !== null ? (_rankLineColor[rank] ?? null) : null;
      const rankLine = lineColor ? `<div style="position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:12px 0 0 12px;background:${lineColor};"></div>` : '';
      return `<div onclick="openCourseDetail('${c.id}')" style="position:relative;display:flex;gap:10px;align-items:flex-start;
        background:var(--warm-white);border-radius:12px;padding:10px;cursor:pointer;
        box-shadow:0 1px 3px rgba(0,0,0,0.06);">${rankLine}
        ${c.imageUrl
          ? `<img src="${c.imageUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
          : `<div style="width:64px;height:64px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,var(--caramel-pale),var(--sand));display:flex;align-items:center;justify-content:center;font-size:22px;">✨</div>`
        }
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="margin-bottom:2px;">
            <div style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;line-height:1.35;
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.title)}</div>
          </div>
          <div style="font-size:12px;color:var(--warm-gray);margin-bottom:5px;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.tagline || '')}</div>
          <div style="font-size:11px;color:var(--light-gray);">${tag ? escapeHtml(tag) + ' · ' : ''}${t('courseSpotsCount').replace('{n}', c.spots?.length||0)}</div>
        </div>
        ${isOwn
          ? `<div style="flex-shrink:0;align-self:center;padding:4px 8px;border-radius:20px;font-size:11px;font-weight:700;
               ${c.published ? 'background:#e8f5e9;color:#4caf50;' : 'background:#f5f5f5;color:#aaa;'}">
               ${c.published ? '🌐 公開中' : '🔒 非公開'}
             </div>`
          : `<button onclick="event.stopPropagation();toggleLike('${c.id}')" data-like-id="${c.id}" data-likes="${c.likes||0}"
               style="font-size:13px;flex-shrink:0;padding:4px 6px;background:none;border:none;cursor:pointer;
                      border-radius:8px;font-family:inherit;line-height:1;transition:transform 0.1s;align-self:center;"
               ontouchstart="this.style.transform='scale(0.85)'" ontouchend="this.style.transform='scale(1)'">${liked ? '❤️' : '🤍'} ${c.likes||0}</button>`
        }
      </div>`;
    }

    // 人気のコース専用カード（フルワイドカルーセル・左バーランク）
    const _rankBarColor = ['#C0903A','#9BA5B0','#B07040','#C8A97A','#C8A97A'];
    function renderPopularCourseCard(c, rank) {
      const liked = isLiked(c.id);
      const cond = c.conditions || {};
      const tags = [cond.with, cond.area, cond.style].filter(Boolean);
      const barColor = _rankBarColor[rank] || 'var(--sand-dark)';
      return `
        <div onclick="openCourseDetail('${c.id}')" style="flex-shrink:0;width:calc(100vw - 40px);
          background:var(--warm-white);border-radius:14px;overflow:hidden;cursor:pointer;
          box-shadow:0 1px 4px rgba(0,0,0,0.07);scroll-snap-align:start;">
          <div style="height:4px;background:${barColor};"></div>
          ${c.imageUrl
            ? `<img src="${c.imageUrl}" style="width:100%;height:110px;object-fit:cover;display:block;">`
            : `<div style="width:100%;height:110px;background:linear-gradient(135deg,var(--caramel-pale),var(--sand));display:flex;align-items:center;justify-content:center;font-size:36px;">✨</div>`
          }
          <div style="padding:12px 14px 14px;display:flex;flex-direction:column;gap:5px;">
            <div style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;line-height:1.35;
              overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${c.title}</div>
            <div style="font-size:13px;color:var(--warm-gray);
              overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;">${c.tagline || ''}</div>
            ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${tags.map(t=>`<span style="padding:2px 8px;background:var(--sand);border-radius:20px;font-size:11px;color:var(--warm-gray);">${t}</span>`).join('')}
            </div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--light-gray);">
              <span>${t('courseSpotsCount').replace('{n}', c.spots?.length||0)} · ${c.authorAvatar||''}${c.authorName||'AI'}</span>
              <button onclick="event.stopPropagation();toggleLike('${c.id}')" data-like-id="${c.id}" data-likes="${c.likes||0}"
                style="font-size:12px;flex-shrink:0;padding:2px 4px;background:none;border:none;cursor:pointer;
                       border-radius:6px;font-family:inherit;line-height:1;"
                ontouchstart="this.style.transform='scale(0.85)'"
                ontouchend="this.style.transform='scale(1)'">
                ${liked ? '❤️' : '🤍'} ${c.likes||0}
              </button>
            </div>
          </div>
        </div>`;
    }

    // 人気のコース（縦並び上位3件）

    // コース詳細を開く
    let _allLoadedCourses = {};
    function _lockCourseScroll() {
      const sc = document.querySelector('#screen-course .screen-content');
      if (sc) { sc.style.overflow = 'hidden'; sc._ptrLocked = true; }
    }
    function _unlockCourseScroll() {
      const sc = document.querySelector('#screen-course .screen-content');
      if (sc) { sc.style.overflowY = 'auto'; sc.style.overflow = ''; sc._ptrLocked = false; }
    }

    async function openCourseDetail(courseId) {
      const city = getCity();
      let course = null;

      // マイリストから探す
      const myList = JSON.parse(localStorage.getItem(city + '_my_courses') || '[]');
      course = myList.find(c => c.id === courseId);

      if (!course) {
        try {
          const community = await fetch(API_BASE + `/api/courses?city=${city}&tab=community`).then(r => r.json());
          course = community.find(c => c.id === courseId);
        } catch(e) {}
      }

      if (!course) course = _allLoadedCourses[courseId] || null;
      if (!course) return;

      // 画像なしの場合はバックグラウンドで取得してlocalStorageを更新
      if (!course.imageUrl) {
        const query = course.imageSearch || '';
        fetch(API_BASE + `/api/courses/image?query=${encodeURIComponent(query)}&city=${city}`)
          .then(r => r.json())
          .then(data => {
            if (data.imageUrl) {
              course.imageUrl = data.imageUrl;
              _allLoadedCourses[courseId] = course;
              // localStorageのマイコースも更新
              const key = city + '_my_courses';
              const list = JSON.parse(localStorage.getItem(key) || '[]');
              const idx = list.findIndex(c => c.id === courseId);
              if (idx !== -1) { list[idx].imageUrl = data.imageUrl; localStorage.setItem(key, JSON.stringify(list)); }
              // 詳細画面の画像エリアだけ差し替え
              const imgEl = document.getElementById(`course-detail-img-${courseId}`);
              if (imgEl) imgEl.outerHTML = `<img src="${data.imageUrl}" style="width:100%;height:180px;object-fit:cover;display:block;">`;
            }
          }).catch(() => {});
      }

      _allLoadedCourses[courseId] = course;
      renderCourseDetail(course);

      _lockCourseScroll();
      lockScroll();
      document.getElementById('course-detail-overlay').style.display = 'block';
      document.getElementById('course-detail-overlay').style.opacity = '1';
      document.getElementById('course-detail-sheet').classList.add('visible');
    }

    function renderCourseDetail(course) {
      const liked = isLiked(course.id);
      const isOwn = course.authorId === getUserId();

      const html = `
        ${course.imageUrl
          ? `<img src="${course.imageUrl}" style="width:100%;height:200px;object-fit:cover;">`
          : `<div id="course-detail-img-${course.id}" style="width:100%;height:160px;background:linear-gradient(135deg,var(--caramel-pale),var(--sand));display:flex;align-items:center;justify-content:center;font-size:48px;">✨</div>`
        }
        <div style="padding:20px;">
          <div style="font-family:'Kaisei Opti',serif;font-size:18px;font-weight:700;margin-bottom:4px;">${escapeHtml(course.title)}</div>
          <div style="font-size:14px;color:var(--warm-gray);margin-bottom:12px;">${escapeHtml(course.tagline || '')}</div>

          ${course.description ? `
            <div style="background:var(--cream);border-radius:10px;padding:12px;margin-bottom:16px;">
              <div style="font-size:14px;font-weight:700;color:var(--caramel);margin-bottom:6px;">${t('courseDetailAttraction')}</div>
              <div style="font-size:15px;line-height:1.65;color:var(--warm-gray);">${escapeHtml(course.description)}</div>
            </div>
          ` : ''}

          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
            ${course.conditions ? Object.values(course.conditions).filter(Boolean).map(v =>
              `<span style="padding:4px 10px;background:var(--sand);border-radius:20px;font-size:13px;">${escapeHtml(v)}</span>`
            ).join('') : ''}
          </div>

          <div style="font-size:14px;font-weight:700;margin-bottom:8px;">${t('courseDetailRoute')}</div>
          <div style="font-size:13px;color:var(--caramel);background:var(--caramel-pale);border-radius:8px;padding:8px 12px;margin-bottom:14px;text-align:center;">📍 ${getLang()==='en' ? 'Please check opening hours before visiting.' : '訪問前に営業状況をご確認ください。'}</div>
          ${(course.spots || []).map(s => `
            <div class="course-timeline-item">
              <div class="course-timeline-time">${escapeHtml(s.time)}</div>
              <div class="course-timeline-body">
                <div class="course-timeline-name">${s.emoji || ''} ${escapeHtml(s.name)} <span style="font-size:12px;color:var(--light-gray);">[${escapeHtml(s.duration)}]</span></div>
                <div class="course-timeline-desc">${escapeHtml(s.description || '')}</div>
                <div class="course-timeline-meta">${escapeHtml(s.address || '')}${s.affiliateLink ? ` · <a onclick="openAffiliateLink('${escapeHtml(s.affiliateLink)}','klook','${escapeHtml(s.name || '')}')" style="color:var(--caramel);text-decoration:underline;cursor:pointer;" data-i18n="affiliateInfoLink">${t('affiliateInfoLink')}</a>` : ''}</div>
              </div>
            </div>
          `).join('')}

          <div style="display:flex;align-items:center;justify-content:space-between;font-size:14px;color:var(--light-gray);margin:12px 0;">
            <span>${t('courseDetailAuthor')} ${course.authorName || 'AI'}&nbsp;&nbsp;${(course.createdAt||'').slice(0,10)}</span>
            <button onclick="event.stopPropagation();toggleLike('${course.id}')" id="like-btn-${course.id}"
              data-like-id="${course.id}" data-likes="${course.likes||0}"
              style="font-size:16px;flex-shrink:0;padding:4px 8px;background:none;border:none;cursor:pointer;
                     border-radius:8px;font-family:inherit;line-height:1;"
              ontouchstart="this.style.transform='scale(0.85)'"
              ontouchend="this.style.transform='scale(1)'">${liked ? '❤️' : '🤍'}</button>
          </div>

          <div style="display:flex;justify-content:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--sand);">
            <button onclick="addCourseToScheduleById('${course.id}')" class="card-action-btn" style="flex:none;width:calc(33% - 4px);">
              <span class="card-action-icon">📅</span>
              <span>予定に追加</span>
            </button>
          </div>

          ${isOwn ? `
            <div style="display:flex;gap:8px;margin-top:8px;">
              ${course.published !== true ? `
                <button onclick="publishCourseById('${course.id}')" id="publish-btn-${course.id}"
                  style="flex:1;padding:11px 8px;background:var(--warm-white);color:var(--caramel);font-size:13px;
                         border:1.5px solid var(--caramel);border-radius:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans JP',sans-serif;">
                  ${t('coursePublishAction')}
                </button>
              ` : `
                <button onclick="unpublishCourseById('${course.id}')" id="unpublish-btn-${course.id}"
                  style="flex:1;padding:11px 8px;background:var(--warm-white);color:var(--sage);font-size:13px;
                         border:1.5px solid var(--sage);border-radius:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans JP',sans-serif;white-space:nowrap;">
                  ${t('courseUnpublishAction')}
                </button>
              `}
              <button onclick="openTitleEdit('${course.id}')"
                style="flex:1;padding:11px 8px;background:var(--warm-white);color:var(--warm-gray);font-size:13px;
                       border:1.5px solid var(--sand-dark);border-radius:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans JP',sans-serif;">
                ${t('courseEditTitleBtn')}
              </button>
            </div>
            <div style="text-align:center;margin-top:16px;">
              <button onclick="deleteMyCourse('${course.id}')"
                style="background:none;border:none;color:var(--light-gray);font-size:13px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;">
                ${t('courseDeleteBtn')}
              </button>
            </div>
          ` : ''}
        </div>
      `;

      const detailContent = document.getElementById('course-detail-content');
      detailContent.innerHTML = html;
      detailContent.scrollTop = 0;
    }

    // コーススポットのアフィリエイトリンク（Klook等）を開く（設計書23フェーズ1）
    // Capacitor環境ではデバイスブラウザ（Browser.open）、Web環境では新規タブで開く。
    // クリック計測は fire-and-forget で送信し、遷移はブロックしない。
    function openAffiliateLink(url, provider, spotName) {
      if (!url) return;
      if (_isCapacitorApp && window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
      } else {
        window.open(url, '_blank', 'noopener');
      }
      try {
        fetch(API_BASE + '/api/affiliate-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spotName, provider, city: getCity() }),
        }).catch(() => {});
      } catch (_) {}
    }

    function closeCourseDetail() {
      _blurIfFocusInside('course-detail-sheet');
      _unlockCourseScroll();
      unlockScroll();
      document.getElementById('course-detail-overlay').style.display = 'none';
      document.getElementById('course-detail-overlay').style.opacity = '0';
      document.getElementById('course-detail-sheet').classList.remove('visible');
      _resetScrollPaddingAfterKb();
    }

    // ─── コース生成シート ───

    function openCourseSheetFromEvent(eventId) {
      if (!getPins()[eventId]) togglePinById(eventId);
      openCourseSheet();
      setTimeout(() => {
        const chip = document.querySelector(
          `#course-sheet-pins-list .pin-chip[data-pin-id="${eventId}"]`
        );
        if (chip && !chip.classList.contains('selected')) chip.click();
      }, 150);
    }

    function openCourseSheet() {
      // 全チップ・テキストをリセット
      document.querySelectorAll('#course-sheet .course-chip').forEach(b => b.classList.remove('selected'));
      const noteEl = document.getElementById('course-note');
      if (noteEl) noteEl.value = '';

      // 日付プリセットバナー
      const _cpBanner = document.getElementById('course-preset-date-banner');
      if (_cpBanner) {
        if (window._coursePresetDate) {
          const _s = window._coursePresetDate;
          const _d = new Date(_s + 'T00:00:00');
          _cpBanner.textContent = `📅 ${_d.getMonth()+1}/${_d.getDate()}（${'日月火水木金土'[_d.getDay()]}）の予定を作ります`;
          _cpBanner.hidden = false;
        } else {
          _cpBanner.hidden = true;
        }
      }

      // プロファイル表示
      const profileEl = document.getElementById('course-sheet-profile-display');
      if (profileEl) {
        const whoMap = { solo: 'ひとりで', couple: '夫婦・カップル', family: 'ファミリー', group: 'グループ' };
        const ageMap = { baby: '0〜2歳', preschool: '3〜6歳', school: '小学生以上' };
        const who = getWhoList();
        const ages = getAgeList();
        let txt = who.map(v => whoMap[v]).filter(Boolean).join('・');
        if (who.includes('family') && ages.length) txt += `・${ages.map(a => ageMap[a]).filter(Boolean).join('・')}`;
        profileEl.textContent = txt ? `設定: ${txt}` : '設定: 指定なし';
      }

      // エリアチップを都市別に動的生成
      const city = getCity();
      const areaChipsEl = document.getElementById('course-area-chips');
      if (areaChipsEl) {
        const areas = CITY_COURSE_AREAS[city] || CITY_COURSE_AREAS.sg;
        areaChipsEl.innerHTML = areas.map(a =>
          `<button class="course-chip" data-val="${a.val}">${a.label}</button>`
        ).join('');
      }

      // transportチップのラベルを都市別に動的変更
      const transitChip = document.getElementById('course-transit-chip');
      if (transitChip) {
        const transitLabel = { sg: '🚇 MRT・バス', bkk: '🚇 BTS・MRT・バス', syd: '🚃 電車・バス' }[city] || '🚇 公共交通・バス';
        transitChip.textContent = transitLabel;
      }

      // ピン留めイベントを選択チップとして表示
      const pins = Object.values(getPins());
      const pinsArea = document.getElementById('course-sheet-pins');
      const pinsList = document.getElementById('course-sheet-pins-list');
      if (pins.length > 0) {
        pinsList.innerHTML = pins.map((p, i) => `
          <button class="pin-chip" data-pin-id="${p.id || p.title}"
            style="display:flex;align-items:center;gap:8px;padding:9px 12px;
                   font-size:14px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;
                   border:none;border-top:${i > 0 ? '1px solid var(--border-color,#e8e0d8)' : 'none'};
                   background:var(--warm-white);color:var(--midnight);text-align:left;width:100%;">
            <span class="pin-check" style="flex-shrink:0;width:18px;height:18px;border-radius:4px;
                   border:1.5px solid var(--light-gray);display:inline-block;line-height:15px;
                   text-align:center;font-size:13px;align-self:center;"></span>
            <span style="font-size:16px;flex-shrink:0;align-self:center;line-height:1;">${p.emoji || '📌'}</span>
            <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;align-self:center;">${p.title}</span>
          </button>`).join('');
        pinsArea.style.display = '';
      } else {
        pinsArea.style.display = 'none';
      }

      // オプションパネルを閉じた状態にリセット
      const optPanel = document.getElementById('course-options-panel');
      const optArrow = document.getElementById('course-options-arrow');
      if (optPanel) optPanel.style.display = 'none';
      if (optArrow) optArrow.style.transform = '';

      document.getElementById('course-step-conditions').hidden = false;
      document.getElementById('course-step-loading').hidden = true;
      document.getElementById('course-step-candidates').hidden = true;
      document.getElementById('course-step-result').hidden = true;
      _lockCourseScroll();
      lockScroll();
      document.getElementById('course-sheet-overlay').style.display = 'block';
      document.getElementById('course-sheet-overlay').style.opacity = '1';
      document.getElementById('course-sheet').classList.add('visible');
    }

    function toggleCourseOptions() {
      const panel = document.getElementById('course-options-panel');
      const arrow = document.getElementById('course-options-arrow');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
    }

    function closeCourseSheet() {
      _blurIfFocusInside('course-sheet');
      document.getElementById('course-sheet-overlay').style.display = 'none';
      document.getElementById('course-sheet-overlay').style.opacity = '0';
      document.getElementById('course-sheet').classList.remove('visible');
      _unlockCourseScroll();
      unlockScroll();
      window._coursePresetDate = null;
      _resetScrollPaddingAfterKb();
    }

    function showCourseStep(step) {
      ['conditions','loading','candidates','result'].forEach(s => {
        document.getElementById('course-step-' + s).hidden = s !== step;
      });
    }

    const MULTI_SELECT_KEYS = new Set(['purpose', 'area']);

    document.addEventListener('click', e => {
      // 条件チップ（purpose/area は複数選択、その他は単一選択）
      const chip = e.target.closest('#course-sheet .course-chip');
      if (chip) {
        const group = chip.closest('.course-chips');
        if (!group) return;
        if (MULTI_SELECT_KEYS.has(group.dataset.key)) {
          chip.classList.toggle('selected');
        } else {
          const wasSelected = chip.classList.contains('selected');
          group.querySelectorAll('.course-chip').forEach(b => b.classList.remove('selected'));
          if (!wasSelected) chip.classList.add('selected');
        }
        return;
      }
      // ピンチップ（多重選択トグル）
      const pinChip = e.target.closest('#course-sheet-pins-list .pin-chip');
      if (pinChip) {
        const sel = pinChip.classList.contains('selected');
        const check = pinChip.querySelector('.pin-check');
        if (sel) {
          pinChip.classList.remove('selected');
          pinChip.style.background = 'var(--warm-white)';
          pinChip.style.color = 'var(--midnight)';
          pinChip.style.fontWeight = '';
          if (check) { check.textContent = ''; check.style.borderColor = '#ccc'; check.style.background = ''; }
        } else {
          pinChip.classList.add('selected');
          pinChip.style.background = 'var(--caramel-pale,#fdf5ec)';
          pinChip.style.color = 'var(--caramel)';
          pinChip.style.fontWeight = '700';
          if (check) { check.textContent = '✓'; check.style.borderColor = 'var(--caramel)'; check.style.background = 'var(--caramel)'; check.style.color = '#fff'; }
        }
      }
    });

    function randomizeCourseConditions() {
      document.querySelectorAll('#course-sheet .course-chips').forEach(group => {
        const chips = [...group.querySelectorAll('.course-chip')];
        if (!chips.length) return;
        chips.forEach(b => b.classList.remove('selected'));
        if (MULTI_SELECT_KEYS.has(group.dataset.key)) {
          // 複数選択グループ: 0〜2個をランダム選択
          const count = Math.floor(Math.random() * Math.min(3, chips.length));
          const shuffled = [...chips].sort(() => Math.random() - 0.5);
          shuffled.slice(0, count).forEach(b => b.classList.add('selected'));
        } else {
          // 単一選択グループ: 50%の確率で1個選択
          if (Math.random() > 0.4) {
            chips[Math.floor(Math.random() * chips.length)].classList.add('selected');
          }
        }
      });
    }

    async function startCourseGeneration() {
      const conditions = {};
      document.querySelectorAll('#course-sheet .course-chips').forEach(group => {
        const key = group.dataset.key;
        if (MULTI_SELECT_KEYS.has(key)) {
          const vals = [...group.querySelectorAll('.course-chip.selected')].map(b => b.dataset.val);
          if (vals.length) conditions[key] = vals.join('・');
        } else {
          const sel = group.querySelector('.course-chip.selected');
          if (sel) conditions[key] = sel.dataset.val;
        }
      });
      const note = (document.getElementById('course-note')?.value || '').trim();
      if (note) conditions.note = note;

      // ローディング表示（候補生成用メッセージ）
      showCourseStep('loading');
      const loadingMsg = document.querySelector('#course-step-loading [data-i18n="courseLoadingMsg"]');
      if (loadingMsg) loadingMsg.textContent = getLang() === 'en' ? 'Thinking of 3 ideas...' : '3つの方向性を考えています…';

      const city = getCity();
      const profile = getProfile();

      // 選択されたピンのみを軸として収集
      const allPins = getPins();
      const selectedPinIds = new Set(
        [...document.querySelectorAll('#course-sheet-pins-list .pin-chip.selected')]
          .map(el => el.dataset.pinId)
      );
      const pinnedEvents = Object.values(allPins)
        .filter(p => selectedPinIds.has(p.id || p.title))
        .map(p => ({ title: p.title, area: p.area, type: p.type, emoji: p.emoji, location: p.location }));

      // 選択ピンがあればエリアを自動セット（未選択の場合）
      if (!conditions.area && pinnedEvents.length > 0) {
        const pinArea = pinnedEvents[0].area;
        if (pinArea) conditions.area = pinArea;
      }

      try {
        const res = await fetch(API_BASE + '/api/courses/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, conditions, profile, pinnedEvents })
        });
        const candidates = await res.json();
        if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('no candidates');
        renderCourseCandidates(candidates);
        showCourseStep('candidates');
      } catch(e) {
        showCourseStep('conditions');
        showToast(t('toastCourseGenFailed'));
      }
    }

    function renderCourseCandidates(candidates) {
      const container = document.getElementById('course-candidates-list');
      container.innerHTML = candidates.map((c, i) => `
        <div onclick="selectCourseCandidate(${i})" id="candidate-card-${i}"
          style="border-radius:14px;border:2px solid var(--sand);background:var(--warm-white);
                 padding:14px 16px;margin-bottom:10px;cursor:pointer;transition:border-color .15s;">
          <div style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;
                      line-height:1.4;margin-bottom:4px;">${c.title}</div>
          <div style="font-size:13px;color:var(--warm-gray);margin-bottom:6px;">${c.tagline || ''}</div>
          <div style="font-size:14px;color:var(--midnight);line-height:1.6;
                      overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
            ${c.description || ''}
          </div>
        </div>
      `).join('');
      window._currentCandidates = candidates;
    }

    async function selectCourseCandidate(index) {
      const candidate = window._currentCandidates?.[index];
      if (!candidate) return;

      // 選択ハイライト
      document.querySelectorAll('[id^="candidate-card-"]').forEach((el, i) => {
        el.style.borderColor = i === index ? 'var(--caramel)' : 'var(--sand)';
      });

      // 短いディレイ後にgenerate開始
      await new Promise(r => setTimeout(r, 300));

      // loadingに切り替え
      showCourseStep('loading');
      const loadingMsg = document.querySelector('#course-step-loading [data-i18n="courseLoadingMsg"]');
      if (loadingMsg) loadingMsg.textContent = getLang() === 'en' ? 'Creating your course...' : 'コースを考えています…';

      // 条件を再収集
      const conditions = {};
      document.querySelectorAll('#course-sheet .course-chips').forEach(group => {
        const key = group.dataset.key;
        if (MULTI_SELECT_KEYS.has(key)) {
          const vals = [...group.querySelectorAll('.course-chip.selected')].map(b => b.dataset.val);
          if (vals.length) conditions[key] = vals.join('・');
        } else {
          const sel = group.querySelector('.course-chip.selected');
          if (sel) conditions[key] = sel.dataset.val;
        }
      });
      const note = (document.getElementById('course-note')?.value || '').trim();
      if (note) conditions.note = note;

      const city = getCity();
      const profile = getProfile();
      const allPins = getPins();
      const selectedPinIds = new Set(
        [...document.querySelectorAll('#course-sheet-pins-list .pin-chip.selected')]
          .map(el => el.dataset.pinId)
      );
      const pinnedEvents = Object.values(allPins)
        .filter(p => selectedPinIds.has(p.id || p.title))
        .map(p => ({ title: p.title, area: p.area, type: p.type, emoji: p.emoji, location: p.location }));

      if (!conditions.area && pinnedEvents.length > 0) {
        const pinArea = pinnedEvents[0].area;
        if (pinArea) conditions.area = pinArea;
      }

      try {
        const res = await fetch(API_BASE + '/api/courses/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city, conditions, profile, pinnedEvents,
            selectedCandidate: candidate,
            userId: getUserId(), userName: getUserName(), userAvatar: getUserAvatar()
          })
        });
        const course = await res.json();
        if (!course || course.error) throw new Error(course?.error || 'generation failed');
        currentGeneratedCourse = course;
        document.getElementById('course-result-content').innerHTML = renderCourseResultHtml(course);
        showCourseStep('result');
      } catch(e) {
        showCourseStep('candidates');
        showToast(t('toastCourseGenFailed'));
      }
    }

    function backToCourseConditions() {
      showCourseStep('conditions');
    }

    function renderCourseResultHtml(course) {
      return `
        ${course.imageUrl
          ? `<img src="${course.imageUrl}" style="width:100%;height:140px;object-fit:cover;border-radius:10px;margin-bottom:12px;display:block;">`
          : ''}
        <div style="font-size:17px;font-weight:700;margin:8px 0 4px;">${escapeHtml(course.title || '')}</div>
        <div style="font-size:14px;color:var(--warm-gray);margin-bottom:12px;">${escapeHtml(course.tagline || '')}</div>
        ${(course.spots || []).map(s => `
          <div class="course-timeline-item">
            <div class="course-timeline-time">${escapeHtml(s.time || '')}</div>
            <div class="course-timeline-body">
              <div class="course-timeline-name">${s.emoji || ''} ${escapeHtml(s.name)} <span style="font-size:12px;color:var(--light-gray);">[${escapeHtml(s.duration || '')}]</span></div>
              <div class="course-timeline-desc">${escapeHtml(s.description || '')}</div>
              ${s.affiliateLink ? `<div class="course-timeline-meta"><a onclick="openAffiliateLink('${escapeHtml(s.affiliateLink)}','klook','${escapeHtml(s.name || '')}')" style="color:var(--caramel);text-decoration:underline;cursor:pointer;" data-i18n="affiliateInfoLink">${t('affiliateInfoLink')}</a></div>` : ''}
            </div>
          </div>
        `).join('')}
      `;
    }

    function saveGeneratedCourse() {
      if (!currentGeneratedCourse) return;
      saveMyCourse(currentGeneratedCourse);
      closeCourseSheet();
      switchCourseTab('mylist');
      showToast(t('toastCourseSaved'));
    }

    async function saveAndPublishGeneratedCourse() {
      if (!currentGeneratedCourse) return;
      const similar = await checkSimilarCourses(currentGeneratedCourse);
      if (similar.length > 0) {
        const names = similar.slice(0, 2).map(c => `「${c.title}」`).join('、');
        const ok = window.confirm(`${names}と似たコースがすでに公開されています。\nこのまま公開しますか？`);
        if (!ok) return;
      }
      saveMyCourse(currentGeneratedCourse);
      await publishCourseById(currentGeneratedCourse.id, { skipSimilarCheck: true });
      closeCourseSheet();
      switchCourseTab('mylist');
      showToast(t('toastCoursePublished2'));
    }

    // ─── マイコース タイトル編集 ───
    let _editingCourseId = null;

    function openTitleEdit(courseId) {
      _editingCourseId = courseId;
      const city = getCity();
      const list = JSON.parse(localStorage.getItem(city + '_my_courses') || '[]');
      const course = list.find(c => c.id === courseId) || _allLoadedCourses[courseId] || {};
      const input = document.getElementById('title-edit-input');
      input.value = course.title || '';
      lockScroll();
      document.getElementById('title-edit-overlay').classList.add('visible');
      document.getElementById('title-edit-sheet').classList.add('visible');
      setTimeout(() => input.focus(), 100);
    }

    function closeTitleEdit() {
      _editingCourseId = null;
      _blurIfFocusInside('title-edit-sheet');
      unlockScroll();
      document.getElementById('title-edit-overlay').classList.remove('visible');
      document.getElementById('title-edit-sheet').classList.remove('visible');
      document.getElementById('title-edit-sheet').style.bottom = '0px';
      document.getElementById('title-edit-input').blur();
      _resetScrollPaddingAfterKb();
    }

    function saveCourseTitle() {
      if (!_editingCourseId) return;
      const newTitle = document.getElementById('title-edit-input').value.trim();
      if (!newTitle) return;
      const city = getCity();
      const key = city + '_my_courses';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = list.findIndex(c => c.id === _editingCourseId);
      if (idx !== -1) {
        list[idx].title = newTitle;
        localStorage.setItem(key, JSON.stringify(list));
        if (_allLoadedCourses[_editingCourseId]) _allLoadedCourses[_editingCourseId].title = newTitle;
        _syncBackupToServer();
      }
      closeTitleEdit();
      // 詳細画面が開いていればタイトルを即更新
      const detailTitle = document.querySelector('#course-detail-content [style*="font-size:18px"]');
      if (detailTitle) detailTitle.textContent = newTitle;
      showToast(t('toastCourseTitleSaved'));
    }

    // ─── マイコース削除 ───

    async function deleteMyCourse(courseId) {
      const city = getCity();
      const key = city + '_my_courses';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const target = list.find(c => c.id === courseId);

      // localStorageから削除
      localStorage.setItem(key, JSON.stringify(list.filter(c => c.id !== courseId)));
      _syncBackupToServer();

      // 公開済みならサーバーからも削除
      if (target?.published) {
        try {
          await authedFetch(API_BASE + `/api/courses/${courseId}?city=${city}`, { method: 'DELETE' });
        } catch(e) {}
      }

      closeCourseDetail();
      switchCourseTab('mylist');
      showToast(t('toastCourseDeleted'));
    }

    function addCourseToScheduleById(courseId) {
      const course = _allLoadedCourses[courseId] || currentGeneratedCourse;
      if (!course) return;
      addCourseToScheduleWithDate(course);
    }

    // ─── 共通日付ピッカー ───
    let _datepickerCallback = null;
    let _datepickerMulti    = false;
    let _datepickerSelectedKeys = new Set();

    function openDatePickerSheet(opts) {
      // opts: { subtitle, multi, presetKey, onConfirm }
      if (opts.presetKey) {
        opts.onConfirm([opts.presetKey]);
        return;
      }
      _datepickerCallback = opts.onConfirm;
      _datepickerMulti    = !!opts.multi;
      _datepickerSelectedKeys = new Set();

      document.getElementById('date-picker-subtitle').textContent = opts.subtitle || '';
      document.getElementById('date-picker-chips').innerHTML =
        buildDateChipsHtml(null)
          .replace(/onclick="selectPlanDate\('([^']+)'\)"/g,
                   "onclick=\"_selectPickerDate('$1')\"");
      document.getElementById('date-picker-add-btn').disabled = true;

      document.getElementById('date-picker-overlay').classList.add('visible');
      document.getElementById('date-picker-modal').classList.add('visible');
      lockScroll();
    }

    function _selectPickerDate(key) {
      if (_datepickerMulti) {
        _datepickerSelectedKeys.has(key)
          ? _datepickerSelectedKeys.delete(key)
          : _datepickerSelectedKeys.add(key);
      } else {
        _datepickerSelectedKeys = new Set([key]);
      }
      document.querySelectorAll('#date-picker-chips .plan-date-chip').forEach(b =>
        b.classList.toggle('selected', _datepickerSelectedKeys.has(b.dataset.date))
      );
      document.getElementById('date-picker-add-btn').disabled = _datepickerSelectedKeys.size === 0;
    }

    function _confirmDatePicker() {
      const keys = [..._datepickerSelectedKeys];
      const cb = _datepickerCallback;
      closeDatePickerSheet();
      if (cb) cb(keys);
    }

    function closeDatePickerSheet() {
      _blurIfFocusInside('date-picker-modal');
      document.getElementById('date-picker-overlay').classList.remove('visible');
      document.getElementById('date-picker-modal').classList.remove('visible');
      unlockScroll();
      _datepickerCallback = null;
      _resetScrollPaddingAfterKb();
    }

    function addCourseToScheduleWithDate(course) {
      _allLoadedCourses[course.id] = course;
      openDatePickerSheet({
        subtitle:  course.title || 'コース',
        multi:     false,
        presetKey: window._coursePresetDate || null,
        onConfirm: async (keys) => {
          const dateStr = keys[0];
          const startTime = course.spots?.[0]?.time || null;
          const entry = {
            id: `cp_${Date.now()}`,
            emoji: '🗺️',
            name: course.title,
            dateKey: dateStr,
            startTime,
            memo: course.tagline || '',
            courseId: course.id,
          };
          const updated = [...getCustomPlans(), entry];
          await saveCustomPlans(updated);
          window._coursePresetDate = null;
          renderScheduleTab();
          showToast('📅 コースを予定に追加しました');
        }
      });
    }

    // いいね
    function isLiked(courseId) {
      const liked = JSON.parse(localStorage.getItem('liked_courses') || '[]');
      return liked.includes(courseId);
    }

    async function toggleLike(courseId) {
      const liked = JSON.parse(localStorage.getItem('liked_courses') || '[]');
      const alreadyLiked = liked.includes(courseId);
      const action = alreadyLiked ? 'unlike' : 'like';

      if (alreadyLiked) {
        localStorage.setItem('liked_courses', JSON.stringify(liked.filter(id => id !== courseId)));
      } else {
        localStorage.setItem('liked_courses', JSON.stringify([...liked, courseId]));
      }
      _syncBackupToServer();

      try {
        await fetch(API_BASE + `/api/courses/${courseId}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: getCity(), action })
        });
      } catch(e) {}

      // カード・詳細ビュー両方のボタンを更新
      document.querySelectorAll(`[data-like-id="${courseId}"]`).forEach(btn => {
        const count = parseInt(btn.dataset.likes || '0') + (alreadyLiked ? -1 : 1);
        btn.dataset.likes = count;
        const isDetailBtn = btn.id === `like-btn-${courseId}`;
        btn.textContent = isDetailBtn
          ? (alreadyLiked ? '🤍' : '❤️')
          : `${alreadyLiked ? '🤍' : '❤️'} ${Math.max(0, count)}`;
      });
    }

    async function checkSimilarCourses(course) {
      try {
        const city = getCity();
        const res = await fetch(API_BASE + `/api/courses?city=${city}&tab=community`);
        const existing = await res.json();
        const title = course.title || '';
        const newSpots = (course.spots || []).map(s => s.name || '').filter(Boolean);
        const titleKeywords = (title.match(/[぀-龯゠-ヿ]{2,}|[A-Za-z]{4,}/g) || []).filter(w => w.length >= 3);
        return existing.filter(c => {
          if (c.id === course.id) return false;
          // スポット名が2件以上一致
          const existSpots = (c.spots || []).map(s => s.name || '').filter(Boolean);
          if (newSpots.filter(s => existSpots.includes(s)).length >= 2) return true;
          // タイトルキーワードが2語以上共通
          const existKeywords = ((c.title || '').match(/[぀-龯゠-ヿ]{2,}|[A-Za-z]{4,}/g) || []).filter(w => w.length >= 3);
          if (titleKeywords.filter(kw => existKeywords.includes(kw)).length >= 2) return true;
          return false;
        });
      } catch { return []; }
    }

    async function publishCourseById(courseId, opts = {}) {
      const city = getCity();
      const myList = JSON.parse(localStorage.getItem(city + '_my_courses') || '[]');
      const course = myList.find(c => c.id === courseId);
      if (!course) return;

      if (!opts.skipSimilarCheck) {
        const similar = await checkSimilarCourses(course);
        if (similar.length > 0) {
          const names = similar.slice(0, 2).map(c => `「${c.title}」`).join('、');
          const ok = window.confirm(`${names}と似たコースがすでに公開されています。\nこのまま公開しますか？`);
          if (!ok) return;
        }
      }

      try {
        await authedFetch(API_BASE + '/api/courses/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...course, isPublic: true })
        });

        // localStorageの published フラグを更新
        const updated = myList.map(c => c.id === courseId ? {...c, isPublic: true, published: true} : c);
        localStorage.setItem(city + '_my_courses', JSON.stringify(updated));
        _syncBackupToServer();

        // ボタンを「公開済み」表示に更新
        const publishBtn = document.getElementById(`publish-btn-${courseId}`);
        if (publishBtn) {
          publishBtn.disabled = true;
          publishBtn.textContent = '公開済み ✓';
          publishBtn.style.color = 'var(--sage)';
          publishBtn.style.borderColor = 'var(--sage)';
        }
        showToast(t('toastCoursePublished'));
        closeCourseDetail();
      } catch(e) {
        showToast(t('toastCoursePublishErr'));
      }
    }

    async function unpublishCourseById(courseId) {
      const city = getCity();
      try {
        await authedFetch(API_BASE + `/api/courses/${courseId}/unpublish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city })
        });
        const key = city + '_my_courses';
        const myList = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(
          myList.map(c => c.id === courseId ? { ...c, published: false, isPublic: false } : c)
        ));
        _syncBackupToServer();
        showToast(t('toastCourseUnpublish'));
        closeCourseDetail();
        switchCourseTab('mylist');
      } catch(e) {
        showToast(t('toastCourseFailed'));
      }
    }

    // ユーティリティ
    function getUserId() {
      let id = localStorage.getItem('user_id');
      if (!id) { id = 'user_' + Math.random().toString(36).slice(2,10); localStorage.setItem('user_id', id); }
      return id;
    }

    function getUserName() {
      return localStorage.getItem('user_name') || '匿名';
    }

    function saveMyCourse(course) {
      const city = getCity();
      const key = city + '_my_courses';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      // 重複チェック
      if (!list.find(c => c.id === course.id)) {
        // published: false を付与して保存
        list.unshift({ ...course, published: false });
        if (list.length > 10) list.pop();
        localStorage.setItem(key, JSON.stringify(list));
        _syncBackupToServer();
      }
    }

    // ─── PLAN FEATURE: DATA LAYER ───
    // custom_plans は都市によらず共通（個人カレンダー）
    // event_plans は都市別（イベントIDが都市固有のため）
    function getCustomPlans() { return JSON.parse(localStorage.getItem('custom_plans') || '[]'); }
    async function saveCustomPlans(arr) {
      localStorage.setItem('custom_plans', JSON.stringify(arr));
      if (getSharedGroupId() && !_calSyncFromServer) await syncToServer();
      // 個人予定表バックアップ（設計書54）: ログイン中かつバックアップ有効時のみ、restore経由の書き込み以外でバックグラウンド同期
      if (!_calSyncFromServer) _syncBackupToServer();
    }
    function getEventPlans() { return JSON.parse(localStorage.getItem(getCity()+'_event_plans') || '[]'); }
    async function saveEventPlans(arr) {
      localStorage.setItem(getCity()+'_event_plans', JSON.stringify(arr));
      if (getSharedGroupId() && !_calSyncFromServer) await syncToServer();
      if (!_calSyncFromServer) _syncBackupToServer();
    }

    function fmtDateKey(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // 予定表・日付選択用：今週月〜日から4週分を返す
    function getScheduleWeeks() {
      const today = new Date(); today.setHours(0,0,0,0);
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + mondayOffset);
      const holidays = getCityHolidays();
      const isHoliday = d => holidays.some(h => fmtDateKey(h) === fmtDateKey(d));
      const jaLabels = ['今週','来週','2週後','3週後'];
      const enLabels = ['This Week','Next Week','In 2 Weeks','In 3 Weeks'];
      return Array.from({length: 4}, (_, w) => {
        const mon = new Date(thisMonday); mon.setDate(thisMonday.getDate() + w * 7);
        const allDays = Array.from({length: 7}, (_, i) => {
          const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
        });
        const nextMon = new Date(allDays[6]); nextMon.setDate(allDays[6].getDate() + 1);
        const isLong = isHoliday(allDays[4]) || isHoliday(nextMon);
        return {
          label: getLang() === 'en' ? enLabels[w] : jaLabels[w],
          allDays,
          isLong,
          startStr: fmtDateKey(allDays[0]),
          endStr:   fmtDateKey(allDays[6]),
        };
      });
    }

    function handleImgError(el, cls, emoji) {
      el.parentElement.innerHTML = '<div class="card-image-bg ' + cls + '">' + emoji + '</div>';
    }

    // ─── SCROLL LOCK (iOS / Android) ───
    let _scrollLockDepth = 0;
    function _preventBgScroll(e) {
      let el = e.target;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const ov = style.overflow + style.overflowY;
        if ((ov.includes('auto') || ov.includes('scroll')) && el.scrollHeight > el.clientHeight) {
          return;
        }
        el = el.parentElement;
      }
      e.preventDefault();
    }
    function lockScroll() {
      if (_scrollLockDepth === 0) {
        document.addEventListener('touchmove', _preventBgScroll, { passive: false });
      }
      _scrollLockDepth++;
    }
    function unlockScroll() {
      if (_scrollLockDepth <= 0) return;
      _scrollLockDepth--;
      if (_scrollLockDepth === 0) {
        document.removeEventListener('touchmove', _preventBgScroll);
      }
    }

    // ─── PLAN MODAL STATE ───
    let _planModalType = null;
    let _planModalEventId = null;
    let _planModalSelectedDate = null;
    let _planModalSelectedDates = new Set();
    let _planModalSelectedStartTime = null;
    let _planModalDetailId = null;
    let _planModalDetailType = null;
    let _selectedPlanEmoji = '📝';
    let _selectedPlanMembers = [];
    let _editingGroupIds = [];

    function buildDateChipsHtml(selectedDate) {
      const weeks = getScheduleWeeks();
      const isEn = getLang() === 'en';
      const dayNamesJa = ['日','月','火','水','木','金','土'];
      const dayNamesEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const dayNames = isEn ? dayNamesEn : dayNamesJa;
      const holidays = getCityHolidays();
      const isHoliday = d => holidays.some(h => fmtDateKey(h) === fmtDateKey(d));
      return weeks.map(g => {
        const chips = g.allDays.map(d => {
          const key = fmtDateKey(d);
          const dow = d.getDay();
          const isHolidayDay = isHoliday(d);
          const isWeekend = dow === 6 || dow === 0;
          let cls = 'plan-date-chip';
          if (!isWeekend && !isHolidayDay) cls += ' plan-date-chip--weekday';
          else if (dow === 6) cls += ' plan-date-chip--sat';
          else if (dow === 0 || isHolidayDay) cls += ' plan-date-chip--sun';
          if (selectedDate === key) cls += ' selected';
          const mm = d.getMonth()+1; const dd = d.getDate();
          return `<button class="${cls}" data-date="${key}" onclick="selectPlanDate('${key}')">${dayNames[dow]}<br>${mm}/${dd}</button>`;
        }).join('');
        return `<div class="plan-date-week-row"><span class="plan-date-week-label">${g.label}${g.isLong ? ' 🎌' : ''}</span><div class="plan-date-week-chips-row">${chips}</div></div>`;
      }).join('');
    }

    function openEventPlanModal(eventId) {
      lockScroll();
      try {
      const event = EVENT_REGISTRY[eventId];
      const pin = getPins()[eventId];
      const title = (event?.store || event?.title || pin?.title || '').slice(0,30);
      const emoji = event?.emoji || pin?.emoji || '📍';
      const area = event?.area || event?.location || pin?.location || '';
      const period = event?.period || pin?.hours || '';
      const meta = [area, period].filter(Boolean).join(' · ');
      _planModalType = 'event';
      _planModalEventId = eventId;
      _planModalSelectedDate = null;
      _planModalSelectedStartTime = '09:00';
      document.getElementById('plan-event-modal-title').textContent = `${emoji} ${title}`;
      document.getElementById('plan-event-modal-subtitle').textContent = meta;
      document.getElementById('plan-event-date-chips').innerHTML = buildDateChipsHtml(null);
      document.getElementById('plan-event-memo').value = '';
      _selectedPlanMembers = [];
      document.querySelectorAll('#plan-event-member-chips .plan-member-chip').forEach(b => b.classList.remove('selected'));
      updatePlanAddBtn('event');
      _showNotifyCheckboxes();
      const _evImpCb = document.getElementById('plan-event-important-cb');
      if (_evImpCb) _evImpCb.checked = false;
      document.getElementById('plan-modal-overlay').classList.add('visible');
      document.getElementById('plan-event-modal').classList.add('visible');
      requestAnimationFrame(() => _syncTimeInputUI('event'));
      } catch(e) {
        unlockScroll();
        document.getElementById('plan-modal-overlay')?.classList.remove('visible');
        document.getElementById('plan-event-modal')?.classList.remove('visible');
        throw e;
      }
    }

    let _customPlanPresetDateKey = null;

    function openCustomPlanModal(presetDateKey = null) {
      _customPlanPresetDateKey = presetDateKey || null;
      lockScroll();
      try {
      _planModalType = 'custom';
      _editingGroupIds = [];
      _planModalSelectedDate = null;
      _planModalSelectedDates = new Set();
      _customPlanSelectedDateKeys = [];
      _planModalSelectedDates = new Set();
      _planModalSelectedStartTime = '09:00';
      _selectedPlanEmoji = '📝';
      _updateEmojiSelectorDisplay('custom', '📝');
      document.getElementById('plan-custom-title').value = '';
      document.getElementById('plan-custom-memo').value = '';
      // 日付チップを直接表示・リセット
      const _chips = document.getElementById('plan-custom-date-chips');
      if (_chips) {
        _chips.style.display = '';
        _chips.innerHTML = buildDateChipsHtml(null);
        if (_customPlanPresetDateKey) {
          _planModalSelectedDates.add(_customPlanPresetDateKey);
          const presetChip = _chips.querySelector(`[data-date="${_customPlanPresetDateKey}"]`);
          if (presetChip) presetChip.classList.add('selected');
        }
      }
      _selectedPlanMembers = [];
      document.querySelectorAll('#plan-custom-member-chips .plan-member-chip').forEach(b => b.classList.remove('selected'));
      document.getElementById('plan-custom-modal-title').textContent = getLang() === 'en' ? 'Add to schedule' : '予定を追加';
      document.getElementById('plan-custom-add-btn').style.display = '';
      document.getElementById('plan-custom-edit-footer').style.display = 'none';
      _renderPlanPinsList();
      updateCustomPlanAddBtn();
      _showNotifyCheckboxes();
      const _cuImpCb = document.getElementById('plan-custom-important-cb');
      if (_cuImpCb) _cuImpCb.checked = false;
      document.getElementById('plan-modal-overlay').classList.add('visible');
      document.getElementById('plan-custom-modal').classList.add('visible');
      requestAnimationFrame(() => _syncTimeInputUI('custom'));
      const customBody = document.querySelector('#plan-custom-modal .plan-modal-body');
      if (customBody) customBody.scrollTop = 0;
      } catch(e) {
        unlockScroll();
        document.getElementById('plan-modal-overlay')?.classList.remove('visible');
        document.getElementById('plan-custom-modal')?.classList.remove('visible');
        throw e;
      }
    }

    function openPlanDetailModal(planId, planType) {
      lockScroll();
      const plans = planType === 'custom' ? getCustomPlans() : getEventPlans();
      const plan = plans.find(p => p.id === planId);
      if (!plan) return;

      if (planType === 'custom') {
        openCustomPlanEdit([plan]);
        return;
      }

      _planModalType = 'detail';
      _planModalDetailId = planId;
      _planModalDetailType = planType;
      _planModalSelectedDate = plan.dateKey;
      _planModalSelectedStartTime = plan.startTime != null ? plan.startTime : (plan.slot === 'allday' ? 'allday' : null);
      document.getElementById('plan-detail-emoji-wrap').style.display = 'none';
      document.getElementById('plan-detail-modal-header').style.alignItems = 'flex-start';
      _selectedPlanMembers = Array.isArray(plan.member) ? [...plan.member] : (plan.member ? [plan.member] : []);
      document.querySelectorAll('#plan-detail-member-chips .plan-member-chip').forEach(b => {
        b.classList.toggle('selected', _selectedPlanMembers.includes(b.dataset.member));
      });
      document.getElementById('plan-detail-header').textContent = `${plan.emoji} ${plan.name}`;
      document.getElementById('plan-detail-meta').textContent = plan.meta || '';
      document.getElementById('plan-detail-date-chips').innerHTML = buildDateChipsHtml(plan.dateKey);
      document.getElementById('plan-detail-memo').value = plan.memo || '';
      _showNotifyCheckboxes();
      const _dtImpCb = document.getElementById('plan-detail-important-cb');
      if (_dtImpCb) _dtImpCb.checked = !!plan.important;
      document.getElementById('plan-modal-overlay').classList.add('visible');
      document.getElementById('plan-detail-modal').classList.add('visible');
      requestAnimationFrame(() => _syncTimeInputUI('detail'));
    }

    const PLAN_EMOJIS = [
      ['🎡','おでかけ'], ['🍽','食事'],     ['🛒','買い物'],   ['🎂','記念日'],   ['✈️','旅行'],
      ['⚽','習い事'],   ['🏊','スポーツ'],  ['🎵','音楽'],     ['🎬','映画'],     ['🎮','ゲーム'],
      ['🏫','学校'],    ['💼','仕事'],     ['🏥','病院'],     ['💈','美容院'],   ['🏠','家のこと'],
      ['🌸','季節'],    ['🎁','プレゼント'],['🍺','飲み会'],   ['💆','マッサージ'],['📝','その他'],
    ];

    let _emojiPickerTarget = null;

    function _updateEmojiSelectorDisplay(target, emoji) {
      const sfx = target === 'custom' ? 'custom' : 'detail';
      const eEl = document.getElementById(`plan-${sfx}-selected-emoji`);
      if (eEl) eEl.textContent = emoji;
    }

    function selectPlanEmoji(emoji) {
      _selectedPlanEmoji = emoji;
      _updateEmojiSelectorDisplay(_emojiPickerTarget || 'custom', emoji);
      document.querySelectorAll('#emoji-picker-grid .emoji-picker-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.emoji === emoji);
      });
    }

    function toggleEmojiInline(target) {
      const inline = document.getElementById(`plan-${target}-emoji-inline`);
      if (!inline) return;
      if (inline.style.display !== 'none') {
        inline.style.display = 'none';
        return;
      }
      _emojiPickerTarget = target;
      inline.innerHTML = `<div class="emoji-picker-grid" style="padding:8px 0 4px;">${
        PLAN_EMOJIS.map(([e, l]) =>
          `<button class="emoji-picker-btn${_selectedPlanEmoji === e ? ' selected' : ''}" data-emoji="${e}" onclick="selectPlanEmoji('${e}');closeEmojiInline('${target}');">${e}<span class="emoji-label">${l}</span></button>`
        ).join('')
      }</div>`;
      inline.style.display = 'block';
    }

    function closeEmojiInline(target) {
      const inline = document.getElementById(`plan-${target}-emoji-inline`);
      if (inline) inline.style.display = 'none';
      _emojiPickerTarget = null;
    }

    function openEmojiPicker(target) { toggleEmojiInline(target); }
    function closeEmojiPicker() {
      closeEmojiInline('custom');
      closeEmojiInline('detail');
    }

    function selectPlanMember(member) {
      const idx = _selectedPlanMembers.indexOf(member);
      if (idx === -1) _selectedPlanMembers.push(member);
      else _selectedPlanMembers.splice(idx, 1);
      ['plan-custom-member-chips', 'plan-event-member-chips', 'plan-detail-member-chips'].forEach(id => {
        document.querySelectorAll(`#${id} .plan-member-chip`).forEach(b => {
          b.classList.toggle('selected', _selectedPlanMembers.includes(b.dataset.member));
        });
      });
    }

    function selectPlanDate(dateKey) {
      if (_planModalType === 'custom') {
        if (_planModalSelectedDates.has(dateKey)) {
          _planModalSelectedDates.delete(dateKey);
        } else {
          _planModalSelectedDates.add(dateKey);
        }
        document.querySelectorAll('#plan-custom-date-chips .plan-date-chip').forEach(c => {
          c.classList.toggle('selected', _planModalSelectedDates.has(c.dataset.date));
        });
        updateCustomPlanAddBtn();
      } else {
        _planModalSelectedDate = dateKey;
        const prefix = _planModalType === 'event' ? 'plan-event' : 'plan-detail';
        document.querySelectorAll(`#${prefix}-date-chips .plan-date-chip`).forEach(c => {
          c.classList.toggle('selected', c.dataset.date === dateKey);
        });
        if (_planModalType === 'event') updatePlanAddBtn('event');
      }
    }

    function toggleAlldayPlan(modalType) {
      _planModalSelectedStartTime = (_planModalSelectedStartTime === 'allday') ? '09:00' : 'allday';
      _syncTimeInputUI(modalType);
    }

    function onPlanTimeInput(modalType) {
      const prefix = modalType === 'event' ? 'plan-event' : modalType === 'custom' ? 'plan-custom' : 'plan-detail';
      const val = document.getElementById(`${prefix}-time-input`)?.value;
      _planModalSelectedStartTime = val || '09:00';
      document.getElementById(`${prefix}-allday-btn`)?.classList.remove('selected');
    }

    function onPlanTimeFocus(modalType) {
      if (_planModalSelectedStartTime === 'allday') {
        _planModalSelectedStartTime = '09:00';
        _syncTimeInputUI(modalType);
      }
    }

    function _syncTimeInputUI(modalType) {
      const prefix = modalType === 'event' ? 'plan-event' : modalType === 'custom' ? 'plan-custom' : 'plan-detail';
      const alldayBtn = document.getElementById(`${prefix}-allday-btn`);
      const timeInput = document.getElementById(`${prefix}-time-input`);
      if (!alldayBtn || !timeInput) return;
      const isAllday = _planModalSelectedStartTime === 'allday';
      alldayBtn.classList.toggle('selected', isAllday);
      timeInput.style.opacity = isAllday ? '0.35' : '';
      if (isAllday) {
        timeInput.value = '09:00';
      } else if (_planModalSelectedStartTime) {
        timeInput.value = _planModalSelectedStartTime;
      } else {
        timeInput.value = '';
      }
    }

    function getStartTimeLabel(plan, lang) {
      const st = plan.startTime;
      if (st === 'allday') return lang === 'en' ? 'All Day' : '終日';
      if (st) return st;
      if (!plan.slot) return null;
      const labels = lang === 'en' ? PLAN_SLOT_LABELS_EN : PLAN_SLOT_LABELS;
      return labels[plan.slot] || null;
    }

    function getPlanTimeSort(plan) {
      const st = plan.startTime;
      if (st === 'allday') return -1;
      if (st) { const [h, m] = st.split(':').map(Number); return h * 60 + m; }
      const legacyOrder = { allday: -1, morning: 9*60, noon: 12*60, evening: 17*60, night: 19*60 };
      return plan.slot != null ? (legacyOrder[plan.slot] ?? 9999) : 9999;
    }

    function updatePlanAddBtn(type) {
      const btn = document.getElementById(`plan-${type}-add-btn`);
      if (btn) btn.disabled = !_planModalSelectedDate;
    }

    function updateCustomPlanAddBtn() {
      const title = document.getElementById('plan-custom-title')?.value?.trim();
      const addBtn = document.getElementById('plan-custom-add-btn');
      const saveBtn = document.getElementById('plan-custom-save-btn');
      const hasDate = _planModalSelectedDates.size > 0;
      if (addBtn) addBtn.disabled = !(title && hasDate);
      if (saveBtn) saveBtn.disabled = !(title && hasDate);
    }

    async function saveEventPlan() {
      const event = EVENT_REGISTRY[_planModalEventId];
      const pin = getPins()[_planModalEventId];
      const title = event?.store || event?.title || pin?.title || '';
      const emoji = event?.emoji || pin?.emoji || '🎡';
      const area = event?.area || event?.location || pin?.location || '';
      const period = event?.period || pin?.hours || '';
      const meta = [area, period].filter(Boolean).join(' · ');
      const memo = document.getElementById('plan-event-memo')?.value?.trim() || '';
      const _evImp = document.getElementById('plan-event-important-cb')?.checked || false;
      const plans = getEventPlans();
      const _evEntry = { id: 'ep_'+Date.now(), eventId: _planModalEventId, emoji, name: title, meta, dateKey: _planModalSelectedDate, startTime: _planModalSelectedStartTime || null, memo, member: _selectedPlanMembers.length ? [..._selectedPlanMembers] : undefined };
      if (_evImp) _evEntry.important = true;
      plans.push(_evEntry);
      await saveEventPlans(plans);
      _notifyGroupIfChecked('plan-event-notify-cb', title, 'added');
      const pins = getPins();
      if (pins[_planModalEventId]) {
        delete pins[_planModalEventId];
        savePins(pins);
        updatePinButtons();
      }
      closePlanModal();
      showToast(t('toastPlanAdded'));
      renderScheduleTab();
    }

    let _customPlanSelectedDateKeys = [];

    async function saveCustomPlan() {
      const title = document.getElementById('plan-custom-title')?.value?.trim();
      if (!title) return;
      const memo = document.getElementById('plan-custom-memo')?.value?.trim() || '';
      const isEdit = _editingGroupIds.length > 0;
      let plans = getCustomPlans();
      if (isEdit) {
        const oldIds = new Set(_editingGroupIds);
        plans = plans.filter(p => !oldIds.has(p.id));
      }
      const important = document.getElementById('plan-custom-important-cb')?.checked || false;
      const now = Date.now();
      const keys = [..._planModalSelectedDates];
      keys.forEach((dateKey, i) => {
        const entry = {
          id: 'cp_'+(now+i),
          emoji: _selectedPlanEmoji,
          name: title,
          dateKey,
          startTime: _planModalSelectedStartTime || null,
          memo
        };
        if (_selectedPlanMembers.length) entry.member = [..._selectedPlanMembers];
        if (important) entry.important = true;
        plans.push(entry);
      });
      await saveCustomPlans(plans);
      _notifyGroupIfChecked('plan-custom-notify-cb', title, isEdit ? 'updated' : 'added');
      closePlanModal();
      showToast(t(isEdit ? 'toastPlanUpdated' : 'toastPlanAdded'));
      renderScheduleTab();
    }

    async function savePlanDetail() {
      const memo = document.getElementById('plan-detail-memo')?.value?.trim() || '';
      const dtImportant = document.getElementById('plan-detail-important-cb')?.checked || false;
      let planName = '';
      if (_planModalDetailType === 'custom') {
        const title = document.getElementById('plan-detail-title')?.value?.trim();
        if (!title) return;
        planName = title;
        const plans = getCustomPlans();
        const idx = plans.findIndex(p => p.id === _planModalDetailId);
        if (idx !== -1) {
          plans[idx].emoji = _selectedPlanEmoji;
          plans[idx].name = title;
          plans[idx].dateKey = _planModalSelectedDate;
          plans[idx].startTime = _planModalSelectedStartTime || null;
          plans[idx].memo = memo;
          if (_selectedPlanMembers.length) plans[idx].member = [..._selectedPlanMembers]; else delete plans[idx].member;
          if (dtImportant) plans[idx].important = true; else delete plans[idx].important;
          await saveCustomPlans(plans);
        }
      } else {
        const plans = getEventPlans();
        const idx = plans.findIndex(p => p.id === _planModalDetailId);
        if (idx !== -1) {
          planName = plans[idx].name || '';
          plans[idx].dateKey = _planModalSelectedDate;
          plans[idx].startTime = _planModalSelectedStartTime || null;
          plans[idx].memo = memo;
          if (_selectedPlanMembers.length) plans[idx].member = [..._selectedPlanMembers]; else delete plans[idx].member;
          if (dtImportant) plans[idx].important = true; else delete plans[idx].important;
          await saveEventPlans(plans);
        }
      }
      _notifyGroupIfChecked('plan-detail-notify-cb', planName, 'updated');
      closePlanModal();
      showToast(t('toastPlanUpdated'));
      renderScheduleTab();
    }

    async function deleteCustomGroup(idsStr) {
      const ids = new Set(idsStr.split(','));
      await saveCustomPlans(getCustomPlans().filter(p => !ids.has(p.id)));
      showToast(t('toastPlanDeleted'));
      renderScheduleTab();
    }

    function openCustomPlanEdit(groupPlans) {
      lockScroll();
      groupPlans.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
      const first = groupPlans[0];
      _planModalType = 'custom';
      _editingGroupIds = groupPlans.map(p => p.id);
      _planModalSelectedDate = null;
      _planModalSelectedDates = new Set(groupPlans.map(p => p.dateKey));
      _planModalSelectedStartTime = first.startTime != null ? first.startTime : (first.slot === 'allday' ? 'allday' : null);
      _selectedPlanEmoji = first.emoji || '📝';
      _updateEmojiSelectorDisplay('custom', _selectedPlanEmoji);
      document.getElementById('plan-custom-title').value = first.name || '';
      // 編集モードは日付チップセクションを表示する（トリガーUIを隠してチップを表示）
      const _editChips = document.getElementById('plan-custom-date-chips');
      if (_editChips) { _editChips.style.display = ''; _editChips.innerHTML = buildDateChipsHtml(null); }
      document.querySelectorAll('#plan-custom-date-chips .plan-date-chip').forEach(c => {
        c.classList.toggle('selected', _planModalSelectedDates.has(c.dataset.date));
      });
      _syncTimeInputUI('custom');
      _selectedPlanMembers = Array.isArray(first.member) ? [...first.member] : (first.member ? [first.member] : []);
      document.querySelectorAll('#plan-custom-member-chips .plan-member-chip').forEach(b => {
        b.classList.toggle('selected', _selectedPlanMembers.includes(b.dataset.member));
      });
      document.getElementById('plan-custom-memo').value = first.memo || '';
      const _editImpCb = document.getElementById('plan-custom-important-cb');
      if (_editImpCb) _editImpCb.checked = !!first.important;
      document.getElementById('plan-custom-modal-title').textContent = getLang() === 'en' ? 'Edit schedule' : '予定を編集';
      document.getElementById('plan-custom-add-btn').style.display = 'none';
      document.getElementById('plan-custom-edit-footer').style.display = 'flex';
      closePinDropdown();
      _updatePinToggleBtn();
      updateCustomPlanAddBtn();
      _showNotifyCheckboxes();
      document.getElementById('plan-modal-overlay').classList.add('visible');
      document.getElementById('plan-custom-modal').classList.add('visible');
      const customBody = document.querySelector('#plan-custom-modal .plan-modal-body');
      if (customBody) customBody.scrollTop = 0;
    }

    function editCustomGroup(idsStr) {
      const ids = idsStr.split(',');
      const allPlans = getCustomPlans();
      const groupPlans = ids.map(id => allPlans.find(p => p.id === id)).filter(Boolean);
      if (!groupPlans.length) return;
      openCustomPlanEdit(groupPlans);
    }

    function closePlanModal() {
      _blurIfFocusInside('plan-event-modal', 'plan-custom-modal', 'plan-detail-modal');
      unlockScroll();
      closePinDropdown();
      document.getElementById('plan-modal-overlay').classList.remove('visible');
      document.getElementById('plan-event-modal').classList.remove('visible');
      document.getElementById('plan-custom-modal').classList.remove('visible');
      document.getElementById('plan-detail-modal').classList.remove('visible');
      _resetScrollPaddingAfterKb();
      _planModalType = null;
      _planModalSelectedDate = null;
      _planModalSelectedStartTime = null;
      _editingGroupIds = [];
    }

    // ─── PLAN TAB RENDER ───

    function renderCustomPlansList() {
      const container = document.getElementById('custom-plans-list');
      if (!container) return;
      const plans = getCustomPlans();
      if (plans.length === 0) {
        container.innerHTML = `<div class="plan-empty">${t('customPlanEmpty')}</div>`;
        return;
      }
      const today = new Date(); today.setHours(0,0,0,0);
      const _lang = getLang();

      // Group by emoji+name+startTime+memo
      const groupMap = new Map();
      plans.forEach(p => {
        const mKey = Array.isArray(p.member) ? p.member.join(',') : (p.member || '');
        const stKey = p.startTime ?? p.slot ?? '';
        const key = `${p.emoji}|${p.name}|${stKey}|${p.memo||''}|${mKey}`;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(p);
      });

      let animIdx = 0;
      container.innerHTML = [...groupMap.values()].map(group => {
        group.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        const first = group[0];
        const safeIds = group.map(p => p.id).join(',').replace(/'/g, "\\'");
        const dateChips = group.map(p => {
          const [,mm,dd] = p.dateKey.split('-');
          return `<span class="plan-chip">${parseInt(mm)}/${parseInt(dd)}</span>`;
        }).join('');
        const upcoming = group.filter(p => new Date(p.dateKey+'T00:00:00') >= today);
        const mArr = Array.isArray(first.member) ? first.member : (first.member ? [first.member] : []);
        const memberChip = mArr.length ? mArr.map(m => `<span class="plan-chip plan-chip--member">${MEMBER_EMOJIS[m]||''}</span>`).join('') : '';
        return `<div class="plan-card" style="animation-delay:${(animIdx++)*0.05}s;">
          <div class="plan-card-emoji">${first.emoji}</div>
          <div class="plan-card-info">
            <div class="plan-card-title">${escapeHtml(first.name)}</div>
            <div class="plan-card-chips">
              ${dateChips}
              ${getStartTimeLabel(first, _lang) ? `<span class="plan-chip">${getStartTimeLabel(first, _lang)}</span>` : ''}
              ${memberChip}
            </div>
            ${first.memo ? `<div class="plan-card-memo">📝 ${escapeHtml(first.memo)}</div>` : ''}
          </div>
          <button class="plan-card-edit" onclick="editCustomGroup('${safeIds}')">✏️</button>
          <button class="plan-card-delete" onclick="deleteCustomGroup('${safeIds}')">🗑</button>
        </div>`;
      }).join('');
    }

    function renderPinnedEventsList() {
      const container = document.getElementById('pinned-events-list');
      if (!container) return;
      const pins = getPins();
      const entries = Object.values(pins);
      if (entries.length === 0) {
        container.innerHTML = `<div class="plan-empty">${t('pinnedEventsEmpty')}</div>`;
        return;
      }
      container.innerHTML = entries.map((p, i) => {
        const safeTitle = (p.title||'').replace(/'/g,"\\'");
        const safeUrl = (p.url||'').replace(/'/g,"\\'");
        return `<div class="plan-card plan-card--event" style="animation-delay:${i*0.05}s;cursor:pointer;" onclick="openPinDetail('${p.id}')">
          <div class="plan-card-emoji">${p.emoji||'📌'}</div>
          <div class="plan-card-info">
            <div class="plan-card-title">${p.title}</div>
            <div class="card-meta" style="margin-bottom:0;gap:10px;">
              ${p.location ? `<span class="meta-item"><span class="meta-icon">📍</span>${p.location}</span>` : ''}
              ${p.hours ? `<span class="meta-item"><span class="meta-icon">📅</span>${p.hours}</span>` : ''}
            </div>
          </div>
          <div class="plan-card-actions" onclick="event.stopPropagation()">
            <button class="plan-to-plan-btn" onclick="openEventPlanModal('${p.id}')">📅 ${t('addToPlanBtn').replace('📅 ','')}</button>
            <button class="plan-unpin-btn" onclick="removePin('${p.id}')">📌 外す</button>
            <button class="plan-to-plan-btn" onclick="openCourseSheetFromEvent('${p.id}')">${t('courseCreateBtn')}</button>
          </div>
        </div>`;
      }).join('');
    }

    // ─── SCHEDULE PLAN INLINE EXPAND (空き週末日) ───
    let _expandedSchedulePlanKey = null;

    function toggleSchedulePlanExpand(dateKey) {
      if (_expandedSchedulePlanKey === dateKey) {
        _collapseSchedulePlan(dateKey);
        _expandedSchedulePlanKey = null;
        return;
      }
      if (_expandedSchedulePlanKey) _collapseSchedulePlan(_expandedSchedulePlanKey);
      const actions = document.getElementById(`schedule-plan-actions-${dateKey}`);
      if (!actions) return;
      actions.style.display = 'flex';
      _expandedSchedulePlanKey = dateKey;
    }
    function _collapseSchedulePlan(dateKey) {
      const el = document.getElementById(`schedule-plan-actions-${dateKey}`);
      if (el) el.style.display = 'none';
    }
    function _openCourseFromSchedule(dateKey) {
      _collapseSchedulePlan(dateKey);
      _expandedSchedulePlanKey = null;
      window._coursePresetDate = dateKey;
      openCourseSheet();
    }

    // ─── SCHEDULE PLAN ACTION SHEET (空き週末日) ───

    function closeSchedulePlanActionSheet() {
      document.getElementById('schedule-plan-action-overlay').classList.remove('visible');
      document.getElementById('schedule-plan-action-sheet').classList.remove('visible');
      unlockScroll();
    }

    // ─── SCHEDULE ACTION SHEET ───
    let _scheduleActionPlanId = null, _scheduleActionPlanType = null, _scheduleActionEventId = null;

    function openScheduleActionSheet(planId, planType, name, btn, eventId) {
      _scheduleActionPlanId = planId;
      _scheduleActionPlanType = planType;
      _scheduleActionEventId = eventId || null;
      const _san = document.getElementById('schedule-action-name'); if (_san) _san.textContent = name;
      const viewBtn = document.getElementById('schedule-action-view-btn');
      const showView = planType === 'event' && !!eventId;
      viewBtn.style.display = showView ? 'block' : 'none';
      const popover = document.getElementById('schedule-action-sheet');
      const rect = btn.getBoundingClientRect();
      const popH = showView ? 125 : 92;
      let top = rect.bottom + 6;
      if (top + popH > window.innerHeight - 80) top = rect.top - popH - 6;
      popover.style.top = `${top}px`;
      popover.style.right = `${window.innerWidth - rect.right}px`;
      popover.style.left = 'auto';
      const overlay = document.getElementById('schedule-action-overlay');
      overlay.style.display = 'block';
      overlay.style.pointerEvents = 'auto';
      popover.classList.add('visible');
    }

    function closeScheduleActionSheet() {
      const overlay = document.getElementById('schedule-action-overlay');
      overlay.style.display = 'none';
      overlay.style.pointerEvents = 'none';
      document.getElementById('schedule-action-sheet').classList.remove('visible');
      _scheduleActionPlanId = null;
      _scheduleActionPlanType = null;
      _scheduleActionEventId = null;
    }

    function scheduleActionViewCard() {
      const id = _scheduleActionPlanId, type = _scheduleActionPlanType, evId = _scheduleActionEventId;
      closeScheduleActionSheet();
      openEventDetailFromSchedule(evId, id, type);
    }

    function scheduleActionEdit() {
      const id = _scheduleActionPlanId, type = _scheduleActionPlanType;
      closeScheduleActionSheet();
      editScheduleItem(id, type);
    }

    function scheduleActionDelete() {
      const id = _scheduleActionPlanId, type = _scheduleActionPlanType;
      closeScheduleActionSheet();
      deleteScheduleItem(id, type);
    }

    async function deleteScheduleItem(planId, planType) {
      if (planType === 'custom') {
        await saveCustomPlans(getCustomPlans().filter(p => p.id !== planId));
      } else {
        await saveEventPlans(getEventPlans().filter(p => p.id !== planId));
      }
      showToast(t('toastPlanDeleted'));
      renderScheduleTab();
    }

    function handleScheduleRowTap(el) {
      const courseId = el.dataset.courseId;
      if (courseId) {
        openCourseDetail(courseId);
        return;
      }
      const planType = el.dataset.planType;
      const eventId = el.dataset.eventId;
      if (planType === 'event' && eventId) {
        openEventDetailFromSchedule(eventId, el.dataset.planId, planType);
      }
    }

    function editScheduleItem(planId, planType) {
      if (planType === 'event') {
        openPlanDetailModal(planId, 'event');
        return;
      }
      const plans = getCustomPlans();
      const target = plans.find(p => p.id === planId);
      if (!target) return;
      const _mk = m => Array.isArray(m) ? m.join(',') : (m || '');
      const _stk = p => p.startTime ?? p.slot ?? '';
      const groupKey = `${target.emoji}|${target.name}|${_stk(target)}|${target.memo||''}|${_mk(target.member)}`;
      openCustomPlanEdit(plans.filter(p => `${p.emoji}|${p.name}|${_stk(p)}|${p.memo||''}|${_mk(p.member)}` === groupKey));
    }

    // ─── FAB PLAN SPEED DIAL ───
    function _renderPlanPinsList() {
      const container = document.getElementById('plan-custom-pins-container');
      const list = document.getElementById('plan-custom-pins-list');
      if (!container || !list) return;
      const pins = Object.values(getPins());
      if (!pins.length) { container.style.display = 'none'; return; }
      const currentTitle = (document.getElementById('plan-custom-title')?.value || '').trim();
      list.innerHTML = pins.map((p, i) => {
        const safeId = (p.id || p.title).replace(/'/g, "\\'");
        const sel = currentTitle && currentTitle === (p.title || '').slice(0, 40);
        return `<button onclick="fillPlanFromPin('${safeId}')"
          style="display:flex;align-items:center;gap:8px;padding:9px 12px;width:100%;
                 font-size:14px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;text-align:left;
                 border:none;border-top:${i > 0 ? '1px solid var(--border-color,#e8e0d8)' : 'none'};
                 background:${sel ? 'var(--caramel-pale)' : 'var(--warm-white)'};
                 color:${sel ? 'var(--caramel)' : 'var(--midnight)'};font-weight:${sel ? '700' : 'normal'};">
          <span style="flex-shrink:0;width:18px;height:18px;border-radius:4px;
                 border:1.5px solid ${sel ? 'var(--caramel)' : 'var(--light-gray)'};
                 background:${sel ? 'var(--caramel)' : ''};color:#fff;
                 display:inline-block;line-height:15px;text-align:center;font-size:13px;align-self:center;">
            ${sel ? '✓' : ''}</span>
          <span style="font-size:16px;flex-shrink:0;align-self:center;line-height:1;">${p.emoji || '📌'}</span>
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || ''}</span>
        </button>`;
      }).join('');
      container.style.display = '';
    }

    function _updatePinToggleBtn() { _renderPlanPinsList(); }
    function togglePinDropdown() {}
    function closePinDropdown() {}

    function fillPlanFromPin(pinId) {
      const pin = getPins()[pinId];
      if (!pin) return;
      _selectedPlanEmoji = pin.emoji || '📝';
      _updateEmojiSelectorDisplay('custom', _selectedPlanEmoji);
      const titleInput = document.getElementById('plan-custom-title');
      if (titleInput) titleInput.value = (pin.title || '').slice(0, 40);
      updateCustomPlanAddBtn();
      _renderPlanPinsList();
    }

    // ─── PIN PICKER SHEET ───
    function refreshPinPicker() {
      const pins = getPins();
      const entries = Object.values(pins);
      const list = document.getElementById('pin-picker-list');
      if (!list) return;
      const isEn = getLang() === 'en';
      if (entries.length === 0) {
        list.innerHTML = `<div class="pin-empty" style="padding:32px 0;"><div class="pin-empty-emoji">📌</div><div class="pin-empty-title">${t('pinEmpty')}</div></div>`;
      } else {
        list.innerHTML = entries.map(p => {
          const safeId = p.id.replace(/'/g, "\\'");
          return `<div class="unscheduled-pin-row">
            <span class="unscheduled-pin-emoji">${p.emoji || '📌'}</span>
            <span class="unscheduled-pin-name">${p.title || ''}</span>
            <button class="unscheduled-pin-remove" onclick="removePin('${safeId}'); refreshPinPicker();" title="${isEn ? 'Unpin' : 'ピンを外す'}">📌</button>
            <button class="unscheduled-pin-add" onclick="closePinPicker(); openEventPlanModal('${safeId}')">${isEn ? '+ Add' : '＋ 追加'}</button>
          </div>`;
        }).join('');
      }
    }

    function closePinPicker() {
      document.getElementById('pin-picker-overlay')?.classList.remove('visible');
      document.getElementById('pin-picker-sheet')?.classList.remove('visible');
      unlockScroll();
    }

    // ─── SCHEDULE TAB RENDER ───
    const PLAN_SLOT_ORDER = { allday:0, morning:1, noon:2, evening:3, night:4 };
    const PLAN_SLOT_LABELS = { allday:'🗓 終日', morning:'☀️ 午前', noon:'🌞 昼', evening:'🌇 夕方', night:'🌙 夜' };
    const PLAN_SLOT_LABELS_EN = { allday:'🗓 All Day', morning:'☀️ Morning', noon:'🌞 Noon', evening:'🌇 Evening', night:'🌙 Night' };
    const MEMBER_EMOJIS = { papa: '👨', mama: '👩', boy: '👦', girl: '👧', dog: '🐕', cat: '🐱' };

    // [ja, en] ペア。en が空なら日本語をそのまま使う
    const JP_EVENTS_FIXED = {
      '1/1':  ['元日',           "New Year's"],
      '1/7':  ['七草',           ''],
      '2/3':  ['節分',           'Setsubun'],
      '2/14': ['バレンタイン',   "Valentine's"],
      '3/3':  ['ひな祭り',       'Hinamatsuri'],
      '3/14': ['ホワイトデー',   'White Day'],
      '4/1':  ['エイプリルフール','April Fools'],
      '5/5':  ['こどもの日',     "Children's Day"],
      '7/7':  ['七夕',           'Tanabata'],
      '8/13': ['お盆',           'Obon'],
      '10/31':['ハロウィン',     'Halloween'],
      '11/15':['七五三',         ''],
      '12/24':['クリスマスイブ', 'Xmas Eve'],
      '12/25':['クリスマス',     'Christmas'],
      '12/31':['大晦日',         "New Year's Eve"],
    };
    function _nthWeekday(year, month0, weekday, n) {
      const d = new Date(year, month0, 1); let cnt = 0;
      while (d.getMonth() === month0) {
        if (d.getDay() === weekday && ++cnt === n) return d.getDate();
        d.setDate(d.getDate() + 1);
      }
      return -1;
    }
    function getJpEvent(date) {
      const y = date.getFullYear(), m = date.getMonth(), day = date.getDate();
      const isEn = getLang() === 'en';
      const pick = (ja, en) => isEn && en ? en : ja;
      const fixed = JP_EVENTS_FIXED[`${m+1}/${day}`];
      if (fixed) return pick(fixed[0], fixed[1]);
      if (m === 4 && day === _nthWeekday(y, 4, 0, 2)) return pick('母の日', "Mother's Day");
      if (m === 5 && day === _nthWeekday(y, 5, 0, 3)) return pick('父の日', "Father's Day");
      return null;
    }



    function renderScheduleTab() {
      _expandedSchedulePlanKey = null;
      const container = document.getElementById('schedule-content');
      if (!container) return;
      const weeks = getScheduleWeeks();
      const customPlans = getCustomPlans();
      const eventPlans = getEventPlans();
      const isEn = getLang() === 'en';
      const dayNamesJa = ['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日'];
      const dayNamesEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayNames = isEn ? dayNamesEn : dayNamesJa;
      const holidays = getCityHolidays();
      const isHoliday = d => holidays.some(h => fmtDateKey(h) === fmtDateKey(d));

      const todayDate = new Date(); todayDate.setHours(0,0,0,0);
      let html = '';
      weeks.forEach((g, gi) => {
        const smm = parseInt(g.startStr.slice(5,7)), sdd = parseInt(g.startStr.slice(8,10));
        const emm = parseInt(g.endStr.slice(5,7)), edd = parseInt(g.endStr.slice(8,10));
        const rangeStr = smm === emm ? `${smm}/${sdd}〜${edd}` : `${smm}/${sdd}〜${emm}/${edd}`;

        const daysHtml = g.allDays.map(d => {
          if (d < todayDate) return ''; // 過去の日は表示しない
          const key = fmtDateKey(d);
          const dow = d.getDay();
          const isHolidayDay = isHoliday(d);
          const isWeekday = dow >= 1 && dow <= 5 && !isHolidayDay;

          const dayCustom = customPlans.filter(p => p.dateKey === key);
          const dayEvent  = eventPlans.filter(p => p.dateKey === key);
          const allItems  = [
            ...dayCustom.map(p => ({...p, pType:'custom'})),
            ...dayEvent.map(p => ({...p, pType:'event'})),
          ].sort((a,b) => getPlanTimeSort(a) - getPlanTimeSort(b));

          // 平日は予定がある日のみ表示
          if (isWeekday && allItems.length === 0) return '';

          let numCls = 'schedule-day-num';
          if (dow === 0 || isHolidayDay) numCls += ' schedule-day-num--sun';
          else if (dow === 6) numCls += ' schedule-day-num--sat';

          const countBadge = allItems.length > 0 ? `<span class="schedule-day-count">${t('scheduleDayCount').replace('{n}', allItems.length)}</span>` : '';
          const dateKey = key;
          const rowsHtml = allItems.length > 0
            ? allItems.map(item => {
                const emojiCls = item.pType === 'event' ? 'schedule-row-emoji--event' : 'schedule-row-emoji--custom';
                const st = item.startTime;
                let timeHtml = '';
                if (st === 'allday') {
                  timeHtml = `<span class="schedule-row-time-allday">${isEn ? 'All day' : '終日'}</span>`;
                } else if (st) {
                  timeHtml = `<span class="schedule-row-time-hm">${st}</span>`;
                } else if (item.slot) {
                  const legacyLabels = isEn ? PLAN_SLOT_LABELS_EN : PLAN_SLOT_LABELS;
                  const legacyLabel = legacyLabels[item.slot];
                  if (legacyLabel) timeHtml = `<span class="schedule-row-time-allday" style="font-size:9px;text-align:center;line-height:1.3;">${legacyLabel}</span>`;
                }
                const safeItemId = item.id.replace(/'/g,"\\'");
                const safeEventId = (item.eventId||'').replace(/'/g,"\\'");
                const safePType = item.pType.replace(/'/g,"\\'");
                const safeCourseId = (item.courseId||'').replace(/'/g,"\\'");
                const mArr2 = Array.isArray(item.member) ? item.member : (item.member ? [item.member] : []);
                const memberHtml = mArr2.map(m => MEMBER_EMOJIS[m] ? `<span class="schedule-member-chip schedule-member-chip--${m}"><span class="member-icon">${MEMBER_EMOJIS[m]}</span></span>` : '').join('');
                const memoHtml = item.memo ? `<span class="schedule-row-memo">📝 ${escapeHtml(item.memo)}</span>` : '';
                const safeName = item.name.replace(/'/g,"\\'");
                const importantCls = item.important ? ' schedule-row--important' : '';
                return `<div class="schedule-swipe-wrap">
                  <div class="schedule-row${importantCls}"
                    data-plan-id="${safeItemId}"
                    data-plan-type="${safePType}"
                    data-event-id="${safeEventId}"
                    data-course-id="${safeCourseId}"
                    onclick="handleScheduleRowTap(this)">
                    <div class="schedule-row-time">${timeHtml}</div>
                    <div class="schedule-row-content">
                      <div class="schedule-row-emoji ${emojiCls}">${item.emoji}</div>
                      <div class="schedule-row-info">
                        <div class="schedule-row-name">${escapeHtml(item.name)}</div>
                        ${memberHtml || memoHtml ? `<div class="schedule-row-meta">${memberHtml}${memoHtml}</div>` : ''}
                      </div>
                      <button class="schedule-row-menu-btn" onclick="event.stopPropagation(); openScheduleActionSheet('${safeItemId}','${safePType}','${safeName}',this,'${safeEventId}')">⋮</button>
                    </div>
                  </div>
                </div>`;
              }).join('')
            : isWeekday
              ? `<div class="schedule-empty-day">${t('scheduleNoPlans')}</div>`
              : `<div class="schedule-empty-day" style="padding:0;overflow:hidden;">
                   <div style="cursor:pointer;text-align:center;padding:10px 14px;"
                     onclick="toggleSchedulePlanExpand('${dateKey}')">
                     <span style="font-size:13px;color:var(--light-gray);">＋ ${t('scheduleMakePlan')}</span>
                   </div>
                   <div id="schedule-plan-actions-${dateKey}"
                     style="display:none;padding:4px 12px 10px;justify-content:center;gap:6px;">
                     <button class="card-action-btn" style="flex:none;width:calc(33% - 4px);"
                       onclick="event.stopPropagation();openCustomPlanModal('${dateKey}')">
                       <span class="card-action-icon">📅</span><span>予定を追加</span>
                     </button>
                     <button class="card-action-btn" style="flex:none;width:calc(33% - 4px);"
                       onclick="event.stopPropagation();_openCourseFromSchedule('${dateKey}')">
                       <span class="card-action-icon">🗺</span><span>${t('courseCreateBtnShort')}</span>
                     </button>
                   </div>
                 </div>`;

          const cityHolidayName = getCityHolidayName(d);
          const jpEvent = cityHolidayName ? null : getJpEvent(d);
          const eventLabel = cityHolidayName || jpEvent;
          const cardCls = isWeekday ? 'schedule-day-card schedule-day-card--weekday' : 'schedule-day-card';
          return `<div class="${cardCls}">
            <div class="schedule-day-header">
              <div class="schedule-day-num-col"><div class="${numCls}">${d.getDate()}</div></div>
              <div class="schedule-day-right">
                <div class="schedule-day-label">${dayNames[dow]}</div>
                ${eventLabel ? `<div class="schedule-jp-event">${cityHolidayName ? '🎌' : '🎉'} ${eventLabel}</div>` : ''}
              </div>
              ${countBadge}
            </div>
            ${rowsHtml}
          </div>`;
        }).join('');

        html += `<div class="schedule-week-group">
          <div class="schedule-week-header">
            ${g.label}
            <span style="font-size:14px;color:var(--warm-gray);font-family:'Noto Sans JP',sans-serif;font-weight:400;">${rangeStr}</span>
            ${g.isLong?`<span class="schedule-holiday-badge">${t('scheduleHolidayBadge')}</span>`:''}
          </div>
          ${daysHtml}
        </div>`;
      });
      container.innerHTML = html;
      adjustScheduleRowNames();
    }

    function adjustScheduleRowNames() {
      document.querySelectorAll('.schedule-row-name').forEach(el => {
        if (el.scrollWidth <= el.clientWidth) return;
        el.style.fontSize = '13px';
        if (el.scrollWidth <= el.clientWidth) return;
        el.style.fontSize = '15px';
        el.style.whiteSpace = 'normal';
        el.style.display = '-webkit-box';
        el.style.webkitLineClamp = '2';
        el.style.webkitBoxOrient = 'vertical';
        el.style.textOverflow = 'unset';
      });
    }

    // ─── CALENDAR LOGIC ───
    function buildCalendarEvents(year, month) {
      const eventMap = {}; // { date: { events: [], sales: [] } }

      const addToMap = (date, bucket, item) => {
        if (!eventMap[date]) eventMap[date] = { events: [], sales: [] };
        eventMap[date][bucket].push(item);
      };

      // EVENT_DATA のみ使用（typeでバッジ色を分ける）
      const { who: calWhoList, age: calAge } = getProfile();
      const filteredCalEvents = EVENT_DATA.filter(e => {
        const eAge = Array.isArray(e.age) ? e.age : (e.age ? [e.age] : ['all']);
        const ageMatch = calAge === 'all' || eAge.includes(calAge) || eAge.includes('all');
        const eWho = Array.isArray(e.who) ? e.who : null;
        const whoMatch = calWhoList.length === 0 || !eWho || calWhoList.some(w => eWho.includes(w));
        return ageMatch && whoMatch;
      });
      filteredCalEvents.forEach(e => {
        if (!e.start_date || !e.end_date) return;
        const badgeClass = e.type === 'gourmet' ? 'cal-count-gourmet'
                         : e.type === 'sale'    ? 'cal-count-sale'
                         : 'cal-count-event';
        // event typeはeventsバケット、それ以外はsalesバケット
        const bucket = e.type === 'event' ? 'events' : 'sales';
        let d = new Date(e.start_date + 'T00:00:00');
        const end = new Date(e.end_date + 'T00:00:00');
        while (d <= end) {
          if (d.getFullYear() === year && d.getMonth() === month) {
            addToMap(d.getDate(), bucket, {
              id: e.id,
              title: e.store || e.title || '',
              location: e.location || '',
              hours: e.period || '',
              tip: e.tip || e.content || '',
              emoji: e.emoji || '📍',
              badgeClass,
            });
          }
          d.setDate(d.getDate() + 1);
        }
      });

      return eventMap;
    }

    const CAL_MONTHS_TO_SHOW = 12; // 今月から12ヶ月分表示

    function renderCalendarMonth(year, month) {
      const today = new Date();
      const eventMap = buildCalendarEvents(year, month);
      const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
      const weeks = totalCells / 7;

      // 連休の日付マップ {date: vacationName}
      const vacationMap = {};
      getLongVacations().forEach(vac => {
        let d = new Date(vac.start); d.setHours(0,0,0,0);
        const end = new Date(vac.end); end.setHours(0,0,0,0);
        while (d <= end) {
          if (d.getFullYear() === year && d.getMonth() === month) {
            vacationMap[d.getDate()] = vac.name;
          }
          d = new Date(d); d.setDate(d.getDate() + 1);
        }
      });

      const sgHolidaySet = new Set();
      getCityHolidays().forEach(h => {
        if (h.getFullYear() === year && h.getMonth() === month) sgHolidaySet.add(h.getDate());
      });

      const DAY_LABELS = ['日','月','火','水','木','金','土'];
      const headerHtml = DAY_LABELS.map((d, i) =>
        `<div class="cal-day-label" style="${i===0?'color:var(--terracotta)':i===6?'color:var(--sky)':''}">${d}</div>`
      ).join('');

      let weeksHtml = '';
      for (let w = 0; w < weeks; w++) {
        let cellsHtml = '';
        // この週で連休が占めるセルの範囲を計算（バー描画用）
        let barStart = -1, barEnd = -1;
        const cellUnit = 100 / 7;

        for (let c = 0; c < 7; c++) {
          const i = w * 7 + c;
          let date, isOtherMonth = false;
          if (i < firstDay || i >= firstDay + daysInMonth) {
            isOtherMonth = true; date = 0;
          } else {
            date = i - firstDay + 1;
          }

          if (!isOtherMonth && date && vacationMap[date]) {
            if (barStart === -1) barStart = c;
            barEnd = c;
          }

          const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isPast = !isOtherMonth && date > 0 &&
            new Date(year, month, date) < todayMidnight;
          const isToday = !isOtherMonth &&
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === date;
          const dayData = !isOtherMonth && !isPast && date ? eventMap[date] : null;
          const hasEvent = dayData && (dayData.events.length > 0 || dayData.sales.length > 0);

          const isHoliday = !isOtherMonth && !isPast && !!date && sgHolidaySet.has(date);

          let classes = 'cal-cell';
          if (isOtherMonth || isPast) classes += ' other-month';
          if (isToday) classes += ' today';
          if (hasEvent) classes += ' has-event';
          if (isHoliday) classes += ' sg-holiday';

          const sunStyle = c === 0 && !isOtherMonth && !isPast && !isHoliday ? 'color:var(--terracotta)' : '';
          const satStyle = c === 6 && !isOtherMonth && !isPast && !isHoliday ? 'color:var(--sky)' : '';
          const dateStyle = isToday ? '' : (sunStyle || satStyle);

          if (isOtherMonth || isPast) {
            cellsHtml += `<div class="${classes}"></div>`;
          } else {
            // 件数バッジ
            let badgesHtml = '';
            if (hasEvent) {
              const ec = dayData.events.length;
              const sc = dayData.sales.length;
              const allItems = [...dayData.events, ...dayData.sales];
              const total = ec + sc;
              badgesHtml = `<div class="cal-event-counts">
                <span class="cal-count-badge cal-count-event">${total}</span>
              </div>`;
              const clickAttr = ` onclick='showCalPopup(${date}, ${year}, ${month+1}, ${JSON.stringify(allItems).replace(/'/g,"&#39;")})'`;
              cellsHtml += `<div class="${classes}"${clickAttr}>
                <span class="cal-date"${dateStyle ? ` style="${dateStyle}"` : ''}>${date}</span>

                ${badgesHtml}
              </div>`;
            } else {
              cellsHtml += `<div class="${classes}">
                <span class="cal-date"${dateStyle ? ` style="${dateStyle}"` : ''}>${date}</span>

              </div>`;
            }
          }
        }

        // 連休バーを週の中のセル範囲に重ねて描画
        let barHtml = '';
        if (barStart !== -1) {
          const left = barStart * cellUnit;
          const width = (barEnd - barStart + 1) * cellUnit;
          // バーの最初のセルに連休名を表示
          const vacName = (() => {
            for (let c = barStart; c <= barEnd; c++) {
              const i = w * 7 + c;
              const date = i < firstDay ? 0 : i - firstDay + 1;
              if (date && vacationMap[date]) return vacationMap[date];
            }
            return '';
          })();
          // 連休開始日かどうか（この週の最初のバーセルが連休全体の最初か）
          const firstVacDate = (() => {
            for (let c = barStart; c <= barEnd; c++) {
              const i = w * 7 + c;
              const date = i - firstDay + 1;
              return date;
            }
          })();
          const showLabel = firstVacDate && !vacationMap[firstVacDate - 1];

          const vacNameEn = { '春休み': 'Spring Break', 'ゴールデンウィーク': 'Golden Week', '夏休み': 'Summer Break', '冬休み': 'Winter Break' };
          const displayVacName = getLang() === 'en' ? (vacNameEn[vacName] || vacName) : vacName;
          const sijsSuffix = getLang() === 'en' ? '(SIJS)' : '（SIJS）';
          barHtml = `<div class="cal-vacation-bar" style="left:calc(${left}% + 2px);width:calc(${width}% - 4px);">
            ${showLabel ? `<span style="position:absolute;left:4px;top:-12px;font-size:8px;color:var(--caramel);font-weight:700;white-space:nowrap;opacity:0.85;">${displayVacName}<span style="font-weight:400;opacity:0.75;"> ${sijsSuffix}</span></span>` : ''}
          </div>`;
        }

        weeksHtml += `<div class="cal-week">${barHtml}${cellsHtml}</div>`;
      }

      return `
        <div class="cal-month-block">
          <div class="cal-month-heading">${year}年 ${monthNames[month]}</div>
          <div class="cal-grid-header">${headerHtml}</div>
          <div class="cal-grid">${weeksHtml}</div>
        </div>`;
    }

    function renderCalendar() {
      const wrap = document.getElementById('cal-months-wrap');
      if (!wrap) return; // 旧カレンダー廃止
      const today = new Date();
      let html = '';
      for (let i = 0; i < CAL_MONTHS_TO_SHOW; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        html += renderCalendarMonth(d.getFullYear(), d.getMonth());
      }
      wrap.innerHTML = html;
    }

    let _calPopupAllEvents = [];
    let _calPopupFilters = new Set();
    let _calPopupDateLabel = '';

    function showCalPopup(date, year, month, events) {
      lockScroll();
      _calPopupAllEvents = Array.isArray(events) ? events : [events];
      _calPopupFilters.clear();
      const lang = getLang();
      _calPopupDateLabel = lang === 'en' ? `${month}/${date}/${year}` : `${year}年${month}月${date}日`;

      document.querySelectorAll('#cal-popup-filter-row .sale-filter-chip').forEach(chip => {
        chip.classList.remove('active');
      });

      renderCalPopupEvents();
      document.getElementById('cal-popup').classList.add('visible');
      document.getElementById('cal-popup-overlay').classList.add('visible');
      document.getElementById('cal-popup-events').scrollTop = 0;
      document.getElementById('cal-popup-fab').classList.remove('visible');
    }

    function setCalPopupFilter(cat) {
      if (_calPopupFilters.has(cat)) {
        _calPopupFilters.clear();
      } else {
        _calPopupFilters.clear();
        _calPopupFilters.add(cat);
      }
      document.querySelectorAll('#cal-popup-filter-row .sale-filter-chip').forEach(chip => {
        chip.classList.toggle('active', _calPopupFilters.has(chip.dataset.cat));
      });
      renderCalPopupEvents();
      document.getElementById('cal-popup-events').scrollTop = 0;
    }

    function renderCalPopupEvents() {
      const lang = getLang();
      const filtered = _calPopupFilters.size === 0
        ? _calPopupAllEvents
        : _calPopupAllEvents.filter(ev => {
            const full = ev.id ? EVENT_REGISTRY[ev.id] : null;
            if (!full) return false;
            return _calPopupFilters.has(full.type);
          });

      filtered.sort((a, b) => {
        const fa = a.id ? EVENT_REGISTRY[a.id] : null;
        const fb = b.id ? EVENT_REGISTRY[b.id] : null;
        const da = fa && fa.start_date ? new Date(fa.start_date) : new Date(0);
        const db = fb && fb.start_date ? new Date(fb.start_date) : new Date(0);
        return calSortOrder === 'desc' ? db - da : da - db;
      });

      const count = filtered.length;
      document.getElementById('cal-popup-date').textContent = _calPopupDateLabel;
      document.getElementById('cal-popup-count').textContent = lang === 'en'
        ? `${count} item${count !== 1 ? 's' : ''}`
        : `${count}件`;

      const cardsHtml = filtered.map((ev, i) => {
        const fullEvent = ev.id ? EVENT_REGISTRY[ev.id] : null;
        if (fullEvent) return renderEventCard(fullEvent, i) || '';
        return `
        <div class="cal-popup-event-item">
          <div class="cal-popup-title">${ev.emoji} ${escapeHtml(ev.title)}</div>
          <div class="cal-popup-meta">
            <span>📍 ${escapeHtml(ev.location)}</span>
            <span>📅 ${escapeHtml(ev.hours)}</span>
          </div>
          ${ev.tip ? `<div class="cal-popup-tips">${escapeHtml(ev.tip)}</div>` : ''}
        </div>`;
      }).join('');
      const lang2 = getLang();
      const eventsEl = document.getElementById('cal-popup-events');
      if (cardsHtml) {
        eventsEl.classList.remove('empty');
        eventsEl.innerHTML = cardsHtml;
      } else {
        eventsEl.classList.add('empty');
        eventsEl.innerHTML = `<div style="text-align:center;color:var(--warm-gray);font-size:14px;">${lang2 === 'en' ? 'No items for this category' : 'このカテゴリの\nイベントはありません'}</div>`;
      }
      updatePinButtons();
    }

    function closeCalPopup() {
      unlockScroll();
      document.getElementById('cal-popup').classList.remove('visible');
      document.getElementById('cal-popup-overlay').classList.remove('visible');
    }

    renderCalendar();
    updateCalSyncBtn();
    checkJoinParam();

    // ─── HIDDEN GEMS DATA ───
    const GEMS_DATA = [
      {
        id: 'g1',
        emoji: '🍜',
        bgClass: 'ramen',
        badge: '隠れた名店',
        name: '麺屋 暁（あかつき）',
        location: 'Tanjong Pagar',
        hours: '11:30〜14:30 / 18:00〜22:00（月曜定休）',
        teaser: '元ミシュランシェフが脱サラして開いた、行列のできる博多ラーメン店。',
        owner: '東京の有名フレンチレストランで10年修行した後、故郷の博多ラーメンへの愛が忘れられず、2019年にシンガポールへ。「本物の博多の味を世界に届けたい」という思いで、毎朝4時から豚骨スープを仕込む。食材は可能な限り日本から空輸。妻のエリさんが担当するデザートの抹茶プリンも密かな人気メニュー。',
        residentAuthor: 'シンガポール在住 5年目・Mさん（2児のママ）',
        residentText: '子どもたちがラーメン好きで毎月通っています。子ども用の細麺・薄味対応をお願いすると快く対応してくれます。ランチは13時を過ぎると少し空くので、その時間を狙うのがコツ。駐車場はないのでMRT Tanjong Pagar駅から徒歩5分。',
        tips: [
          '人気No.1は「特製とんこつ $18」。麺の硬さは「バリカタ」で注文すると本場の食感',
          '12時〜13時は行列必至。13時15分以降に行くとほぼ待たずに入れる',
          'ランチの〆に頼める「替え玉 $2」はコスパ最高。ニンニクは自分で入れる派がコツ',
          '駐車場なし。Tanjong Pagar駅A出口から徒歩5分',
          'テイクアウト不可。必ず店内で食べること',
        ],
      },
      {
        id: 'g2',
        emoji: '☕',
        bgClass: 'cafe',
        badge: '穴場カフェ',
        name: 'Forest Brew',
        location: 'Dempsey Hill',
        hours: '9:00〜18:00（火曜定休）',
        teaser: 'Dempsey Hillの森の中に隠れた、地元在住者だけが知るオーガニックカフェ。',
        owner: 'マレーシア出身のLinaとシンガポール人のJamesが2021年に開業。2人とも元々はIT業界出身で、コロナ禍をきっかけに「本当にやりたいこと」を追求してカフェをオープン。コーヒー豆はスマトラとエチオピアから直接仕入れ、フードは全てオーガニック食材を使用。小さな農園も裏に持っており、ハーブは自家栽培。',
        residentAuthor: 'シンガポール在住 3年目・Kさん（ワーキングマム）',
        residentText: '週末の午前中に子どもを連れてよく来ます。広い庭があって子どもが走り回れるので、ゆっくりコーヒーを楽しめます。ベビーチェアも完備。パンケーキが絶品で、うちの子は毎回これをリクエスト。駐車場も広いので車でのアクセスが楽です。',
        tips: [
          '人気メニューは「シングルオリジン フラットホワイト $7」と「バナナパンケーキ $14」',
          '庭席は週末の10時前後に埋まる。9時台に来ると確実に取れる',
          '犬同伴OK。ペット用の水とおやつも用意してくれる',
          'Dempsey Hillの奥まった場所にあるのでGoogleマップ必須。看板が小さくて見逃しやすい',
          'テイクアウトのコーヒー豆（$28/250g）はお土産にも最適',
        ],
      },
      {
        id: 'g3',
        emoji: '🌊',
        bgClass: 'park',
        badge: '知る人ぞ知る',
        name: 'Coney Island Park',
        location: 'Punggol',
        hours: '7:00〜19:00（年中無休）',
        teaser: 'シンガポール北東端の小島。地元ファミリーだけが知る「もうひとつのセントーサ」。',
        owner: '観光化されていない自然保護区で、シンガポール政府が管理する公園。1980年代まで民間所有だったが、現在は誰でも無料でアクセスできる。島内には在来種の植物や野鳥が生息し、自然観察の場としても貴重。ローカルのサイクリストや家族連れに人気だが、観光客にはほとんど知られていない。',
        residentAuthor: 'シンガポール在住 7年目・Tさん（小学生2人のパパ）',
        residentText: '子どもたちが小さいうちから毎年来ています。サイクリングロードが整備されていて、6歳くらいから自転車で一周できます。島内に売店はないので、飲み物・おやつは必ず持参。朝7時に入ると人も少なく、野生のオオトカゲや珍しい鳥に会えることも。日が高くなる前に切り上げるのがベスト。',
        tips: [
          '入口はPunggol Promenade Nature Walk側のみ。迷ったらGoogleマップで「Coney Island West Entrance」と検索',
          'レンタル自転車あり（入口付近 $8/時間）。6歳以上なら一周（約4km）楽しめる',
          '売店ゼロ。水・おやつ・虫除けスプレーは必ず持参',
          '野生のカピバラが目撃される唯一のスポット。朝7〜9時が遭遇率高め',
          '日陰が少ないので帽子必須。10時以降は気温が上がり子どもにはきつい',
        ],
      },
    ];

    function renderGems() {
      const container = document.getElementById('gems-scroll');
      if (!container) return;
      container.innerHTML = GEMS_DATA.map((g, i) => `
        <div class="gem-card" style="animation-delay:${i * 0.1}s" onclick="openDetail('${g.id}')">
          <div class="gem-image ${g.bgClass}">
            <span class="gem-badge">${g.badge}</span>
            ${g.emoji}
          </div>
          <div class="gem-body">
            <div class="gem-name">${g.name}</div>
            <div class="gem-meta">📍 ${g.location}</div>
            <div class="gem-teaser">${g.teaser}</div>
          </div>
        </div>`).join('');
    }

    function openDetail(id) {
      const g = GEMS_DATA.find(x => x.id === id);
      if (!g) return;

      document.getElementById('detail-emoji').textContent = g.emoji;
      document.getElementById('detail-header-img').className = 'detail-header-img ' + g.bgClass;
      document.getElementById('detail-badge').textContent = g.badge;
      document.getElementById('detail-title').textContent = g.name;
      document.getElementById('detail-meta-row').innerHTML = `
        <span class="detail-meta-item">📍 ${g.location}</span>
        <span class="detail-meta-item">🕐 ${g.hours}</span>`;
      document.getElementById('detail-owner').textContent = g.owner;
      document.getElementById('detail-resident-author').textContent = g.residentAuthor;
      document.getElementById('detail-resident-text').textContent = g.residentText;
      document.getElementById('detail-tips-list').innerHTML =
        g.tips.map(t => `<li>${t}</li>`).join('');

      const screen = document.getElementById('detail-screen');
      screen.classList.add('visible');
      screen.scrollTop = 0;
    }

    function closeDetail() {
      document.getElementById('detail-screen').classList.remove('visible');
    }

    renderGems();

    // ─── SHARE APP ───
    async function shareApp(spotName, eventUrl) {
      const appUrl = 'https://dosuru.app';
      const cityMeta = CITY_META[getCity()] || CITY_META.sg;
      const appPromo = `📱 おでかけNavi — ${cityMeta.subtitleJa}\n${appUrl}`;
      const shareData = eventUrl
        ? {
            title: spotName || 'おでかけNavi',
            text: `「${spotName}」が気になってます！\n\n${appPromo}`,
            url: eventUrl,
          }
        : {
            title: 'おでかけNavi',
            text: `${cityMeta.subtitleJa}！週末どうする？はここで決まる👇`,
            url: appUrl,
          };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(eventUrl || appUrl);
          showToast('🔗 URLをコピーしました！');
        }
      } catch(e) {
        if (e.name !== 'AbortError') showToast('🔗 URLをコピーしました！');
      }
    }

    // ─── TOAST ───
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ─── PULL-TO-REFRESH ───



    // ─── パスフレーズ由来の鍵導出（共通ヘルパー、設計書54/55）───
    // 個人予定表バックアップ（設計書54）・共有カレンダー（設計書55）の両方から呼ばれる。
    // 「鍵導出アルゴリズムの関数のみ共通化し、パスフレーズ自体・保存先キー・保存値は完全に分離する」方針（設計書55 §4）。
    function _b64urlEncode(bytes) {
      return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    }
    function _b64urlDecode(b64) {
      return Uint8Array.from(atob(b64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    }
    function _genSaltB64() {
      return _b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
    }
    // パスフレーズ文字列 + salt(Base64url) から AES-256-GCM の CryptoKey を導出する（PBKDF2, iterations:100000, SHA-256）
    async function _deriveKeyFromPassphrase(passphrase, saltB64) {
      const saltBytes = _b64urlDecode(saltB64);
      const baseKey = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
      );
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    }
    // CryptoKeyをraw exportしてBase64url化する（案X-B: 端末保存・自動復元用。導出済み鍵materialのみ保存し、平文パスフレーズ自体は保存しない）
    async function _exportKeyMaterial(cryptoKey) {
      const raw = await crypto.subtle.exportKey('raw', cryptoKey);
      return _b64urlEncode(raw);
    }
    async function _importKeyMaterial(b64) {
      return crypto.subtle.importKey('raw', _b64urlDecode(b64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    // CryptoKeyオブジェクトを直接受け取る汎用の暗号化・復号（IV12バイト先頭付与、Base64url、既存_encryptPlans/_decryptPlansと同パターン）
    async function _encryptWithKey(cryptoKey, data) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(JSON.stringify(data)));
      const buf = new Uint8Array(12 + ct.byteLength);
      buf.set(iv); buf.set(new Uint8Array(ct), 12);
      return _b64urlEncode(buf);
    }
    async function _decryptWithKey(cryptoKey, encB64) {
      const buf = _b64urlDecode(encB64);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, cryptoKey, buf.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    }

    // ─── 個人予定表バックアップ（設計書54）───
    // ログイン認証（誰のデータか）とバックアップ用パスフレーズ（暗号化鍵の元）は完全に別レイヤー。
    // オプトイン機能のため起動時同期フロー（loadEventData()等）からは一切呼ばれない。
    // そのため下記モジュールスコープ変数はTDZ対象外（起動時フローの間接参照経路に無い、設計書54 §2-8）。
    const BACKUP_KEY_MATERIAL_KEY = 'app_backup_key_material'; // 導出済み鍵material（raw export→Base64url）の保存キー。パスフレーズ自体は保存しない
    let _backupKeyCache = null; // 導出済みCryptoKey（メモリキャッシュ、同期読み取り用）
    let _backupSyncInFlight = false; // 多重PUT防止用の簡易フラグ

    function _getBackupKeyMaterial() {
      try { return localStorage.getItem(BACKUP_KEY_MATERIAL_KEY); } catch (_) { return null; }
    }
    function _setBackupKeyMaterial(material) {
      try { localStorage.setItem(BACKUP_KEY_MATERIAL_KEY, material); } catch (_) {}
      if (_CapPrefs) _CapPrefs.set({ key: BACKUP_KEY_MATERIAL_KEY, value: material }).catch(() => {});
    }
    function _clearBackupKeyMaterial() {
      _backupKeyCache = null;
      try { localStorage.removeItem(BACKUP_KEY_MATERIAL_KEY); } catch (_) {}
      if (_CapPrefs) _CapPrefs.remove({ key: BACKUP_KEY_MATERIAL_KEY }).catch(() => {});
    }
    // iOS版はPreferencesをソースオブトゥルースとして復元（設計書49/50と同じハイブリッド方式）。
    // オプトイン機能のため起動時には呼ばない。バックアップセクションを開いたタイミングで一度だけ呼ぶ。
    async function _restoreBackupKeyFromPrefsIfNeeded() {
      if (_backupKeyCache) return true;
      let material = null;
      if (_CapPrefs) {
        try {
          const r = await _CapPrefs.get({ key: BACKUP_KEY_MATERIAL_KEY });
          material = (r && typeof r.value === 'string') ? r.value : null;
          if (material) { try { localStorage.setItem(BACKUP_KEY_MATERIAL_KEY, material); } catch (_) {} }
        } catch (_) {}
      }
      if (!material) material = _getBackupKeyMaterial();
      if (!material) return false;
      try {
        _backupKeyCache = await _importKeyMaterial(material);
        return true;
      } catch (_) { return false; }
    }

    function isBackupEnabled() {
      return !!_getBackupKeyMaterial();
    }

    // 全データバックアップ対象の都市（設計書58 §3-3: ACTIVE_CITIESが['sg']のみでも、
    // 過去にBKK/SYDが稼働していた時期のlocalStorageデータを取りこぼさないよう固定で全都市分を対象にする）
    const BACKUP_CITIES = ['sg', 'bkk', 'syd'];

    // 現在のlocalStorageからバックアップ対象データ一式を集める（設計書58 §3-4 新構造）
    function _collectBackupPayload() {
      const eventPlansByCity = {};
      const myCoursesByCity = {};
      BACKUP_CITIES.forEach(city => {
        try { eventPlansByCity[city] = JSON.parse(localStorage.getItem(city + '_event_plans') || '[]'); } catch (_) { eventPlansByCity[city] = []; }
        try { myCoursesByCity[city] = JSON.parse(localStorage.getItem(city + '_my_courses') || '[]'); } catch (_) { myCoursesByCity[city] = []; }
      });
      let genres = [], likedCourses = [], ageList = [];
      try { genres = JSON.parse(localStorage.getItem('app_genres') || '[]'); } catch (_) {}
      try { likedCourses = JSON.parse(localStorage.getItem('liked_courses') || '[]'); } catch (_) {}
      try { ageList = JSON.parse(localStorage.getItem('app_age_list') || '[]'); } catch (_) {}
      return {
        version: 2,
        customPlans: getCustomPlans(),
        eventPlansByCity,
        myCoursesByCity,
        genres,
        who: localStorage.getItem('app_who') || '[]',
        ageList,
        likedCourses,
        avatar: localStorage.getItem('user_avatar') || '',
      };
    }

    // 復号したバックアップデータをlocalStorageへローカルとマージして書き込む（設計書58 §3-5 後方互換含む）
    async function _applyRestoredBackup(dec) {
      // 旧構造（versionフィールドなし）: {customPlans, eventPlans} のみ。eventPlansは現在の都市に割り当てる
      const isLegacy = !dec || typeof dec.version === 'undefined';
      const legacyEventPlans = isLegacy ? (dec.eventPlans || []) : [];

      const localCustom = getCustomPlans();
      const mergedCustom = mergeArr(localCustom, dec.customPlans || []);
      await saveCustomPlans(mergedCustom);

      BACKUP_CITIES.forEach(city => {
        const localEvent = (() => { try { return JSON.parse(localStorage.getItem(city + '_event_plans') || '[]'); } catch (_) { return []; } })();
        let remoteEvent = [];
        if (isLegacy) {
          if (city === getCity()) remoteEvent = legacyEventPlans;
        } else {
          remoteEvent = (dec.eventPlansByCity && dec.eventPlansByCity[city]) || [];
        }
        const mergedEvent = mergeArr(localEvent, remoteEvent);
        localStorage.setItem(city + '_event_plans', JSON.stringify(mergedEvent));

        const localCourses = (() => { try { return JSON.parse(localStorage.getItem(city + '_my_courses') || '[]'); } catch (_) { return []; } })();
        const remoteCourses = (!isLegacy && dec.myCoursesByCity && dec.myCoursesByCity[city]) || [];
        const mergedCourses = mergeArr(localCourses, remoteCourses);
        localStorage.setItem(city + '_my_courses', JSON.stringify(mergedCourses));
      });

      if (!isLegacy) {
        if (Array.isArray(dec.genres) && dec.genres.length && getGenreList().length === 0) {
          saveGenreList(dec.genres);
        }
        if (Array.isArray(dec.likedCourses) && dec.likedCourses.length) {
          try {
            const localLiked = JSON.parse(localStorage.getItem('liked_courses') || '[]');
            const mergedLiked = Array.from(new Set([...localLiked, ...dec.likedCourses]));
            localStorage.setItem('liked_courses', JSON.stringify(mergedLiked));
          } catch (_) {}
        }
        if (dec.who && getWhoList().length === 0) {
          try { localStorage.setItem('app_who', typeof dec.who === 'string' ? dec.who : JSON.stringify(dec.who)); } catch (_) {}
        }
        if (Array.isArray(dec.ageList) && dec.ageList.length && getAgeList().length === 0) {
          localStorage.setItem('app_age_list', JSON.stringify(dec.ageList));
        }
        if (dec.avatar && !localStorage.getItem('user_avatar')) {
          localStorage.setItem('user_avatar', dec.avatar);
        }
      }
    }

    // saveCustomPlans/saveEventPlans/マイコース保存・ジャンル/プロフィール/いいね変更から呼ばれる。
    // バックアップ未設定・未ログインなら即return（実害なし）。
    async function _syncBackupToServer() {
      if (!getAuthToken()) return;
      if (!isBackupEnabled()) return;
      if (_backupSyncInFlight) return;
      _backupSyncInFlight = true;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 設計書22パターン踏襲：ハングさせない
      try {
        if (!_backupKeyCache) {
          const ok = await _restoreBackupKeyFromPrefsIfNeeded();
          if (!ok) return;
        }
        const salt = localStorage.getItem('app_backup_salt');
        if (!salt) return;
        const encryptedData = await _encryptWithKey(_backupKeyCache, _collectBackupPayload());
        await authedFetch(API_BASE + '/api/user-plans/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salt, encryptedData }),
          signal: controller.signal,
        });
      } catch (e) {
        // ネットワークエラー・タイムアウトとも静かに諦める（ローカル保存は既に完了済み、UIをブロックしない）
      } finally {
        clearTimeout(timeoutId);
        _backupSyncInFlight = false;
      }
    }

    function openBackupSection() {
      renderBackupSection();
    }

    function renderBackupSection() {
      const el = document.getElementById('backup-section-content');
      if (!el) return;
      const loggedIn = !!getAuthToken();
      if (!loggedIn) {
        el.innerHTML = `<p style="font-size:13px;color:var(--warm-gray);line-height:1.7;margin:0;" data-i18n="backupLoginRequired">${t('backupLoginRequired')}</p>`;
        return;
      }
      if (isBackupEnabled()) {
        el.innerHTML = `
          <p style="font-size:13px;color:var(--warm-gray);line-height:1.7;margin:0 0 10px;" data-i18n="backupEnabledDesc">${t('backupEnabledDesc')}</p>
          <button class="cal-sync-action secondary" data-backup-action="change">🔑 <span data-i18n="backupChangePassphrase">${t('backupChangePassphrase')}</span></button>
          <button class="cal-sync-action danger" data-backup-action="disable">🚫 <span data-i18n="backupDisable">${t('backupDisable')}</span></button>`;
      } else {
        el.innerHTML = `
          <p style="font-size:13px;color:var(--warm-gray);line-height:1.7;margin:0 0 6px;" data-i18n="backupDisabledDesc">${t('backupDisabledDesc')}</p>
          <p style="font-size:12px;color:var(--warm-gray);line-height:1.6;margin:0 0 10px;" data-i18n="backupExcludesCalendarNote">${t('backupExcludesCalendarNote')}</p>
          <button class="cal-sync-action primary" data-backup-action="setup">🔒 <span data-i18n="backupEnable">${t('backupEnable')}</span></button>`;
      }
    }

    // ─── バックアップ用パスフレーズ入力シート ───
    let _backupSheetMode = null; // 'setup' | 'restore' | 'change'

    async function openBackupPassphraseSheet(mode) {
      if (!getAuthToken()) { showToast(t('backupLoginRequired')); return; }
      _backupSheetMode = mode;
      const titleEl = document.getElementById('backup-passphrase-title');
      const warnEl = document.getElementById('backup-passphrase-warn');
      const confirmRow = document.getElementById('backup-passphrase-confirm-row');
      document.getElementById('backup-passphrase-input').value = '';
      document.getElementById('backup-passphrase-confirm-input').value = '';
      if (warnEl) warnEl.style.display = '';
      if (mode === 'setup') {
        if (titleEl) titleEl.textContent = t('backupSetupTitle');
        if (confirmRow) confirmRow.style.display = '';
      } else if (mode === 'change') {
        if (titleEl) titleEl.textContent = t('backupChangePassphrase');
        if (confirmRow) confirmRow.style.display = '';
      } else {
        // restore: サーバーに既存バックアップがある場合（別端末で設定済み）
        if (titleEl) titleEl.textContent = t('backupRestoreTitle');
        if (confirmRow) confirmRow.style.display = 'none';
      }
      lockScroll();
      document.getElementById('backup-passphrase-overlay').classList.add('visible');
      document.getElementById('backup-passphrase-sheet').classList.add('visible');
    }

    function closeBackupPassphraseSheet() {
      _blurIfFocusInside('backup-passphrase-sheet');
      unlockScroll();
      document.getElementById('backup-passphrase-overlay').classList.remove('visible');
      document.getElementById('backup-passphrase-sheet').classList.remove('visible');
    }

    async function submitBackupPassphrase() {
      const passphrase = (document.getElementById('backup-passphrase-input').value || '').trim();
      if (!passphrase) { showToast(t('backupPassphraseEmpty')); return; }
      const mode = _backupSheetMode;
      if (mode === 'setup' || mode === 'change') {
        const confirmVal = (document.getElementById('backup-passphrase-confirm-input').value || '').trim();
        if (passphrase !== confirmVal) { showToast(t('backupPassphraseMismatch')); return; }
      }
      const btn = document.getElementById('backup-passphrase-submit-btn');
      if (btn) { btn.disabled = true; }
      try {
        if (mode === 'setup') {
          await _doBackupSetup(passphrase);
        } else if (mode === 'change') {
          await _doBackupChange(passphrase);
        } else {
          await _doBackupRestore(passphrase);
        }
      } finally {
        if (btn) { btn.disabled = false; }
      }
    }

    async function _doBackupSetup(passphrase) {
      _sendDebugLog('backup_start', { mode: 'setup', hasAuthToken: !!getAuthToken() });
      try {
        const salt = _genSaltB64();
        const key = await _deriveKeyFromPassphrase(passphrase, salt);
        const encryptedData = await _encryptWithKey(key, _collectBackupPayload());
        const res = await authedFetch(API_BASE + '/api/user-plans/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salt, encryptedData }),
        });
        _sendDebugLog('backup_put_response', { mode: 'setup', status: res.status, ok: res.ok });
        if (!res.ok) throw new Error('backup setup failed');
        _backupKeyCache = key;
        const material = await _exportKeyMaterial(key);
        _setBackupKeyMaterial(material);
        localStorage.setItem('app_backup_salt', salt);
        closeBackupPassphraseSheet();
        renderBackupSection();
        showToast(t('toastBackupEnabled'));
      } catch (e) {
        _sendDebugLog('backup_error', {
          mode: 'setup',
          errorName: e?.name || null,
          errorMessage: e?.message || String(e),
          hasAuthToken: !!getAuthToken(),
        });
        showToast(t('toastBackupError'));
      }
    }

    async function _doBackupChange(passphrase) {
      _sendDebugLog('backup_start', { mode: 'change', hasAuthToken: !!getAuthToken() });
      try {
        // 既存の鍵で復号できることを確認してから新パスフレーズで再暗号化（設計書54 §6-10のフロー）
        if (!_backupKeyCache) {
          const ok = await _restoreBackupKeyFromPrefsIfNeeded();
          if (!ok) {
            _sendDebugLog('backup_error', { mode: 'change', errorName: 'RestoreKeyFailed', errorMessage: 'no existing backup key material', hasAuthToken: !!getAuthToken() });
            showToast(t('toastBackupError'));
            return;
          }
        }
        const newSalt = _genSaltB64();
        const newKey = await _deriveKeyFromPassphrase(passphrase, newSalt);
        const encryptedData = await _encryptWithKey(newKey, _collectBackupPayload());
        const res = await authedFetch(API_BASE + '/api/user-plans/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salt: newSalt, encryptedData }),
        });
        _sendDebugLog('backup_put_response', { mode: 'change', status: res.status, ok: res.ok });
        if (!res.ok) throw new Error('backup change failed');
        _backupKeyCache = newKey;
        const material = await _exportKeyMaterial(newKey);
        _setBackupKeyMaterial(material);
        localStorage.setItem('app_backup_salt', newSalt);
        closeBackupPassphraseSheet();
        renderBackupSection();
        showToast(t('toastBackupEnabled'));
      } catch (e) {
        _sendDebugLog('backup_error', {
          mode: 'change',
          errorName: e?.name || null,
          errorMessage: e?.message || String(e),
          hasAuthToken: !!getAuthToken(),
        });
        showToast(t('toastBackupError'));
      }
    }

    async function _doBackupRestore(passphrase) {
      _sendDebugLog('backup_start', { mode: 'restore', hasAuthToken: !!getAuthToken() });
      try {
        const res = await authedFetch(API_BASE + '/api/user-plans/me');
        _sendDebugLog('backup_get_response', { mode: 'restore', status: res.status, ok: res.ok });
        if (!res.ok) throw new Error('fetch failed');
        const d = await res.json();
        if (!d.salt || !d.encryptedData) {
          _sendDebugLog('backup_error', { mode: 'restore', errorName: 'MissingSaltOrData', errorMessage: 'no salt/encryptedData in response', hasAuthToken: !!getAuthToken() });
          showToast(t('toastBackupError'));
          return;
        }
        const key = await _deriveKeyFromPassphrase(passphrase, d.salt);
        let dec;
        try {
          dec = await _decryptWithKey(key, d.encryptedData);
        } catch (e) {
          _sendDebugLog('backup_error', { mode: 'restore', errorName: e?.name || null, errorMessage: 'decrypt failed: ' + (e?.message || String(e)), hasAuthToken: !!getAuthToken() });
          showToast(t('toastBackupPassphraseWrong'));
          return;
        }
        _backupKeyCache = key;
        const material = await _exportKeyMaterial(key);
        _setBackupKeyMaterial(material);
        localStorage.setItem('app_backup_salt', d.salt);
        await _applyRestoredBackup(dec);
        closeBackupPassphraseSheet();
        renderBackupSection();
        renderScheduleTab();
        showToast(t('toastBackupRestored'));
      } catch (e) {
        _sendDebugLog('backup_error', {
          mode: 'restore',
          errorName: e?.name || null,
          errorMessage: e?.message || String(e),
          hasAuthToken: !!getAuthToken(),
        });
        showToast(t('toastBackupError'));
      }
    }

    function disableBackup() {
      if (!confirm(t('confirmBackupDisable'))) return;
      _clearBackupKeyMaterial();
      localStorage.removeItem('app_backup_salt');
      renderBackupSection();
      showToast(t('toastBackupDisabled'));
    }

    // 設定画面「予定表のバックアップ」セクションを開いたタイミングで、
    // 別端末での既存バックアップ有無をチェックし、あればrestoreモードの案内を出す。
    async function checkExistingBackupOnOpen() {
      if (!getAuthToken()) return;
      if (isBackupEnabled()) return; // 既にこの端末で有効化済みなら何もしない
      try {
        const res = await authedFetch(API_BASE + '/api/user-plans/me');
        if (!res.ok) return;
        const d = await res.json();
        if (d.salt && d.encryptedData) {
          const el = document.getElementById('backup-section-content');
          if (el) {
            el.innerHTML = `
              <p style="font-size:13px;color:var(--warm-gray);line-height:1.7;margin:0 0 10px;" data-i18n="backupFoundExistingDesc">${t('backupFoundExistingDesc')}</p>
              <button class="cal-sync-action primary" data-backup-action="restore">🔓 <span data-i18n="backupRestoreTitle">${t('backupRestoreTitle')}</span></button>
              <button class="cal-sync-action secondary" data-backup-action="setup">🔒 <span data-i18n="backupEnable">${t('backupEnable')}</span></button>`;
          }
        }
      } catch (e) {}
    }

    // ─── 共有カレンダー ───
    let _calSyncFromServer = false;
    let _pendingJoinGroupId = null;
    let _pendingJoinKey = null;
    let _scannerStream = null;
    let _scannerRafId = null;

    // idベースの和集合マージ（後勝ち＝第2引数bの内容が優先される）。
    // 設計書22: doJoinGroup()専用だった実装を共通関数として切り出し、fetchFromServer()からも使う。
    function mergeArr(a, b) {
      const m = {};
      [...a, ...b].forEach(p => { if (p && p.id) m[p.id] = p; });
      return Object.values(m);
    }

    // ─── E2E ENCRYPTION (AES-256-GCM) ───
    // 設計書55: 新方式（パスフレーズ由来の鍵）と旧方式（URLフラグメントのランダム鍵）が共存する。
    // getCalKey/setCalKey は「実際に暗号化・復号に使う鍵材料（Base64url）」を保持する点は旧方式から変更なし。
    // 新方式ではパスフレーズ自体ではなく、パスフレーズから導出した鍵material（raw export→Base64url）をここに保存する
    // （案X-B: 端末保存・自動復元、設計書55 §2-8）。
    function getCalKey() { return localStorage.getItem(getCity()+'_shared_cal_key') || null; }
    function setCalKey(k) {
      if (k) localStorage.setItem(getCity()+'_shared_cal_key', k); else localStorage.removeItem(getCity()+'_shared_cal_key');
      if (_CapPrefs) {
        const prefKey = getCity()+'_shared_cal_key';
        if (k) _CapPrefs.set({ key: prefKey, value: k }).catch(() => {});
        else _CapPrefs.remove({ key: prefKey }).catch(() => {});
      }
    }
    // salt: 新方式グループのみ持つ。平文（非秘密）、パスフレーズと組み合わせて鍵を導出するために必要。
    function getCalSalt() { return localStorage.getItem(getCity()+'_shared_cal_salt') || null; }
    function setCalSalt(s) {
      if (s) localStorage.setItem(getCity()+'_shared_cal_salt', s); else localStorage.removeItem(getCity()+'_shared_cal_salt');
    }

    async function _genCalKey() {
      const k = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, true, ['encrypt','decrypt']);
      const raw = await crypto.subtle.exportKey('raw', k);
      return btoa(String.fromCharCode(...new Uint8Array(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    }
    async function _importCalKey(b64) {
      const raw = Uint8Array.from(atob(b64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
    }
    async function _encryptPlans(keyB64, data) {
      const key = await _importCalKey(keyB64);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(JSON.stringify(data)));
      const buf = new Uint8Array(12 + ct.byteLength);
      buf.set(iv); buf.set(new Uint8Array(ct), 12);
      return btoa(String.fromCharCode(...buf)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    }
    async function _decryptPlans(keyB64, encB64) {
      const key = await _importCalKey(keyB64);
      const buf = Uint8Array.from(atob(encB64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)}, key, buf.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    }
    async function _generateQR(url) {
      if (!window.qrcode) await _loadScript('/qrcode-generator.js');
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(4, 0);
    }

    function getSharedGroupId() { return localStorage.getItem(getCity()+'_shared_group_id')||null; }
    function setSharedGroupId(id) {
      if (id) localStorage.setItem(getCity()+'_shared_group_id', id);
      else localStorage.removeItem(getCity()+'_shared_group_id');
    }

    function getCalDeviceId() {
      let id = localStorage.getItem('cal_device_id');
      if (!id) { id = 'dev_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('cal_device_id', id); }
      return id;
    }
    async function _registerGroupPush(gid) {
      if (_isCapacitorApp) {
        if (!_nativeDeviceToken) return;
        try {
          await fetch(API_BASE + '/api/calendar/'+gid+'/push-subscribe-ios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceToken: _nativeDeviceToken, deviceId: getCalDeviceId() }),
          });
        } catch(e) {}
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        await fetch(API_BASE + '/api/calendar/'+gid+'/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub, deviceId: getCalDeviceId() }),
        });
      } catch(e) {}
    }

    async function _deregisterGroupPush(gid) {
      if (_isCapacitorApp) {
        if (!_nativeDeviceToken) return;
        try {
          await fetch(API_BASE + '/api/calendar/'+gid+'/push-subscribe-ios', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceToken: _nativeDeviceToken }),
          });
        } catch(e) {}
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        await fetch(API_BASE + '/api/calendar/'+gid+'/push-subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch(e) {}
    }

    function _showNotifyCheckboxes() {
      const inGroup = !!getSharedGroupId();
      ['plan-event-notify-row', 'plan-custom-notify-row', 'plan-detail-notify-row'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = inGroup ? 'flex' : 'none';
      });
      ['plan-event-notify-cb', 'plan-custom-notify-cb', 'plan-detail-notify-cb'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
      });
    }

    async function _notifyGroupIfChecked(cbId, planName, actionType) {
      const gid = getSharedGroupId();
      if (!gid) return;
      const cb = document.getElementById(cbId);
      if (!cb || !cb.checked) return;
      const actionLabel = actionType === 'updated' ? '更新' : '追加';
      try {
        await fetch(API_BASE + '/api/calendar/'+gid+'/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '📅 カレンダーが更新されました',
            body: planName + ' が' + actionLabel + 'されました',
            deviceId: getCalDeviceId(),
          }),
        });
      } catch(e) {}
    }

    async function syncToServer() {
      const gid = getSharedGroupId(); if (!gid) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 設計書22: 5秒でタイムアウトし、失敗しても静かに諦める（UIをハングさせない）
      try {
        const customPlans = getCustomPlans();
        const eventPlans  = JSON.parse(localStorage.getItem(getCity()+'_event_plans')||'[]');
        const key = getCalKey();
        let body;
        if (key) {
          body = { encryptedData: await _encryptPlans(key, {customPlans, eventPlans}) };
        } else {
          body = { customPlans, eventPlans };
        }
        await fetch(API_BASE + '/api/calendar/'+gid, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch(e) {
        // タイムアウト・ネットワーク断とも同様に扱う。ローカル保存は既に完了しているため、
        // ここで例外を投げずに静かに諦める（呼び出し元のUIをブロックしない）。
      } finally {
        clearTimeout(timeoutId);
      }
    }

    async function fetchFromServer() {
      const gid = getSharedGroupId(); if (!gid) return false;
      try {
        const r = await fetch(API_BASE + '/api/calendar/'+gid);
        if (!r.ok) {
          if (r.status === 404) { setSharedGroupId(null); updateCalSyncBtn(); }
          return false;
        }
        const d = await r.json();
        let serverCustom, serverEvent;
        if (d.encryptedData) {
          const key = getCalKey();
          if (!key) return false;
          try {
            const dec = await _decryptPlans(key, d.encryptedData);
            serverCustom = dec.customPlans || [];
            serverEvent  = dec.eventPlans  || [];
          } catch(e) { showToast('復号に失敗しました'); return false; }
        } else {
          serverCustom = d.customPlans || [];
          serverEvent  = d.eventPlans  || [];
        }
        // 設計書22（案B）: 全置換ではなくidベースの和集合マージ（サーバー優先）にする。
        // これにより、保存直後のforce quit等でPUTがサーバーに未到達だった場合でも、
        // 次回同期時にローカルにしかない予定が丸ごと消えることを防ぐ。
        const localCustom = getCustomPlans();
        const localEvent  = JSON.parse(localStorage.getItem(getCity()+'_event_plans')||'[]');
        const customPlans = mergeArr(localCustom, serverCustom);
        const eventPlans  = mergeArr(localEvent, serverEvent);
        _calSyncFromServer = true;
        await saveCustomPlans(customPlans);
        await saveEventPlans(eventPlans);
        _calSyncFromServer = false;
        return true;
      } catch(e) { _calSyncFromServer = false; return false; }
    }

    function updateCalSyncBtn() {
      const btn = document.getElementById('cal-sync-header-btn');
      if (!btn) return;
      const connected = !!getSharedGroupId();
      btn.classList.toggle('connected', connected);
      const lbl = btn.querySelector('.sync-label');
      if (lbl) lbl.textContent = connected ? '共有中' : '共有';
    }

    function openCalSync() {
      renderCalSyncModal();
      lockScroll();
      document.getElementById('cal-sync-overlay').classList.add('visible');
      document.getElementById('cal-sync-modal').classList.add('visible');
    }
    function closeCalSync() {
      unlockScroll();
      document.getElementById('cal-sync-overlay').classList.remove('visible');
      document.getElementById('cal-sync-modal').classList.remove('visible');
    }

    function renderCalSyncModal() {
      const gid = getSharedGroupId();
      const el = document.getElementById('cal-sync-modal-content');
      if (gid) {
        const showPushPrompt = _shouldShowPushPrompt();
        el.innerHTML = `
          ${showPushPrompt ? `
          <div style="background:var(--caramel-pale);border:1px solid var(--caramel-light);border-radius:12px;padding:12px 14px;margin-bottom:14px;text-align:center;">
            <div style="font-size:14px;font-weight:600;color:var(--midnight);margin-bottom:4px;">🔔 通知をオンにしましょう</div>
            <div style="font-size:13px;color:var(--warm-gray);margin-bottom:10px;line-height:1.6;">メンバーの予定が更新されたとき<br>プッシュ通知で受け取れます</div>
            <button class="cal-sync-action primary" style="margin-bottom:0;" onclick="enablePushForCalendar()">通知をオンにする</button>
          </div>` : ''}
          <div class="cal-sync-status-line">✅ グループ接続中</div>
          <div class="cal-sync-groupid-line">グループID: <strong>${gid}</strong></div>
          <div style="background:var(--sage-pale);border:1px solid var(--sage-light);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:13px;color:var(--warm-gray);line-height:1.65;">
            🔒 予定は<strong>暗号化</strong>して保存されています。共有メンバー以外は読めません（アプリ管理者も含む）。<br>
            ${getCalSalt()
              ? '<span style="color:var(--terracotta);">⚠️ 参加にはパスフレーズが必要です。招待相手に別途パスフレーズをお伝えください。</span>'
              : '<span style="color:var(--terracotta);">⚠️ リンク（またはQR）を知っている人は誰でも参加できます。</span><br>信頼できる相手にだけ共有してください。'}
          </div>
          <p style="font-size:13px;color:var(--warm-gray);text-align:center;margin:0 0 10px;">QRコードを読み取るか、リンクを送ると参加できます</p>
          <div id="cal-qr-wrap" style="display:flex;justify-content:center;margin-bottom:12px;min-height:200px;align-items:center;">
            <span style="font-size:13px;color:var(--light-gray);">読み込み中...</span>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <button class="cal-sync-action secondary" style="flex:1;margin-bottom:0;" onclick="copyJoinLink('${gid}')">📋 リンクをコピー</button>
            <button class="cal-sync-action secondary" style="flex:1;margin-bottom:0;" onclick="shareViaLine('${gid}')">💬 LINEで共有</button>
          </div>
          <button class="cal-sync-action secondary" onclick="doRefreshCalSync()">🔄 最新データを取得</button>
          <button class="cal-sync-action danger"     onclick="doLeaveGroup()">🚪 グループから離脱</button>`;
        loadCalQR(gid);
      } else {
        el.innerHTML = `
          <p style="font-size:15px;color:var(--warm-gray);text-align:center;margin:0 0 24px;line-height:1.8;">
            家族の予定表をまとめて<br>みんなで共有できます。<br>
            <span style="font-size:13px;">グループを作って家族にリンクを共有するか、<br>QRコードをスキャンして参加できます。</span>
          </p>
          <button class="cal-sync-action primary" id="cal-create-btn" onclick="doCreateGroup()">🔗 グループを作成する</button>
          <button class="cal-sync-action secondary" onclick="openQRScanner()">📷 QRコードをスキャン</button>`;
      }
    }

    // 新方式（salt）グループはフラグメントなしURL、旧方式（fragment鍵）グループは従来通りフラグメント付きURL（設計書55 §3）
    async function loadCalQR(gid) {
      try {
        const salt = getCalSalt();
        const key = getCalKey();
        const url = salt
          ? `https://dosuru.app/?join=${gid}&city=${getCity()}`
          : `https://dosuru.app/?join=${gid}&city=${getCity()}${key ? '#'+key : ''}`;
        const dataUrl = await _generateQR(url);
        const wrap = document.getElementById('cal-qr-wrap');
        if (wrap) wrap.innerHTML = `<img src="${dataUrl}" width="200" height="200" style="border-radius:12px;" alt="QR">`;
      } catch(e) {}
    }

    // 「グループを作成する」ボタン押下 → パスフレーズ設定シートを開くフローに変更（設計書55）
    function doCreateGroup() {
      openCalPassphraseSheet('create');
    }

    async function _doCalCreateGroup(passphrase) {
      const btn = document.getElementById('cal-passphrase-submit-btn');
      try {
        const city = getCity();
        const salt = _genSaltB64();
        const cryptoKey = await _deriveKeyFromPassphrase(passphrase, salt);
        const customPlans = getCustomPlans();
        const eventPlans  = JSON.parse(localStorage.getItem(city+'_event_plans')||'[]');
        const encryptedData = await _encryptWithKey(cryptoKey, {customPlans, eventPlans});
        const r = await fetch(API_BASE + '/api/calendar/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, salt, encryptedData })
        });
        if (!r.ok) throw new Error('create failed');
        const d = await r.json();
        const material = await _exportKeyMaterial(cryptoKey);
        setCalKey(material);
        setCalSalt(salt);
        setSharedGroupId(d.groupId);
        if (_hasActivePushSub()) await _registerGroupPush(d.groupId);
        updateCalSyncBtn();
        closeCalPassphraseSheet();
        renderCalSyncModal();
      } catch(e) {
        showToast(t('toastCalGroupCreateError'));
        if (btn) { btn.disabled = false; }
      }
    }

    async function doRefreshCalSync() {
      showToast('データを取得中...');
      const ok = await fetchFromServer();
      if (ok) { renderScheduleTab(); showToast('最新データに更新しました'); }
      else showToast('取得に失敗しました');
    }

    async function doLeaveGroup() {
      if (!confirm('グループから離脱しますか？\n最新のサーバーデータをローカルに保存します。')) return;
      const gid = getSharedGroupId();
      if (gid && _hasActivePushSub()) await _deregisterGroupPush(gid);
      await fetchFromServer();
      setSharedGroupId(null);
      setCalKey(null);
      setCalSalt(null);
      updateCalSyncBtn();
      renderScheduleTab();
      closeCalSync();
      showToast('グループから離脱しました');
    }

    function copyJoinLink(gid) {
      const salt = getCalSalt();
      const key = getCalKey();
      const url = salt
        ? `https://dosuru.app/?join=${gid}&city=${getCity()}`
        : `https://dosuru.app/?join=${gid}&city=${getCity()}${key ? '#'+key : ''}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('リンクをコピーしました')).catch(() => _fallbackCopy(url));
      } else {
        _fallbackCopy(url);
      }
    }
    function _fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('リンクをコピーしました'); } catch(e) { showToast('コピーできませんでした'); }
      document.body.removeChild(ta);
    }

    function shareViaLine(gid) {
      const salt = getCalSalt();
      const key = getCalKey();
      const url = salt
        ? `https://dosuru.app/?join=${gid}&city=${getCity()}`
        : `https://dosuru.app/?join=${gid}&city=${getCity()}${key ? '#'+key : ''}`;
      // パスフレーズ自体はメッセージ本文に含めない（設計書55 §2-7、意図的に鍵とグループIDを分離したままにする）
      const msg = `おでかけNaviの予定表グループに参加してください！\n${url}`;
      window.open(`https://line.me/R/share?text=${encodeURIComponent(msg)}`, '_blank');
    }

    async function openQRScanner() {
      const el = document.getElementById('cal-sync-modal-content');
      el.innerHTML = `
        <p style="font-size:14px;color:var(--warm-gray);text-align:center;margin:0 0 12px;line-height:1.6;">QRコードをカメラに向けてください</p>
        <div id="qr-scanner-wrap" style="position:relative;background:#000;border-radius:12px;overflow:hidden;margin:0 auto 12px;width:min(260px,100%);aspect-ratio:1;">
          <video id="qr-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block;"></video>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
            <div style="width:55%;aspect-ratio:1;border:2.5px solid var(--caramel);border-radius:10px;box-shadow:0 0 0 2000px rgba(0,0,0,0.35);"></div>
          </div>
        </div>
        <canvas id="qr-canvas" style="display:none;"></canvas>
        <button class="cal-sync-action secondary" onclick="closeQRScanner()">キャンセル</button>
        <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
          <div style="flex:1;height:1px;background:var(--light-gray);opacity:0.4;"></div>
          <span style="font-size:13px;color:var(--light-gray);">または直接入力</span>
          <div style="flex:1;height:1px;background:var(--light-gray);opacity:0.4;"></div>
        </div>
        <div style="display:flex;gap:8px;">
          <input id="manual-group-id" type="text" maxlength="6" placeholder="グループID（例: ABC123）"
                 style="flex:1;padding:12px 10px;border:1.5px solid var(--light-gray);border-radius:10px;font-size:16px;font-family:inherit;background:var(--cream);text-transform:uppercase;"/>
          <button class="cal-sync-action primary" style="width:96px;margin:0;" onclick="doManualJoin()">参加</button>
        </div>`;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        _scannerStream = stream;
        const video = document.getElementById('qr-video');
        if (!video) { stream.getTracks().forEach(t => t.stop()); _scannerStream = null; return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          _scanLoopBD(detector, video);
        } else {
          if (!window.jsQR) await _loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');
          _scanLoopJsQR(video);
        }
      } catch(e) {
        const wrap = document.getElementById('qr-scanner-wrap');
        if (wrap) { wrap.innerHTML = '<p style="color:var(--light-gray);font-size:13px;text-align:center;padding:40px 0;">カメラを使用できません</p>'; }
      }
    }

    function closeQRScanner() {
      if (_scannerStream) { _scannerStream.getTracks().forEach(t => t.stop()); _scannerStream = null; }
      if (_scannerRafId) { cancelAnimationFrame(_scannerRafId); _scannerRafId = null; }
      renderCalSyncModal();
    }

    function _loadScript(src) {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    async function _scanLoopBD(detector, video) {
      if (!_scannerStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) { handleScannedQR(codes[0].rawValue); return; }
      } catch(e) {}
      _scannerRafId = requestAnimationFrame(() => _scanLoopBD(detector, video));
    }

    function _scanLoopJsQR(video) {
      if (!_scannerStream || !window.jsQR) return;
      const canvas = document.getElementById('qr-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        canvas.width = vw; canvas.height = vh;
        ctx.drawImage(video, 0, 0, vw, vh);
        const code = jsQR(ctx.getImageData(0, 0, vw, vh).data, vw, vh);
        if (code) { handleScannedQR(code.data); return; }
      }
      _scannerRafId = requestAnimationFrame(() => _scanLoopJsQR(video));
    }

    function handleScannedQR(raw) {
      if (_scannerStream) { _scannerStream.getTracks().forEach(t => t.stop()); _scannerStream = null; }
      if (_scannerRafId) { cancelAnimationFrame(_scannerRafId); _scannerRafId = null; }
      let joinId = null, joinKey = null;
      try {
        const u = new URL(raw);
        const j = u.searchParams.get('join');
        if (j && /^[A-Z2-9]{6}$/.test(j)) { joinId = j; joinKey = u.hash.replace('#','') || null; }
      } catch(e) {
        if (/^[A-Z2-9]{6}$/.test(raw.trim().toUpperCase())) joinId = raw.trim().toUpperCase();
      }
      if (!joinId) { renderCalSyncModal(); showToast('無効なQRコードです'); return; }
      renderCalSyncModal();
      _pendingJoinGroupId = joinId;
      _pendingJoinKey = joinKey;
      const desc = document.getElementById('cal-join-desc');
      if (desc) desc.innerHTML = `グループ <strong>${joinId}</strong> に参加しますか？<br><br>現在の予定データと統合されます。`;
      document.getElementById('cal-join-overlay').classList.add('visible');
      document.getElementById('cal-join-modal').classList.add('visible');
    }

    function doManualJoin() {
      const input = document.getElementById('manual-group-id');
      const id = (input?.value || '').trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(id)) { showToast('グループIDは6文字（英数字）です'); return; }
      handleScannedQR(id);
    }

    function checkJoinParam() {
      const sp = new URLSearchParams(window.location.search);
      const joinId = sp.get('join');
      if (!joinId || !/^[A-Z2-9]{6}$/.test(joinId)) return;
      _pendingJoinGroupId = joinId;
      _pendingJoinKey = window.location.hash.replace('#', '') || null;
      const desc = document.getElementById('cal-join-desc');
      if (desc) {
        desc.innerHTML = `グループ <strong>${joinId}</strong> に参加しますか？<br><br>現在の予定データと統合されます。`;
      }
      document.getElementById('cal-join-overlay').classList.add('visible');
      document.getElementById('cal-join-modal').classList.add('visible');
      window.history.replaceState({}, '', window.location.pathname);
    }

    function closeJoinPrompt() {
      document.getElementById('cal-join-overlay').classList.remove('visible');
      document.getElementById('cal-join-modal').classList.remove('visible');
      _pendingJoinGroupId = null;
      _pendingJoinKey = null;
    }

    // 「参加する」ボタン押下。salt有無で新方式（パスフレーズ入力）/旧方式（フラグメント鍵）に分岐する（設計書55 §2-5）。
    async function doJoinGroup() {
      if (!_pendingJoinGroupId) return;
      const gid = _pendingJoinGroupId;
      // 旧方式: URLフラグメントに鍵が含まれていた場合はそのまま従来ロジックで参加する
      if (_pendingJoinKey) {
        await _doJoinGroupWithKey(gid, _pendingJoinKey);
        return;
      }
      // 新方式判定のため、まずグループ情報を取得してsaltの有無を見る
      try {
        const r = await fetch(API_BASE + `/api/calendar/${gid}`);
        if (!r.ok) throw new Error();
        const serverData = await r.json();
        if (serverData.salt) {
          // 新方式グループ: パスフレーズ入力シートへ誘導（確認ダイアログはそのまま維持、閉じてから開く）
          closeJoinPrompt();
          _pendingJoinGroupId = gid;
          openCalPassphraseSheet('join');
          return;
        }
        // saltなし・暗号化なしグループ（既存の無暗号化グループ）
        await _doJoinGroupWithKey(gid, null);
      } catch (e) {
        showToast('参加に失敗しました。グループIDをご確認ください。');
      }
    }

    async function _doJoinGroupWithKey(gid, key) {
      try {
        const r = await fetch(API_BASE + `/api/calendar/${gid}`);
        if (!r.ok) throw new Error();
        const serverData = await r.json();

        let serverCustom = [], serverEvent = [];
        if (serverData.encryptedData) {
          if (!key) { showToast('リンクから参加してください（暗号化キーが必要です）'); return; }
          try {
            const dec = await _decryptPlans(key, serverData.encryptedData);
            serverCustom = dec.customPlans || [];
            serverEvent  = dec.eventPlans  || [];
          } catch(e) { showToast('暗号化キーが正しくありません'); return; }
        } else {
          serverCustom = serverData.customPlans || [];
          serverEvent  = serverData.eventPlans  || [];
        }

        const localCustom = getCustomPlans();
        const localEvent  = JSON.parse(localStorage.getItem(getCity()+'_event_plans')||'[]');
        const merged = { customPlans: mergeArr(serverCustom, localCustom), eventPlans: mergeArr(serverEvent, localEvent) };

        let putBody;
        if (key) {
          putBody = { encryptedData: await _encryptPlans(key, merged) };
        } else {
          putBody = merged;
        }
        await fetch(API_BASE + `/api/calendar/${gid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(putBody)
        });

        if (key) setCalKey(key);
        _calSyncFromServer = true;
        await saveCustomPlans(merged.customPlans);
        await saveEventPlans(merged.eventPlans);
        _calSyncFromServer = false;
        setSharedGroupId(gid);
        if (_hasActivePushSub()) await _registerGroupPush(gid);
        updateCalSyncBtn();
        renderScheduleTab();
        closeJoinPrompt();
        showToast('グループに参加しました！');
        if (_shouldShowPushPrompt()) {
          renderCalSyncModal();
          document.getElementById('cal-sync-modal').classList.add('visible');
        }
      } catch(e) {
        showToast('参加に失敗しました。グループIDをご確認ください。');
      }
    }

    // 新方式グループ（salt あり）への参加。パスフレーズ入力シートから呼ばれる（設計書55 §2-5）。
    async function _doJoinGroupWithPassphrase(gid, passphrase) {
      try {
        const r = await fetch(API_BASE + `/api/calendar/${gid}`);
        if (!r.ok) throw new Error();
        const serverData = await r.json();
        if (!serverData.salt || !serverData.encryptedData) { showToast(t('toastCalJoinError')); return; }

        const cryptoKey = await _deriveKeyFromPassphrase(passphrase, serverData.salt);
        let dec;
        try {
          dec = await _decryptWithKey(cryptoKey, serverData.encryptedData);
        } catch (e) {
          showToast(t('toastCalPassphraseWrong'));
          return;
        }
        const serverCustom = dec.customPlans || [];
        const serverEvent  = dec.eventPlans  || [];
        const localCustom = getCustomPlans();
        const localEvent  = JSON.parse(localStorage.getItem(getCity()+'_event_plans')||'[]');
        const merged = { customPlans: mergeArr(serverCustom, localCustom), eventPlans: mergeArr(serverEvent, localEvent) };
        const encryptedData = await _encryptWithKey(cryptoKey, merged);
        await fetch(API_BASE + `/api/calendar/${gid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encryptedData })
        });

        const material = await _exportKeyMaterial(cryptoKey);
        setCalKey(material);
        setCalSalt(serverData.salt);
        _calSyncFromServer = true;
        await saveCustomPlans(merged.customPlans);
        await saveEventPlans(merged.eventPlans);
        _calSyncFromServer = false;
        setSharedGroupId(gid);
        if (_hasActivePushSub()) await _registerGroupPush(gid);
        updateCalSyncBtn();
        renderScheduleTab();
        closeCalPassphraseSheet();
        showToast('グループに参加しました！');
        if (_shouldShowPushPrompt()) {
          renderCalSyncModal();
          document.getElementById('cal-sync-overlay').classList.add('visible');
          document.getElementById('cal-sync-modal').classList.add('visible');
        }
      } catch (e) {
        showToast(t('toastCalJoinError'));
      }
    }

    // ─── 共有カレンダー用パスフレーズ入力シート（作成用・参加用共通、設計書55）───
    let _calPassphraseMode = null; // 'create' | 'join'

    function openCalPassphraseSheet(mode) {
      _calPassphraseMode = mode;
      const titleEl = document.getElementById('cal-passphrase-title');
      const confirmRow = document.getElementById('cal-passphrase-confirm-row');
      document.getElementById('cal-passphrase-input').value = '';
      document.getElementById('cal-passphrase-confirm-input').value = '';
      if (mode === 'create') {
        if (titleEl) titleEl.textContent = t('calPassphraseSetupTitle');
        if (confirmRow) confirmRow.style.display = '';
      } else {
        if (titleEl) titleEl.textContent = t('calPassphraseJoinTitle');
        if (confirmRow) confirmRow.style.display = 'none';
      }
      lockScroll();
      document.getElementById('cal-passphrase-overlay').classList.add('visible');
      document.getElementById('cal-passphrase-sheet').classList.add('visible');
    }

    function closeCalPassphraseSheet() {
      _blurIfFocusInside('cal-passphrase-sheet');
      unlockScroll();
      document.getElementById('cal-passphrase-overlay').classList.remove('visible');
      document.getElementById('cal-passphrase-sheet').classList.remove('visible');
    }

    async function submitCalPassphrase() {
      const passphrase = (document.getElementById('cal-passphrase-input').value || '').trim();
      if (!passphrase) { showToast(t('backupPassphraseEmpty')); return; }
      const mode = _calPassphraseMode;
      if (mode === 'create') {
        const confirmVal = (document.getElementById('cal-passphrase-confirm-input').value || '').trim();
        if (passphrase !== confirmVal) { showToast(t('backupPassphraseMismatch')); return; }
      }
      const btn = document.getElementById('cal-passphrase-submit-btn');
      if (btn) { btn.disabled = true; }
      try {
        if (mode === 'create') {
          await _doCalCreateGroup(passphrase);
        } else {
          if (!_pendingJoinGroupId) { showToast(t('toastCalJoinError')); return; }
          await _doJoinGroupWithPassphrase(_pendingJoinGroupId, passphrase);
        }
      } finally {
        if (btn) { btn.disabled = false; }
      }
    }

