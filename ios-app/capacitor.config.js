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
      resize: 'none', // キーボードがWebViewを縮小しない → ナビの上に被さる自然な挙動
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
