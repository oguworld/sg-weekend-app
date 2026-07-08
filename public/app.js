    // ─── CAPACITOR DETECTION ───
    const _isCapacitorApp = !!(window.Capacitor?.isNativePlatform?.());
    const API_BASE = _isCapacitorApp ? 'https://dosuru.app' : '';

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
            const atTop    = el.scrollTop <= 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            if (dy > 0 && atTop)    { e.preventDefault(); return; } // 上端での引き上げ防止
            if (dy < 0 && atBottom) { e.preventDefault(); return; } // 下端での引き下げ防止
            return; // スクロール余地あり → 通常スクロール許可
          }
          el = el.parentElement;
        }
        e.preventDefault(); // スクロール対象なし → 防止
      }, { passive: false });
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
        settingsTitle: '設定',
        secProfile: 'プロフィール',
        secAppSettings: 'アプリ設定',
        labelLang: '表示言語',
        secData: 'データ',
        secOther: 'その他',
        clearPins: 'ピン留めをすべて削除',
        resetBtn: 'リセット',
        secFeedback: 'フィードバック',
        feedbackPlaceholder: '改善要望・バグ報告・スポット追加リクエストなど、なんでもどうぞ！',
        feedbackSend: '📨 送信する',
        secSupport: '応援する',
        supportDesc: 'このアプリは無料で運営しています。気に入っていただけたら、コーヒー1杯分で応援していただけると嬉しいです',
        supportLabel: 'アプリを応援する',
        supportBtn: 'アプリを応援する（SGD 5）',
        secAbout: 'アプリ情報',
        aboutAppName: 'アプリ名',
        aboutVersion: 'バージョン',
        navHome: '期間限定',
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
        howtoLabel: '使い方',
        howtoOpenBtn: '見る',
        shareSettingsDesc: 'シンガポール在住の友達にこのアプリを紹介しよう！',
        shareSettingsBtn: '友達にシェアする',
        bannerToday: '⏰ 本日まで',
        bannerTomorrow: '⏰ 明日まで',
        bannerDaysLeft: '⏰ あと{d}日',
        toastProfileSet: '✅ {label} に設定しました',
        profileLabelAll: '指定なし（すべて）',
        installDescIos: '画面下の共有ボタン（□↑）→「ホーム画面に追加」でOK！',
        installDescAndroid: 'おでかけNaviとしてホーム画面から起動できます',
        installBtnIos: '方法を見る',
        installBtnAndroid: '追加する',
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
        navCourse: 'コース',
        courseScreenTitle: 'おでかけコース',
        courseTabEveryone: 'みんなのコース',
        courseTabMylist: 'マイコース',
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
        supportBtn: '$5 を贈る',
        scheduleMakePlan: '予定を立てる',
        courseCreateBtn: '🗺 コース作成',
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
        settingsTitle: 'Settings',
        secProfile: 'Profile',
        secAppSettings: 'App Settings',
        labelLang: 'Display Language',
        secData: 'Data',
        secOther: 'Other',
        clearPins: 'Clear all pins',
        resetBtn: 'Reset',
        secFeedback: 'Feedback',
        feedbackPlaceholder: 'Suggestions, bug reports, spot requests — anything welcome!',
        feedbackSend: '📨 Send',
        secSupport: 'Support',
        supportDesc: 'This app is free to use. If you enjoy it, buying us a coffee would mean a lot.',
        supportLabel: 'Support the app',
        supportBtn: 'Support the app (SGD 5)',
        secAbout: 'About',
        aboutAppName: 'App',
        aboutVersion: 'Version',
        navHome: 'Limited',
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
        howtoLabel: 'How to Use',
        howtoOpenBtn: 'Open',
        shareSettingsDesc: 'Share this app with your friends in Singapore!',
        shareSettingsBtn: 'Share with Friends',
        bannerToday: '⏰ Today only',
        bannerTomorrow: '⏰ Until tomorrow',
        bannerDaysLeft: '⏰ {d} days left',
        toastProfileSet: '✅ Set to: {label}',
        profileLabelAll: 'All (no preference)',
        installDescIos: 'Tap the share button (□↑) at the bottom → "Add to Home Screen"',
        installDescAndroid: 'Add おでかけNavi to your home screen for quick access',
        installBtnIos: 'How to',
        installBtnAndroid: 'Add',
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
        navCourse: 'Courses',
        courseScreenTitle: 'Outing Courses',
        courseTabEveryone: 'Explore',
        courseTabMylist: 'My Courses',
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
        supportBtn: 'Gift $5',
        scheduleMakePlan: 'Plan a trip',
        courseCreateBtn: '🗺 Course',
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

      const titleEl = document.getElementById('app-title-city');
      if (titleEl) titleEl.textContent = `週末どうする？${meta.flag} ${meta.code}`;

      const subtitleEl = document.getElementById('app-subtitle-city');
      if (subtitleEl) subtitleEl.textContent = lang === 'en' ? meta.subtitleEn : meta.subtitleJa;

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
      _howtoRendered = false;
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
      grid.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--warm-gray);">
        <div style="font-size:28px;margin-bottom:8px;">⏳</div>
        <div style="font-size:15px;">${t('loadingEvents')}</div>
      </div>`;
      try {
        const res = await fetch(API_BASE + `/api/events?city=${getCity()}`);
        EVENT_DATA = res.ok ? await res.json() : [];
      } catch(e) {
        EVENT_DATA = [];
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
                 data-id="${e.id}" style="animation-delay:${i * 0.06}s;">
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
              <div style="position:relative;margin:-18px -18px 0;">
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
      window.scrollTo({ top: 0, behavior: 'instant' });
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
        filterCats.clear();
        if (getGenreList().length > 0) {
          _recommendModeActive = !_recommendModeActive;
        } else {
          _recommendModeActive = true;
        }
      } else {
        _recommendModeActive = false;
        const already = filterCats.has(val);
        filterCats.clear();
        if (!already) filterCats.add(val);
      }
      _syncCatChips();
      _syncRecommendChip();
      updateFilterBadge();
      window.scrollTo({ top: 0, behavior: 'instant' });
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

      // おすすめモードON かつジャンル未設定 → グリッド内に案内を表示
      if (_recommendModeActive && getGenreList().length === 0) {
        grid.innerHTML = `<div style="padding:48px 24px 32px;text-align:center;">
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
      grid.innerHTML = filtered.map((e, i) => renderEventCard(e, i)).join('');
      resultCount.textContent = filtered.length + t('countSuffix');
      emptyState.classList.toggle('visible', filtered.length === 0);
      updatePinButtons();
      loadInstagramEmbeds();
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
    {
      const CAT_ORDER = ['all', 'recommend', 'event', 'show', 'gourmet', 'sale', 'opening'];
      let _swipeStartX = 0, _swipeStartY = 0, _swipeIntent = null;

      function _currentCatIdx() {
        if (_recommendModeActive) return CAT_ORDER.indexOf('recommend');
        if (filterCats.size === 0) return CAT_ORDER.indexOf('all');
        const cat = [...filterCats][0];
        return CAT_ORDER.indexOf(cat);
      }

      function _switchCatBySwipe(dir) {
        const idx = _currentCatIdx();
        const next = idx + dir;
        if (next < 0 || next >= CAT_ORDER.length) return;
        toggleCatFilter(CAT_ORDER[next]);
        const chip = document.querySelector(`#filter-row-category .filter-chip[data-cat="${CAT_ORDER[next]}"]`);
        chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        window.scrollTo({ top: 0, behavior: 'instant' });
      }

      const homeEl = document.getElementById('screen-home');
      homeEl?.addEventListener('touchstart', e => {
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
        _swipeIntent = null;
      }, { passive: true });

      homeEl?.addEventListener('touchmove', e => {
        if (_swipeIntent) return;
        const dx = Math.abs(e.touches[0].clientX - _swipeStartX);
        const dy = Math.abs(e.touches[0].clientY - _swipeStartY);
        if (dx > 6 || dy > 6) _swipeIntent = dx > dy ? 'h' : 'v';
      }, { passive: true });

      homeEl?.addEventListener('touchend', e => {
        if (_swipeIntent !== 'h') return;
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
    }

    // ─── FAB 即時タップ対応（iOS Safari scroll-offset click mismatch 回避）───
    {
      let _fabTx = 0, _fabTy = 0;
      [
        { id: 'fab-ai',     fn: () => openAIChat() },
        { id: 'course-fab', fn: () => openCourseSheet() },
        { id: 'fab-plan',   fn: () => openCustomPlanModal() },
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
      }, { passive: false });
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
      ['install-overlay',    () => closeInstallModal()],
      ['share-overlay',      () => closeShareModal()],
      ['share-modal-close',  () => closeShareModal()],
      ['pin-detail-overlay', () => closePinDetail()],
      ['chat-overlay',       () => closeAIChat()],
      ['pin-picker-overlay',   () => closePinPicker()],
      ['emoji-picker-overlay',    () => closeEmojiPicker()],
      ['schedule-action-overlay', () => closeScheduleActionSheet()],
      ['cal-popup-overlay',       () => closeCalPopup()],
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

    loadEventData();
    initPushState();
    initSettingsProfile();
    initSettingsGenres();

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
      window.addEventListener('scroll', () => {
        fab.classList.toggle('visible', window.scrollY > 300);
      }, { passive: true });

      const calFab = document.getElementById('cal-popup-fab');
      document.getElementById('cal-popup-events').addEventListener('scroll', () => {
        calFab.classList.toggle('visible', document.getElementById('cal-popup-events').scrollTop > 150);
      }, { passive: true });

      // AI FAB は home タブで常時表示
      document.getElementById('fab-ai').classList.add('visible');
    })();
    function fabScrollTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function calPopupScrollTop() {
      document.getElementById('cal-popup-events').scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── AI CHAT ───
    let CHAT_HISTORY = [];

    function openAIChat() {
      lockScroll();
      const msgs = document.getElementById('chat-messages');
      if (!msgs.children.length) {
        appendChatBubble('ai', 'こんにちは！週末のお出かけについて何でも聞いてください 🌴\n例：「子連れでおすすめは？」「来週末どこ行く？」');
      }
      document.getElementById('chat-overlay').classList.add('visible');
      document.getElementById('chat-sheet').classList.add('visible');
      setTimeout(() => document.getElementById('chat-input').focus(), 350);
    }

    function closeAIChat() {
      if (isVoiceRecording) stopVoiceInput();
      document.getElementById('chat-overlay').classList.remove('visible');
      document.getElementById('chat-sheet').classList.remove('visible');
      unlockScroll();
    }

    function resetAIChat() {
      CHAT_HISTORY = [];
      document.getElementById('chat-messages').innerHTML = '';
      appendChatBubble('ai', 'こんにちは！週末のお出かけについて何でも聞いてください 🌴\n例：「子連れでおすすめは？」「来週末どこ行く？」');
    }

    function appendChatBubble(role, text) {
      const msgs = document.getElementById('chat-messages');
      const el = document.createElement('div');
      el.className = `chat-bubble ${role}`;
      el.textContent = text;
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
      return el;
    }

    function renderChatMiniCard(ev) {
      const emoji = ev.emoji || '📍';
      const name = (ev.store || ev.title || '').replace(/'/g, "\\'");
      const period = ev.period || ev.hours || '';
      const location = ev.location || '';
      const meta = [period, location].filter(Boolean).join('  ·  ');
      const safeId = ev.id;
      return `<div class="chat-mini-wrap">
        <div class="chat-mini-card" onclick="toggleChatMiniDetail(this,'${safeId}')">
          <span class="chat-mini-emoji">${emoji}</span>
          <div class="chat-mini-info">
            <div class="chat-mini-name">${name}</div>
            ${meta ? `<div class="chat-mini-meta">${meta}</div>` : ''}
          </div>
          <span class="chat-mini-arrow">›</span>
        </div>
        <div class="chat-mini-detail" id="chat-detail-${safeId}"></div>
      </div>`;
    }

    function toggleChatMiniDetail(btn, id) {
      const wrap = btn.closest('.chat-mini-wrap');
      const detail = wrap.querySelector('.chat-mini-detail');
      const isOpen = detail.classList.contains('open');
      if (isOpen) {
        detail.classList.remove('open');
        btn.classList.remove('expanded');
      } else {
        if (!detail.innerHTML.trim()) {
          const ev = EVENT_REGISTRY[id];
          if (ev) {
            const html = renderEventCard(ev, 0, true);
            if (html) {
              const tmp = document.createElement('div');
              tmp.innerHTML = html.trim();
              if (tmp.firstElementChild) detail.appendChild(tmp.firstElementChild);
            }
          }
        }
        detail.classList.add('open');
        btn.classList.add('expanded');
        setTimeout(() => detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      }
    }

    function appendChatCards(eventIds) {
      if (!eventIds?.length) return;
      const msgs = document.getElementById('chat-messages');
      const wrap = document.createElement('div');
      wrap.className = 'chat-cards-wrap';
      eventIds.slice(0, 3).forEach(id => {
        const ev = EVENT_REGISTRY[id];
        if (!ev) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = renderChatMiniCard(ev).trim();
        if (tmp.firstElementChild) wrap.appendChild(tmp.firstElementChild);
      });
      if (wrap.children.length) {
        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
      }
    }

    function showTyping() {
      const msgs = document.getElementById('chat-messages');
      const el = document.createElement('div');
      el.className = 'chat-bubble ai';
      el.id = 'chat-typing-indicator';
      el.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function hideTyping() {
      document.getElementById('chat-typing-indicator')?.remove();
    }

    async function chatSend() {
      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send-btn');
      const text = input.value.trim();
      if (!text) return;

      appendChatBubble('user', text);
      CHAT_HISTORY.push({ role: 'user', content: text });
      input.value = '';
      sendBtn.disabled = true;
      sendBtn.classList.remove('visible');
      document.getElementById('chat-mic-btn').style.display = '';
      showTyping();

      try {
        const res = await fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: CHAT_HISTORY.slice(-6),
            lang: getLang(),
            city: getCity(),
          }),
        });
        hideTyping();

        if (!res.ok) throw new Error('API error');
        const data = await res.json();

        appendChatBubble('ai', data.message || '回答を取得できませんでした。');
        appendChatCards(data.eventIds);
        CHAT_HISTORY.push({ role: 'assistant', content: data.message || '' });

      } catch (e) {
        hideTyping();
        appendChatBubble('ai', 'エラーが発生しました。もう一度お試しください。');
      }
    }

    document.getElementById('chat-input').addEventListener('input', function() {
      const hasText = !!this.value.trim();
      document.getElementById('chat-send-btn').disabled = !hasText;
      document.getElementById('chat-send-btn').classList.toggle('visible', hasText);
      document.getElementById('chat-mic-btn').style.display = hasText ? 'none' : '';
    });

    // ─── VOICE INPUT ───
    let voiceRecognition = null;
    let isVoiceRecording = false;

    (function initVoiceMic() {
      if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        ['chat-mic-btn', 'course-note-mic-btn'].forEach(id => {
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

    function toggleVoiceInput() {
      if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) return;
      if (isVoiceRecording) { stopVoiceInput(); return; }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      voiceRecognition = new SR();
      voiceRecognition.lang = getLang() === 'en' ? 'en-US' : 'ja-JP';
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = true;

      const micBtn  = document.getElementById('chat-mic-btn');
      const input   = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send-btn');

      voiceRecognition.onstart = () => {
        isVoiceRecording = true;
        micBtn.classList.add('recording');
        input.placeholder = getLang() === 'en' ? 'Listening...' : '聴いています...';
      };

      voiceRecognition.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
        input.value = transcript;
        const hasText = !!transcript.trim();
        sendBtn.disabled = !hasText;
        sendBtn.classList.toggle('visible', hasText);
        micBtn.style.display = hasText ? 'none' : '';
      };

      voiceRecognition.onend = () => {
        isVoiceRecording = false;
        micBtn.classList.remove('recording');
        input.placeholder = getLang() === 'en' ? 'Ask about your weekend plans...' : '週末の予定を相談してみよう...';
        voiceRecognition = null;
      };

      voiceRecognition.onerror = () => {
        isVoiceRecording = false;
        micBtn.classList.remove('recording');
        input.placeholder = getLang() === 'en' ? 'Ask about your weekend plans...' : '週末の予定を相談してみよう...';
        voiceRecognition = null;
      };

      voiceRecognition.start();
    }
    document.getElementById('chat-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.isComposing) chatSend();
    });

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
      lockScroll();
      const pins = getPins();
      const p = pins[id];
      if (!p) return;

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
      lockScroll();
      const event = EVENT_REGISTRY[eventId];
      if (!event) return;
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

    // ─── INSTALL BANNER ───
    let deferredPrompt = null;
    const INSTALL_DISMISSED_KEY = 'sg_install_dismissed';

    function isIOS() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent);
    }
    function isInStandaloneMode() {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.navigator.standalone === true;
    }

    // Android: beforeinstallprompt をキャッチ
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner('android');
    });

    function showInstallBanner(platform) {
      if (_isCapacitorApp) return;
      // すでにインストール済みまたは閉じた場合はスキップ
      if (isInStandaloneMode()) return;
      if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return;

      const desc = document.getElementById('install-banner-desc');
      const btn = document.getElementById('install-banner-btn');

      if (platform === 'ios') {
        desc.textContent = t('installDescIos');
        btn.textContent = t('installBtnIos');
      } else {
        desc.textContent = t('installDescAndroid');
        btn.textContent = t('installBtnAndroid');
      }

      setTimeout(() => {
        document.getElementById('install-banner').classList.add('visible');
      }, 3000); // 3秒後に表示
    }

    function handleInstall() {
      if (deferredPrompt) {
        // Android: ネイティブダイアログを表示
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choice => {
          if (choice.outcome === 'accepted') {
            dismissInstallBanner();
          }
          deferredPrompt = null;
        });
      } else {
        // iOS: シェアモーダルを開く
        dismissInstallBanner();
        openShareModal();
      }
    }

    function dismissInstallBanner() {
      document.getElementById('install-banner').classList.remove('visible');
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    }

    // iOS: 初回アクセス時にバナー表示
    if (isIOS() && !isInStandaloneMode()) {
      showInstallBanner('ios');
    }

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
    function closeInstallModal() {
      document.getElementById('install-modal').classList.remove('visible');
      document.getElementById('install-overlay').classList.remove('visible');
      unlockScroll();
    }

    function renderHowtoContent() {
      const isEn = getLang() === 'en';
      const stepBadge = (n) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--caramel);color:#fff;font-size:12px;font-weight:700;flex-shrink:0;">${n}</span>`;

      return `
        <div class="pin-detail-title" style="margin-bottom:6px;">${isEn ? 'How to Use' : '使い方'}</div>
        <div style="font-size:14px;color:var(--warm-gray);line-height:1.7;margin-bottom:16px;">
          ${isEn ? 'Find events, build day courses with AI, and plan your weekend.' : '週末のお出かけをかんたんに計画できるアプリです。'}
        </div>

        <div style="background:var(--sage-pale);border-radius:16px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:14px;font-weight:700;color:var(--warm-gray);margin-bottom:8px;">📱 ${isEn ? 'Add to Home Screen' : 'ホーム画面に追加'}</div>
          <div style="font-size:14px;color:var(--warm-gray);line-height:1.8;">${isEn
            ? '<strong>iPhone:</strong> Safari → Share (□↑) → "Add to Home Screen"<br><strong>Android:</strong> Chrome → ⋮ → "Add to Home screen"'
            : '<strong>iPhone：</strong>Safari → 共有（□↑）→「ホーム画面に追加」<br><strong>Android：</strong>Chrome → ⋮ →「ホーム画面に追加」'
          }</div>
        </div>

        <div style="background:var(--caramel-pale);border-radius:16px;padding:16px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            ${stepBadge(1)}
            <div style="font-size:15px;font-weight:700;color:var(--midnight);">🔍 ${isEn ? 'Find events' : 'イベントを探す'}</div>
          </div>
          <div style="font-size:14px;color:var(--warm-gray);line-height:1.9;">
            ${isEn
              ? '• <strong>⭐ Recommended</strong> — shows events matching your genre settings<br>• Switch tabs: <strong>Events / Shows / Food / Deals / New Open</strong><br>• Use <strong>Filter ▼</strong> to narrow by date, area, or keyword<br>• <strong>⏰</strong> ending soon &nbsp;/&nbsp; <strong>🔔</strong> newly added'
              : '• <strong>⭐ おすすめ</strong> — 設定したジャンルに合うイベントを表示<br>• タブ切り替え：<strong>イベント / 展示・公演 / グルメ / プロモ / 新規オープン</strong><br>• <strong>絞り込み ▼</strong> で日程・エリア・キーワードを指定<br>• <strong>⏰</strong> 終了間近 &nbsp;/&nbsp; <strong>🔔</strong> 新着'
            }
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
          <div style="width:2px;height:14px;background:var(--light-gray);border-radius:1px;"></div>
        </div>

        <div style="background:var(--caramel-pale);border-radius:16px;padding:16px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            ${stepBadge(2)}
            <div style="font-size:15px;font-weight:700;color:var(--midnight);">🗺 ${isEn ? 'Build a course' : 'コースを作る'}</div>
          </div>
          <div style="font-size:14px;color:var(--warm-gray);line-height:1.9;">
            ${isEn
              ? '• Open <strong>Course tab</strong> → tap <strong>＋</strong> → AI suggests 3 concepts<br>• Pick one → get a full day itinerary<br>• Tap <strong>📅</strong> to add the whole course to your schedule'
              : '• <strong>コースタブ</strong> → <strong>＋</strong> をタップ → AIが3候補を提案<br>• 気に入ったコンセプトを選ぶとフルプランを生成<br>• <strong>📅</strong> で予定表に一括追加できます'
            }
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
          <div style="width:2px;height:14px;background:var(--light-gray);border-radius:1px;"></div>
        </div>

        <div style="background:var(--caramel-pale);border-radius:16px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            ${stepBadge(3)}
            <div style="font-size:15px;font-weight:700;color:var(--midnight);">📅 ${isEn ? 'Manage your schedule' : '予定を管理する'}</div>
          </div>
          <div style="font-size:14px;color:var(--warm-gray);line-height:1.9;">
            ${isEn
              ? '• Tap <strong>📅 Add to plan</strong> on any event card<br>• Or tap <strong>＋</strong> in the Schedule tab to add freely<br>• Share your schedule with family via <strong>🔗 Share</strong>'
              : '• イベントカードの <strong>📅 予定に追加</strong> で日時を設定<br>• 予定表の <strong>＋</strong> で自由に予定を追加<br>• <strong>🔗 共有</strong> で家族と予定を共有'
            }
          </div>
        </div>

        <div style="background:var(--sage-pale);border-radius:16px;padding:14px 16px;margin-bottom:4px;">
          <div style="font-size:14px;font-weight:700;color:var(--warm-gray);margin-bottom:8px;">⚙️ ${isEn ? 'Settings' : '設定'}</div>
          <div style="font-size:14px;color:var(--warm-gray);line-height:1.9;">${isEn
            ? '• <strong>Genres & Interests</strong> — select genres to personalize ⭐ Recommended<br>• <strong>Who you\'re going with</strong> — tailors AI course suggestions<br>• <strong>Language</strong> — switch between Japanese and English'
            : '• <strong>ジャンル・興味</strong> — ジャンルを選ぶと ⭐ おすすめ に反映されます<br>• <strong>一緒に行く人</strong> — コース生成AIのプロンプトに反映されます<br>• <strong>言語</strong> — 日本語と英語を切り替えできます'
          }</div>
        </div>`;
    }

    let _howtoRendered = false; // SW更新時にリセット → 再レンダリング
    let _howtoOpen = false;
    function openShareModal() {
      if (_howtoOpen) return;
      _howtoOpen = true;
      if (!_howtoRendered) {
        document.getElementById('howto-content').innerHTML = renderHowtoContent();
        _howtoRendered = true;
      }
      document.getElementById('howto-content').scrollTop = 0;
      document.getElementById('share-modal').classList.add('visible');
      document.getElementById('share-overlay').classList.add('visible');
    }
    function closeShareModal() {
      if (!_howtoOpen) return;
      _howtoOpen = false;
      document.getElementById('share-modal').classList.remove('visible');
      document.getElementById('share-overlay').classList.remove('visible');
    }
    async function doShare() {
      const cityMeta = CITY_META[getCity()] || CITY_META.sg;
      const data = {
        title: 'おでかけNavi',
        text: `${cityMeta.subtitleJa}！週末どうする？はここで決まる👇`,
        url: 'https://dosuru.app',
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

    // ─── PUSH NOTIFICATIONS ───
    let _pushSubscription = null;

    function _urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    async function initPushState() {
      const item = document.getElementById('push-setting-item');
      if (!item) return;
      if (_isCapacitorApp) { item.style.display = 'none'; return; }
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
      const denied = Notification.permission === 'denied';
      btn.textContent = denied ? t('pushDenied') : _pushSubscription ? t('pushOn') : t('pushOff');
    }

    async function togglePush() {
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

    // ─── NAV LOGIC ───
    function closeAllPopups() {
      closeInstallModal();
      closeShareModal();
      closeCalPopup();
      closePinDetail();
      closePinPicker();
      closeEmojiPicker();
      closeScheduleActionSheet();
      closeAIChat();
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
      const fabAi = document.getElementById('fab-ai');
      fabAi.style.display = hideFabs ? 'none' : '';
      if (!hideFabs) fabAi.classList.add('visible');
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
      await switchCourseTab('everyone');

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
    }

    // タブ切り替え
    async function switchCourseTab(tab) {
      currentCourseTab = tab;
      document.querySelectorAll('.course-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tab));

      const city = getCity();

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
            <div style="font-size:12px;color:var(--light-gray);">❤️ ${c.likes||0} · ${t('courseSpotsCount').replace('{n}', c.spots?.length||0)} · ${c.authorAvatar||''}${c.authorName||'AI'}</div>
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
                <div class="course-timeline-meta">${escapeHtml(s.address || '')}</div>
              </div>
            </div>
          `).join('')}

          <div style="font-size:14px;color:var(--light-gray);margin:12px 0;">
            ❤️ ${course.likes || 0}&nbsp;&nbsp;${t('courseDetailAuthor')} ${course.authorName || 'AI'}&nbsp;&nbsp;${(course.createdAt||'').slice(0,10)}
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

    function closeCourseDetail() {
      _unlockCourseScroll();
      unlockScroll();
      document.getElementById('course-detail-overlay').style.display = 'none';
      document.getElementById('course-detail-overlay').style.opacity = '0';
      document.getElementById('course-detail-sheet').classList.remove('visible');
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
      document.getElementById('course-sheet-overlay').style.display = 'none';
      document.getElementById('course-sheet-overlay').style.opacity = '0';
      document.getElementById('course-sheet').classList.remove('visible');
      _unlockCourseScroll();
      unlockScroll();
      window._coursePresetDate = null;
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
      document.getElementById('title-edit-overlay').style.display = 'block';
      document.getElementById('title-edit-sheet').style.display = 'block';
      setTimeout(() => input.focus(), 100);
    }

    function closeTitleEdit() {
      _editingCourseId = null;
      unlockScroll();
      document.getElementById('title-edit-overlay').style.display = 'none';
      document.getElementById('title-edit-sheet').style.display = 'none';
      document.getElementById('title-edit-input').blur();
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

      // 公開済みならサーバーからも削除
      if (target?.published) {
        try {
          await fetch(API_BASE + `/api/courses/${courseId}?city=${city}`, { method: 'DELETE' });
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
      document.getElementById('date-picker-overlay').classList.remove('visible');
      document.getElementById('date-picker-modal').classList.remove('visible');
      unlockScroll();
      _datepickerCallback = null;
    }

    function addCourseToScheduleWithDate(course) {
      _allLoadedCourses[course.id] = course;
      openDatePickerSheet({
        subtitle:  course.title || 'コース',
        multi:     false,
        presetKey: window._coursePresetDate || null,
        onConfirm: (keys) => {
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
          saveCustomPlans(updated);
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
        await fetch(API_BASE + '/api/courses/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...course, isPublic: true })
        });

        // localStorageの published フラグを更新
        const updated = myList.map(c => c.id === courseId ? {...c, isPublic: true, published: true} : c);
        localStorage.setItem(city + '_my_courses', JSON.stringify(updated));

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
        await fetch(API_BASE + `/api/courses/${courseId}/unpublish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city })
        });
        const key = city + '_my_courses';
        const myList = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(
          myList.map(c => c.id === courseId ? { ...c, published: false, isPublic: false } : c)
        ));
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
      }
    }

    // ─── PLAN FEATURE: DATA LAYER ───
    // custom_plans は都市によらず共通（個人カレンダー）
    // event_plans は都市別（イベントIDが都市固有のため）
    function getCustomPlans() { return JSON.parse(localStorage.getItem('custom_plans') || '[]'); }
    function saveCustomPlans(arr) {
      localStorage.setItem('custom_plans', JSON.stringify(arr));
      if (getSharedGroupId() && !_calSyncFromServer) syncToServer();
    }
    function getEventPlans() { return JSON.parse(localStorage.getItem(getCity()+'_event_plans') || '[]'); }
    function saveEventPlans(arr) {
      localStorage.setItem(getCity()+'_event_plans', JSON.stringify(arr));
      if (getSharedGroupId() && !_calSyncFromServer) syncToServer();
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
      document.getElementById('plan-modal-overlay').style.display = 'block';
      document.getElementById('plan-modal-overlay').style.opacity = '1';
      document.getElementById('plan-event-modal').classList.add('visible');
      requestAnimationFrame(() => _syncTimeInputUI('event'));
      } catch(e) { unlockScroll(); throw e; }
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
      document.getElementById('plan-modal-overlay').style.display = 'block';
      document.getElementById('plan-modal-overlay').style.opacity = '1';
      document.getElementById('plan-custom-modal').classList.add('visible');
      requestAnimationFrame(() => _syncTimeInputUI('custom'));
      const customBody = document.querySelector('#plan-custom-modal .plan-modal-body');
      if (customBody) customBody.scrollTop = 0;
      } catch(e) { unlockScroll(); throw e; }
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
      document.getElementById('plan-modal-overlay').style.display = 'block';
      document.getElementById('plan-modal-overlay').style.opacity = '1';
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

    function saveEventPlan() {
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
      saveEventPlans(plans);
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

    function saveCustomPlan() {
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
      saveCustomPlans(plans);
      _notifyGroupIfChecked('plan-custom-notify-cb', title, isEdit ? 'updated' : 'added');
      closePlanModal();
      showToast(t(isEdit ? 'toastPlanUpdated' : 'toastPlanAdded'));
      renderScheduleTab();
    }

    function savePlanDetail() {
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
          saveCustomPlans(plans);
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
          saveEventPlans(plans);
        }
      }
      _notifyGroupIfChecked('plan-detail-notify-cb', planName, 'updated');
      closePlanModal();
      showToast(t('toastPlanUpdated'));
      renderScheduleTab();
    }

    function deleteCustomGroup(idsStr) {
      const ids = new Set(idsStr.split(','));
      saveCustomPlans(getCustomPlans().filter(p => !ids.has(p.id)));
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
      document.getElementById('plan-modal-overlay').style.display = 'block';
      document.getElementById('plan-modal-overlay').style.opacity = '1';
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
      unlockScroll();
      closePinDropdown();
      document.getElementById('plan-modal-overlay').style.display = 'none';
      document.getElementById('plan-modal-overlay').style.opacity = '0';
      document.getElementById('plan-event-modal').classList.remove('visible');
      document.getElementById('plan-custom-modal').classList.remove('visible');
      document.getElementById('plan-detail-modal').classList.remove('visible');
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

    function deleteScheduleItem(planId, planType) {
      if (planType === 'custom') {
        saveCustomPlans(getCustomPlans().filter(p => p.id !== planId));
      } else {
        saveEventPlans(getEventPlans().filter(p => p.id !== planId));
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



    // ─── 共有カレンダー ───
    let _calSyncFromServer = false;
    let _pendingJoinGroupId = null;
    let _pendingJoinKey = null;
    let _scannerStream = null;
    let _scannerRafId = null;

    // ─── E2E ENCRYPTION (AES-256-GCM, key lives in URL fragment only) ───
    function getCalKey() { return localStorage.getItem(getCity()+'_shared_cal_key') || null; }
    function setCalKey(k) { if (k) localStorage.setItem(getCity()+'_shared_cal_key', k); else localStorage.removeItem(getCity()+'_shared_cal_key'); }

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
          body: JSON.stringify(body)
        });
      } catch(e) {}
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
        let customPlans, eventPlans;
        if (d.encryptedData) {
          const key = getCalKey();
          if (!key) return false;
          try {
            const dec = await _decryptPlans(key, d.encryptedData);
            customPlans = dec.customPlans || [];
            eventPlans  = dec.eventPlans  || [];
          } catch(e) { showToast('復号に失敗しました'); return false; }
        } else {
          customPlans = d.customPlans || [];
          eventPlans  = d.eventPlans  || [];
        }
        _calSyncFromServer = true;
        saveCustomPlans(customPlans);
        saveEventPlans(eventPlans);
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
        const showPushPrompt = !_pushSubscription && 'PushManager' in window && Notification.permission !== 'denied';
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
            <span style="color:var(--terracotta);">⚠️ リンク（またはQR）を知っている人は誰でも参加できます。</span><br>
            信頼できる相手にだけ共有してください。
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

    async function loadCalQR(gid) {
      try {
        const key = getCalKey();
        const url = `https://dosuru.app/?join=${gid}&city=${getCity()}${key ? '#'+key : ''}`;
        const dataUrl = await _generateQR(url);
        const wrap = document.getElementById('cal-qr-wrap');
        if (wrap) wrap.innerHTML = `<img src="${dataUrl}" width="200" height="200" style="border-radius:12px;" alt="QR">`;
      } catch(e) {}
    }

    async function doCreateGroup() {
      const btn = document.getElementById('cal-create-btn');
      if (btn) { btn.disabled = true; btn.textContent = '作成中...'; }
      try {
        const city = getCity();
        const key = await _genCalKey();
        const customPlans = getCustomPlans();
        const eventPlans  = JSON.parse(localStorage.getItem(city+'_event_plans')||'[]');
        const encryptedData = await _encryptPlans(key, {customPlans, eventPlans});
        const r = await fetch(API_BASE + '/api/calendar/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, encryptedData })
        });
        const d = await r.json();
        setCalKey(key);
        setSharedGroupId(d.groupId);
        if (_pushSubscription) await _registerGroupPush(d.groupId);
        updateCalSyncBtn();
        renderCalSyncModal();
      } catch(e) {
        showToast('グループ作成に失敗しました');
        if (btn) { btn.disabled = false; btn.textContent = '🔗 グループを作成する'; }
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
      if (gid && _pushSubscription) await _deregisterGroupPush(gid);
      await fetchFromServer();
      setSharedGroupId(null);
      setCalKey(null);
      updateCalSyncBtn();
      renderScheduleTab();
      closeCalSync();
      showToast('グループから離脱しました');
    }

    function copyJoinLink(gid) {
      const key = getCalKey();
      const url = `https://dosuru.app/?join=${gid}&city=${getCity()}${key ? '#'+key : ''}`;
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
      const key = getCalKey();
      const url = `https://dosuru.app/?join=${gid}&city=${getCity()}${key ? '#'+key : ''}`;
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
          <button class="cal-sync-action primary" style="width:72px;margin:0;" onclick="doManualJoin()">参加</button>
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

    async function doJoinGroup() {
      if (!_pendingJoinGroupId) return;
      const gid = _pendingJoinGroupId;
      const key = _pendingJoinKey;
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
        const mergeArr = (a, b) => { const m={}; [...a,...b].forEach(p=>{ if(p&&p.id) m[p.id]=p; }); return Object.values(m); };
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
        saveCustomPlans(merged.customPlans);
        saveEventPlans(merged.eventPlans);
        _calSyncFromServer = false;
        setSharedGroupId(gid);
        if (_pushSubscription) await _registerGroupPush(gid);
        updateCalSyncBtn();
        renderScheduleTab();
        closeJoinPrompt();
        showToast('グループに参加しました！');
        if (!_pushSubscription && 'PushManager' in window && Notification.permission !== 'denied') {
          renderCalSyncModal();
          document.getElementById('cal-sync-modal').classList.add('visible');
        }
      } catch(e) {
        showToast('参加に失敗しました。グループIDをご確認ください。');
      }
    }

    // ─── PWA SERVICE WORKER ───
    if (!_isCapacitorApp && 'serviceWorker' in navigator) {
      // 初回ロード時点のコントローラーを記録（初回インストールとアップデートを区別）
      const hadController = !!navigator.serviceWorker.controller;

      // controllerchange: skipWaiting+claim で新SWがページを掌握した瞬間に確実に発火
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) {
          const banner = document.getElementById('update-banner');
          if (banner) banner.classList.add('show');
        }
        // 新SWにバージョン確認を再送
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
        }
      });

      // SW_UPDATED メッセージも念のため残す（controllerchange の補完）
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SW_UPDATED') {
          const banner = document.getElementById('update-banner');
          if (banner) banner.classList.add('show');
        }
        if (e.data?.type === 'SW_VERSION') {
          const incoming = e.data.version;
          const saved = localStorage.getItem('sw-version');
          if (saved && saved !== incoming) {
            const banner = document.getElementById('update-banner');
            if (banner) banner.classList.add('show');
          }
          localStorage.setItem('sw-version', incoming);
        }
      });

      window.addEventListener('load', async () => {
        let reg;
        try {
          reg = await navigator.serviceWorker.register('/sw.js');
        } catch (err) {
          console.warn('SW registration failed:', err);
        }
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          navigator.serviceWorker.getRegistration().then(reg => {
            reg?.update();
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
            }
          });
        }
      });

      // バナー系ボタン: touchend で即時反応（click の遅延回避）
      const updateBannerBtn = document.querySelector('.update-banner-btn');
      if (updateBannerBtn) {
        updateBannerBtn.addEventListener('touchend', () => { location.reload(); }, { passive: true });
      }
      const installBannerBtn = document.getElementById('install-banner-btn');
      if (installBannerBtn) {
        installBannerBtn.addEventListener('touchend', e => { e.preventDefault(); handleInstall(); }, { passive: false });
      }
      const installBannerClose = document.querySelector('.install-banner-close');
      if (installBannerClose) {
        installBannerClose.addEventListener('touchend', e => { e.preventDefault(); dismissInstallBanner(); }, { passive: false });
      }
    }
