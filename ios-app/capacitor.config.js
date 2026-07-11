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
      resize: 'none', // 設計書12フェーズ1（2026-07-11実施→同日ロールバック）: 'native'は実機でテキスト入力不可の重大回帰を起こしたため'none'に復元
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
