/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'app.dosuru',
  appName: 'おでかけNavi',
  webDir: '../public',
  ios: {
    contentInset: 'always',
    backgroundColor: '#FFF9F2',
  },
  plugins: {
    Keyboard: {
      resize: 'native', // 設計書12フェーズ1（2026-07-11）: 'none'時のinnerHeight/visualViewport固着バグ対応の実機検証のため変更。問題があればこの1行を'none'に戻すだけでロールバック可能
    },
    SplashScreen: {
      launchShowDuration: 1000,
      launchFadeOutDuration: 300,
      backgroundColor: '#FFF9F2',
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

module.exports = config;
