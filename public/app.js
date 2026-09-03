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
      // ⚠️ 2026-08-28に一度Web版にも適用範囲を拡大したが、Web版の設定画面（一緒に行く人 等、
      // onclick属性のみでtouchendデリゲーションを持たない要素）でタップが効かなくなる新規回帰を
      // 引き起こしたため、2026-08-29にCapacitor限定へ差し戻した。News画面のbody連鎖スクロール問題は
      // 根本原因（#screen-newsのflex-direction指定漏れ、CSS側で修正済み）が解消済みのため、
      // この処理をWeb版に適用しなくても再発しないはず。
      let _capTouchStartX = 0;
      let _capTouchStartY = 0;
      document.addEventListener('touchstart', e => {
        _capTouchStartX = e.touches[0].clientX;
        _capTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      document.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - _capTouchStartX;
        const dy = e.touches[0].clientY - _capTouchStartY;
        // 横方向優勢のジェスチャーは、まず横スクロール可能な祖先（カテゴリタブ行等）を探して許可する。
        // これが無いと、縦スクロール判定だけのループが横スクロール専用要素（overflow-x:autoのみ、
        // overflow-y:autoは副作用で真だがscrollHeight<=clientHeightのため対象外）を素通りしてしまい、
        // 最終的にe.preventDefault()でスワイプ自体がブロックされる（カテゴリタブが横に動かせない不具合）。
        if (Math.abs(dx) > Math.abs(dy)) {
          let hEl = e.target;
          while (hEl && hEl !== document.documentElement) {
            const hOv = window.getComputedStyle(hEl).overflowX;
            if ((hOv === 'auto' || hOv === 'scroll') && hEl.scrollWidth > hEl.clientWidth) {
              const atLeft  = hEl.scrollLeft <= 0;
              const atRight = hEl.scrollLeft + hEl.clientWidth >= hEl.scrollWidth - 1;
              if (dx > 0 && atLeft)  { e.preventDefault(); return; }
              if (dx < 0 && atRight) { e.preventDefault(); return; }
              return; // 横スクロール余地あり → 許可
            }
            hEl = hEl.parentElement;
          }
        }
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

    // ─── .chat-overlay フェードアウト完了後にdisplay:noneで実質除去（設計書86）───
    // iOS Safariでopacity:0のposition:fixed要素がステータスバー付近に古いペイントとして焼き付く不具合の対策。
    // 再表示時はCSS側の .chat-overlay.visible { display:block !important; } が確実に上書きするため、
    // 各要素の「開く」処理コード側は変更不要。
    document.querySelectorAll('.chat-overlay').forEach(el => {
      el.addEventListener('transitionend', (e) => {
        if (e.target !== el || e.propertyName !== 'opacity') return;
        if (!el.classList.contains('visible')) {
          el.style.display = 'none';
        }
      });
    });

    // ─── パスフレーズ入力シート（バックアップ）フォーカス中はbottom-navを一時的に隠す（設計書60。
    // 設計書178フェーズ3で共有カレンダー機能削除に伴い#cal-passphrase-sheetを対象から除外）───
    // Web版Safari・iOS版共通（Capacitor限定にしない）。モバイルSafariのキーボード表示時、独立したposition:fixed;bottom:0
    // 要素同士（.bottom-nav と #backup-passphrase-sheet）の可視領域追従がズレ、
    // ボタン行がボトムナビと重なる不具合の対策。対象をシート内のinput/textareaに厳密に限定する。
    document.addEventListener('focusin', (e) => {
      try {
        const t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        if (!t.closest('#backup-passphrase-sheet')) return;
        const nav = document.querySelector('.bottom-nav');
        if (nav) nav.style.visibility = 'hidden';
      } catch (_) {}
    });
    document.addEventListener('focusout', (e) => {
      try {
        const t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        if (!t.closest('#backup-passphrase-sheet')) return;
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
        catAll: '新着',
        catRecommend: 'おすすめ',
        catEvent: 'イベント',
        catShow: '展示・公演',
        catGourmet: 'グルメ・フェア',
        catSale: 'プロモ・お得',
        catOpening: '新規オープン',
        catTravel: '旅行',
        catStarting: '🆕 今週から',
        catEnding: '🔥 今週まで',
        endingFilterBtn: '残りわずか',
        labelWhen: 'いつ行く？',
        labelWhat: 'どこ行く？',
        emptyTitle: 'まだスポット準備中！',
        emptyDesc: 'このカテゴリのおでかけ先は<br>近日公開予定です。<br>絞り込み条件を変えて探してみましょう。',
        pinScreenTitle: '📌 ピン留め',
        homeScreenTitle: 'おでかけ情報',
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
        supportBtn: 'SGD 5 を贈る',
        secAbout: 'アプリ情報',
        aboutAppName: 'アプリ名',
        aboutVersion: 'バージョン',
        navHome: 'おでかけ',
        navSettings: '設定',
        pinBtn: 'ピン留め',
        pinnedBtn: '外す ✓',
        shareBtn: '📤 共有する',
        articleLink: '元記事を見る',
        tipsLabel: '🎒 ひとことメモ',
        commentsBtnLabel: '💬 コメント',
        commentEmpty: 'まだコメントがありません。最初のコメントを書いてみましょう！',
        commentPlaceholder: 'コメントを書く（300文字まで）',
        commentDeleteLink: '削除',
        commentAuthGate: 'コメントするには',
        confirmDeleteComment: 'このコメントを削除しますか？',
        toastCommentSent: 'コメントを投稿しました',
        toastCommentDeleted: 'コメントを削除しました',
        toastCommentError: '通信に失敗しました。もう一度お試しください',
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
        labelPush: '更新の通知',
        pushOn: 'ON',
        pushOff: 'OFF',
        pushDenied: '許可が必要',
        pushUnsupported: '非対応',
        toastPushOn: '🔔 プッシュ通知をONにしました！',
        toastPushOff: '🔕 プッシュ通知をOFFにしました',
        toastPushDenied: '⚙️ 設定アプリから通知を許可してください',
        toastPushError: '⚠️ 通知の設定に失敗しました',
        countSuffix: '件',
        pinEmpty: 'まだピン留めしたイベントがありません',
        pinEmptyDesc: '気になるスポットのカードから<br>📌ピン留めしてみましょう！',
        navPins: 'ピン留め',
        pinSectionEvents: 'おでかけ情報',
        pinSectionNews: 'くらし情報',
        newsPinEmpty: 'まだピン留めしたニュースがありません',
        pinsEmptyCombinedTitle: 'まだ何もピン留めしていません',
        pinsEmptyCombinedDesc: '気になるイベントやニュースの📌をタップすると<br>ここにまとめて表示されます',
        shareSettingsDesc: 'シンガポール在住の友達にこのアプリを紹介しよう！',
        shareSettingsBtn: '友達にシェアする',
        bannerToday: '⏰ 本日まで',
        bannerTomorrow: '⏰ 明日まで',
        bannerDaysLeft: '⏰ あと{d}日',
        toastProfileSet: '✅ {label} に設定しました',
        profileLabelAll: '指定なし（すべて）',
        navNews: 'くらし',
        newsScreenTitle: 'くらし情報',
        newsCatAll: '新着',
        newsCatAdmin: 'SG政府',
        newsCatTransport: '都市開発・交通',
        newsCatHealth: '医療・健康',
        newsCatEducation: '教育・子育て',
        newsCatWeather: '天候・災害',
        newsCatCommunity: 'コミュニティ',
        newsEmptyDesc: '現在表示できる情報がありません。<br>また後で確認してください。',
        lifeInfoPreviewTitle: '📰 シンガポールくらし情報',
        lifeInfoPreviewMoreLink: 'もっと見る ›',
        authGateMessage: 'この機能を使うにはアカウント連携が必要です',
        authGateBtn: '設定で連携する',
        prBadgeLabel: 'PR',
        titleEditCancel: 'キャンセル',
        labelNickname: 'ニックネーム',
        labelDarkMode: 'ダークモード',
        nicknamePlaceholder: '匿名',
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
        backupForgotPassphraseLink: 'パスフレーズを忘れた場合はこちら',
        confirmBackupReset: '既存のバックアップデータは復元できなくなり、新しいパスフレーズで作り直されます。よろしいですか？',
        toastBackupEnabled: '🔒 バックアップを有効にしました',
        toastBackupDisabled: 'バックアップを無効にしました',
        toastBackupRestored: '✅ バックアップから復元しました',
        toastBackupError: '⚠️ 処理に失敗しました。もう一度お試しください',
        toastBackupPassphraseWrong: 'パスフレーズが正しくありません',
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
        catAll: 'New',
        catRecommend: 'Recommended',
        catEvent: 'Events',
        catShow: 'Shows & Exhibitions',
        catGourmet: 'Food & Fairs',
        catSale: 'Promos & Deals',
        catOpening: 'Grand Openings',
        catTravel: 'Travel',
        catStarting: '📅 This Week',
        catEnding: '⏰ Ending Soon',
        endingFilterBtn: 'Ending Soon',
        labelWhen: 'When?',
        labelWhat: 'Where to go?',
        emptyTitle: 'Coming soon!',
        emptyDesc: 'No spots in this category yet.<br>Try adjusting your filters to see more.',
        pinScreenTitle: '📌 Pinned',
        homeScreenTitle: 'Outing Info',
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
        supportBtn: 'Gift SGD 5',
        secAbout: 'About',
        aboutAppName: 'App',
        aboutVersion: 'Version',
        navHome: 'Outings',
        navSettings: 'Settings',
        pinBtn: 'Pin',
        pinnedBtn: 'Unpin ✓',
        shareBtn: '📤 Share',
        articleLink: 'Source article',
        tipsLabel: '🎒 Tips',
        commentsBtnLabel: '💬 Comments',
        commentEmpty: 'No comments yet. Be the first to write one!',
        commentPlaceholder: 'Write a comment (max 300 chars)',
        commentDeleteLink: 'Delete',
        commentAuthGate: 'Link your account to comment.',
        confirmDeleteComment: 'Delete this comment?',
        toastCommentSent: 'Comment posted',
        toastCommentDeleted: 'Comment deleted',
        toastCommentError: 'Something went wrong. Please try again.',
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
        pinEmpty: 'No pinned events yet',
        pinEmptyDesc: 'Tap 📌 on any card to pin it!',
        navPins: 'Pinned',
        pinSectionEvents: 'Outing Info',
        pinSectionNews: 'Life Info & News',
        newsPinEmpty: 'No pinned news articles yet',
        pinsEmptyCombinedTitle: 'No pins yet',
        pinsEmptyCombinedDesc: 'Tap 📌 on any event or news article<br>and it will show up here',
        shareSettingsDesc: 'Share this app with your friends in Singapore!',
        shareSettingsBtn: 'Share with Friends',
        bannerToday: '⏰ Today only',
        bannerTomorrow: '⏰ Until tomorrow',
        bannerDaysLeft: '⏰ {d} days left',
        toastProfileSet: '✅ Set to: {label}',
        profileLabelAll: 'All (no preference)',
        navNews: 'Life Info',
        newsScreenTitle: 'Life Info & News',
        newsCatAll: 'New',
        newsCatAdmin: 'Admin',
        newsCatTransport: 'Urban Dev. & Transport',
        newsCatHealth: 'Health',
        newsCatEducation: 'Education',
        newsCatWeather: 'Weather',
        newsCatCommunity: 'Community',
        newsEmptyDesc: 'No information available right now.<br>Please check back later.',
        lifeInfoPreviewTitle: '📰 Singapore Life Info',
        lifeInfoPreviewMoreLink: 'More ›',
        authGateMessage: 'Please link your account to use this feature',
        authGateBtn: 'Link Account in Settings',
        prBadgeLabel: 'PR',
        titleEditCancel: 'Cancel',
        labelNickname: 'Nickname',
        labelDarkMode: 'Dark Mode',
        nicknamePlaceholder: 'Anonymous',
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
        backupForgotPassphraseLink: 'Forgot your passphrase?',
        confirmBackupReset: 'Your existing backup can no longer be restored and will be recreated with a new passphrase. Continue?',
        toastBackupEnabled: '🔒 Backup enabled',
        toastBackupDisabled: 'Backup disabled',
        toastBackupRestored: '✅ Restored from backup',
        toastBackupError: '⚠️ Something went wrong. Please try again',
        toastBackupPassphraseWrong: 'Incorrect passphrase',
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

    // ─── フィルター変数 ───
    let filterCats    = new Set();
    let filterWeek    = '';
    let filterWho     = new Set();
    let filterAreas   = new Set();
    let filterKeyword = '';
    let filterEnding  = false;
    let filterNew     = true; // 先頭チップ（旧「すべて」）は「新着」化したため、初期状態からON
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

      // 「ひとことメモ」機能はイベントカードでは非表示化済み（toggleCardTips()等は残置）。
      // 同じ表示位置・開閉パターンをコメント機能（設計書174）に転用する。
      const tipsList = `<button class="tips-toggle-btn" id="${_commentBtnId('event', e.id)}" onclick="toggleCardComments('event','${e.id}')" data-comment-item-id="${e.id}">${t('commentsBtnLabel')}<span class="comment-count-label"></span><span class="tips-arrow">▽</span></button>`;
      const tipsContent = `<div class="comment-box" id="${_commentDomId('event', e.id)}" style="display:none;"></div>`;

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

      // 新着リボン（取り込みから24時間以内、2026-09-02に日付単位判定から厳密な経過時間判定へ変更）
      const newRibbon = (() => {
        if (!e.fetched_at) return '';
        const fetched = new Date(e.fetched_at);
        if (isNaN(fetched.getTime())) return '';
        const hours = (Date.now() - fetched.getTime()) / 3600000;
        if (hours <= 24) return `<div class="card-new-ribbon card-new-ribbon--today">New</div>`;
        return '';
      })();
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

      // 右上バッジ: New と 残り日数が両方該当する場合は残り日数を優先表示（同じ位置・同じサイズ）
      const topRightBadgeHtml = bannerLabel
        ? `<div class="card-new-ribbon" style="background:var(--terracotta);color:white;">${bannerLabel}</div>`
        : newRibbon;
      const hasRibbon = topRightBadgeHtml !== '';

      const igSc = getInstagramShortcode(e.url);
      const pinLinkHtml = `<span class="card-detail-link card-pin-link${pinned ? ' pinned' : ''}" id="pin-${e.id}" onclick="togglePinById('${e.id}')" style="cursor:pointer;">📌 <span id="pin-label-${e.id}">${pinned ? t('pinnedBtn') : t('pinBtn')}</span></span>`;

      // タイトル→写真→説明の順（生活情報カードと同じくタイトルは地の色の上にプレーン表示、
      // 写真に文字を重ねない。以前は写真にオーバーレイでタイトルを重ねていたが可読性が
      // 落ちるためこの並びに変更した）
      const plainTitleHtml = `<h2 style="font-family:'Noto Sans JP',sans-serif;font-size:16px;font-weight:700;color:var(--midnight);margin:0 0 10px;line-height:1.35;">${e.store || e.title || ''}</h2>`;

      // カテゴリタグの配色（生活情報カードのLIFE_INFO_CATEGORY_COLORSと同じ考え方）
      const EVENT_CATEGORY_LABEL_KEYS = { event: 'catEvent', show: 'catShow', gourmet: 'catGourmet', sale: 'catSale', opening: 'catOpening', travel: 'catTravel' };
      const EVENT_CATEGORY_COLORS = {
        event:   { bg: 'var(--caramel-pale)',       color: 'var(--caramel)' },
        show:    { bg: 'rgba(122,173,204,0.18)',    color: 'var(--sky)' },
        gourmet: { bg: 'rgba(196,112,90,0.16)',      color: 'var(--terracotta)' },
        sale:    { bg: 'rgba(110,158,136,0.18)',     color: 'var(--sage)' },
        opening: { bg: 'rgba(192,144,58,0.16)',      color: 'var(--gold)' },
        travel:  { bg: 'var(--plum-pale)',           color: 'var(--plum)' },
      };
      const catKey = EVENT_CATEGORY_LABEL_KEYS[e.type] || '';
      const catLabel = catKey ? t(catKey) : '';
      const catColor = EVENT_CATEGORY_COLORS[e.type] || EVENT_CATEGORY_COLORS.event;
      // 右端バッジ: New とあと何日が両方該当する場合はあと何日を優先（New と全く同じ見た目に統一）
      const inlineBadgeStyle = 'font-size:11px;font-weight:700;color:white;background:var(--caramel);border-radius:20px;padding:3px 9px;margin-left:auto;';
      const inlineBadgeHtml = bannerLabel
        ? `<span style="${inlineBadgeStyle}">${bannerLabel}</span>`
        : (newRibbon !== '' ? `<span style="${inlineBadgeStyle}">New</span>` : '');
      const metaRowHtml = (catLabel || e.location || e.period || e.hours || inlineBadgeHtml)
        ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:var(--warm-gray);">
            ${catLabel ? `<span style="background:${catColor.bg};color:${catColor.color};border-radius:20px;padding:2px 8px;font-weight:700;">${catLabel}</span>` : ''}
            ${e.location ? `<span>${e.location}</span>` : ''}
            ${(e.period || e.hours) ? `<span>${e.period || e.hours}</span>` : ''}
            ${inlineBadgeHtml}
          </div>` : '';

      return `
        <article class="spot-card${isEndingSoon ? ' ending-soon' : ''}" data-tab="${e.tab || 'weekend'}" data-age="${eAgeAttr}"
                 data-id="${e.id}">
          ${igSc ? (() => {
            const igEmbedUrl = (e.url || '').replace(/\/$/, '') + '/?utm_source=ig_embed';
            const igMetaHtml = `
              <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.78) 100%);pointer-events:none;z-index:2;"></div>
              <div style="position:absolute;bottom:0;left:0;right:0;padding:10px 14px 13px;pointer-events:none;z-index:3;">
                <h2 style="font-family:'Kaisei Opti',serif;font-size:16px;font-weight:700;color:white;margin:0;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.45);${hasRibbon ? 'padding-right:44px;' : ''}">${e.store || e.title || ''}</h2>
                ${(e.location || e.period || e.hours) ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;opacity:0.92;">
                  ${e.location ? `<span style="font-size:14px;color:rgba(255,255,255,0.95);text-shadow:0 1px 3px rgba(0,0,0,.4);">📍 ${e.location}</span>` : ''}
                  ${(e.period || e.hours) ? `<span style="font-size:14px;color:rgba(255,255,255,0.95);text-shadow:0 1px 3px rgba(0,0,0,.4);">📅 ${e.period || e.hours}</span>` : ''}
                </div>` : ''}
              </div>`;
            return `${topRightBadgeHtml}<div class="card-body">
              <div style="position:relative;margin:-14px -14px 12px;">
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
                      style="width:100%;height:200px;object-fit:cover;display:block;"
                      onerror="handleImgError(this,'${bgClass}','${safeEmoji}')" />`
              : `<div class="card-image-bg ${bgClass}" style="height:200px;">${e.emoji || '📍'}</div>`;
            return `<div class="card-body">
              ${metaRowHtml}
              ${plainTitleHtml}
              <div style="position:relative;border-radius:var(--radius-card);overflow:hidden;margin-bottom:10px;">
                ${imgHtml}
              </div>`;
          })()}
            ${displayContent ? `<p style="font-size:15px;color:var(--warm-gray);line-height:1.65;margin-bottom:10px;">${displayContent}</p>` : ''}
            <div class="card-sub-row">
              ${tipsList}
              <div style="display:flex;align-items:center;gap:14px;">
                ${pinLinkHtml}
                ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener" class="card-detail-link">🔗 ${t('articleLink')}</a>` : ''}
              </div>
            </div>
            ${tipsContent}
          </div>
        </article>`;
    }

    // ─── 生活情報・ニュースのキュレーション（設計書172） ───
    // GET /api/life-info は既存 GET /api/events とは完全に独立したエンドポイント。
    // 片方の取得失敗がもう片方の表示に影響しないよう、呼び出し元でも個別に try/catch する。

    let LIFE_INFO_DATA = [];
    let _newsCategory = ''; // '' = 先頭チップ（新着）
    let _newsFilterNew = true; // 先頭チップ（旧「すべて」）は「新着」化したため、初期状態からON
    let _newsDataLoaded = false; // 初回のみfetchし、以降のタブ切り替えではキャッシュを再描画するだけにする（おでかけ画面と同じ挙動）
    let _newsDataVersion = 0; // fetchのたびに加算。renderNewsList()の再描画要否判定に使う
    let _newsListRenderedKey = null; // 直近にリストへ実際に描画した(カテゴリ,新着のみ,データ版)の組み合わせ

    const LIFE_INFO_CATEGORY_LABEL_KEYS = {
      admin:     'newsCatAdmin',
      transport: 'newsCatTransport',
      health:    'newsCatHealth',
      education: 'newsCatEducation',
      weather:   'newsCatWeather',
      community: 'newsCatCommunity',
    };

    // カテゴリごとのタグ配色（アプリ既存のカラーパレット内の色を流用、見た目のトーンを崩さない範囲で区別）
    const LIFE_INFO_CATEGORY_COLORS = {
      admin:     { bg: 'rgba(192,144,58,0.16)',  color: 'var(--gold)' },
      transport: { bg: 'rgba(110,158,136,0.18)', color: 'var(--sage)' },
      health:    { bg: 'rgba(224,154,136,0.20)', color: 'var(--terracotta-light)' },
      education: { bg: 'var(--sand)',            color: 'var(--caramel)' },
      weather:   { bg: 'rgba(122,173,204,0.18)', color: 'var(--sky)' },
      community: { bg: 'rgba(196,112,90,0.16)',  color: 'var(--terracotta)' },
    };
    function _lifeInfoCategoryTagStyle(category) {
      const c = LIFE_INFO_CATEGORY_COLORS[category] || LIFE_INFO_CATEGORY_COLORS.education;
      return `background:${c.bg};color:${c.color};`;
    }

    // ニュース記事のピン留め（イベントのgetPins()/savePins()とは別の独立ストレージ。
    // イベント側はEVENT_REGISTRYから都度情報を引くが、ニュース記事はlife-info.jsonの
    // 保持期間（7日）で消える可能性があるため、ピン留め時点の内容を丸ごとローカルに保存する）
    function getNewsPins() {
      try { return JSON.parse(localStorage.getItem('app_pinned_news') || '{}'); } catch { return {}; }
    }
    function saveNewsPins(pins) {
      localStorage.setItem('app_pinned_news', JSON.stringify(pins));
    }
    function toggleNewsPinById(id) {
      const pins = getNewsPins();
      if (pins[id]) {
        delete pins[id];
        showToast(t('toastUnpinned'));
      } else {
        const item = LIFE_INFO_DATA.find(it => it.id === id);
        if (!item) return;
        pins[id] = item;
        showToast(t('toastPinned'));
      }
      saveNewsPins(pins);
      _newsListRenderedKey = null; // ピン状態はrenderNewsList()の再描画スキップ判定キーに含まれないため強制再描画
      renderNewsList();
      renderNewsPinList();
    }

    // 生活情報記事の元記事URLを開く（既存 openSponsoredCardLink() と同じ分岐パターン）
    function openLifeInfoLink(url) {
      if (!url) return;
      if (_isCapacitorApp && window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
      } else {
        window.open(url, '_blank', 'noopener');
      }
    }

    function _formatLifeInfoDate(publishedAt) {
      if (!publishedAt) return '';
      const d = new Date(publishedAt);
      if (isNaN(d.getTime())) return '';
      const lang = getLang();
      return lang === 'ja'
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // 新着リボン（1日以内に登録、イベントカードの newRibbon ロジックと同一基準）
    function _lifeInfoNewRibbonHtml(item) {
      return _isLifeInfoItemNew(item) ? `<div class="card-new-ribbon card-new-ribbon--today">New</div>` : '';
    }

    function _lifeInfoCardHtml(item) {
      const lang = getLang();
      const title = (lang === 'ja' ? item.title : item.title_en) || item.title || '';
      const summary = (lang === 'ja' ? item.summary : item.summary_en) || item.summary || '';
      const dateStr = _formatLifeInfoDate(item.publishedAt);
      const catKey = LIFE_INFO_CATEGORY_LABEL_KEYS[item.category] || '';
      const catLabel = catKey ? t(catKey) : '';
      const url = (item.sourceUrl || '').replace(/'/g, '&#39;');
      const newRibbon = _lifeInfoNewRibbonHtml(item);
      return `<div class="spot-card" style="padding:14px;">
        ${newRibbon}
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:var(--warm-gray);">
          ${catLabel ? `<span style="${_lifeInfoCategoryTagStyle(item.category)}border-radius:20px;padding:2px 8px;font-weight:700;">${catLabel}</span>` : ''}
          <span>${item.source || ''}</span>
          <span>${dateStr}</span>
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--midnight);margin-bottom:10px;line-height:1.35;">${title}</div>
        <div style="font-size:15px;color:var(--warm-gray);line-height:1.65;margin-bottom:10px;">${summary}</div>
        <div class="card-sub-row">
          <button class="tips-toggle-btn" id="${_commentBtnId('news', item.id)}" onclick="toggleCardComments('news','${item.id}')" data-comment-item-id="${item.id}">${t('commentsBtnLabel')}<span class="comment-count-label"></span><span class="tips-arrow">▽</span></button>
          <div style="display:flex;align-items:center;gap:14px;">
            <span class="card-detail-link card-pin-link${getNewsPins()[item.id] ? ' pinned' : ''}" style="cursor:pointer;" onclick="toggleNewsPinById('${item.id}')">📌 ${getNewsPins()[item.id] ? t('pinnedBtn') : t('pinBtn')}</span>
            ${url ? `<a href="${url}" target="_blank" rel="noopener" class="card-detail-link">🔗 ${t('articleLink')}</a>` : ''}
          </div>
        </div>
        <div class="comment-box" id="${_commentDomId('news', item.id)}" style="display:none;"></div>
      </div>`;
    }

    // ホーム画面プレビュー専用の軽量カード（タイトルのみ・横スクロール、要約文は含めない）
    function _lifeInfoPreviewCardHtml(item) {
      const lang = getLang();
      const title = (lang === 'ja' ? item.title : item.title_en) || item.title || '';
      const catKey = LIFE_INFO_CATEGORY_LABEL_KEYS[item.category] || '';
      const catLabel = catKey ? t(catKey) : '';
      const url = (item.sourceUrl || '').replace(/'/g, '&#39;');
      return `<div style="flex:0 0 auto;width:180px;background:var(--warm-white);border-radius:12px;padding:10px 12px;cursor:pointer;" onclick="openLifeInfoLink('${url}')">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px;font-size:10px;color:var(--warm-gray);">
          ${catLabel ? `<span style="${_lifeInfoCategoryTagStyle(item.category)}border-radius:20px;padding:1px 7px;font-weight:700;">${catLabel}</span>` : ''}
          <span>${item.source || ''}</span>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--midnight);line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${title}</div>
      </div>`;
    }

    // ホーム画面: 生活情報プレビュー（直近2〜3件、公開日新しい順）
    async function loadLifeInfoPreview() {
      const section = document.getElementById('life-info-preview-section');
      const list = document.getElementById('life-info-preview-list');
      if (!section || !list) return;
      try {
        const res = await fetch(API_BASE + `/api/life-info?city=${getCity()}`);
        const items = res.ok ? await res.json() : [];
        if (!Array.isArray(items) || items.length === 0) {
          section.style.display = 'none';
          return;
        }
        const preview = items.slice(0, 3);
        list.innerHTML = preview.map(_lifeInfoPreviewCardHtml).join('');
        section.style.display = 'block';
      } catch (e) {
        // GET /api/events の成否とは無関係に失敗させる（ホーム画面全体には影響させない）
        section.style.display = 'none';
      }
    }

    // ニュース画面: カテゴリ絞り込み込みの一覧表示
    // 先頭チップ（旧「すべて」）は「新着」に変更済み。cat===''（このチップ）選択時のみ
    // 新着（直近24時間以内）に絞り込み、他の具体的なカテゴリを選んだ場合は解除する。
    function setNewsCategory(cat) {
      _newsCategory = cat;
      _newsFilterNew = (cat === '');
      document.querySelectorAll('#news-filter-row .filter-chip').forEach(chip => {
        chip.classList.toggle('active', (chip.dataset.newsCat || '') === cat);
      });
      document.getElementById('news-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
      renderNewsList();
    }

    // 新着（1日以内）のみ表示（イベント画面の toggleNewFilter() と同じ基準・パターン）
    function toggleNewsFilterNew() {
      _newsFilterNew = !_newsFilterNew;
      document.getElementById('news-new-filter-btn')?.classList.toggle('active', _newsFilterNew);
      renderNewsList();
    }

    function _isLifeInfoItemNew(item) {
      if (!item.fetched_at) return false;
      const fetched = new Date(item.fetched_at);
      if (isNaN(fetched.getTime())) return false;
      return (Date.now() - fetched.getTime()) <= 24 * 3600000;
    }

    function renderNewsList() {
      const list = document.getElementById('news-list');
      const empty = document.getElementById('news-empty-state');
      if (!list) return;
      // 同じ絞り込み条件・同じデータ版で既に描画済みなら何もしない
      // （タブを行き来するたびにカードを丸ごと作り直してfadeUpが再生され「ちかっ」と光って見える問題の対策）
      const key = _newsCategory + '|' + _newsFilterNew + '|' + _newsDataVersion;
      if (key === _newsListRenderedKey) return;
      _newsListRenderedKey = key;
      let filtered = _newsCategory
        ? LIFE_INFO_DATA.filter(item => item.category === _newsCategory)
        : [...LIFE_INFO_DATA];
      if (_newsFilterNew) filtered = filtered.filter(_isLifeInfoItemNew);
      // カテゴリチップの並び順（#news-filter-row）と一致させる
      const NEWS_CATEGORY_ORDER = { admin: 0, transport: 1, health: 2, weather: 3, community: 4, education: 5 };
      filtered.sort((a, b) => {
        const ca = NEWS_CATEGORY_ORDER[a.category] ?? 99;
        const cb = NEWS_CATEGORY_ORDER[b.category] ?? 99;
        if (ca !== cb) return ca - cb;
        return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
      });
      const countEl = document.getElementById('news-result-count');
      if (countEl) countEl.textContent = getLang() === 'ja' ? `${filtered.length}件` : `${filtered.length}`;
      if (filtered.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      list.innerHTML = filtered.map(_lifeInfoCardHtml).join('');
      _applyCommentCounts('news', '#news-list [data-comment-item-id]');
    }

    async function loadLifeInfoNewsScreen() {
      const list = document.getElementById('news-list');
      if (list) list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--warm-gray);">
        <div style="font-size:24px;margin-bottom:8px;">⏳</div>
        <div style="font-size:14px;">${t('loadingEvents')}</div>
      </div>`;
      try {
        const res = await fetch(API_BASE + `/api/life-info?city=${getCity()}`);
        LIFE_INFO_DATA = res.ok ? await res.json() : [];
      } catch (e) {
        LIFE_INFO_DATA = [];
      }
      _newsDataLoaded = true;
      _newsDataVersion++;
      renderNewsList();
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

    function _setIconFilter(type) {
      // pin/ending/new は元々排他トグルだったが、「新着」チップ(filterCats/filterNew)が
      // カテゴリ行の主軸になった現在は、残りわずか(ending)・ピン留め(pin)はその上に追加で
      // 絞り込む補助フィルターという位置づけに変わっている。他方をONにした際に
      // filterNew を巻き込んで強制OFFにしないよう、自分のグループ内だけで排他制御する
      const wasActive = type === 'pin' ? showPinnedOnly : type === 'ending' ? filterEnding : filterNew;
      if (type !== 'new') {
        showPinnedOnly = false; filterEnding = false;
        document.getElementById('pin-filter-btn')?.classList.remove('active');
        document.getElementById('ending-filter-btn')?.classList.remove('active');
      } else {
        filterNew = false;
        document.getElementById('new-filter-btn')?.classList.remove('active');
      }
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

    // ─── コメント機能（イベント・生活情報カード共通。設計書174） ───
    // ひとことメモ（.tips-toggle-btn/.tips-box--collapsible）と同じ開閉パターンを踏襲し、
    // ボトムシートではなくカード内にインライン展開する。
    function _commentDomId(itemType, itemId) { return 'comment-box-' + itemType + '-' + itemId; }
    function _commentBtnId(itemType, itemId) { return 'comment-btn-' + itemType + '-' + itemId; }

    // JWTペイロード（署名検証はしない、UI表示専用の軽量判定）から自分のuserIdを取り出す。
    // 「自分のコメントにだけ削除リンクを出す」ための見た目上の判定のみに使用し、
    // 実際の削除権限チェックはサーバー側(DELETE /api/comments/:id)で必ず行う。
    function _getMyUserIdFromToken() {
      const token = getAuthToken();
      if (!token) return null;
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.userId || null;
      } catch (_) { return null; }
    }

    function toggleCardComments(itemType, itemId) {
      const box = document.getElementById(_commentDomId(itemType, itemId));
      const btn = document.getElementById(_commentBtnId(itemType, itemId));
      if (!box || !btn) return;
      const open = box.style.display === 'none' || !box.style.display;
      box.style.display = open ? 'block' : 'none';
      const arrow = btn.querySelector('.tips-arrow');
      if (arrow) arrow.textContent = open ? '△' : '▽';
      if (open && !box.dataset.loaded) {
        box.dataset.loaded = '1';
        _loadComments(itemType, itemId);
      }
    }

    async function _loadComments(itemType, itemId) {
      const box = document.getElementById(_commentDomId(itemType, itemId));
      if (!box) return;
      try {
        const res = await fetch(API_BASE + `/api/comments?itemType=${itemType}&itemId=${encodeURIComponent(itemId)}`);
        const comments = res.ok ? await res.json() : [];
        _renderCommentBox(itemType, itemId, comments);
      } catch (e) {
        box.innerHTML = `<div class="comment-empty">${t('toastCommentError')}</div>`;
      }
    }

    function _renderCommentBox(itemType, itemId, comments) {
      const box = document.getElementById(_commentDomId(itemType, itemId));
      if (!box) return;
      const myUserId = _getMyUserIdFromToken();
      const listHtml = (comments && comments.length)
        ? comments.map(c => `
          <div class="comment-item">
            <div class="comment-meta">
              <span class="comment-nickname">${escapeHtml(c.nickname || '匿名')}</span>
              <span>${_formatLifeInfoDate(c.createdAt)}</span>
              ${myUserId && c.userId === myUserId ? `<span class="comment-delete-link" onclick="deleteComment('${c.id}','${itemType}','${itemId}')">${t('commentDeleteLink')}</span>` : ''}
            </div>
            <div class="comment-text">${escapeHtml(c.text)}</div>
          </div>`).join('')
        : '';

      const inputHtml = getAuthToken()
        ? `<div class="comment-input-row">
            <input class="comment-input" id="comment-input-${itemType}-${itemId}" maxlength="300" placeholder="${t('commentPlaceholder')}">
            <button class="comment-send-btn" onclick="postComment('${itemType}','${itemId}')">➤</button>
          </div>`
        : `<div class="comment-auth-gate">${t('commentAuthGate')} <a onclick="goToAccountLinking()">${t('authGateBtn')}</a></div>`;

      box.innerHTML = listHtml + inputHtml;
    }

    function _updateCommentCountLabel(itemType, itemId, delta) {
      const btn = document.getElementById(_commentBtnId(itemType, itemId));
      if (!btn) return;
      const label = btn.querySelector('.comment-count-label');
      if (!label) return;
      const current = parseInt(label.textContent.replace(/[()]/g, ''), 10) || 0;
      const next = Math.max(0, current + delta);
      label.textContent = next > 0 ? ` (${next})` : '';
    }

    async function postComment(itemType, itemId) {
      const input = document.getElementById(`comment-input-${itemType}-${itemId}`);
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      try {
        const res = await authedFetch(API_BASE + '/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemType, itemId, text, nickname: getUserName() }),
        });
        if (!res.ok) { showToast(t('toastCommentError')); return; }
        input.value = '';
        await _loadComments(itemType, itemId);
        _updateCommentCountLabel(itemType, itemId, 1);
      } catch (e) {
        showToast(t('toastCommentError'));
      }
    }

    async function deleteComment(commentId, itemType, itemId) {
      if (!confirm(t('confirmDeleteComment'))) return;
      try {
        const res = await authedFetch(API_BASE + `/api/comments/${commentId}`, { method: 'DELETE' });
        if (!res.ok) { showToast(t('toastCommentError')); return; }
        await _loadComments(itemType, itemId);
        _updateCommentCountLabel(itemType, itemId, -1);
        showToast(t('toastCommentDeleted'));
      } catch (e) {
        showToast(t('toastCommentError'));
      }
    }

    // カード一覧描画時に1回だけ呼び、itemId毎のコメント数をボタンのラベルに反映する
    // （カード枚数分のリクエストを避けるため/api/comments/countsで一括取得）
    async function _applyCommentCounts(itemType, containerSelector) {
      try {
        const res = await fetch(API_BASE + `/api/comments/counts?itemType=${itemType}`);
        if (!res.ok) return;
        const counts = await res.json();
        document.querySelectorAll(containerSelector).forEach(btn => {
          const label = btn.querySelector('.comment-count-label');
          const id = btn.dataset.commentItemId;
          if (!label || !id) return;
          const n = counts[id] || 0;
          label.textContent = n > 0 ? ` (${n})` : '';
          // コメント欄は常に折りたたみをデフォルトとする（2026-09-03、自動展開を撤回）
        });
      } catch (_) {}
    }

    function toggleCatFilter(val) {
      if (val === 'all') {
        // 先頭チップ（旧「すべて」）は「新着」に変更済み。新着（直近24時間以内）に絞り込む
        filterCats.clear();
        _recommendModeActive = false;
        filterNew = true;
      } else if (val === 'recommend') {
        if (getGenreList().length === 0) {
          // ジャンル未設定時は「おすすめ」チップ自体が非表示のため、
          // ONにせず即座に抜ける（表示中カテゴリの状態を変更しない）
          return;
        }
        filterCats.clear();
        _recommendModeActive = !_recommendModeActive;
        filterNew = false;
      } else {
        if (filterCats.has(val) && !_recommendModeActive) {
          // 既にアクティブなカテゴリを再タップしても何もしない（タブとして選択状態を維持する。
          // 「すべて」に戻ってしまうトグル解除の挙動は意図しない誤動作だったため撤回）
          return;
        }
        _recommendModeActive = false;
        filterCats.clear();
        filterCats.add(val);
        filterNew = false;
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

        // 新着（取り込みから24時間以内、2026-09-02に日付単位判定から厳密な経過時間判定へ変更）
        const newMatch = !filterNew || (() => {
          if (!e.fetched_at) return false;
          const fetched = new Date(e.fetched_at);
          if (isNaN(fetched.getTime())) return false;
          return (Date.now() - fetched.getTime()) <= 24 * 3600000;
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

      // カテゴリチップの並び順（#filter-row-category）と一致させる
      const CATEGORY_ORDER = { event: 0, show: 1, gourmet: 2, sale: 3, opening: 4, travel: 5 };
      filtered.sort((a, b) => {
        const ca = CATEGORY_ORDER[a.type] ?? 99;
        const cb = CATEGORY_ORDER[b.type] ?? 99;
        if (ca !== cb) return ca - cb;
        const fa = a.fetched_at || '0000-00-00';
        const fb = b.fetched_at || '0000-00-00';
        return fb.localeCompare(fa);
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
      _applyCommentCounts('event', '#cards-grid [data-comment-item-id]');
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

    // ─── ニュース画面カテゴリチップ 即時タップ対応（filter-row-categoryと同じパターン、設計書172） ───
    {
      let _newsCatTouchStartX = 0, _newsCatTouchStartY = 0;
      document.getElementById('news-filter-row')?.addEventListener('touchstart', e => {
        _newsCatTouchStartX = e.touches[0].clientX;
        _newsCatTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      document.getElementById('news-filter-row')?.addEventListener('touchend', e => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        const dx = Math.abs(e.changedTouches[0].clientX - _newsCatTouchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - _newsCatTouchStartY);
        if (dx > 8 || dy > 8) return;
        e.preventDefault();
        setNewsCategory(chip.dataset.newsCat || '');
      }, { passive: false });
    }

    // ─── ニュース画面「新着のみ」ボタン 即時タップ対応 ───
    document.getElementById('news-new-filter-btn')?.addEventListener('touchend', e => {
      e.preventDefault();
      toggleNewsFilterNew();
    }, { passive: false });

    // ─── ニュース画面「更新」ボタン 即時タップ対応 ───
    document.getElementById('news-refresh-btn')?.addEventListener('touchend', e => {
      e.preventDefault();
      loadLifeInfoNewsScreen();
    }, { passive: false });

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

    // ─── ニュース画面スワイプでカテゴリ切り替え（ホーム画面と同じパターン、単独判定。設計書172） ───
    {
      let _newsSwipeStartX = 0, _newsSwipeStartY = 0, _newsSwipeIntent = null, _newsSwipeOnHeaderScroll = false;

      function _newsVisibleCatOrder() {
        return [...document.querySelectorAll('#news-filter-row .filter-chip')]
          .filter(b => b.offsetParent !== null)
          .map(b => b.dataset.newsCat || '');
      }

      function _switchNewsCatBySwipe(dir) {
        const order = _newsVisibleCatOrder();
        const idx = order.indexOf(_newsCategory);
        const next = idx + dir;
        if (idx === -1 || next < 0 || next >= order.length) return;
        setNewsCategory(order[next]);
        const chip = document.querySelector(`#news-filter-row .filter-chip[data-news-cat="${order[next]}"]`);
        chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }

      const newsScreenEl = document.getElementById('screen-news');
      newsScreenEl?.addEventListener('touchstart', e => {
        _newsSwipeOnHeaderScroll = !!e.target.closest('#news-filter-row');
        _newsSwipeStartX = e.touches[0].clientX;
        _newsSwipeStartY = e.touches[0].clientY;
        _newsSwipeIntent = null;
      }, { passive: true });

      newsScreenEl?.addEventListener('touchmove', e => {
        if (_newsSwipeOnHeaderScroll || _newsSwipeIntent) return;
        const dx = Math.abs(e.touches[0].clientX - _newsSwipeStartX);
        const dy = Math.abs(e.touches[0].clientY - _newsSwipeStartY);
        if (dx > 6 || dy > 6) _newsSwipeIntent = dx > dy ? 'h' : 'v';
      }, { passive: true });

      newsScreenEl?.addEventListener('touchend', e => {
        if (_newsSwipeOnHeaderScroll || _newsSwipeIntent !== 'h') return;
        const dx = e.changedTouches[0].clientX - _newsSwipeStartX;
        if (Math.abs(dx) < 50) return;
        _switchNewsCatBySwipe(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    // ─── ボトムナビ 即時タップ対応（iOS Safari scroll-offset click mismatch 回避）───
    {
      let _navTouchStartX = 0, _navTouchStartY = 0;
      ['home', 'news', 'pins', 'settings'].forEach(s => {
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
      ['backup-passphrase-overlay', () => closeBackupPassphraseSheet()],
      ['backup-passphrase-submit-btn', () => submitBackupPassphrase()],
    ].forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('touchend', e => { e.preventDefault(); fn(); }, { passive: false });
    });


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
    // loadLifeInfoPreview(); // イベント画面のプレビューは非表示化（ニュースタブに一本化、2026-08-28）
    loadLifeInfoNewsScreen(); // ニュースタブを初期表示画面にしたため起動時に直接読み込む（2026-08-28）
    setTimeout(() => _debugLogScreenMetrics('news'), 500); // 診断: 初期表示時点のメトリクス（使い捨て）
    initPushState().then(() => _maybePromptPushOnboarding());
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

    // Pull to Refresh（ニュース画面。iOS版のみ有効化。ニュース画面に横スワイプ機構はあるが
    // 独立判定のためコース画面と同様 watchSwipeIntent=false）
    _initPtr(document.getElementById('news-scroll-content'), 'ptr-indicator-news', async () => {
      await loadLifeInfoNewsScreen();
    }, false);

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
      document.getElementById('news-scroll-content')?.addEventListener('scroll', () => {
        fab.classList.toggle('visible', document.getElementById('news-scroll-content').scrollTop > 300);
      }, { passive: true });
    })();
    function fabScrollTop() {
      const targetId = document.getElementById('nav-news')?.classList.contains('active')
        ? 'news-scroll-content' : 'home-scroll-content';
      document.getElementById(targetId)?.scrollTo({ top: 0, behavior: 'smooth' });
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
      renderPinList();
    }

    function updatePinButtons() {
      const pins = getPins();
      document.querySelectorAll('.spot-card').forEach(card => {
        const id = card.dataset.id;
        const btn = card.querySelector('#pin-' + id);
        if (!btn) return;
        const label = card.querySelector('#pin-label-' + id);
        const isPinned = !!pins[id];
        btn.classList.toggle('pinned', isPinned);
        btn.setAttribute('aria-label', t(isPinned ? 'pinnedBtn' : 'pinBtn'));
        if (label) label.textContent = t(isPinned ? 'pinnedBtn' : 'pinBtn');
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
          </div>`;
        _updatePinsScreenEmptyState();
        return;
      }
      // 元のイベントカードをそのまま再利用する（EVENT_REGISTRYは毎回のloadEventData()で
      // ピン留め済みだが現存しないイベントを自動的に間引いているため、ここに残る entries は
      // 必ずEVENT_REGISTRYに存在する前提で良い）
      container.innerHTML = entries
        .map(p => EVENT_REGISTRY[p.id])
        .filter(Boolean)
        .map(e => renderEventCard(e))
        .join('');
      loadInstagramEmbeds();
      _applyCommentCounts('event', '#pin-list-content [data-comment-item-id]');
      _updatePinsScreenEmptyState();
    }

    // ニュース・イベントどちらもピン留めが0件の場合、セクション分けされた表示の代わりに
    // 画面中央に大きく表示する共通の空状態に切り替える（設計時点の「上に寄りすぎ」対策）
    function _updatePinsScreenEmptyState() {
      const sectioned = document.getElementById('pins-sectioned-content');
      const combined = document.getElementById('pins-empty-combined');
      if (!sectioned || !combined) return;
      const bothEmpty = Object.keys(getPins()).length === 0 && Object.keys(getNewsPins()).length === 0;
      sectioned.style.display = bothEmpty ? 'none' : '';
      combined.style.display = bothEmpty ? 'flex' : 'none';
    }

    // ニュース記事のピン留め一覧（画面: #screen-pins、シンプルな一覧）
    function renderNewsPinList() {
      const container = document.getElementById('news-pin-list-content');
      if (!container) return;
      const pins = getNewsPins();
      const entries = Object.values(pins);
      if (entries.length === 0) {
        container.innerHTML = `
          <div class="pin-empty">
            <div class="pin-empty-emoji">📰</div>
            <div class="pin-empty-title">${t('newsPinEmpty')}</div>
          </div>`;
        _updatePinsScreenEmptyState();
        return;
      }
      container.innerHTML = entries.map(_lifeInfoCardHtml).join('');
      _applyCommentCounts('news', '#news-pin-list-content [data-comment-item-id]');
      _updatePinsScreenEmptyState();
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

    function removePin(id) {
      const pins = getPins();
      delete pins[id];
      savePins(pins);
      updatePinButtons();
      renderPinList();
    }

    function clearPins() {
      if (!confirm(t('confirmClearPins'))) return;
      localStorage.removeItem(pinsKey());
      updatePinButtons();
      renderPinList();
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
        // アカウント連携だけで完結させる方針に変更。バックアップパスフレーズの必須化は廃止
        // （_checkMandatoryBackupSetup()本体は削除せず残置、設定画面から任意に設定可能なまま）
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
        title: 'SG在住Navi',
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

    // 初回起動時のみ、通知をデフォルトでONにするため自動的に許可ダイアログを表示する（iOS版のみ）。
    // localStorageのフラグで一度きりにする（結果が許可/拒否どちらでも二度と自動では聞かない）。
    // 起動直後だとまだ画面が整っていないため少し待ってから表示する。
    async function _maybePromptPushOnboarding() {
      if (!_isCapacitorApp) return;
      try {
        if (localStorage.getItem('app_push_onboarding_prompted')) return;
        localStorage.setItem('app_push_onboarding_prompted', 'true');
        if (!_shouldShowPushPrompt()) return;
        setTimeout(() => { _toggleNativePush(); }, 1500);
      } catch (_) {}
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
        if (_pushSubscription) {
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
          showToast(t('toastPushOn'));
        }
      } catch(e) {
        showToast(t('toastPushError'));
      }
      _updatePushBtn();
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
      // 通知タップでアプリが起動/フォアグラウンド化した際の遷移
      // （?nav=news 指定なら生活情報タブ、それ以外はトップ画面へ。
      //  共有カレンダー参加ダイアログへの誘導は設計書178フェーズ3で予定表・共有カレンダー機能削除に伴い撤去）
      plugin.addListener('pushNotificationActionPerformed', (action) => {
        let targetNav = 'home';
        try {
          const url = action?.notification?.data?.url;
          if (url) {
            const u = new URL(url, 'https://dosuru.app');
            if (u.searchParams.get('nav') === 'news') targetNav = 'news';
          }
        } catch (e) {}
        switchNav(targetNav);
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
      closePinDetail();
      closeEventFilterSheet();
      const detail = document.getElementById('detail-screen');
      if (detail) detail.classList.remove('visible');
    }

    const FAB_HIDDEN_SCREENS = new Set(['settings']);

    let _loadedCity = getCity();

    // アカウント連携必須ゲート（設計書116）
    function _applyScreenAuthGate(screenKey) {
      const gateEl = document.getElementById(`${screenKey}-auth-gate`);
      if (!gateEl) return;
      const gated = !getAuthToken();
      gateEl.style.display = gated ? 'flex' : 'none';
      return gated;
    }

    function goToAccountLinking() {
      switchNav('settings');
      setTimeout(() => {
        document.getElementById('login-section-logged-out')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    // ─── 診断: News画面のbodyスクロール調査（使い捨て、原因特定後に削除すること。2026-08-28） ───
    function _debugLogScreenMetrics(screen) {
      try {
        const el = screen === 'home' ? document.getElementById('screen-home') : document.getElementById('screen-' + screen);
        const scrollEl = screen === 'home' ? document.getElementById('home-scroll-content') : el?.querySelector('.screen-scroll-content');
        const cs = el ? window.getComputedStyle(el) : null;
        _sendDebugLog('screen_metrics_debug', {
          screen,
          bodyScrollHeight: document.body.scrollHeight,
          docScrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          windowScrollY: window.scrollY,
          elDisplay: cs?.display,
          elFlexDirection: cs?.flexDirection,
          elClassList: el?.className,
          elOffsetHeight: el?.offsetHeight,
          elBoundingHeight: el ? Math.round(el.getBoundingClientRect().height) : null,
          scrollElScrollHeight: scrollEl?.scrollHeight,
          scrollElClientHeight: scrollEl?.clientHeight,
        });
      } catch (err) {
        _sendDebugLog('screen_metrics_debug_error', { screen, message: String(err) });
      }
    }
    let _debugScrollDiagBound = false;
    function _bindDebugScrollDiag() {
      if (_debugScrollDiagBound) return;
      _debugScrollDiagBound = true;
      let lastY = window.scrollY;
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        if (y === lastY) return;
        lastY = y;
        const activeNav = document.querySelector('.nav-item.active')?.id || '';
        _sendDebugLog('window_scroll_debug', { scrollY: y, activeNav });
      }, { passive: true });
    }
    _bindDebugScrollDiag();

    function switchNav(screen) {
      // 画面遷移直前にフォーカスが残っていれば無条件で外す（モーダル閉じ忘れ等でinput/textareaに
      // フォーカスが残ったまま遷移すると、iOS WKWebViewでボトムナビのタップが効かなくなる不具合の対策。2026-07-11）
      if (document.activeElement && document.activeElement !== document.body && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      closeAllPopups();
      ['home','news','pins','settings'].forEach(s => {
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

      const cityChanged = getCity() !== _loadedCity;
      const appHeader = document.querySelector('.app-header');
      if (screen === 'home') {
        document.getElementById('screen-home').style.display = 'flex';
        if (appHeader) appHeader.style.display = 'block';
        // 既に「すべて」表示済み（カテゴリ未選択・おすすめモードOFF）かつ都市も変わっていなければ、
        // タブを叩くだけで毎回チップ再同期・スクロール位置リセット・再描画をやり直す必要はない。
        // ニュース画面の同種の「変化がなければ何もしない」対策と挙動を揃える（生活情報のちかつき対策と同じ考え方）。
        const homeAlreadyDefault = filterCats.size === 0 && !_recommendModeActive && filterNew === true && !filterEnding;
        // 縦スクロール位置は変化の有無に関わらず必ず一番上に戻す（生活情報画面と同じ挙動）
        document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
        if (!homeAlreadyDefault || cityChanged) {
          filterCats.clear();
          _recommendModeActive = false;
          filterNew = true; // 先頭チップ（新着）にリセット
          filterEnding = false; // 「残りわずか」フィルターもリセット
          document.getElementById('ending-filter-btn')?.classList.remove('active');
          _syncCatChips();
          _syncRecommendChip();
          // チップ行を左端にスクロール
          const chipRow = document.getElementById('filter-row-category');
          if (chipRow) chipRow.scrollLeft = 0;
          if (cityChanged) { _loadedCity = getCity(); loadEventData(); }
          else { renderEventCards(); }
        }
        setTimeout(() => _debugLogScreenMetrics('home'), 300);
      } else {
        document.getElementById('screen-home').style.display = 'none';
        if (appHeader) appHeader.style.display = 'none';
        const el = document.getElementById('screen-' + screen);
        if (el) {
          el.style.display = 'flex';
          el.classList.add('visible');
        }
        if (screen === 'settings') {
          initSettingsProfile();
          initSettingsGenres();
          renderBackupSection();
          checkExistingBackupOnOpen();
        }
        if (screen === 'news') {
          // ボトムナビからニュースタブを開くたびにカテゴリ絞り込みを先頭チップ（新着）にリセットする
          _newsCategory = '';
          _newsFilterNew = true;
          document.querySelectorAll('#news-filter-row .filter-chip').forEach(chip => {
            chip.classList.toggle('active', !(chip.dataset.newsCat || ''));
          });
          // カテゴリタブ行を左端にスクロール（おでかけ画面のfilter-row-categoryと同じ挙動）
          const newsChipRow = document.getElementById('news-filter-row');
          if (newsChipRow) newsChipRow.scrollLeft = 0;
          // 一覧の縦スクロール位置も一番上に戻す（おでかけ画面のhome-scroll-contentと同じ挙動）
          document.getElementById('news-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
          // おでかけ画面と同じく、初回のみfetchし、以降はキャッシュ済みデータを再描画するだけにする
          // （毎回ローディング表示が挟まると「更新が走っている」ように見えるため）
          if (_newsDataLoaded) renderNewsList();
          else loadLifeInfoNewsScreen();
          setTimeout(() => _debugLogScreenMetrics('news'), 300);
        }
        if (screen === 'pins') {
          renderPinList();
          renderNewsPinList();
        }
      }
    }

    // ユーティリティ（getUserName()はコメント機能《postComment()》が現役使用中のため残置。getUserId()はコース機能専用のため設計書178フェーズ1で削除済み）
    function getUserName() {
      return localStorage.getItem('user_name') || '匿名';
    }

    function fmtDateKey(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function handleImgError(el, cls, emoji) {
      if (!el.dataset.retried) {
        el.dataset.retried = '1';
        const src = el.src;
        setTimeout(() => {
          if (!el.isConnected) return; // 待機中にDOMから除去されていたら何もしない
          el.removeAttribute('src');
          el.src = src; // 同一URLへのsrc再代入だけではブラウザが再読み込みしないことがあるため、一度removeAttributeで明示的にクリアしてから再設定する
        }, 1200);
        return;
      }
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

    checkNavParam();

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
      const appPromo = `📱 SG在住Navi — ${cityMeta.subtitleJa}\n${appUrl}`;
      const shareData = eventUrl
        ? {
            title: spotName || 'SG在住Navi',
            text: `「${spotName}」が気になってます！\n\n${appPromo}`,
            url: eventUrl,
          }
        : {
            title: 'SG在住Navi',
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
    // CryptoKeyオブジェクトを直接受け取る汎用の暗号化・復号（IV12バイト先頭付与、Base64url形式）
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

    // 現在のlocalStorageからバックアップ対象データ一式を集める（設計書58 §3-4 新構造。
    // 設計書178フェーズ1でコース機能削除に伴い myCoursesByCity/likedCourses フィールドを削除。
    // 設計書178フェーズ2で探訪（スタンプラリー）機能削除に伴い stampMemos/arrivalDate/departureDate フィールドを削除。
    // 設計書178フェーズ3で予定表機能削除に伴い customPlans/eventPlansByCity フィールドを削除）
    function _collectBackupPayload() {
      let genres = [], ageList = [];
      try { genres = JSON.parse(localStorage.getItem('app_genres') || '[]'); } catch (_) {}
      try { ageList = JSON.parse(localStorage.getItem('app_age_list') || '[]'); } catch (_) {}
      return {
        version: 2,
        genres,
        who: localStorage.getItem('app_who') || '[]',
        ageList,
        avatar: localStorage.getItem('user_avatar') || '',
      };
    }

    // 復号したバックアップデータをlocalStorageへローカルとマージして書き込む（設計書58 §3-5。
    // 設計書178フェーズ2で旧構造〈versionフィールドなし〉の後方互換分岐を削除、常にversion:2形式として扱う。
    // 設計書178フェーズ3で予定表機能削除に伴い customPlans/eventPlansByCity のマージ処理を削除）
    async function _applyRestoredBackup(dec) {
      if (Array.isArray(dec.genres) && dec.genres.length && getGenreList().length === 0) {
        saveGenreList(dec.genres);
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

    // マイコース保存・ジャンル/プロフィール/いいね変更から呼ばれる。
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
          <button class="cal-sync-action secondary" data-backup-action="change" style="margin-bottom:8px;">🔑 <span data-i18n="backupChangePassphrase">${t('backupChangePassphrase')}</span></button>
          <button class="cal-sync-action secondary" data-backup-action="disable">🚫 <span data-i18n="backupDisable">${t('backupDisable')}</span></button>`;
      } else {
        el.innerHTML = `
          <p style="font-size:13px;color:var(--warm-gray);line-height:1.7;margin:0 0 10px;" data-i18n="backupDisabledDesc">${t('backupDisabledDesc')}</p>
          <button class="cal-sync-action primary" data-backup-action="setup">🔒 <span data-i18n="backupEnable">${t('backupEnable')}</span></button>`;
      }
    }

    // ─── バックアップ用パスフレーズ入力シート ───
    let _backupSheetMode = null; // 'setup' | 'restore' | 'change'
    let _backupSheetMandatory = false; // true時はオーバーレイタップ・✕・キャンセルで閉じられない（設計書118）

    // アカウント連携が確認できた（refreshLoginUI success分岐）たびに呼ばれる。この端末にまだ
    // バックアップ鍵materialが無ければ、サーバーの既存バックアップ有無を見てsetup/restoreいずれかの
    // モードで必須パスフレーズシートを開く（設計書118）。
    async function _checkMandatoryBackupSetup() {
      if (!getAuthToken()) return;
      if (isBackupEnabled()) return; // 既にこの端末で鍵material保持済みなら何もしない
      const sheetEl = document.getElementById('backup-passphrase-sheet');
      if (sheetEl && sheetEl.classList.contains('visible')) return; // 既に開いている（二重表示防止）
      try {
        const res = await authedFetch(API_BASE + '/api/user-plans/me');
        if (!res.ok) return;
        const d = await res.json();
        const mode = (d.salt && d.encryptedData) ? 'restore' : 'setup';
        openBackupPassphraseSheet(mode, true); // 第2引数 mandatory=true
      } catch (e) {}
    }

    async function openBackupPassphraseSheet(mode, mandatory = false) {
      if (!getAuthToken()) { showToast(t('backupLoginRequired')); return; }
      _sendDebugLog('backup_passphrase_sheet_open', { mode, mandatory, isCapacitor: _isCapacitorApp, ua: navigator.userAgent });
      _backupSheetMode = mode;
      _backupSheetMandatory = mandatory;
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
      const closeBtn = document.getElementById('backup-passphrase-close-btn');
      const cancelBtn = document.getElementById('backup-passphrase-cancel-btn');
      const resetLink = document.getElementById('backup-passphrase-reset-link');
      if (closeBtn) closeBtn.style.display = mandatory ? 'none' : '';
      if (cancelBtn) cancelBtn.style.display = mandatory ? 'none' : '';
      if (resetLink) resetLink.style.display = (mandatory && mode === 'restore') ? '' : 'none';
      lockScroll();
      document.getElementById('backup-passphrase-overlay').classList.add('visible');
      document.getElementById('backup-passphrase-sheet').classList.add('visible');
    }

    function closeBackupPassphraseSheet() {
      if (_backupSheetMandatory) return; // 必須モードは閉じさせない（オーバーレイタップ・✕・キャンセル全経路がこの1関数を通るため一括で防げる）
      _blurIfFocusInside('backup-passphrase-sheet');
      unlockScroll();
      document.getElementById('backup-passphrase-overlay').classList.remove('visible');
      document.getElementById('backup-passphrase-sheet').classList.remove('visible');
    }

    (function _initBackupPassphraseInputDiag() {
      const input = document.getElementById('backup-passphrase-input');
      if (!input) return;
      ['touchstart', 'touchend', 'focus', 'blur', 'input'].forEach(evtName => {
        input.addEventListener(evtName, () => {
          _sendDebugLog('backup_passphrase_input_event', {
            evt: evtName,
            valueLength: input.value.length,
            activeElementIsInput: document.activeElement === input,
            isCapacitor: _isCapacitorApp,
          });
        }, { passive: true });
      });
    })();

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

    // 必須restoreモードで「パスフレーズを忘れた場合」リンクをタップした際、シートを閉じずに
    // その場でsetupモードへ切り替える（設計書118）。サーバー上の暗号化データは_doBackupSetupが
    // 新しいsalt+暗号文で無条件PUT上書きするため、この関数自体はUI切り替えのみでよい。
    function _resetBackupAndSetupFresh() {
      if (!confirm(t('confirmBackupReset'))) return;
      _backupSheetMode = 'setup';
      document.getElementById('backup-passphrase-title').textContent = t('backupSetupTitle');
      document.getElementById('backup-passphrase-confirm-row').style.display = '';
      document.getElementById('backup-passphrase-input').value = '';
      document.getElementById('backup-passphrase-reset-link').style.display = 'none';
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
        _backupSheetMandatory = false; // 成功時は必須モードでも閉じられるようにする（設計書118）
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
        _backupSheetMandatory = false; // 成功時は必須モードでも閉じられるようにする（設計書118）
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
        _backupSheetMandatory = false; // 成功時は必須モードでも閉じられるようにする（設計書118）
        closeBackupPassphraseSheet();
        renderBackupSection();
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

    // Web版でのプッシュ通知タップ遷移（?nav=news → 生活情報タブ）。sw.jsのnotificationclickが
    // client.navigate()で付与するクエリを起動時に読み取る
    function checkNavParam() {
      const sp = new URLSearchParams(window.location.search);
      const nav = sp.get('nav');
      if (nav !== 'news') return;
      switchNav('news');
      window.history.replaceState({}, '', window.location.pathname);
    }

