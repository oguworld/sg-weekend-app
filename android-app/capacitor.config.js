/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'app.dosuru',
  appName: 'SG在住Navi',
  webDir: '../public',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchFadeOutDuration: 300,
      backgroundColor: '#FAFAF8',
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

module.exports = config;
