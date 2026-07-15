/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'app.dosuru',
  appName: 'おでかけNavi',
  webDir: '../public',
  ios: {
    // 設計書15（2026-07-11）: 'always'だとキーボード表示時にwindow.innerHeightがsafe-area-inset-top分縮んで固着し、
    // ボトムナビ(position:fixed;bottom:0)が真の画面下端から浮くビューポート固着バグの真因だったため'never'に変更。
    // 崩れた場合は'always'に1行ロールバック可（詳細は.claude/next.md）。
    contentInset: 'never',
    backgroundColor: '#FFF9F2',
  },
  plugins: {
    Keyboard: {
      resize: 'none', // 設計書12フェーズ1（2026-07-11実施→同日ロールバック）: 'native'は実機でテキスト入力不可の重大回帰を起こしたため'none'に復元。絶対に変更しないこと
    },
    SplashScreen: {
      launchShowDuration: 1000,
      launchFadeOutDuration: 300,
      backgroundColor: '#FFF9F2',
      showSpinner: false,
      launchAutoHide: true,
    },
    GoogleAuth: {
      // scopes: 認証情報最小化方針（設計書35）により openid のみ要求（email/profileは要求しない）
      scopes: ['openid'],
      // iosClientId: Google Cloud Consoleで発行したiOS用OAuthクライアントID（2026-07-15発行済み）
      iosClientId: '928776929755-ne2tlcmg60esqkgfb1uiuujgh7k13bh4.apps.googleusercontent.com',
      grantOfflineAccess: false,
    },
  },
};

module.exports = config;
