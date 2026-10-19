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

    // ─── 設定画面のキーボード被り対策（軽量フォールバックのみ。2026-07-11設計書15で刷新）───
    // かつての .plan-modal / .plan-sheet を縮小・移動する複雑なJS一式（_adjustSheetForKb等）は撤去した。
    // ビューポート固着バグの真因は capacitor.config.js の contentInset:'always' 側にあり、
    // これらのシート操作JSは無害な被害者だったと判明したため（設計書15）。
    // シート系のキーボード回避は .plan-modal-body{overflow-y:auto} の内部スクロールとネイティブに委ねる。
    //
    // ただし「設定画面直下の入力欄（#feedback-text など、.plan-modal/.plan-sheetの外側）」は
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
        catEvent: '限定イベント',
        catShow: '展示・公演',
        catGourmet: 'グルメ・フェア',
        catSale: 'プロモ・お得',
        catOpening: '新規オープン',
        catTravel: '旅行',
        catStarting: '🆕 今週から',
        catEnding: '🔥 今週まで',
        labelWhen: 'いつ行く？',
        labelWhat: 'どこ行く？',
        emptyTitle: '該当するスポットが見つかりませんでした',
        emptyDesc: '条件を変えて<br>探してみてください。',
        pinScreenTitle: '📌 ピン留め',
        homeScreenTitle: 'おでかけ情報',
        settingsTitle: '設定',
        calNotesSwitch: '説明',
        secProfile: 'プロフィール',
        secAppSettings: 'アプリ設定',
        secData: 'データ',
        secSupport: 'サポート・情報',
        clearPins: 'ピン留めをすべて削除',
        resetBtn: 'リセット',
        secFeedback: 'フィードバック',
        feedbackPlaceholder: '改善要望・バグ報告・スポット追加リクエストなど、なんでもどうぞ！',
        feedbackSend: '📨 送信する',
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
        loadingLifeInfo: 'くらし情報を読み込み中...',
        labelPush: '更新の通知',
        pushOn: 'オン',
        pushOff: 'オフ',
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
        qrShareTitle: 'アプリを共有',
        qrShareDesc: 'このQRコードを友達に読み取ってもらうと、アプリのダウンロードページが開きます',
        qrShareLinkBtn: 'シェア',
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
        prBadgeLabel: 'PR',
        titleEditCancel: 'キャンセル',
        labelDarkMode: 'ダークモード',
        statTemp: '気温',
        statRain: '降水確率',
        statNowcast: '2時間予報',
        statFx: 'SGD→JPY',
        statPsi: 'PSI',
        statPm25: 'PM2.5(1時間)',
        statDengue: 'デング熱',
        fareSheetTitle: '旅行シーズン情報',
        fareSheetPrevMonth: '前の月',
        fareSheetNextMonth: '次の月',
        fareLegendMonth: '色の見方',
        fareLegendYear: '12か月の目安',
        tourFareStep1: '前後のボタンで、月を切り替えられます',
        tourFareStep2: '都市をタップすると、その月の詳細が出ます。グリーンは安め、オレンジは高めの目安です',
        tourWelcomeStart: '始める',
        tourWelcomeTitle1: 'SG在住Naviへようこそ',
        tourWelcomeStep1: 'シンガポール在住の方向けの、くらしとおでかけの情報アプリです。主な使い方を、30秒でご案内します',
        tourWelcomeStep2: '下のボタンで、くらし・おでかけ・カレンダー・設定を切り替えられます。カレンダーでは、祝日や行事、旅行シーズン情報が見られます',
        tourWelcomeStep3: '為替・PM2.5(大気汚染)・デング熱の今の値です。PM2.5はタップするとエリア別の詳細が、デング熱は基準が見られます',
        tourWelcomeStep4: 'ニュースを、カテゴリで絞り込めます',
        psiUpdated: '更新',
        psiMode1h: 'PM2.5',
        psiMode24h: 'PSI',
        psiLoading: '読み込み中…',
        psiDesc1h: 'PM2.5(微小粒子)の、直近1時間の値です。1時間ごとに更新されます',
        psiDesc1hWidget: 'エリア別のPM2.5(微小粒子)の、直近1時間の値です。上の指標は、中心部の値です',
        psiDesc24h: 'エリア別のPSI(過去24時間の平均値)です。1時間ごとに更新されます',
        psiNote24h: 'NEA(シンガポール環境庁)データ。PSIは24時間平均',
        psiNote1h: 'NEA(シンガポール環境庁)データ。基準もNEAの値',
        tourFareStep3: '選んだ都市のシーズン情報が見られます。バーの月をタップすると、月を切り替えられます。表示は目安です',
        tourCalStep1: 'オンにすると、予定の期間と説明がまとめて表示されます',
        tourCalStep2: 'この飛行機のアイコンをタップすると、旅行先ごとの高い・安いの目安を、月を切り替えながら見られます',
        labelTutorial: 'チュートリアル',
        tutorialSheetTitle: 'チュートリアル',
        tutorialAll: '最初から全部見る',
        tutorialSee: '見る',
        tutorialSeen: '✓ 見た',
        tutorialClose: '閉じる',
        tutorialName1: '基本の使い方',
        tutorialDesc1: '画面の見方と、くらしの指標・カテゴリ',
        tutorialName2: 'カレンダー',
        tutorialDesc2: '予定の説明と、旅行シーズン情報の入口',
        tutorialName3: '旅行シーズン情報',
        tutorialDesc3: '月の切り替えと、都市ごとの詳細',
        tutorialName4: 'くらしの指標(PM2.5)',
        tutorialDesc4: 'PM2.5の見方と、タップで見える詳細',
        tourPm25Step1: '真ん中は、空気の汚れ具合(PM2.5)です。顔の絵文字と色で、今の状態が分かります',
        tourPm25Step2: 'ここで、PM2.5とPSIを切り替えられます。PSIは、空気の汚れの総合点です',
        tourPm25Step3: 'エリアごとの値です。緑は安全、黄色はちょっと危険、赤は危険です',
        tourPm25Step4: '色と顔の絵文字の見方です',
        fareSheetLoading: '読み込み中…',
        fareSheetFailed: '読み込めませんでした。しばらくしてから開き直してください。',
        fxConverterTitle: 'かんたん換算',
        fxConverterBase: '100 SGD は:',
        fxConverterUnavailable: 'レートを取得できませんでした。しばらくしてから開き直してください。',
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
        labelSisterApp: '姉妹アプリ SGBusNavi',
        secWilloa: 'Willoa',
        labelAboutWilloa: 'About Willoa',
      }
    };

    // 英語対応(i18n)は廃止済み（設計書189）。getLang()は常に'ja'を返す簡易実装として残す
    // （呼び出し元19箇所を個別に書き換える代わりに、この関数自体を簡略化することで影響範囲を最小化している）
    function getLang() { return 'ja'; }
    function t(key) { const s = STRINGS.ja; return (s && s[key] !== undefined) ? s[key] : key; }

    // 新規インストールか(新機能の紹介を出さない判定、設計書227)。sg_themeは下のテーマ移行が初回起動で書くため、
    // 移行より前に評価する。2026-07以降の版を一度でも起動した既存ユーザーは必ず持ち、まっさらな新規だけが持たない
    const _isFreshInstall = (() => { try { return localStorage.getItem('sg_theme') === null; } catch (_) { return false; } })();
    // 新規インストール向けのウェルカムツアー(設計書233)の対象フラグ。新規の最初の起動で立て、見終わる/スキップで消す。
    // 途中でアプリが終了された場合は、次の起動でもう一度出す(sg_themeは2回目以降の起動で存在するため、_isFreshInstallでは判定できない)
    const _WELCOME_PENDING_KEY = 'app_welcome_pending';
    (() => { try { if (_isFreshInstall && _isCapacitorApp) localStorage.setItem(_WELCOME_PENDING_KEY, '1'); } catch (_) {} })();
    // 起動処理(initWhatsNew)が同期で触るため、TDZを避けて早い位置で宣言する
    const _WHATSNEW_SEEN_KEY = 'app_whatsnew_seen';
    let _whatsNewPending = null; // 表示中の紹介: { version, persist, cta }
    let _tutorialRun = null;   // 設定のチュートリアルの見直しの実行中: { queue: [id…] }。nullなら実行していない(再入ガード兼、案内の自動表示の抑止)。switchNav()が早く呼ばれても参照できるよう、ここで宣言する

    // ─── DARK MODE（設計書184で配色機能〈キャラメル/柳グリーン/ダーク〉を廃止し復元）───
    // 旧sg_paletteからの移行: 初回起動時に1回だけ実行
    (function migratePaletteToTheme() {
      if (localStorage.getItem('sg_theme') !== null) return; // 既にsg_theme設定済みなら何もしない
      const oldPalette = localStorage.getItem('sg_palette');
      if (oldPalette === 'dark') {
        localStorage.setItem('sg_theme', 'dark');
      } else {
        // 'default' / 'willow' / 未設定(新規ユーザー) いずれも 'light' に移行
        localStorage.setItem('sg_theme', 'light');
      }
      localStorage.removeItem('sg_palette');
    })();
    function getTheme() { return localStorage.getItem('sg_theme') || 'light'; }
    function applyTheme() {
      const mode = getTheme();
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
      updateThemeUI();
    }
    function updateThemeUI() {
      const el = document.getElementById('dark-mode-label');
      if (!el) return;
      const mode = getTheme();
      const labels = { auto: '自動', light: 'オフ', dark: 'オン' };
      el.textContent = labels[mode] || labels.light;
    }
    function cycleTheme() {
      const cycle = { auto: 'light', light: 'dark', dark: 'auto' };
      const next = cycle[getTheme()] || 'auto';
      localStorage.setItem('sg_theme', next);
      applyTheme();
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (getTheme() === 'auto') applyTheme();
    });

    // ─── CITY ───
    const CITY_META = {
      sg: { code: 'SG', flag: '🇸🇬', nameJa: 'シンガポール', nameEn: 'Singapore', subtitleJa: 'シンガポール在住者の週末おでかけガイド', subtitleEn: 'Weekend guide for Japanese in Singapore' },
      bkk: { code: 'BKK', flag: '🇹🇭', nameJa: 'バンコク',         nameEn: 'Bangkok',       subtitleJa: 'バンコク在住者の週末おでかけガイド',         subtitleEn: 'Weekend guide for Japanese in Bangkok' },
      syd: { code: 'SYD', flag: '🇦🇺', nameJa: 'シドニー',         nameEn: 'Sydney',        subtitleJa: 'シドニー在住者の週末おでかけガイド',         subtitleEn: 'Weekend guide for Japanese in Sydney' },
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

    // 日本語の文で、数字+単位・英単語・カタカナ語の途中で折り返さないよう、塊をnowrapのspanで包む(長すぎる塊は包まない)。
    // 末尾4文字ほども1つの塊にして、折り返した最後の行が1〜2文字だけになるのを防ぐ(短い文には適用しない)
    function _noBreakJa(text) {
      text = text == null ? '' : String(text);
      const re = /(\d+(?:[\/:.,]\d+)*(?:[〜~\-]\d+(?:[\/:.,]\d+)*)?(?:周年|万人|万|か月|月|日|年|時|分|人|%|番)?(?:[上中下]旬)?)|([A-Za-z][A-Za-z0-9]*(?:[-'][A-Za-z0-9]+)*)|([ァ-ヶー]+・?)/g;
      const wrap = (str) => {
        let out = '', last = 0, m;
        re.lastIndex = 0;
        while ((m = re.exec(str)) !== null) {
          out += escapeHtml(str.slice(last, m.index));
          out += (m[0].length >= 2 && m[0].length <= 16) ? `<span class="nb">${escapeHtml(m[0])}</span>` : escapeHtml(m[0]);
          last = m.index + m[0].length;
        }
        return out + escapeHtml(str.slice(last));
      };
      if (text.length <= 10) return wrap(text);
      let tailStart = text.length - 4, m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index < tailStart && tailStart < m.index + m[0].length) { tailStart = m.index; break; }
      }
      if (text.length - tailStart > 16) return wrap(text);
      return wrap(text.slice(0, tailStart)) + `<span class="nb">${wrap(text.slice(tailStart))}</span>`;
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

    // ─── 指標ウィジェット（為替・天気・PSI・スコール・デング熱） ───
    // PSI・デング熱の判定基準（server.jsのpsiLevel()/dengueLevel()と一致させること）
    const STAT_CRITERIA = {
      psi: [
        { label: '良好', range: '0-50', emoji: '😊' },
        { label: '普通', range: '51-100', emoji: '😐' },
        { label: '要注意', range: '101-200', emoji: '😷' },
        { label: '健康に悪い', range: '201-300', emoji: '😫' },
        { label: '危険', range: '301+', emoji: '☠️' },
      ],
      dengue: [
        { label: '警報なし', range: '0区' },
        { label: '注意', range: '1-5区' },
        { label: '警戒', range: '6-15区' },
        { label: '厳重警戒', range: '16区+' },
      ],
    };
    const STAT_CRITERIA_DESC = {
      psi: '大気汚染の程度を示す指標です。中心部(セントラル地域)の過去24時間の値で、1時間ごとに更新されます',
      dengue: '現在活動中のデング熱クラスター(流行地区)の数です。日々の新規感染者数ではありません',
    };
    // 指標レベル→絵文字マッピング（PSIのみ実装。将来デング熱等に展開する場合はキーを追加するだけでよい構造。
    // server.jsのpsiLevel()のレベル文字列と一致させること）
    const STAT_LEVEL_EMOJI = {
      psi: { '良好': '😊', '普通': '😐', '要注意': '😷', '健康に悪い': '😫', '危険': '☠️' },
      // くらし画面の指標ウィジェットは、2026-10-19から中心部のPM2.5(1時間値)。区分はserver.jsのpm25Level()・_PM25_BANDSと一致させる
      pm25: { '通常': '😊', 'やや高い': '😷', '高い': '😫', '非常に高い': '☠️' },
    };
    const _statCurrentLevel = { psi: null, dengue: null };
    // デング熱の4段階→3色(緑=安全・黄=ちょっと危険・赤=危険)。PSI/PM2.5と同じ3色方針(2026-10-19ユーザー指定)
    const _DENGUE_LEVEL_CLASS = { '警報なし': 'safe', '注意': 'caution', '警戒': 'danger', '厳重警戒': 'danger' };

    function toggleStatCriteria(kind) {
      const popover = document.getElementById('stat-criteria-popover');
      if (!popover) return;
      if (popover.classList.contains('visible') && popover.dataset.kind === kind) {
        popover.classList.remove('visible');
        return;
      }
      if (kind === 'psi') { _openPsiPopover(popover); return; }
      if (kind === 'fx') { _openFxPopover(popover); return; }
      popover.classList.remove('psi-detail', 'fx-detail');
      const currentLevel = _statCurrentLevel[kind];
      const chips = STAT_CRITERIA[kind].map(it => {
        const tierCls = _DENGUE_LEVEL_CLASS[it.label] ? ` dengue-lv-${_DENGUE_LEVEL_CLASS[it.label]}` : '';
        // デング熱は凡例の3色文字色分けのみとし、現在値の塗りつぶしハイライトは行わない(2026-10-19ユーザー指定)。
        // kind==='dengue'以外(将来の拡張用)は従来どおりactiveクラスで現在値を強調する。
        const activeCls = (kind !== 'dengue' && it.label === currentLevel) ? ' active' : '';
        return `<span class="stat-criteria-chip${tierCls}${activeCls}">${it.emoji ? it.emoji + ' ' : ''}${it.label} ${it.range}</span>`;
      }).join('');
      popover.innerHTML = `<div class="stat-criteria-desc">${STAT_CRITERIA_DESC[kind]}</div><div class="stat-criteria-chips">${chips}</div>`;
      popover.dataset.kind = kind;
      popover.classList.add('visible');
    }
    // ─── PSIタップの詳細(設計書234、2026-10-19): エリア別タイル(地図配置)。右上の「1時間 | 24時間」で表示を切り替える ───
    // 24時間=各エリアのPSI(24時間値)+PSIの基準。1時間=各エリアのPM2.5(1時間値、µg/m³)+NEAのPM2.5の基準。
    // データは GET /api/psi-detail(サーバーが10分キャッシュ)。端末側でも5分キャッシュする。選んだ表示は localStorage の sg_psi_mode に保存する。
    // 失敗時・データ無しの時は、今までの「説明+基準のチップ」だけを出す。PSIの区分のしきい値は server.js の psiLevel() と一致させること。
    const _PSI_LEVEL_CLASS = { '良好': 'good', '普通': 'normal', '要注意': 'caution', '健康に悪い': 'unhealthy', '危険': 'hazard' };
    // NEAのPM2.5(1時間値)の区分。出典: NEAのヘイズ情報ポータル https://www.haze.gov.sg/resources/1-hr-pm2.5-readings(2026-10-19確認)
    // Band1 0-55 Normal / Band2 56-150 Elevated / Band3 151-250 High / Band4 251以上 Very High
    const _PM25_BANDS = [
      { cls: 'normal', label: '通常', range: '0-55', max: 55 },
      { cls: 'elevated', label: 'やや高い', range: '56-150', max: 150 },
      { cls: 'high', label: '高い', range: '151-250', max: 250 },
      { cls: 'veryhigh', label: '非常に高い', range: '251+', max: Infinity },
    ];
    const _PSI_MAP_ORDER = ['north', 'west', 'central', 'east', 'south'];
    const _PSI_REGION_NAMES = { north: '北部', west: '西部', central: '中心部', east: '東部', south: '南部' };
    const _PSI_DETAIL_TTL_MS = 5 * 60 * 1000;
    let _psiDetail = null;          // { data, fetchedAt }
    let _psiDetailPromise = null;
    // 開くたびに、上のウィジェットと同じ指標で始める(PM2.5(1時間値)の時は'1h'=PM2.5、PSIのフォールバック時は'24h'=PSI)。
    // 右上の「PM2.5 | PSI」の切り替えは、そのポップアップを開いている間だけ有効で、保存しない(2026-10-19ユーザー指定『まず1時間毎のPM2.5』)
    let _psiMode = '1h';
    let _psiWidgetKind = null;   // 上のウィジェットが何を表示しているか: 'pm25'(中心部のPM2.5 1時間値)/'psi'(従来の中心部PSI。pm25が無い時のフォールバック)/null(未取得)

    function _psiLevelOfValue(v) {
      if (!Number.isFinite(v)) return null;
      if (v <= 50) return '良好';
      if (v <= 100) return '普通';
      if (v <= 200) return '要注意';
      if (v <= 300) return '健康に悪い';
      return '危険';
    }
    function _pm25BandOfValue(v) {
      if (!Number.isFinite(v)) return null;
      return _PM25_BANDS.find(b => v <= b.max) || null;
    }
    function _psiTimeParts(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
      return m ? { mo: Number(m[2]), d: Number(m[3]), h: Number(m[4]), mi: m[5] } : null;
    }
    function _psiCell(v) { return Number.isFinite(v) ? String(v) : '–'; }
    function _psiDetailValid(d) {
      return !!(d && Array.isArray(d.regions) && d.regions.some(r => r && (Number.isFinite(r.psi) || Number.isFinite(r.pm25))));
    }
    // 現在モードの、値と区分(クラス・ラベル)の取り出し
    function _psiModeInfo(r) {
      if (_psiMode === '1h') {
        const band = _pm25BandOfValue(r && r.pm25);
        return { value: r ? r.pm25 : null, cls: band ? `pm25-lv-${band.cls}` : '', label: band ? band.label : '' };
      }
      const lv = _psiLevelOfValue(r && r.psi);
      return { value: r ? r.psi : null, cls: lv ? `psi-lv-${_PSI_LEVEL_CLASS[lv]}` : '', label: lv || '' };
    }
    // 凡例のチップ。どのエリアも「選ばれた状態」にしないため、現在の区分の強調は付けない(2026-10-19ユーザー指定)
    function _psiChipsHtml(d, mode) {
      if ((mode || _psiMode) === '1h') {
        return _PM25_BANDS.map(b =>
          `<span class="psi-chip pm25-lv-${b.cls}">${STAT_LEVEL_EMOJI.pm25[b.label] ? STAT_LEVEL_EMOJI.pm25[b.label] + ' ' : ''}${b.label} ${b.range}</span>`
        ).join('');
      }
      return STAT_CRITERIA.psi.map(it =>
        `<span class="psi-chip psi-lv-${_PSI_LEVEL_CLASS[it.label] || 'normal'}">${it.emoji ? it.emoji + ' ' : ''}${it.label} ${it.range}</span>`
      ).join('');
    }
    function _psiTilesHtml(d) {
      const by = {};
      d.regions.forEach(r => { if (r && r.id) by[r.id] = r; });
      const tile = (id, pos) => {
        const r = by[id] || { id, name: _PSI_REGION_NAMES[id] };
        const info = _psiModeInfo(r);
        return `<div class="psi-tile psi-pos-${pos} ${info.cls}">`
          + `<div class="psi-tile-name">${escapeHtml(r.name || _PSI_REGION_NAMES[id])}</div>`
          + `<div class="psi-tile-val">${escapeHtml(_psiCell(info.value))}</div>`
          + `<div class="psi-tile-sub">${escapeHtml(info.label || (_psiMode === '1h' ? 'µg/m³' : ''))}</div></div>`;
      };
      return `<div class="psi-map" data-tour="psi-map">${tile('north', 'n')}${tile('west', 'w')}${tile('central', 'c')}${tile('east', 'e')}${tile('south', 's')}</div>`;
    }
    function _psiPopoverHtml(loading) {
      const d = _psiDetail && _psiDetail.data;
      if (!loading && _psiDetailValid(d)) {
        const tp = _psiTimeParts(d.updatedAt);
        const updated = tp ? `${escapeHtml(t('psiUpdated'))}: ${tp.mo}/${tp.d} ${tp.h}:${tp.mi}` : '';
        const btn = (mode, label) => `<button type="button" class="psi-mode-btn${_psiMode === mode ? ' active' : ''}" role="tab" aria-selected="${_psiMode === mode}" data-psi-mode="${mode}" onclick="if(!_touchCapableDetected) setPsiMode('${mode}')">${escapeHtml(label)}</button>`;
        // 説明は、モードと、上のウィジェットが表示している指標(PM2.5/PSI)に合わせる。ウィジェットがPSIの時(pm25が無いフォールバック)だけ、従来の「中心部の過去24時間の値」
        const desc = _psiMode === '1h'
          ? (_psiWidgetKind === 'pm25' ? t('psiDesc1hWidget') : t('psiDesc1h'))
          : (_psiWidgetKind === 'psi' ? STAT_CRITERIA_DESC.psi : t('psiDesc24h'));
        const note = _psiMode === '1h' ? t('psiNote1h') : t('psiNote24h');
        // 並び: 説明+トグル → タイル → 基準のチップ(凡例) → 注記(NEAのデータです…)
        return `<div class="psi-bar"><span class="psi-updated">${updated}</span><div class="psi-mode" role="tablist" data-tour="psi-toggle">${btn('1h', t('psiMode1h'))}${btn('24h', t('psiMode24h'))}</div></div>`
          + `<div class="stat-criteria-desc psi-desc">${escapeHtml(desc)}</div>`
          + _psiTilesHtml(d)
          + `<div class="psi-chips" data-tour="psi-chips">${_psiChipsHtml(d)}</div>`
          + `<div class="psi-note">${escapeHtml(note)}</div>`;
      }
      // 読み込み中・失敗時: ウィジェットがPM2.5の時はPM2.5の基準、それ以外は従来のPSIの説明と基準
      const fbPm25 = _psiWidgetKind === 'pm25';
      return `<div class="stat-criteria-desc psi-desc">${escapeHtml(fbPm25 ? t('psiDesc1h') : STAT_CRITERIA_DESC.psi)}</div>`
        + (loading ? `<div class="psi-loading">${escapeHtml(t('psiLoading'))}</div>` : '')
        + `<div class="psi-chips">${_psiChipsHtml(null, fbPm25 ? '1h' : '24h')}</div>`;
    }
    function _loadPsiDetail() {
      if (_psiDetail && Date.now() - _psiDetail.fetchedAt < _PSI_DETAIL_TTL_MS) return Promise.resolve(_psiDetail.data);
      if (_psiDetailPromise) return _psiDetailPromise;
      _psiDetailPromise = (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/psi-detail?city=${getCity()}`);
          if (!res.ok) throw new Error('psi-detail failed');
          const data = await res.json();
          _psiDetail = { data, fetchedAt: Date.now() };
          return data;
        } catch (_) {
          return null;
        } finally {
          _psiDetailPromise = null;
        }
      })();
      return _psiDetailPromise;
    }
    function _openPsiPopover(popover) {
      _psiMode = _psiWidgetKind === 'psi' ? '24h' : '1h';   // 開くたびに、ウィジェットと同じ指標(通常はPM2.5)で始める
      popover.dataset.kind = 'psi';
      popover.classList.remove('fx-detail');
      popover.classList.add('visible', 'psi-detail');
      const fresh = _psiDetail && Date.now() - _psiDetail.fetchedAt < _PSI_DETAIL_TTL_MS;
      popover.innerHTML = _psiPopoverHtml(!fresh);
      if (fresh) return;
      _loadPsiDetail().then(() => {
        if (popover.dataset.kind !== 'psi' || !popover.classList.contains('visible')) return;
        popover.innerHTML = _psiPopoverHtml(false);
      });
    }
    // ─── 為替「かんたん換算」(設計書236、2026-10-19): 100 SGDが主要12通貨でいくらかの早見表 ───
    // 入力欄・通貨選択・⇄切替は無し(速さ優先)。loadWidgetStats()が保持した_fxRatesを使い、新規通信せず同期的に描画する
    const FX_QUICK_CURRENCIES = [
      { code: 'JPY', flag: '🇯🇵' }, { code: 'IDR', flag: '🇮🇩' }, { code: 'MYR', flag: '🇲🇾' },
      { code: 'THB', flag: '🇹🇭' }, { code: 'VND', flag: '🇻🇳' }, { code: 'INR', flag: '🇮🇳' },
      { code: 'AUD', flag: '🇦🇺' }, { code: 'PHP', flag: '🇵🇭' }, { code: 'TWD', flag: '🇹🇼' },
      { code: 'HKD', flag: '🇭🇰' }, { code: 'USD', flag: '🇺🇸' }, { code: 'EUR', flag: '🇪🇺' },
    ];
    // 通貨ごとの読みやすさ優先の整形（JPYは整数桁区切り、桁数が突出するIDR/VNDは「万」単位に短縮、他は小数1桁）
    function _fxFormatAmount(code, amount) {
      if (code === 'JPY') {
        return Math.round(amount).toLocaleString('ja-JP');
      }
      if (code === 'IDR' || code === 'VND') {
        return (amount / 10000).toFixed(1) + '万';
      }
      return amount.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    function _fxPopoverHtml() {
      if (!_fxRates) {
        return `<div class="stat-criteria-desc">${escapeHtml(t('fxConverterUnavailable'))}</div>`;
      }
      const rows = FX_QUICK_CURRENCIES.map(({ code, flag }) => {
        const rate = _fxRates[code];
        if (!Number.isFinite(rate)) return '';
        const amount = rate * 100;
        return `<div class="fx-row"><span class="fx-row-cur">${flag} ${code}</span><span class="fx-row-val">${escapeHtml(_fxFormatAmount(code, amount))}</span></div>`;
      }).join('');
      return `<div class="stat-criteria-desc">${escapeHtml(t('fxConverterTitle'))}</div>`
        + `<div class="fx-base">${escapeHtml(t('fxConverterBase'))}</div>`
        + `<div class="fx-rows">${rows}</div>`;
    }
    function _openFxPopover(popover) {
      popover.dataset.kind = 'fx';
      popover.classList.remove('psi-detail');
      popover.classList.add('visible', 'fx-detail');
      popover.innerHTML = _fxPopoverHtml();
    }
    // 「PM2.5 | PSI」の切り替え(開いている間だけ有効。保存しない)
    function setPsiMode(mode) {
      _psiMode = mode === '1h' ? '1h' : '24h';
      const popover = document.getElementById('stat-criteria-popover');
      if (!popover || popover.dataset.kind !== 'psi' || !_psiDetailValid(_psiDetail && _psiDetail.data)) return;
      popover.innerHTML = _psiPopoverHtml(false);
    }
    // 切り替えボタンの即時タップ対応(ポップアップ内。ゴーストクリックはonclickのガードで抑える)
    document.getElementById('stat-criteria-popover')?.addEventListener('touchend', e => {
      const b = e.target.closest('[data-psi-mode]');
      if (!b) return;
      e.preventDefault();
      setPsiMode(b.dataset.psiMode);
    }, { passive: false });
    // クライテリア表示中に他の場所をタップしたら閉じる
    document.addEventListener('touchend', e => {
      // ポップアップ内のボタン(トグル等)は、押すと中身を作り直してタップ元の要素がDOMから外れるため、e.target.closest()では
      // 「ポップアップの外」と誤判定して閉じてしまう(2026-10-19に実機で発生)。タップ開始時点の経路(composedPath)で判定する
      // 案内(スポットライト)の表示中は、「次へ」「スキップ」のタップ(案内のレイヤー上=ポップアップの外)で閉じない(2026-10-19)
      if (_tourState) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      const popover = document.getElementById('stat-criteria-popover');
      if (e.target.closest('[data-stat-crit]') || e.target.closest('#stat-criteria-popover') || (popover && path.includes(popover))) return;
      popover?.classList.remove('visible');
    }, { passive: true });

    // 指標ウィジェットの前回取得時刻（設計書213: 画面遷移時の再取得判定に使用。成功時のみ更新）
    let _widgetStatsLastLoadedAt = 0;
    let _fxRates = null;   // くらし画面「かんたん換算」(設計書236)用。100 SGD換算の12通貨レート。loadWidgetStats()が保持、タップ時は新規fetchしない
    async function loadWidgetStats() {
      try {
        const res = await fetch(API_BASE + '/api/widget-stats?city=' + getCity());
        const data = await res.json();
        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        if (data.exchangeRate) setText('stat-fx', data.exchangeRate.toFixed(1) + '円');
        if (data.fxRates) _fxRates = data.fxRates;
        if (data.psi) _statCurrentLevel.psi = data.psi.level;   // PSIの基準のチップの強調用(ポップアップの24時間モード)
        // 指標の値: 新しいサーバー応答(pm25あり)=中心部のPM2.5(1時間値)、無ければ従来の中心部のPSI(24時間値)にフォールバック
        const stat = data.pm25 ? { key: 'pm25', label: 'statPm25', v: data.pm25 } : (data.psi ? { key: 'psi', label: 'statPsi', v: data.psi } : null);
        if (stat) {
          const emoji = STAT_LEVEL_EMOJI[stat.key][stat.v.level] || '';
          setHTML('stat-psi', `${emoji ? `<span class="stat-val-emoji">${emoji}</span> ` : ''}${stat.v.value}<span class="stat-val-level">(${stat.v.level})</span>`);
          const lbl = document.getElementById('stat-psi-label');
          if (lbl) { lbl.dataset.i18n = stat.label; lbl.textContent = t(stat.label); }
          _psiWidgetKind = stat.key;
        }
        if (data.dengue) { setHTML('stat-dengue', `${data.dengue.clusterCount}区<span class="stat-val-level">(${data.dengue.level})</span>`); _statCurrentLevel.dengue = data.dengue.level; }
        if (data.weather) {
          setText('stat-temp', Math.round(data.weather.temp) + '°');
          setText('stat-rain', data.weather.rainProbPercent + '%');
        }
        if (data.nowcast) setText('stat-nowcast', data.nowcast.text);
        _widgetStatsLastLoadedAt = Date.now(); // 成功時のみ更新（失敗時は直前の表示を維持し、次回遷移時に再試行させる）
      } catch (e) { /* 取得失敗時は「--」のまま表示 */ }
    }

    function selectCity(city) {
      if (!CITY_META[city]) return;
      localStorage.setItem('app_city', city);
      updateCityUI();
      updateTabLabels();
      const meta = CITY_META[city];
      showToast(`${meta.flag} ${meta.nameJa}に切り替えました`);
    }

    function updateCityUI() {
      const city = getCity();
      const meta = CITY_META[city] || CITY_META.sg;

      buildCitySelect();

      const shareDescEl = document.getElementById('share-settings-desc');
      if (shareDescEl) {
        const descJa = { sg: 'シンガポール在住の友達にこのアプリを紹介しよう！', bkk: 'バンコク在住の友達にこのアプリを紹介しよう！', syd: 'シドニー在住の友達にこのアプリを紹介しよう！' };
        shareDescEl.textContent = descJa[city] || descJa.sg;
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
      buildCitySelect();
      updateTabLabels();
      _syncRecommendChip();
      updateThemeUI();
      if (typeof initSettingsProfile === 'function') initSettingsProfile();
      if (typeof initSettingsGenres === 'function') initSettingsGenres();
    }

    // 祝日・学校休暇データは data/sg/calendar-events.json + GET /api/calendar に一本化済み
    // （旧LONG_VACATIONS_BY_CITY/CITY_HOLIDAYS/CITY_HOLIDAY_NAMESは呼び出し元が無いデッドコードのため2026-09-06に削除）

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
      await loadLikeCounts('event'); // 設計書210: 公開いいね件数をLIKE_COUNTSへ格納してからカード描画する
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

      const displayContent = e.content || '';
      const rawTips = e.tips;

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
        event:   { bg: 'var(--caramel-pale)',    color: 'var(--caramel)' },
        show:    { bg: 'var(--sky-pale)',         color: 'var(--sky)' },
        gourmet: { bg: 'var(--terracotta-pale)',  color: 'var(--terracotta)' },
        sale:    { bg: 'var(--sage-pale)',        color: 'var(--sage)' },
        opening: { bg: 'var(--gold-pale)',        color: 'var(--gold)' },
        travel:  { bg: 'var(--plum-pale)',        color: 'var(--plum)' },
      };
      const catKey = EVENT_CATEGORY_LABEL_KEYS[e.type] || '';
      const catLabel = catKey ? t(catKey) : '';
      const catColor = EVENT_CATEGORY_COLORS[e.type] || EVENT_CATEGORY_COLORS.event;
      // 右端バッジ: New とあと何日が両方該当する場合はあと何日を優先（New と全く同じ見た目に統一）
      const inlineBadgeStyle = 'font-size:11px;font-weight:700;color:white;background:var(--caramel);border-radius:20px;padding:3px 9px;margin-left:auto;';
      const inlineBadgeHtml = bannerLabel
        ? `<span style="${inlineBadgeStyle}">${bannerLabel}</span>`
        : (newRibbon !== '' ? `<span style="${inlineBadgeStyle}">New</span>` : '');
      const eventDateStr = _formatLifeInfoDate(e.publishedAt || e.fetched_at);
      const metaRowHtml = (catLabel || e.source || e.period || e.hours || inlineBadgeHtml)
        ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:var(--warm-gray);">
            ${catLabel ? `<span style="background:${catColor.bg};color:${catColor.color};border-radius:20px;padding:2px 8px;font-weight:700;">${catLabel}</span>` : ''}
            ${e.source ? `<span>${e.source}</span>` : ''}
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
                <h2 style="font-family:var(--font-heading);font-size:16px;font-weight:700;color:white;margin:0;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.45);${hasRibbon ? 'padding-right:44px;' : ''}">${e.store || e.title || ''}</h2>
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
            ${displayContent ? `<p style="font-size:15px;color:var(--warm-gray);line-height:1.65;margin-bottom:10px;line-break:strict;">${_noBreakJa(displayContent)}</p>` : ''}
            <div class="card-sub-row">
              ${_likeButtonHtml('event', e.id)}
              ${pinLinkHtml}
              ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener" class="card-detail-link">🔗 ${t('articleLink')}</a>` : ''}
            </div>
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
      admin:     { bg: 'var(--gold-pale)',             color: 'var(--gold)' },
      transport: { bg: 'var(--sage-pale)',             color: 'var(--sage)' },
      health:    { bg: 'var(--terracotta-light-pale)', color: 'var(--terracotta-light)' },
      education: { bg: 'var(--sand)',                  color: 'var(--caramel)' },
      weather:   { bg: 'var(--sky-pale)',              color: 'var(--sky)' },
      community: { bg: 'var(--terracotta-pale)',       color: 'var(--terracotta)' },
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
      updatePinFabVisibility('news');
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
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    // 新着リボン（1日以内に登録、イベントカードの newRibbon ロジックと同一基準）
    function _lifeInfoNewRibbonHtml(item) {
      return _isLifeInfoItemNew(item) ? `<div class="card-new-ribbon card-new-ribbon--today">New</div>` : '';
    }

    function _lifeInfoCardHtml(item) {
      const title = item.title || '';
      const summary = item.summary || '';
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
          ${_likeButtonHtml('news', item.id)}
          <span class="card-detail-link card-pin-link${getNewsPins()[item.id] ? ' pinned' : ''}" style="cursor:pointer;" onclick="toggleNewsPinById('${item.id}')">📌 ${getNewsPins()[item.id] ? t('pinnedBtn') : t('pinBtn')}</span>
          ${url ? `<a href="${url}" target="_blank" rel="noopener" class="card-detail-link">🔗 ${t('articleLink')}</a>` : ''}
        </div>
      </div>`;
    }

    // ホーム画面プレビュー専用の軽量カード（タイトルのみ・横スクロール、要約文は含めない）
    function _lifeInfoPreviewCardHtml(item) {
      const title = item.title || '';
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
      // 1次キー: 取り込み時間（新しい順）、2次キー: カテゴリー順（#news-filter-rowの並びと一致させる）
      const NEWS_CATEGORY_ORDER = { admin: 0, transport: 1, health: 2, weather: 3, community: 4, education: 5 };
      filtered.sort((a, b) => {
        const fa = new Date(a.fetched_at || 0).getTime();
        const fb = new Date(b.fetched_at || 0).getTime();
        if (fa !== fb) return fb - fa;
        const ca = NEWS_CATEGORY_ORDER[a.category] ?? 99;
        const cb = NEWS_CATEGORY_ORDER[b.category] ?? 99;
        return ca - cb;
      });
      const countEl = document.getElementById('news-result-count');
      if (countEl) countEl.textContent = `${filtered.length}件`;
      if (filtered.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      list.innerHTML = filtered.map(_lifeInfoCardHtml).join('');
    }

    async function loadLifeInfoNewsScreen() {
      const list = document.getElementById('news-list');
      if (list) list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--warm-gray);">
        <div style="font-size:24px;margin-bottom:8px;">⏳</div>
        <div style="font-size:14px;">${t('loadingLifeInfo')}</div>
      </div>`;
      try {
        const res = await fetch(API_BASE + `/api/life-info?city=${getCity()}`);
        LIFE_INFO_DATA = res.ok ? await res.json() : [];
      } catch (e) {
        LIFE_INFO_DATA = [];
      }
      await loadLikeCounts('news'); // 設計書210: 公開いいね件数をLIKE_COUNTSへ格納してからカード描画する
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
            <h2 style="font-family:var(--font-heading);font-size:16px;font-weight:700;color:var(--midnight);margin:0 0 8px;line-height:1.3;">${escapeHtml(card.title || '')}</h2>
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
      // pin/new は元々排他トグルだったが、「新着」チップ(filterCats/filterNew)が
      // カテゴリ行の主軸になった現在は、ピン留め(pin)はその上に追加で
      // 絞り込む補助フィルターという位置づけに変わっている。他方をONにした際に
      // filterNew を巻き込んで強制OFFにしないよう、自分のグループ内だけで排他制御する
      const wasActive = type === 'pin' ? showPinnedOnly : filterNew;
      if (type !== 'new') {
        showPinnedOnly = false;
        document.getElementById('pin-filter-btn')?.classList.remove('active');
      } else {
        filterNew = false;
        document.getElementById('new-filter-btn')?.classList.remove('active');
      }
      if (!wasActive) {
        if (type === 'pin')    { showPinnedOnly = true; document.getElementById('pin-filter-btn')?.classList.add('active'); }
        if (type === 'new')    { filterNew      = true; document.getElementById('new-filter-btn')?.classList.add('active'); }
      }
      updateFilterBadge();
      document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
      renderEventCards();
    }

    function togglePinFilter()    { _setIconFilter('pin'); }
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

        return pinMatch && ageMatch && catMatch && whoFilterMatch && weekMatch && areaMatch && newMatch && kwMatch && recommendMatch;
      });

      // 1次キー: 取り込み時間（新しい順）、2次キー: カテゴリー順（#filter-row-categoryの並びと一致させる）
      const CATEGORY_ORDER = { event: 0, show: 1, gourmet: 2, sale: 3, opening: 4, travel: 5 };
      filtered.sort((a, b) => {
        const fa = a.fetched_at || '0000-00-00';
        const fb = b.fetched_at || '0000-00-00';
        if (fa !== fb) return fb.localeCompare(fa);
        const ca = CATEGORY_ORDER[a.type] ?? 99;
        const cb = CATEGORY_ORDER[b.type] ?? 99;
        return ca - cb;
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
        // 設計書210: _cardElCacheのキャッシュヒット時（isNew===false）はrenderEventCard()自体を
        // 呼ばないため、いいね件数・いいね済み状態（ハートの塗りつぶし）をここで都度最新値に同期する。
        // 新規生成時（isNew===true）もrenderEventCard()生成時点の値で固定化されないよう同様に同期する。
        (() => {
          const liked = !!getLikedItems()[`event:${e.id}`];
          const count = LIKE_COUNTS.event?.[e.id] || 0;
          const likeBtn = el.querySelector('.like-btn');
          if (likeBtn) {
            likeBtn.classList.toggle('liked', liked);
            const emojiEl = likeBtn.querySelector('.like-emoji');
            if (emojiEl) emojiEl.textContent = liked ? '❤️' : '🤍';
            const countEl = likeBtn.querySelector('.like-count');
            if (countEl) countEl.textContent = count;
          }
        })();
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

    // ─── カレンダー画面カテゴリチップ 即時タップ対応（filter-row-categoryと同じパターン） ───
    {
      let _calCatTouchStartX = 0, _calCatTouchStartY = 0;
      document.getElementById('calendar-filter-row')?.addEventListener('touchstart', e => {
        _calCatTouchStartX = e.touches[0].clientX;
        _calCatTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      document.getElementById('calendar-filter-row')?.addEventListener('touchend', e => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        const dx = Math.abs(e.changedTouches[0].clientX - _calCatTouchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - _calCatTouchStartY);
        if (dx > 8 || dy > 8) return;
        e.preventDefault();
        setCalendarCategory(chip.dataset.calCat || '');
      }, { passive: false });
    }

    // ─── カレンダー画面 月見出しの季節アイコン・飛行機アイコン
    //     即時タップ対応（いずれも動的に再描画されるため#calendar-listへのイベント委譲） ───
    // filter-row-category等と同じパターン: touchstartで開始座標を記録し、touchendで移動量(dx/dy)が
    // 閾値を超えていればスクロール/ドラッグとみなしタップ処理をしない（ボタン上から指を離さず
    // スクロールすると押した扱いになってしまう不具合の修正）
    let _calListTouchStartX = 0, _calListTouchStartY = 0;
    document.getElementById('calendar-list')?.addEventListener('touchstart', e => {
      _calListTouchStartX = e.touches[0].clientX;
      _calListTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.getElementById('calendar-list')?.addEventListener('touchend', e => {
      const dx = Math.abs(e.changedTouches[0].clientX - _calListTouchStartX);
      const dy = Math.abs(e.changedTouches[0].clientY - _calListTouchStartY);
      if (dx > 8 || dy > 8) return;
      const seasonBtn = e.target.closest('.cal-season-icon-btn');
      if (seasonBtn) {
        e.preventDefault();
        toggleMonthSeasonNote(seasonBtn);
        return;
      }
      const fareGo = e.target.closest('.cal-fare-go');
      if (fareGo) {
        e.preventDefault();
        openFareSheet(Number(fareGo.dataset.month));
      }
    }, { passive: false });

    // ─── PSI・デング熱指標タップでクライテリア表示 即時タップ対応 ───
    document.getElementById('stat-widget-info')?.addEventListener('touchend', e => {
      const col = e.target.closest('[data-stat-crit]');
      if (!col) return;
      e.preventDefault();
      toggleStatCriteria(col.dataset.statCrit);
    }, { passive: false });


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

    // ─── カレンダー画面スワイプでカテゴリ切り替え（ホーム/ニュース画面と同じパターン、単独判定） ───
    {
      let _calSwipeStartX = 0, _calSwipeStartY = 0, _calSwipeIntent = null, _calSwipeOnHeaderScroll = false;

      function _calVisibleCatOrder() {
        return [...document.querySelectorAll('#calendar-filter-row .filter-chip')]
          .filter(b => b.offsetParent !== null)
          .map(b => b.dataset.calCat || '');
      }

      function _switchCalCatBySwipe(dir) {
        const order = _calVisibleCatOrder();
        const idx = order.indexOf(_calendarCategory);
        const next = idx + dir;
        if (idx === -1 || next < 0 || next >= order.length) return;
        setCalendarCategory(order[next]);
        const chip = document.querySelector(`#calendar-filter-row .filter-chip[data-cal-cat="${order[next]}"]`);
        chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }

      const calendarScreenEl = document.getElementById('screen-calendar');
      calendarScreenEl?.addEventListener('touchstart', e => {
        _calSwipeOnHeaderScroll = !!e.target.closest('#calendar-filter-row');
        _calSwipeStartX = e.touches[0].clientX;
        _calSwipeStartY = e.touches[0].clientY;
        _calSwipeIntent = null;
      }, { passive: true });

      calendarScreenEl?.addEventListener('touchmove', e => {
        if (_calSwipeOnHeaderScroll || _calSwipeIntent) return;
        const dx = Math.abs(e.touches[0].clientX - _calSwipeStartX);
        const dy = Math.abs(e.touches[0].clientY - _calSwipeStartY);
        if (dx > 6 || dy > 6) _calSwipeIntent = dx > dy ? 'h' : 'v';
      }, { passive: true });

      calendarScreenEl?.addEventListener('touchend', e => {
        if (_calSwipeOnHeaderScroll || _calSwipeIntent !== 'h') return;
        const dx = e.changedTouches[0].clientX - _calSwipeStartX;
        if (Math.abs(dx) < 50) return;
        _switchCalCatBySwipe(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    // ─── ボトムナビ 即時タップ対応（iOS Safari scroll-offset click mismatch 回避）───
    {
      let _navTouchStartX = 0, _navTouchStartY = 0;
      ['home', 'news', 'calendar', 'settings'].forEach(s => {
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
        { id: 'fab-pin',    fn: () => openPinSheet() },
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
      if (btn.id === 'pin-filter-btn') togglePinFilter();
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
        if (e.target.closest('#do-share-btn'))      { e.preventDefault(); openQrShareSheet(); return; }
        if (e.target.closest('#feedback-send-btn')) { e.preventDefault(); sendFeedback(); return; }
        if (e.target.closest('#push-toggle-btn'))   { e.preventDefault(); togglePush(); return; }
      }, { passive: false });
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
      ['qr-share-overlay', () => closeQrShareSheet()],
      ['qr-share-link-btn', () => doShare()],
      ['promo-modal-overlay', () => closePromoModal()],
      ['promo-modal-dismiss-link', () => closePromoModal()],
      ['whatsnew-start-btn', () => whatsNewPrimary()],
      ['whatsnew-later-btn', () => whatsNewLater()],
      ['tour-next', () => tourNext()],
      ['tour-skip', () => tourSkip()],
    ].forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('touchend', e => { e.preventDefault(); fn(); }, { passive: false });
    });


    // app-headerはscreen-home内のstickyヘッダーになったためsyncHeaderHeightは不要
    function syncHeaderHeight() {}

    // @capacitor/preferences プラグイン参照。プッシュ通知の状態永続化に使用（旧: 認証トークン保存にも使用していたが、
    // アカウント連携機能の全削除に伴いプッシュ通知専用となった）
    let _CapPrefs = null;              // iOS版のみ非null想定
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
    // 新規インストールでウェルカムツアーを出す時は、通知の許可(OSダイアログ)をツアーの終了後に尋ねる(暗幕の上にダイアログが出て混乱するのを避ける)
    initPushState().then(() => { if (!_maybeStartWelcomeTour()) _maybePromptPushOnboarding(); });
    initWhatsNew();
    initSettingsProfile();
    initSettingsGenres();

    // Pull to Refresh（設計書19、イベント画面。iOS版・Web版両方で有効化（設計書198）。既存の横スワイプ機構と共存させるためwatchSwipeIntent=true）
    _initPtr(document.getElementById('home-scroll-content'), 'ptr-indicator-home', async () => {
      await loadEventData();
    }, true);

    // Pull to Refresh（ニュース画面。iOS版・Web版両方で有効化（設計書198）。ニュース画面に横スワイプ機構はあるが
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
      // 隠し操作(実機で新機能の紹介・案内を何度も確認するため): バージョン表示を3秒以内に5回タップすると、
      // 「見た版」と「案内済み」の記録を消して再読み込みする(2026-10-18)
      let _taps = 0, _tapTimer = null;
      el.addEventListener('click', () => {
        _taps++;
        clearTimeout(_tapTimer);
        _tapTimer = setTimeout(() => { _taps = 0; }, 3000);
        if (_taps < 5) return;
        _taps = 0;
        try {
          localStorage.removeItem(_WHATSNEW_SEEN_KEY);
          localStorage.removeItem('app_tour_pending');
          Object.keys(localStorage).filter(k => k.startsWith(_TOUR_DONE_PREFIX)).forEach(k => localStorage.removeItem(k));
          localStorage.setItem(_WELCOME_PENDING_KEY, '1');   // 新規インストール向けのウェルカムツアーも、もう一度出す(通知の許可は触らない)
        } catch (_) {}
        showToast('紹介と案内をリセットしました。再読み込みします');
        setTimeout(() => location.reload(), 900);
      });
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
      document.getElementById('calendar-scroll-content')?.addEventListener('scroll', () => {
        fab.classList.toggle('visible', document.getElementById('calendar-scroll-content').scrollTop > 300);
      }, { passive: true });
    })();
    function fabScrollTop() {
      const targetId = document.getElementById('nav-calendar')?.classList.contains('active')
        ? 'calendar-scroll-content'
        : document.getElementById('nav-news')?.classList.contains('active')
          ? 'news-scroll-content' : 'home-scroll-content';
      document.getElementById(targetId)?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── LIKE LOGIC（設計書210で新規追加、設計書211で双方向トグルに変更）───
    // 個人のブックマーク（ピン留め）とは別の、全ユーザーに見える公開の人気度表示。
    // ログイン不要・ON/OFF双方向トグル（何度でも切り替え可能）。連打・水増し防止は端末のlocalStorageのみ（ピン留めと同方式）。
    let LIKE_COUNTS = { event: {}, news: {} }; // { event: { evt_abc: 12 }, news: { li_xxx: 3 } }

    function likedKey() { return `${getCity()}_liked_items`; }
    function getLikedItems() {
      try { return JSON.parse(localStorage.getItem(likedKey()) || '{}'); } catch { return {}; }
    }
    function saveLikedItems(liked) {
      localStorage.setItem(likedKey(), JSON.stringify(liked));
    }

    // itemType（'event'|'news'）別のいいね件数をまとめて取得し LIKE_COUNTS に格納する
    async function loadLikeCounts(itemType) {
      try {
        const res = await fetch(API_BASE + `/api/likes?itemType=${itemType}`);
        LIKE_COUNTS[itemType] = res.ok ? await res.json() : {};
      } catch (e) {
        LIKE_COUNTS[itemType] = {};
      }
    }

    function toggleLike(itemType, itemId) {
      const liked = getLikedItems();
      const key = `${itemType}:${itemId}`;
      const isLiked = !!liked[key];
      const action = isLiked ? 'unlike' : 'like';
      if (isLiked) {
        delete liked[key];
        LIKE_COUNTS[itemType][itemId] = Math.max(0, (LIKE_COUNTS[itemType][itemId] || 0) - 1);
      } else {
        liked[key] = true;
        LIKE_COUNTS[itemType][itemId] = (LIKE_COUNTS[itemType][itemId] || 0) + 1;
      }
      saveLikedItems(liked);
      _updateLikeButtonDom(itemType, itemId);
      fetch(API_BASE + '/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId, action }),
      }).catch(() => {}); // 失敗時もローカル状態は維持（楽観的UI、ロールバックしない）
    }

    // 該当カードのハートボタンDOM（塗りつぶし状態＋件数）を最新状態に同期する。
    // renderEventCards()の_cardElCacheキャッシュヒット時、および_lifeInfoCardHtml()の
    // innerHTML再代入後どちらから呼んでも安全なよう、DOM要素を都度querySelectorで探す。
    function _updateLikeButtonDom(itemType, itemId) {
      const liked = !!getLikedItems()[`${itemType}:${itemId}`];
      const count = LIKE_COUNTS[itemType]?.[itemId] || 0;
      document.querySelectorAll(`.like-btn[data-like-type="${itemType}"][data-like-id="${CSS.escape(itemId)}"]`).forEach(btn => {
        btn.classList.toggle('liked', liked);
        const emojiEl = btn.querySelector('.like-emoji');
        if (emojiEl) emojiEl.textContent = liked ? '❤️' : '🤍';
        const countEl = btn.querySelector('.like-count');
        if (countEl) countEl.textContent = count;
      });
    }

    function _likeButtonHtml(itemType, itemId) {
      const liked = !!getLikedItems()[`${itemType}:${itemId}`];
      const count = LIKE_COUNTS[itemType]?.[itemId] || 0;
      const safeId = itemId.replace(/'/g, "\\'");
      return `<span class="card-detail-link like-btn${liked ? ' liked' : ''}" data-like-type="${itemType}" data-like-id="${itemId}" style="cursor:pointer;" onclick="toggleLike('${itemType}', '${safeId}')"><span class="like-emoji">${liked ? '❤️' : '🤍'}</span> <span class="like-count">${count}</span></span>`;
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
      updatePinFabVisibility('home');
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
      updatePinFabVisibility('home');
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
    }

    // ─── GENRE SETTINGS ───
    function getGenreList() {
      try { return JSON.parse(localStorage.getItem('app_genres') || '[]'); } catch { return []; }
    }

    function saveGenreList(ids) {
      localStorage.setItem('app_genres', JSON.stringify(ids));
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

    function initSettingsGenres() {
      const container = document.getElementById('genre-chips-container');
      if (!container) return;
      const selected = new Set(getGenreList());
      container.innerHTML = GENRE_LIST.map(g => `
        <button class="genre-chip${selected.has(g.id) ? ' selected' : ''}"
          data-genre="${g.id}"
          onclick="toggleGenre('${g.id}')">${g.emoji} ${g.label}</button>
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
      const whoMap = { solo: 'ひとりで', couple: '夫婦・カップル', family: 'ファミリー', group: 'グループ' };
      const ageMap = { baby: '0〜2歳', preschool: '3〜6歳', school: '小学生以上' };

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
            parts.push(`ファミリー（${ageLabel}）`);
          }
        }
        labelEl.textContent = parts.length ? parts.join('・') : t('genreStatusUnset');
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

    applyProfileSort();
    applyI18n();
    updateCityUI();
    applyTheme();
    loadWidgetStats();
    updatePinFabVisibility('news'); // 起動時のデフォルト画面(くらし)に合わせて初期表示を判定

    // Service Worker登録(プッシュ通知に必要 + 更新時に自動リロードして最新デザインを反映)
    if ('serviceWorker' in navigator) {
      const _hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      if (_hadController) {
        let _swReloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (_swReloaded) return;
          _swReloaded = true;
          location.reload();
        });
      }
    }

    // QR共有シートの「シェア」ボタン。紹介ページ・アプリ両方のリンクを含めて送る
    // 文言はabout.htmlのヒーロー見出しと表現を揃えている（「週末」限定の旧文言は
    // くらし情報・カレンダー等を含む現在の機能構成と合わなくなったため2026-09-11変更）
    async function doShare() {
      const text = `シンガポールの出来事を日本語でまるごとチェック👇\n\n紹介ページ: https://about.dosuru.app\nアプリ: https://apps.apple.com/app/id6787159354`;
      const data = { title: 'SG在住Navi', text };
      if (navigator.share) {
        try { await navigator.share(data); } catch(e) {}
      } else {
        await navigator.clipboard.writeText(text);
        showToast(t('toastUrlCopied'));
      }
    }

    function openQrShareSheet() {
      const canvas = document.getElementById('qr-code-canvas');
      if (canvas && !canvas.hasChildNodes()) {
        const qr = qrcode(0, 'M');
        qr.addData('https://about.dosuru.app');
        qr.make();
        canvas.innerHTML = qr.createSvgTag(6, 4);
      }
      lockScroll();
      document.getElementById('qr-share-overlay').classList.add('visible');
      document.getElementById('qr-share-sheet').classList.add('visible');
    }

    function closeQrShareSheet() {
      unlockScroll();
      document.getElementById('qr-share-overlay').classList.remove('visible');
      document.getElementById('qr-share-sheet').classList.remove('visible');
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
      // Android版（設計書214）: FCM未導入のためプッシュ通知オンボーディング自体を出さない
      if (_isCapacitorApp && window.Capacitor?.getPlatform?.() === 'android') return false;
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
      // Android版（設計書214）: FCM未導入のためプッシュ通知トグルUI自体を非表示にする。
      // iOS版・Web版の既存分岐（_isCapacitorApp判定）には影響を与えない。
      if (_isCapacitorApp && window.Capacitor?.getPlatform?.() === 'android') {
        item.style.display = 'none';
        return;
      }
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
      _closeAllCalBubbles();
    }

    const FAB_HIDDEN_SCREENS = new Set(['settings']);

    let _loadedCity = getCity();

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
      ['home','news','calendar','settings'].forEach(s => {
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
      updatePinFabVisibility(screen);
      if (screen === 'home') {
        document.getElementById('screen-home').style.display = 'flex';
        if (appHeader) appHeader.style.display = 'block';
        // 指標ウィジェット（気温・降水確率・2時間予報等）は前回取得から5分以上経過していれば再取得する（設計書213）。
        // アプリを開きっぱなしのまま長時間放置されても表示が古いままにならないようにするため。
        if (Date.now() - _widgetStatsLastLoadedAt > 5 * 60 * 1000) loadWidgetStats();
        // 既に「すべて」表示済み（カテゴリ未選択・おすすめモードOFF）かつ都市も変わっていなければ、
        // タブを叩くだけで毎回チップ再同期・スクロール位置リセット・再描画をやり直す必要はない。
        // ニュース画面の同種の「変化がなければ何もしない」対策と挙動を揃える（生活情報のちかつき対策と同じ考え方）。
        const homeAlreadyDefault = filterCats.size === 0 && !_recommendModeActive && filterNew === true;
        // 縦スクロール位置は変化の有無に関わらず必ず一番上に戻す（生活情報画面と同じ挙動）
        document.getElementById('home-scroll-content')?.scrollTo({ top: 0, behavior: 'instant' });
        if (!homeAlreadyDefault || cityChanged) {
          filterCats.clear();
          _recommendModeActive = false;
          filterNew = true; // 先頭チップ（新着）にリセット
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
        }
        if (screen === 'news') {
          // 指標ウィジェット（為替・PSI・デング熱等）は前回取得から5分以上経過していれば再取得する（設計書213）
          if (Date.now() - _widgetStatsLastLoadedAt > 5 * 60 * 1000) loadWidgetStats();
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
        if (screen === 'calendar') {
          // ボトムナビからカレンダータブを開くたびにカテゴリ絞り込みを「すべて」にリセットする（ニュース画面と同じ挙動）
          _calendarCategory = '';
          document.querySelectorAll('#calendar-filter-row .filter-chip').forEach(chip => {
            chip.classList.toggle('active', !(chip.dataset.calCat || ''));
          });
          const calFilterRow = document.getElementById('calendar-filter-row');
          if (calFilterRow) calFilterRow.scrollLeft = 0;
          loadCalendarScreen(true);
        }
      }
      _maybeStartPendingTour(screen);
    }

    // ─── ピン留めFAB＋ボトムシート（くらし・おでかけ画面のみ、ピンが1件以上ある時だけFAB表示） ───
    function updatePinFabVisibility(screen) {
      const fab = document.getElementById('fab-pin');
      if (!fab) return;
      const onPinnableScreen = screen === 'home' || screen === 'news';
      const totalPins = Object.keys(getPins()).length + Object.keys(getNewsPins()).length;
      fab.classList.toggle('visible', onPinnableScreen && totalPins > 0);
    }
    function openPinSheet() {
      renderPinList();
      renderNewsPinList();
      document.getElementById('pin-sheet-overlay')?.classList.add('visible');
      lockScroll();
    }
    function closePinSheet() {
      _blurIfFocusInside('pin-sheet');
      document.getElementById('pin-sheet-overlay')?.classList.remove('visible');
      unlockScroll();
    }

    // ─── カレンダー画面（祝日・主要行事(季節イベント/締切/記念日含む)・学校休暇を1年分まとめて一覧表示。実イベントは件数過多のため対象外） ───
    const CALENDAR_CATEGORY_COLORS = {
      'holiday-sg':      { bg: 'var(--holiday-red-pale)',  color: 'var(--holiday-red)' },
      'holiday-jp':      { bg: 'var(--sky-pale)',           color: 'var(--sky)' },
      'festival':        { bg: 'var(--festival-gold-pale)', color: 'var(--festival-gold)' },
      'school-vacation':  { bg: 'var(--sand)',              color: 'var(--warm-gray)' },
    };
    const CALENDAR_CATEGORY_LABELS = {
      'holiday-sg': '祝日', 'holiday-jp': '日本の祝日', 'festival': '文化・催し',
      'school-vacation': '学校行事',
    };
    // 休みかどうかが大事な祝日(SG)だけ、塗りつぶしのラベルで目立たせる(日本の祝日・文化・催し・学校行事は塗りなしの文字)
    const CALENDAR_FILLED_LABEL_CATEGORIES = ['holiday-sg'];
    // 月ごとに毎年繰り返す季節の話題（気候・食べ物・GSS）。年に依存しない固定マッピング。
    // calendar-events.json（年次の日付レンジイベント）とは別の性質のデータのため静的定数として保持する（設計書194）。
    const MONTH_SEASONAL_TAGS = {
      1:  [{ icon: '☂️', note: '北東モンスーン(雨季)の後半で、大雨が続きやすい時期です' }],
      2:  [],
      3:  [{ icon: '☂️', note: '2月の乾燥期を挟んで、北東モンスーン(雨季)の終盤にかけて再び雨が増える時期です' }],
      4:  [],
      5:  [],
      6:  [
        { icon: '🍈', note: 'ドリアンのシーズンが始まります' },
        { icon: '🛍️', note: 'GSS(グレートシンガポールセール)が始まる時期です' },
      ],
      7:  [
        { icon: '🍈', note: 'ドリアンの最盛期で、価格が下がりやすい時期です' },
        { icon: '🛍️', note: 'GSS(グレートシンガポールセール)期間中です' },
      ],
      8:  [
        { icon: '🍈', note: 'ドリアンの最盛期終盤にあたる時期です' },
        { icon: '🛍️', note: 'GSS(グレートシンガポールセール)終盤です' },
        { icon: '😷', note: 'ヘイズ(近隣国からの煙害)が出やすくなる時期です' },
      ],
      9:  [
        { icon: '😷', note: 'ヘイズが最も懸念される時期です' },
      ],
      10: [
        { icon: '🏎️', note: 'F1シンガポールGPが開催され、周辺の交通規制や混雑が増える時期です' },
        { icon: '😷', note: 'ヘイズの可能性がまだ残る時期です' },
      ],
      11: [
        { icon: '🍈', note: 'ドリアンの副シーズンでもあります' },
        { icon: '☂️', note: '北東モンスーン(雨季)が始まり雨が増える時期です' },
      ],
      12: [{ icon: '☂️', note: '北東モンスーン(雨季)が本格化し、大雨のピークを迎えます' }],
    };
    // フィルターチップの表示文言をCALENDAR_CATEGORY_LABELSと連動させる（index.html側に別途ハードコードしない。
    // カテゴリ名を変更する際はCALENDAR_CATEGORY_LABELSを直すだけでバッジ・チップ両方に反映される）
    document.querySelectorAll('#calendar-filter-row .filter-chip').forEach(chip => {
      const cat = chip.dataset.calCat || '';
      chip.textContent = cat ? (CALENDAR_CATEGORY_LABELS[cat] || cat) : 'すべて';
    });
    let CALENDAR_DATA = [];
    let _calendarLoadedYear = null;
    const _calendarYear = new Date().getFullYear();
    let _calendarCategory = '';

    const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
    // 日付の列に出す「日」と「曜日」。月は月カードの見出しに出ているため省く
    function _calendarDayParts(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return { day: d.getDate(), weekday: WEEKDAY_JA[d.getDay()] };
    }
    // 期間の文字(例: 「10/7(水)〜10/8(木)」)。年は書かない。期間がなければ空文字
    function _calendarRangeText(it) {
      if (!it.endDate || it.endDate === it.date) return '';
      const fmt = dateStr => {
        const d = new Date(dateStr + 'T00:00:00');
        return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_JA[d.getDay()]})`;
      };
      return `${fmt(it.date)}〜${fmt(it.endDate)}`;
    }

    async function loadCalendarScreen(scrollToCurrent) {
      const key = `${getCity()}_${_calendarYear}`;
      if (_calendarLoadedYear !== key) {
        try {
          const res = await fetch(`${API_BASE}/api/calendar?city=${getCity()}&year=${_calendarYear}`);
          CALENDAR_DATA = await res.json();
          _calendarLoadedYear = key;
        } catch (e) { CALENDAR_DATA = []; }
      }
      renderCalendarList();
      if (scrollToCurrent) _scrollCalendarToCurrentMonth();
    }

    // ボトムナビからカレンダーを開いた時、今月の月カードが見えるところまでスクロールする
    // （表示中の年が実際の今年と違う場合や、今月に予定が無い場合は先頭のまま）
    function _scrollCalendarToCurrentMonth() {
      const scrollEl = document.getElementById('calendar-scroll-content');
      if (!scrollEl) return;

      // 今月合わせは「すべて」表示の時だけ行う。カテゴリを絞った表示は該当月が
      // 疎らで年末近くにしか無いことも多く、無理に今月へ合わせず素直に先頭(1月)へ戻す
      if (_calendarCategory !== '') {
        scrollEl.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }

      // カテゴリ切替直前までスクロール中だった場合、iOSの慣性スクロールが残っていて
      // この後のscrollTo()による位置指定を後から上書きしてしまい、意図せず一番下まで
      // スクロールしてしまうことがある。一瞬overflowを止めて慣性を強制キャンセルしてから
      // 位置を計算・適用する（2026-09-07 カテゴリ切替時のスクロール暴走で発覚）
      scrollEl.style.overflowY = 'hidden';
      void scrollEl.offsetHeight;
      scrollEl.style.overflowY = '';

      const nowMonthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      if (nowMonthKey.slice(0, 4) !== String(_calendarYear)) {
        scrollEl.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
      // スクロール先の基準は月ラベル(.cal-month-head-outer)。カード自体を基準にすると、
      // ラベルがカードの外(上)にあるため、ラベルが画面上端より上に隠れてしまう（2026-09-10修正）
      const cards = [...document.querySelectorAll('.cal-month-head-outer[data-month]')];
      const target = cards.find(c => c.dataset.month === nowMonthKey) || cards.find(c => c.dataset.month > nowMonthKey);
      if (!target) { scrollEl.scrollTo({ top: 0, behavior: 'instant' }); return; }
      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      // 季節アイコンの丸ボタンの影が画面上端でちょうど切れてしまうのを防ぐため、
      // 月ラベルのすぐ上に少しだけ余白(SCROLL_TOP_BUFFER)を残してスクロールする（2026-09-10）
      const SCROLL_TOP_BUFFER = 10;
      const rawTop = targetRect.top - scrollRect.top + scrollEl.scrollTop - SCROLL_TOP_BUFFER;
      scrollEl.scrollTo({ top: Math.min(Math.max(rawTop, 0), maxScrollTop), behavior: 'instant' });
    }

    function setCalendarCategory(cat) {
      _calendarCategory = cat;
      document.querySelectorAll('#calendar-filter-row .filter-chip').forEach(chip => {
        chip.classList.toggle('active', (chip.dataset.calCat || '') === cat);
      });
      renderCalendarList();
      _scrollCalendarToCurrentMonth();
    }

    // 月見出しの季節アイコンの吹き出しを閉じる共通処理
    // （航空券シーズン表は設計書222再設計3回目でフロート吹き出し方式を廃止、アコーディオンのため対象外）
    function _closeAllCalBubbles() {
      document.querySelectorAll('.cal-month-season-bubble.visible').forEach(b => b.classList.remove('visible'));
    }
    // 月見出しの季節アイコン（気候・食べ物・GSS）タップで説明の吹き出しを表示（設計書194、
    // 2026-09-10に月見出し行へアイコンを統合する形へレイアウト変更）。
    // 月見出し行（.cal-month-head-outer）直下の吹き出し要素1つを使い回し、タップされたアイコンのnoteに差し替える方式。
    // 複数アイコンがある月では、タップしたアイコンの実際の位置に吹き出し（と矢印）を追従させる
    // （固定位置だと「別のアイコンを指しているように見える」ズレが生じるため）。
    function toggleMonthSeasonNote(btn) {
      const headRow = btn.closest('.cal-month-head-outer');
      const bubble = headRow?.querySelector('.cal-month-season-bubble');
      if (!bubble) return;
      const note = btn.dataset.note || '';
      const isSameAndVisible = bubble.classList.contains('visible') && bubble.dataset.activeNote === note;
      _closeAllCalBubbles();
      if (isSameAndVisible) return;
      bubble.textContent = note;
      bubble.dataset.activeNote = note;
      bubble.classList.add('visible');
      _positionCalBubbleUnderBtn(headRow, btn, bubble);
    }
    // 月見出し行内のボタン(季節アイコン)の直下に吹き出しの位置・矢印を合わせる処理
    function _positionCalBubbleUnderBtn(headRow, btn, bubble) {
      const rowRect = headRow.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const btnCenter = btnRect.left - rowRect.left + btnRect.width / 2;
      let left = btnCenter - 19; // 矢印(中心から-5px位置)がボタン中央に来るような基準オフセット
      const maxLeft = headRow.clientWidth - bubble.offsetWidth - 8;
      left = Math.max(8, Math.min(left, maxLeft));
      bubble.style.left = left + 'px';
      bubble.style.setProperty('--arrow-left', Math.max(10, Math.min(btnCenter - left - 5, bubble.offsetWidth - 20)) + 'px');
    }
    // 吹き出し表示中に他の場所をタップしたら閉じる
    document.addEventListener('touchend', e => {
      if (e.target.closest('.cal-season-icon-btn') || e.target.closest('.cal-month-season-bubble')) return;
      _closeAllCalBubbles();
    }, { passive: true });

    function renderCalendarList() {
      // 「すべて」表示時は日本の祝日・学校行事を含めない（カテゴリで明示的に選んだ時だけ表示する）
      const CALENDAR_HIDDEN_IN_ALL = ['holiday-jp'];
      const items = _calendarCategory
        ? CALENDAR_DATA.filter(it => it.category === _calendarCategory)
        : CALENDAR_DATA.filter(it => !CALENDAR_HIDDEN_IN_ALL.includes(it.category));
      const listEl = document.getElementById('calendar-list');
      const emptyEl = document.getElementById('calendar-empty-state');
      const scrollEl = document.getElementById('calendar-scroll-content');
      if (listEl) listEl.style.paddingBottom = '';
      if (items.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'flex';
        return;
      }
      emptyEl.style.display = 'none';

      const sorted = [...items].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      const byDate = new Map();
      sorted.forEach(it => {
        if (!byDate.has(it.date)) byDate.set(it.date, []);
        byDate.get(it.date).push(it);
      });

      let html = '';
      let currentMonth = null;
      for (const [date, dayItems] of byDate) {
        const month = date.slice(0, 7); // 'YYYY-MM'
        if (month !== currentMonth) {
          if (currentMonth !== null) {
            html += `</div>`; // 前の月カードを閉じる
          }
          currentMonth = month;
          const monthNum = Number(month.slice(5));
          const seasonTags = MONTH_SEASONAL_TAGS[monthNum] || [];
          const seasonBadgeHtml = `<span class="cal-month-season-badge">` +
            seasonTags.map(tag =>
              `<button class="cal-season-icon-btn" data-note="${escapeHtml(tag.note)}" aria-label="季節の話題を見る" onclick="if(!_touchCapableDetected) toggleMonthSeasonNote(this)">${tag.icon}</button>`
            ).join('') +
            _fareGoHtml(monthNum) +
            `</span>`;
          html += `<div class="cal-month-head-outer" data-month="${month}">
            <span class="cal-month-head-label">${monthNum}月</span>
            ${seasonBadgeHtml}
            <div class="cal-month-season-bubble"></div>
          </div>
          <div class="cal-month-card" data-month="${month}">`;
        }
        const dayParts = _calendarDayParts(date);
        const isHolidayDay = dayItems.some(it => it.category === 'holiday-sg');
        html += `<div class="cal-day-group${isHolidayDay ? ' cal-day-holiday' : ''}">
          <div class="cal-day-date"><span class="cal-day-num">${dayParts.day}</span><span class="cal-day-wd">${dayParts.weekday}</span></div>
          <div class="cal-day-events">`;
        dayItems.forEach(it => {
          const c = CALENDAR_CATEGORY_COLORS[it.category] || CALENDAR_CATEGORY_COLORS['festival'];
          const label = CALENDAR_CATEGORY_LABELS[it.category] || '';
          const range = _calendarRangeText(it);
          // 日本の祝日はnoteを出さない（馴染みがあるため）。説明(期間・note)は常にDOMに置き、
          // 画面ヘッダーのスイッチ(#calendar-list.cal-notes-on)でCSSの表示を切り替える。1行目は期間、noteがあれば続ける
          const noteText = (it.note && it.category !== 'holiday-jp') ? it.note : '';
          const noteHtml = (noteText || range)
            ? `<div class="cal-item-note">${range ? `<span class="cal-item-note-range">${range}</span>` : ''}${noteText ? _noBreakJa(noteText) : ''}</div>`
            : '';
          // 祝日(SG)は塗りつぶしのラベル、それ以外は塗りなしの小さな文字。右端に置く
          const labelHtml = CALENDAR_FILLED_LABEL_CATEGORIES.includes(it.category)
            ? `<span class="cal-badge" style="background:${c.bg};color:${c.color};">${label}</span>`
            : `<span class="cal-tag">${label}</span>`;
          html += `<div class="cal-item">
            <div class="cal-item-head">
              <span class="cal-name-wrap">
                <span class="cal-name">${it.name}</span>
              </span>
              ${labelHtml}
            </div>
            ${noteHtml}
          </div>`;
        });
        html += `</div></div>`;
      }
      if (currentMonth !== null) {
        html += `</div>`; // 最後の月カードを閉じる
      }
      listEl.innerHTML = html;

      // 「すべて」表示は今月合わせスクロールの対象のため、12月が年内最後のカードでも
      // きっちり画面最上部に寄せられるよう、最後のカード自身の高さを差し引いた分だけ
      // 末尾に余白を確保する（固定値だと画面サイズやカードの中身の量で過不足が出るため、
      // 実測して必要な分だけ確保する。2026-09-07）
      _updateCalendarEndPadding();
    }

    // 「すべて」表示時の末尾余白を実測して付与する(今月合わせスクロールで12月まで先頭に寄せられるように)
    function _updateCalendarEndPadding() {
      const listEl = document.getElementById('calendar-list');
      const scrollEl = document.getElementById('calendar-scroll-content');
      if (!listEl || !scrollEl || _calendarCategory !== '') return;
      const cards = listEl.querySelectorAll('.cal-month-card');
      const lastCard = cards[cards.length - 1];
      const need = lastCard ? Math.max(0, scrollEl.clientHeight - lastCard.getBoundingClientRect().height) : 0;
      listEl.style.paddingBottom = `${need}px`;
    }

    // 画面ヘッダーの「説明」スイッチ: 全ての月の予定の説明(期間・note)をまとめて開閉する。状態はlocalStorage(sg_cal_notes)
    let _calNotesOn = false;
    try { _calNotesOn = localStorage.getItem('sg_cal_notes') === '1'; } catch (_) {}
    function _applyCalNotesState() {
      document.getElementById('calendar-list')?.classList.toggle('cal-notes-on', _calNotesOn);
      document.getElementById('cal-notes-switch')?.setAttribute('aria-checked', _calNotesOn ? 'true' : 'false');
    }
    function toggleCalNotes() {
      const scrollEl = document.getElementById('calendar-scroll-content');
      // 切替前後で、画面上端に見えている最初の予定の位置が動かないようにスクロールを補正する
      const anchorOf = () => {
        if (!scrollEl) return null;
        const top = scrollEl.getBoundingClientRect().top;
        return [...document.querySelectorAll('#calendar-list .cal-item')].find(el => el.getBoundingClientRect().bottom > top + 1) || null;
      };
      const anchor = anchorOf();
      const before = anchor && scrollEl ? anchor.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top : 0;
      _calNotesOn = !_calNotesOn;
      try { localStorage.setItem('sg_cal_notes', _calNotesOn ? '1' : '0'); } catch (_) {}
      _applyCalNotesState();
      if (anchor && scrollEl) {
        const after = anchor.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
        scrollEl.scrollTop += after - before;
      }
      _updateCalendarEndPadding();
    }
    _applyCalNotesState();
    // 画面ヘッダーのスイッチ 即時タップ対応(onclick属性はゴーストクリック対策のガード付き)
    document.getElementById('cal-notes-switch')?.addEventListener('touchend', e => {
      e.preventDefault();
      toggleCalNotes();
    }, { passive: false });

    // ─── 航空券シーズン表（設計書222。SG発の航空券の月別の目安。実運賃は扱わない）───
    // 月見出しの飛行機アイコンから専用画面(#fare-sheet、設計書231)を、その月をセットして開く。画面内で月を切り替えられ、
    // 都市ピル(価格レベルで色分け)をタップするとその月の詳細を1つ表示する。選択中の都市は月を替えても保持する。
    const FARE_SEASONS_CACHE_KEY = 'sg_fare_seasons_cache';
    let FARE_SEASONS_DATA = null;      // /api/fare-seasons の応答をそのまま保持

    // 国名(日本語)→国旗絵文字。city.country に対応。
    const FARE_COUNTRY_FLAG = {
      '日本': '🇯🇵',
      'タイ': '🇹🇭',
      'ベトナム': '🇻🇳',
      'インドネシア': '🇮🇩',
      'マレーシア': '🇲🇾',
      'フィリピン': '🇵🇭',
      'モルディブ': '🇲🇻',
      'オーストラリア': '🇦🇺',
      '台湾': '🇹🇼',
      'アラブ首長国連邦': '🇦🇪'
    };
    function _fareCountryFlag(country) {
      return FARE_COUNTRY_FLAG[country] || '';
    }

    // 価格レベル(1〜5)をピル・色帯の3段階に分類する。1〜2→cheap、3→normal、4〜5→expensive(天候補正は入れない)。
    function _fareLevelTier(level) {
      if (level <= 2) return 'cheap';
      if (level === 3) return 'normal';
      return 'expensive';
    }

    // その月が「要確認」(priceBasis==='check')なら、価格レベルに関わらず 'unknown'(グレー)。それ以外は価格レベルの3段階
    function _fareMonthTier(city, idx) {
      const m = Array.isArray(city.monthly) ? city.monthly[idx] : null;
      if (m && m.priceBasis === 'check') return 'unknown';
      return _fareLevelTier(city.levels[idx]);
    }

    async function loadFareSeasonsData() {
      try {
        const res = await fetch(`${API_BASE}/api/fare-seasons?city=${getCity()}&v=11`);
        if (!res.ok) throw new Error('fare-seasons fetch failed');
        FARE_SEASONS_DATA = await res.json();
        try { localStorage.setItem(FARE_SEASONS_CACHE_KEY, JSON.stringify(FARE_SEASONS_DATA)); } catch (_) {}
      } catch (e) {
        // 通信失敗時は前回成功時のキャッシュがあればそれを使う（設計書222）
        if (!FARE_SEASONS_DATA) {
          try {
            const cached = localStorage.getItem(FARE_SEASONS_CACHE_KEY);
            if (cached) FARE_SEASONS_DATA = JSON.parse(cached);
          } catch (_) {}
        }
      }
    }

    // 飛行機アイコンのボタン(月見出し右側)。タップで専用画面をその月で開く
    function _fareGoHtml(monthNum) {
      return `<button class="cal-fare-go" data-tour="cal-fare-entry" data-month="${monthNum}" aria-label="${monthNum}月の旅行シーズン情報" onclick="if(!_touchCapableDetected) openFareSheet(${monthNum})">✈️</button>`;
    }

    let _fareSheetMonth = 1;
    const _FARE_SHEET_DEFAULT_CITY = 'tokyo';   // 開いた直後に選んでおく都市(2026-10-17ユーザー指定。何を見る画面か分かりやすいため)
    let _fareSheetCity = _FARE_SHEET_DEFAULT_CITY;   // 選択中の都市ID。月を替えても保持し、開くたびに東京から始める
    function _isFareSheetOpen() {
      return !!document.getElementById('fare-sheet-overlay')?.classList.contains('visible');
    }
    function _setFareSheetBody(html) {
      const body = document.getElementById('fare-sheet-body');
      if (body) body.innerHTML = html;
    }

    function openFareSheet(month) {
      if (_isFareSheetOpen()) return;
      _fareSheetMonth = month;
      _fareSheetCity = _FARE_SHEET_DEFAULT_CITY;
      const scrollEl = document.getElementById('fare-sheet-scroll');
      if (scrollEl) scrollEl.scrollTop = 0;
      document.getElementById('fare-sheet-overlay')?.classList.add('visible');
      lockScroll();
      if (FARE_SEASONS_DATA) { renderFareSheet(); _maybeStartFareSheetTour(); return; }
      _setFareSheetBody(`<div class="cal-fare-state">${escapeHtml(t('fareSheetLoading'))}</div>`);
      (async () => {
        await loadFareSeasonsData();
        if (_isFareSheetOpen()) { renderFareSheet(); _maybeStartFareSheetTour(); }
      })();
    }
    // 旅行シーズン画面を初めて開いた時だけ、スポットライトで使い方を案内する(2026-10-18ユーザー指定。端末ごとに1回、app_tour_done_fare-sheet-1)
    const _FARE_SHEET_TOUR_ID = 'fare-sheet-1';
    function _maybeStartFareSheetTour() {
      if (_tutorialRun || _tourDone(_FARE_SHEET_TOUR_ID) || _tourState || _whatsNewPending || !_isFareSheetOpen()) return;   // 設定のチュートリアルの見直し中は始めない(見直し側が開始する)
      // 画面が下からせり上がる動き(0.25秒)が終わってから始める。途中で測ると、スポットライトの位置がずれる(2026-10-18に実機で発生)
      setTimeout(() => {
        if (_tourState || !_isFareSheetOpen()) return;
        startTour({ id: _FARE_SHEET_TOUR_ID, persist: true, steps: _fareSheetTourSteps() });
      }, 400);
    }
    // 旅行シーズン画面の案内のステップ(自動表示と、設定のチュートリアルの見直しで共通)
    function _fareSheetTourSteps() {
      return [
        { anchor: 'fare-month-step', text: t('tourFareStep1') },
        { anchor: 'fare-pills', text: t('tourFareStep2') },
        { anchor: 'fare-detail', text: t('tourFareStep3') },
      ];
    }
    function closeFareSheet() {
      if (!_isFareSheetOpen()) return;
      document.getElementById('fare-sheet-overlay')?.classList.remove('visible');
      unlockScroll();
    }

    // 専用画面の本文: 「‹ 11月 ›」の月の切り替え → 凡例 → 都市ピル → 詳細(都市選択時)/ヒント → 注記。
    // 並び順: 国名(日本語ロケール)順+同国内は元データの順の固定(2026-10-17)。ピルの色は価格レベル(要確認はグレー)で付ける。
    function renderFareSheet() {
      if (!FARE_SEASONS_DATA) {
        _setFareSheetBody(`<div class="cal-fare-state">${escapeHtml(t('fareSheetFailed'))}</div>`);
        return;
      }
      const scrollEl = document.getElementById('fare-sheet-scroll');
      const prevScroll = scrollEl ? scrollEl.scrollTop : 0;
      const { cities } = FARE_SEASONS_DATA;
      const month = _fareSheetMonth;
      const idx = month - 1;

      // 並びは固定(下のFARE_PILL_COUNTRY_ORDER)。色では並べず、月を替えてもピルが動かない
      // 都市ピルは、国の固定順で並べ、画面幅に合わせて自然に折り返す(2026-10-18ユーザー指定: 同じ国をなるべく隣にして、行数を減らす)。
      // 430pt幅(iPhone Pro Max系)で6行になる並び(日本・台湾・オーストラリア / インドネシア / タイ / マレーシア / セブ+ベトナム / ベトナム+モルディブ+ドバイ)。
      // 同国内は元データ(cities配列)の順。リストに無い国は末尾(日本語ロケール順)。都市や国を足したら、このリストに国を足す
      const FARE_PILL_COUNTRY_ORDER = ['日本', '台湾', 'オーストラリア', 'インドネシア', 'タイ', 'マレーシア', 'フィリピン', 'ベトナム', 'モルディブ', 'アラブ首長国連邦'];
      const countryRank = country => { const k = FARE_PILL_COUNTRY_ORDER.indexOf(country); return k < 0 ? FARE_PILL_COUNTRY_ORDER.length : k; };
      const orderedCities = cities
        .map((city, i) => ({ city, i }))
        .sort((x, y) => countryRank(x.city.country) - countryRank(y.city.country) || x.city.country.localeCompare(y.city.country, 'ja') || x.i - y.i)
        .map(x => x.city);

      const pillHtml = city => {
        const tier = _fareMonthTier(city, idx);
        const flag = _fareCountryFlag(city.country);
        return `<button class="cal-fare-pill cal-fare-pill-${tier}${city.id === _fareSheetCity ? ' cal-fare-pill-active' : ''}" data-fare-city="${escapeHtml(city.id)}" onclick="selectFareSheetCity(this)">${flag ? flag + ' ' : ''}${escapeHtml(city.name)}</button>`;
      };
      const pillsHtml = `<div class="cal-fare-pill-row">${orderedCities.map(pillHtml).join('')}</div>`;

      const hasUnknown = cities.some(city => _fareMonthTier(city, idx) === 'unknown');
      const selected = cities.find(c => c.id === _fareSheetCity);
      const selectedHasUnknown = !!selected && selected.levels.some((_, i) => _fareMonthTier(selected, i) === 'unknown');
      const detailHtml = selected ? `<div class="cal-fare-detail" data-tour="fare-detail">${_fareDetailHtml(selected, month)}</div>` : '';

      _setFareSheetBody(`
        <div class="fare-mon-step" data-tour="fare-month-step">
          <button class="fare-mon-step-btn" aria-label="${escapeHtml(t('fareSheetPrevMonth'))}" onclick="stepFareSheetMonth(-1)">‹</button>
          <span class="fare-mon-step-label">${month}月</span>
          <button class="fare-mon-step-btn" aria-label="${escapeHtml(t('fareSheetNextMonth'))}" onclick="stepFareSheetMonth(1)">›</button>
        </div>
        <div class="cal-fare-legend"><b>${escapeHtml(t('fareLegendMonth'))}</b><span><i class="cal-fare-lg-bar cal-fare-lg-bar-cheap"></i>安め</span><span><i class="cal-fare-lg-bar cal-fare-lg-bar-normal"></i>普通</span><span><i class="cal-fare-lg-bar cal-fare-lg-bar-expensive"></i>高め</span>${(hasUnknown || selectedHasUnknown) ? '<span><i class="cal-fare-lg-bar cal-fare-lg-bar-unknown"></i>要確認</span>' : ''}</div>
        <div class="cal-fare-pills" data-tour="fare-pills">${pillsHtml}</div>
        ${detailHtml}
        <div class="cal-fare-footnote">※表示は目安です。実際の価格は予約前にご確認ください。</div>
      `);
      if (scrollEl) scrollEl.scrollTop = prevScroll;
    }

    // 月の切り替え(前後ボタン・12か月の色帯のタップ)。選択中の都市はそのまま、新しい月の内容に差し替わる
    function setFareSheetMonth(month) {
      if (!(month >= 1 && month <= 12)) return;
      _fareSheetMonth = month;
      renderFareSheet();
    }
    // 前後ボタン(12月の次は1月、1月の前は12月に戻る)
    function stepFareSheetMonth(delta) {
      setFareSheetMonth(((_fareSheetMonth - 1 + delta + 12) % 12) + 1);
    }
    // 都市ピルのタップ。別のピルなら差し替える。選択中のピルの再タップは何もしない(2026-10-18ユーザー指定)
    function selectFareSheetCity(pillEl) {
      const id = pillEl?.dataset?.fareCity;
      if (!id) return;
      if (_fareSheetCity === id) return;   // 選択中の都市の再タップでは、何も変えない(詳細は消さない)
      _fareSheetCity = id;
      renderFareSheet();
    }

    // 詳細表示: 12か月分の色帯(当月を枠線で強調) + 5行(所要・価格・天候・現地・SG側)。
    // 価格は色と同じ基準(価格レベルのみ)の凡例語。天候・現地は content/fare-seasons.json の monthly(一般的な傾向)。
    // SG側はローカル校(MOE)の休暇と重なる月かどうかのみ(日本人学校の休暇は航空券への影響が薄いため出さない)。
    function _fareDetailHtml(city, month) {
      const { legend, bookingLeadTime, schoolHolidays } = FARE_SEASONS_DATA;
      const idx = month - 1;

      // 各月の列=上に月の数字+下に色のセグメント。列のタップでその月に切り替える(専用画面内)
      const flag = _fareCountryFlag(city.country);
      const stripHtml = city.levels.map((lv, i) => {
        const tier = _fareMonthTier(city, i);
        const cur = i === idx;
        return `<button type="button" class="cal-fare-month-col${cur ? ' cal-fare-month-col-current' : ''}" aria-label="${i + 1}月" onclick="setFareSheetMonth(${i + 1})"><span class="cal-fare-month-num">${i + 1}</span><span class="cal-fare-month-seg cal-fare-month-seg-${tier}${cur ? ' cal-fare-month-seg-current' : ''}"></span></button>`;
      }).join('');

      const lv = city.levels[idx];
      const leadTime = (bookingLeadTime[city.haul] || {})[String(lv)];
      const monthly = Array.isArray(city.monthly) ? city.monthly[idx] : null;
      const reason = monthly && typeof monthly.priceReason === 'string' ? monthly.priceReason : '';
      const isUnknown = _fareMonthTier(city, idx) === 'unknown';
      // 推定の月(priceBasis==='demand')は色を付けず(levelsは3)、estLevelの見立てを「推察」コメントで示す
      const estLevel = monthly && monthly.priceBasis === 'demand' ? monthly.estLevel : null;
      const estWord = { 1: 'かなり安め', 2: '安め', 4: '高め', 5: 'かなり高め' }[estLevel];
      // 予約の目安は改行せず、同じ文の続きに出す(2026-10-18ユーザー指定。理由がある月は「。予約は〇が目安」、無い月は「（予約は〇が目安）」)
      const leadText = leadTime ? (reason ? `。予約は${leadTime}が目安` : `（予約は${leadTime}が目安）`) : '';
      let priceHtml;
      if (isUnknown) {
        priceHtml = escapeHtml('要確認（運賃の出典と食い違う可能性）');
      } else if (estWord) {
        priceHtml = _noBreakJa(`${estWord}の可能性${reason ? `（${reason}）` : ''}${leadText}`);
      } else {
        priceHtml = _noBreakJa(`${(legend && legend[String(lv)]) || ''}${reason ? `（${reason}）` : ''}${leadText}`);
      }
      const moeHit = ((schoolHolidays && schoolHolidays.moe) || []).includes(month);
      const sgText = moeHit ? 'ローカル校の休暇と重なり、家族旅行で混みやすい' : '休暇なし';

      const row = (label, value, isHtml) =>
        `<div class="cal-fare-row"><span class="cal-fare-row-k">${label}</span><span class="cal-fare-row-v">${isHtml ? value : _noBreakJa(value)}</span></div>`;

      return `
        <div class="cal-fare-city"><b>${flag ? flag + ' ' : ''}${escapeHtml(city.name)}</b><span>${escapeHtml(t('fareLegendYear'))}</span></div>
        <div class="cal-fare-month-strip">${stripHtml}</div>
        ${row('所要', city.flightHours || '')}
        ${row('価格', priceHtml, true)}
        ${monthly && monthly.weather ? row('天候', monthly.weather) : ''}
        ${monthly && monthly.local ? row('現地', monthly.local) : ''}
        ${row('SG側', sgText)}
      `;
    }

    // ユーティリティ（getUserId()はコース機能専用のため設計書178フェーズ1で削除済み）
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
        const ovX = style.overflow + style.overflowX;
        if ((ovX.includes('auto') || ovX.includes('scroll')) && el.scrollWidth > el.clientWidth) {
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

    // ─── 新機能の紹介(What's New、設計書227) ───
    // 更新後の初回起動で1回だけ出す1枚ページ。内容は content/whats-new.json (GET /api/whats-new?version=)。
    // 紹介を用意した版だけ出し、新規インストールには出さない。Webは ?whatsnew=<版> を付けた時だけ確認用に表示する。

    // 何をするかを決めるだけの純関数(localStorageにもDOMにも触らない)
    //   { action: 'none' }  何もしない
    //   { action: 'markSeen', version }  紹介は出さず、見た版として記録する(新規インストール)
    //   { action: 'fetch', version, persist }  その版の内容を取りに行く。persist=true なら、見終わった時に記録する
    function _decideWhatsNew({ isFresh, seen, current, previewVersion, isNative }) {
      const semver = /^\d+\.\d+\.\d+$/;
      if (!isNative) {
        return semver.test(previewVersion || '') ? { action: 'fetch', version: previewVersion, persist: false } : { action: 'none' };
      }
      if (!semver.test(current || '')) return { action: 'none' };
      if (isFresh) return { action: 'markSeen', version: current };
      if (seen === current) return { action: 'none' };
      return { action: 'fetch', version: current, persist: true };
    }

    async function initWhatsNew() {
      // 実機で「紹介が出ない」原因を特定するための記録(logs/debug-nav.logに wn_* として残る)
      const wnLog = (e, d) => _sendDebugLog('wn_' + e, d || {});
      try {
        const previewVersion = new URLSearchParams(location.search).get('whatsnew') || '';
        let current = '';
        let hasPlugin = false;
        if (_isCapacitorApp) {
          const appPlugin = window.Capacitor?.Plugins?.App;
          hasPlugin = !!appPlugin;
          if (appPlugin) current = (await appPlugin.getInfo()).version || '';
        }
        const seenNow = localStorage.getItem(_WHATSNEW_SEEN_KEY);
        const decision = _decideWhatsNew({
          isFresh: _isFreshInstall,
          seen: seenNow,
          current, previewVersion, isNative: _isCapacitorApp,
        });
        wnLog('decide', { action: decision.action, current, seen: seenNow, isFresh: _isFreshInstall, hasPlugin });
        if (decision.action === 'markSeen') {
          localStorage.setItem(_WHATSNEW_SEEN_KEY, decision.version);
          return;
        }
        if (decision.action !== 'fetch') return;
        // 確認用(persist=false)は、1日キャッシュの古い内容が出ないよう、毎回サーバーに確認する
        const res = await fetch(
          `${API_BASE}/api/whats-new?version=${encodeURIComponent(decision.version)}`,
          decision.persist ? undefined : { cache: 'no-cache' }
        );
        if (!res.ok) { wnLog('fetch_failed', { status: res.status }); return; }
        const data = await res.json();
        wnLog('fetched', { hasEntry: !!(data && data.entry), version: decision.version });
        if (data && data.entry) {
          openWhatsNew(data.entry, decision);
        } else if (decision.persist) {
          localStorage.setItem(_WHATSNEW_SEEN_KEY, decision.version); // 紹介の無い版は、毎回取りに行かない
        }
      } catch (e) { wnLog('error', { message: String(e && e.message || e) }); /* 通信に失敗した時は何も保存しない(次回の起動で再試行) */ }
    }

    function openWhatsNew(entry, decision) {
      const overlay = document.getElementById('whatsnew-overlay');
      const modal = document.getElementById('whatsnew-modal');
      const body = document.getElementById('whatsnew-body');
      if (!overlay || !modal || !body || _whatsNewPending) return;
      const image = entry.image
        ? `<img class="whatsnew-img" src="${API_BASE}/whats-new-images/${encodeURIComponent(entry.image)}" alt="" onerror="this.remove()">`
        : '';
      const items = (entry.items || []).map(it => `
        <div class="whatsnew-item">
          <div class="whatsnew-item-icon">${escapeHtml(it.icon || '')}</div>
          <div>
            <div class="whatsnew-item-title">${escapeHtml(it.title || '')}</div>
            <div class="whatsnew-item-body">${escapeHtml(it.body || '')}</div>
          </div>
        </div>`).join('');
      body.innerHTML = `
        <span class="whatsnew-chip">v${escapeHtml(decision.version)}</span>
        <div class="whatsnew-title" id="whatsnew-title">${escapeHtml(entry.title || '')}</div>
        <div class="whatsnew-sub">${escapeHtml(entry.subtitle || '')}</div>
        <div class="whatsnew-items">${items}</div>
        ${image}`;
      body.scrollTop = 0;
      // CTA(「使ってみる」)がある版は、主ボタン=CTA・従ボタン=「あとで」。無い版・不正なCTAは従来どおり「はじめる」1つ
      const cta = _whatsNewCta(entry);
      const startBtn = document.getElementById('whatsnew-start-btn');
      const laterBtn = document.getElementById('whatsnew-later-btn');
      if (startBtn) startBtn.textContent = cta ? cta.label : 'はじめる';
      if (laterBtn) laterBtn.hidden = !cta;
      _sendDebugLog('wn_opened', { version: decision.version });
      _whatsNewPending = { version: decision.version, persist: decision.persist, cta };
      lockScroll();
      overlay.classList.add('visible');
      modal.classList.add('visible');
    }

    // サーバーのentry・保存した保留のツアーのステップを検証する。anchor・textは必須(textは120字まで)。
    // beforeは、アプリ側の許可リスト(_TOUR_BEFORE)にある名前だけ通す(未知・文字列以外は捨てる。そのステップ自体は残る)
    function _tourSanitizeSteps(arr) {
      return arr.filter(st => st && typeof st.anchor === 'string' && typeof st.text === 'string' && st.text.trim())
        .slice(0, 6)
        .map(st => {
          const o = { anchor: st.anchor, text: st.text.trim().slice(0, 120) };
          if (typeof st.before === 'string' && Object.prototype.hasOwnProperty.call(_TOUR_BEFORE, st.before)) o.before = st.before;
          return o;
        });
    }

    // 紹介のCTA(設計書232)。screenは許可リストのみ。ツアーは、steps(anchor+text)が1つ以上ある時だけ有効
    const _WHATSNEW_SCREENS = ['calendar', 'news', 'home', 'settings'];
    function _whatsNewCta(entry) {
      const c = entry && entry.cta;
      if (!c || typeof c !== 'object' || !_WHATSNEW_SCREENS.includes(c.screen)) return null;
      const label = (typeof c.label === 'string' && c.label.trim()) ? c.label.trim().slice(0, 12) : '使ってみる';
      const tourId = (typeof c.tour === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(c.tour)) ? c.tour : '';
      const tours = entry.tours && typeof entry.tours === 'object' ? entry.tours : null;
      const tour = tourId && tours && Object.prototype.hasOwnProperty.call(tours, tourId) ? tours[tourId] : null;
      const steps = tour && Array.isArray(tour.steps) ? _tourSanitizeSteps(tour.steps) : [];
      return { label, screen: c.screen, tourId: steps.length ? tourId : '', steps };
    }

    // 「あとで」。カードは閉じるだけだが、ツアーが未実施なら「保留」を保存し、次にその画面(カレンダー)を開いた時に出す。
    // 保留は自己完結のJSON(次回にentryを取り直さずに済ませるため)。Webの確認(persist=false)では保存しない
    const _TOUR_PENDING_KEY = 'app_tour_pending';
    function whatsNewLater() {
      const pending = _whatsNewPending;
      const cta = pending && pending.cta;
      const persist = !!(pending && pending.persist);
      closeWhatsNew();
      if (!persist || !cta || !cta.tourId || _tourDone(cta.tourId)) return;
      try {
        localStorage.setItem(_TOUR_PENDING_KEY, JSON.stringify({ id: cta.tourId, screen: cta.screen, steps: cta.steps }));
      } catch (_) {}
    }
    function _tourPendingClear() {
      try { localStorage.removeItem(_TOUR_PENDING_KEY); } catch (_) {}
    }
    // 保存された保留を読む。壊れている・不正なものは削除してnullを返す
    function _tourPendingRead() {
      let raw = null;
      try { raw = localStorage.getItem(_TOUR_PENDING_KEY); } catch (_) { return null; }
      if (!raw) return null;
      try {
        const p = JSON.parse(raw);
        const okId = p && typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id);
        const okScreen = p && _WHATSNEW_SCREENS.includes(p.screen);
        const steps = p && Array.isArray(p.steps) ? _tourSanitizeSteps(p.steps) : [];
        if (okId && okScreen && steps.length) return { id: p.id, screen: p.screen, steps };
      } catch (_) {}
      _tourPendingClear();
      return null;
    }
    // 「あとで」を押した人が、その画面を初めて開いた時にツアーを出す。switchNav()の末尾から呼ぶ。
    // 紹介カード・別のツアーの表示中は始めない。見終わっていれば保留を捨てる
    function _maybeStartPendingTour(screen) {
      if (_tourState || _whatsNewPending || _tutorialRun) return;   // 設定のチュートリアルの見直し中は始めない
      const p = _tourPendingRead();
      if (!p || p.screen !== screen) return;
      if (_tourDone(p.id)) { _tourPendingClear(); return; }
      // 画面の描画が落ち着いてから開始する。待っている間に別の画面へ移っていたら始めない
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
        if (!document.getElementById('nav-' + screen)?.classList.contains('active')) return;
        startTour({ id: p.id, steps: p.steps, persist: true });
      }, 350)));
    }

    // 主ボタン。CTAがあれば、カードを閉じてその画面へ移動し、(初回だけ)ツアーを始める
    function whatsNewPrimary() {
      const pending = _whatsNewPending;
      const cta = pending && pending.cta;
      const persist = !!(pending && pending.persist);
      closeWhatsNew();
      if (!cta) return;
      if (persist) _tourPendingClear();   // 「使ってみる」で始めるので、保留は不要
      switchNav(cta.screen);
      if (!cta.tourId) return;
      if (persist && _tourDone(cta.tourId)) return;   // 見終わっていれば画面移動だけ
      // 画面の描画が落ち着いてから開始する(カレンダーの今月へのスクロール等が終わるのを待つ)
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
        startTour({ id: cta.tourId, steps: cta.steps, persist });
      }, 350)));
    }

    // ─── ミニチュートリアル(スポットライト、設計書232) ───
    // アンカーは、アプリ側が持つ固定の名前だけ(要素に data-tour を付ける)。未知・見つからない・非表示のステップは飛ばす
    const _TOUR_ANCHORS = ['cal-notes-switch', 'cal-fare-entry', 'fare-month-step', 'fare-pills', 'fare-detail', 'nav-bar', 'news-stats', 'news-stat-pm25', 'news-filters', 'psi-toggle', 'psi-map', 'psi-chips'];
    // PSI詳細のポップアップの中の要素(ポップアップは画面上部にあり、通常スクロール不要なので、scrollIntoViewは最小限にする)
    const _TOUR_POPOVER_ANCHORS = ['psi-toggle', 'psi-map', 'psi-chips'];
    // ステップの直前に実行する動作の許可リスト(サーバーのentryの`before`は、この名前だけ有効)。成功でtrue、失敗でfalse(そのステップ以降を打ち切る)
    const _TOUR_BEFORE = {
      // くらしの指標のウィジェットをタップした時のPSI詳細ポップアップを開く(すでに開いていれば何もしない)。中身が描画されるまで最大約3秒待つ
      'open-psi': async () => {
        const pop = document.getElementById('stat-criteria-popover');
        if (!pop) return false;
        if (!(pop.classList.contains('visible') && pop.dataset.kind === 'psi')) toggleStatCriteria('psi');
        const t0 = Date.now();
        for (;;) {
          if (pop.querySelector('.psi-map') && _tourVisible(pop.querySelector('.psi-mode'))) {
            if (_tourState) _tourState.psiOpened = true;
            return true;
          }
          if (Date.now() - t0 >= 3000) return false;
          await new Promise(r => setTimeout(r, 120));
        }
      },
    };
    function _closeStatPopover() { document.getElementById('stat-criteria-popover')?.classList.remove('visible'); }
    const _TOUR_DONE_PREFIX = 'app_tour_done_';
    let _tourState = null;   // { id, persist, steps, index, locked }

    function _tourDone(id) {
      try { return localStorage.getItem(_TOUR_DONE_PREFIX + id) === '1'; } catch (_) { return false; }
    }
    function _tourVisible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    function _tourAnchorEl(name) {
      if (!_TOUR_ANCHORS.includes(name)) return null;
      const els = Array.from(document.querySelectorAll(`[data-tour="${name}"]`));
      if (name === 'cal-fare-entry') {
        const month = String(new Date().getMonth() + 1);
        return els.find(e => e.dataset.month === month) || els[0] || null;
      }
      return els[0] || null;
    }
    // 画面の描画待ち(カレンダーの月見出しはデータ取得後に出る)。見つからなければnull
    async function _tourWaitAnchor(name, timeoutMs = 2500) {
      const t0 = Date.now();
      for (;;) {
        const el = _tourAnchorEl(name);
        if (_tourVisible(el)) return el;
        if (Date.now() - t0 >= timeoutMs) return null;
        await new Promise(r => setTimeout(r, 150));
      }
    }

    // 吹き出しの位置(純関数)。対象の上下の広い側に置き、画面からはみ出さない。左右は対象の中心に合わせて画面内に収める
    function _tourPlaceTip(rect, tipHeight, viewportH, viewportW, tipWidth) {
      const margin = 12, gap = 14;
      const width = tipWidth || Math.min(340, viewportW - margin * 2);
      const placement = (viewportH - rect.bottom) >= rect.top ? 'below' : 'above';
      let top = placement === 'below' ? rect.bottom + gap : rect.top - gap - tipHeight;
      top = Math.max(margin, Math.min(top, viewportH - tipHeight - margin));
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(margin, Math.min(left, viewportW - width - margin));
      return { top, left, width, placement };
    }

    // 対象の無い(中央に出す)ステップ用。画面の中央に置く純関数
    function _tourPlaceCenter(tipHeight, viewportH, viewportW, tipWidth) {
      const width = tipWidth || Math.min(340, viewportW - 24);
      return { top: Math.max(12, (viewportH - tipHeight) / 2), left: Math.max(12, (viewportW - width) / 2), width, placement: 'center' };
    }

    // onEnd: 終了時に呼ぶ(任意。{ shown, record })。shown=falseは、出せるステップが無くて何も出さなかった時
    async function startTour({ id, steps, persist, onEnd }) {
      if (_tourState || !id || !Array.isArray(steps)) return;
      const layer = document.getElementById('tour-layer');
      if (!layer) return;
      _tourState = { id, persist: !!persist, steps: [], index: -1, locked: false, onEnd };
      const st = _tourState;
      // 見つかるステップだけ残す(全部無ければ何も出さず、記録もしない)。anchorがnullのステップは、中央に出すカードで、常に残す
      // beforeを持つステップと、それ以降のステップは、beforeの実行(ポップアップを開く等)の後に初めて出現するため、最初の存在確認から外す
      const firstBefore = steps.findIndex(step => step.before);
      const found = await Promise.all(steps.map((step, i) =>
        (!step.anchor || (firstBefore >= 0 && i >= firstBefore)) ? Promise.resolve(true) : _tourWaitAnchor(step.anchor)));
      if (_tourState !== st) return;
      st.steps = steps.filter((_, i) => found[i]);
      if (!st.steps.some(step => step.anchor)) { st.steps = []; _tourEnd(false); return; }
      lockScroll();
      st.locked = true;
      window.addEventListener('resize', _tourReposition);
      window.addEventListener('orientationchange', _tourReposition);
      layer.classList.add('visible');
      _tourShow(0);
    }

    async function _tourShow(i) {
      const st = _tourState;
      if (!st) return;
      if (i >= st.steps.length) { _tourEnd(true); return; }
      const step = st.steps[i];
      const center = !step.anchor;
      // beforeがあれば、先に実行する(失敗したら、そのステップ以降は出さずに終了。ウィジェットの案内だけで終わる)。実行中は「次へ」を受け付けない
      if (step.before) {
        const fn = _TOUR_BEFORE[step.before];
        st.busy = true;
        let ok = false;
        try { ok = !!(fn && await fn()); } catch (_) { ok = false; }
        st.busy = false;
        if (_tourState !== st) return;
        if (!ok) { _tourEnd(true); return; }
        const first = await _tourWaitAnchor(step.anchor, 2500);
        if (_tourState !== st) return;
        if (!first) { _tourEnd(true); return; }
      }
      const el = center ? null : _tourAnchorEl(step.anchor);
      if (!center && !_tourVisible(el)) { _tourShow(i + 1); return; }   // 途中で消えたステップは飛ばす
      st.index = i;
      const inPopover = !!step.anchor && _TOUR_POPOVER_ANCHORS.includes(step.anchor);
      if (el && !step.noScroll) el.scrollIntoView({ block: inPopover ? 'nearest' : 'center', inline: 'nearest' });   // noScroll: 画面下端に固定の要素(ボトムナビ)など
      const isLast = i === st.steps.length - 1;
      document.getElementById('tour-layer')?.classList.toggle('tour-center', center);
      const titleEl = document.getElementById('tour-tip-title');
      if (titleEl) { titleEl.textContent = step.title || ''; titleEl.hidden = !step.title; }
      document.getElementById('tour-tip-count').textContent = `${i + 1} / ${st.steps.length}`;
      document.getElementById('tour-tip-text').textContent = step.text;
      document.getElementById('tour-next').textContent = step.nextLabel || (isLast ? 'わかった' : '次へ');
      document.getElementById('tour-skip').style.display = isLast ? 'none' : '';
      requestAnimationFrame(_tourReposition);
      if (inPopover) setTimeout(_tourReposition, 250);   // ポップアップの描画・スクロールが落ち着いた後に、位置を測り直す
    }

    function _tourReposition() {
      const st = _tourState;
      if (!st || st.index < 0) return;
      const hole = document.getElementById('tour-hole');
      if (!st.steps[st.index].anchor) {   // 中央に出すカード(対象なし)。穴は出さず、暗幕だけ(.tour-center)
        hole.style.display = 'none';
        const ctip = document.getElementById('tour-tip');
        const cvw = window.innerWidth, cvh = window.innerHeight;
        const cw = Math.min(340, cvw - 24);
        ctip.style.width = `${cw}px`;
        const cpos = _tourPlaceCenter(ctip.offsetHeight, cvh, cvw, cw);
        ctip.style.top = `${cpos.top}px`;
        ctip.style.left = `${cpos.left}px`;
        ctip.dataset.placement = cpos.placement;
        return;
      }
      hole.style.display = '';
      const el = _tourAnchorEl(st.steps[st.index].anchor);
      if (!_tourVisible(el)) return;
      const r = el.getBoundingClientRect();
      const pad = 6;
      hole.style.top = `${r.top - pad}px`;
      hole.style.left = `${r.left - pad}px`;
      hole.style.width = `${r.width + pad * 2}px`;
      hole.style.height = `${r.height + pad * 2}px`;
      const tip = document.getElementById('tour-tip');
      const vw = window.innerWidth, vh = window.innerHeight;
      tip.style.width = `${Math.min(340, vw - 24)}px`;
      const pos = _tourPlaceTip(r, tip.offsetHeight, vh, vw, Math.min(340, vw - 24));
      tip.style.top = `${pos.top}px`;
      tip.style.left = `${pos.left}px`;
      tip.dataset.placement = pos.placement;
      const arrowX = Math.max(20, Math.min(r.left + r.width / 2 - pos.left, pos.width - 20));
      tip.style.setProperty('--tour-arrow-x', `${arrowX}px`);
    }

    function tourNext() {
      if (!_tourState || _tourState.busy) return;
      _tourShow(_tourState.index + 1);
    }
    function tourSkip() { _tourEnd(true); }

    // 終了。record=trueかつpersistなら「見終わった」を記録する(Web確認のpersist=falseは記録しない)
    function _tourEnd(record) {
      const st = _tourState;
      if (!st) return;
      _tourState = null;
      if (record && st.persist) {
        try { localStorage.setItem(_TOUR_DONE_PREFIX + st.id, '1'); } catch (_) {}
        _tourPendingClear();   // 見終わったので、「あとで」の保留も消す
      }
      window.removeEventListener('resize', _tourReposition);
      window.removeEventListener('orientationchange', _tourReposition);
      document.getElementById('tour-layer')?.classList.remove('visible', 'tour-center');
      if (st.locked) unlockScroll();
      if (st.psiOpened) _closeStatPopover();   // 案内が開いたPSI詳細のポップアップは、終了で閉じる
      if (typeof st.onEnd === 'function') {
        try { st.onEnd({ shown: st.steps.length > 0, record: !!record }); } catch (_) {}
      }
    }

    // ─── ウェルカムツアー(新規インストール向け、設計書233) ───
    // くらし画面だけで完結する4ステップ(ようこそ→ボトムナビ→指標→カテゴリ)。文言はアプリ内の固定文言。
    // 対象: ネイティブアプリで、新規インストール(app_welcome_pending)の人。Webは ?tour=welcome の確認用だけ(記録しない)
    const _WELCOME_TOUR_ID = 'welcome-1';
    function _welcomeTourSteps() {
      return [
        { anchor: null, title: t('tourWelcomeTitle1'), text: t('tourWelcomeStep1'), nextLabel: t('tourWelcomeStart') },
        { anchor: 'nav-bar', text: t('tourWelcomeStep2'), noScroll: true },
        { anchor: 'news-stats', text: t('tourWelcomeStep3') },
        { anchor: 'news-filters', text: t('tourWelcomeStep4') },
      ];
    }
    // 終了(最後まで見る/スキップ)で、対象フラグを消し、そのあとで通知の許可を尋ねる
    function _welcomeTourEnd(info) {
      if (info && info.record) { try { localStorage.removeItem(_WELCOME_PENDING_KEY); } catch (_) {} }
      _maybePromptPushOnboarding();
    }
    // 出す条件が揃っていれば、開始を予約してtrueを返す(呼び出し元は、その場合、通知の許可を尋ねない=ツアー終了後に尋ねる)。
    // 条件が揃わなければfalse(従来どおり、呼び出し元が通知の許可を尋ねる)
    function _maybeStartWelcomeTour() {
      const preview = !_isCapacitorApp && new URLSearchParams(location.search).get('tour') === 'welcome';
      let want = false;
      try { want = preview || (_isCapacitorApp && localStorage.getItem(_WELCOME_PENDING_KEY) === '1' && !_tourDone(_WELCOME_TOUR_ID)); } catch (_) {}
      if (!want || _tourState || _whatsNewPending) return false;
      // 画面の描画が落ち着いてから開始する。開始できなかった(別の表示が出た・くらし画面でない・アンカーが無い)時は、通知の許可を従来どおり尋ねる
      setTimeout(() => {
        const ready = !_tourState && !_whatsNewPending && document.getElementById('nav-news')?.classList.contains('active');
        if (!ready) { if (!preview) _maybePromptPushOnboarding(); return; }
        startTour({ id: _WELCOME_TOUR_ID, steps: _welcomeTourSteps(), persist: !preview, onEnd: preview ? null : _welcomeTourEnd });
      }, 900);
      return true;
    }

    // ─── 設定の「チュートリアル」(これまでのハイライト付きの案内を、いつでも見直せる。設計書235) ───
    // 案内は TUTORIALS に登録する。新しい案内を足す時は、ここに1件足す(必要なら、対象の要素に data-tour を付けて _TOUR_ANCHORS に追加)。
    // 見直しは persist:false で動かし、「見た」の記録(app_tour_done_*)・新規の対象フラグ・「あとで」の保留は、一切更新しない。
    // calendar-1 の文言は、自動表示ではサーバー(content/whats-new.json)のentryが使われ、見直しではアプリ内(tourCalStep1/2)が使われる。
    // 変える時は、whats-new.json とアプリ内 STRINGS.ja の2か所を直す。
    function _calendarTourSteps() {
      return [
        { anchor: 'cal-notes-switch', text: t('tourCalStep1') },
        { anchor: 'cal-fare-entry', text: t('tourCalStep2') },
      ];
    }
    // くらしの指標(PM2.5)の案内。1.8.16の紹介カードの「使ってみる」(ツアーID pm25-1、文言はサーバー側`content/whats-new.json`)と同じ内容。
    // 文言は、サーバーの1.8.16のentryとアプリ内`tourPm25Step1`の2か所(変える時は両方)
    function _pm25TourSteps() {
      return [
        { anchor: 'news-stat-pm25', text: t('tourPm25Step1') },
        { anchor: 'psi-toggle', before: 'open-psi', text: t('tourPm25Step2') },
        { anchor: 'psi-map', text: t('tourPm25Step3') },
        { anchor: 'psi-chips', text: t('tourPm25Step4') },
      ];
    }
    const _tutorialWait = ms => new Promise(r => setTimeout(r, ms));
    const TUTORIALS = [
      {
        id: _WELCOME_TOUR_ID, nameKey: 'tutorialName1', descKey: 'tutorialDesc1', steps: _welcomeTourSteps,
        prepare: async () => { switchNav('news'); await _tutorialWait(600); },
      },
      {
        id: 'pm25-1', nameKey: 'tutorialName4', descKey: 'tutorialDesc4', steps: _pm25TourSteps,
        prepare: async () => { switchNav('news'); await _tutorialWait(600); },
        cleanup: () => _closeStatPopover(),
      },
      {
        id: 'calendar-1', nameKey: 'tutorialName2', descKey: 'tutorialDesc2', steps: _calendarTourSteps,
        prepare: async () => { switchNav('calendar'); await _tutorialWait(700); },
      },
      {
        id: _FARE_SHEET_TOUR_ID, nameKey: 'tutorialName3', descKey: 'tutorialDesc3', steps: _fareSheetTourSteps,
        prepare: async () => {
          switchNav('calendar');
          await _tutorialWait(500);
          openFareSheet(new Date().getMonth() + 1);
          await _tutorialWait(450);   // 画面が下からせり上がる動き(0.25秒)が終わってから測る
        },
        cleanup: () => closeFareSheet(),
      },
    ];

    function _isTutorialSheetOpen() {
      return !!document.getElementById('tutorial-sheet-overlay')?.classList.contains('visible');
    }
    function renderTutorialSheet() {
      const body = document.getElementById('tutorial-sheet-body');
      if (!body) return;
      const items = TUTORIALS.map(tu => {
        const seen = _tourDone(tu.id);
        return `<div class="tutorial-item">
          <div class="tutorial-item-main">
            <div class="tutorial-item-name">${escapeHtml(t(tu.nameKey))}${seen ? `<span class="tutorial-seen">${escapeHtml(t('tutorialSeen'))}</span>` : ''}</div>
            <div class="tutorial-item-desc">${escapeHtml(t(tu.descKey))}</div>
          </div>
          <button type="button" class="tutorial-item-btn" onclick="startTutorial('${escapeHtml(tu.id)}')">${escapeHtml(t('tutorialSee'))}</button>
        </div>`;
      }).join('');
      body.innerHTML = `<button type="button" class="tutorial-all-btn" onclick="startTutorialAll()">${escapeHtml(t('tutorialAll'))}</button>${items}`;
    }
    function openTutorialSheet() {
      if (_isTutorialSheetOpen()) return;
      renderTutorialSheet();
      document.getElementById('tutorial-sheet-overlay')?.classList.add('visible');
      lockScroll();
    }
    function closeTutorialSheet() {
      if (!_isTutorialSheetOpen()) return;
      document.getElementById('tutorial-sheet-overlay')?.classList.remove('visible');
      unlockScroll();
    }
    // 見直しを始める。紹介カード・別の案内・実行中の見直しがある時は始めない
    function _startTutorialRun(ids) {
      if (_tutorialRun || _tourState || _whatsNewPending) return;
      const queue = ids.filter(id => TUTORIALS.some(tu => tu.id === id));
      if (!queue.length) return;
      closeTutorialSheet();
      _tutorialRun = { queue };
      _runNextTutorial();
    }
    function startTutorial(id) { _startTutorialRun([id]); }
    function startTutorialAll() { _startTutorialRun(TUTORIALS.map(tu => tu.id)); }
    async function _runNextTutorial() {
      const run = _tutorialRun;
      if (!run) return;
      const id = run.queue.shift();
      if (!id) { _tutorialFinish(run); return; }
      const tu = TUTORIALS.find(x => x.id === id);
      if (!tu) { _runNextTutorial(); return; }
      try { await tu.prepare(); } catch (_) {}
      if (_tutorialRun !== run) return;
      let ended = false;
      const onEnd = () => {
        if (ended) return;
        ended = true;
        try { if (tu.cleanup) tu.cleanup(); } catch (_) {}
        if (_tutorialRun !== run) return;
        setTimeout(() => _runNextTutorial(), 300);
      };
      await startTour({ id: tu.id, steps: tu.steps(), persist: false, onEnd });
      // startTour が何も始めなかった(別の案内が出ていた等)場合は、終わったものとして次へ進む(止まらないように)
      if (!ended && !(_tourState && _tourState.id === tu.id)) onEnd();
    }
    // 見直しの最後。設定画面に戻る
    function _tutorialFinish(run) {
      if (_tutorialRun !== run) return;
      _tutorialRun = null;
      switchNav('settings');
    }

    function closeWhatsNew() {
      if (!_whatsNewPending) return;
      const { version, persist } = _whatsNewPending;
      _whatsNewPending = null;
      if (persist) { try { localStorage.setItem(_WHATSNEW_SEEN_KEY, version); } catch (_) {} }
      unlockScroll();
      document.getElementById('whatsnew-overlay')?.classList.remove('visible');
      document.getElementById('whatsnew-modal')?.classList.remove('visible');
    }

    // ─── PROMO MODAL（Web版→iOSアプリ誘導、設計書206） ───
    function maybeShowWebPromoModal() {
      if (_isCapacitorApp) return;
      try {
        let count = parseInt(localStorage.getItem('app_web_promo_visit_count') || '0', 10);
        if (isNaN(count) || count < 0) count = 0;
        count += 1;
        localStorage.setItem('app_web_promo_visit_count', String(count));
        if (count > 1 && count % 10 === 1) {
          openPromoModal();
        }
      } catch (_) {}
    }

    function openPromoModal() {
      const overlay = document.getElementById('promo-modal-overlay');
      const modal = document.getElementById('promo-modal');
      if (!overlay || !modal) return;
      overlay.classList.add('visible');
      modal.classList.add('visible');
    }

    function closePromoModal() {
      const overlay = document.getElementById('promo-modal-overlay');
      const modal = document.getElementById('promo-modal');
      if (overlay) overlay.classList.remove('visible');
      if (modal) modal.classList.remove('visible');
    }

    maybeShowWebPromoModal();

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


    // Web版でのプッシュ通知タップ遷移（?nav=news → 生活情報タブ）。sw.jsのnotificationclickが
    // client.navigate()で付与するクエリを起動時に読み取る
    function checkNavParam() {
      const sp = new URLSearchParams(window.location.search);
      const nav = sp.get('nav');
      if (nav !== 'news') return;
      switchNav('news');
      window.history.replaceState({}, '', window.location.pathname);
    }

