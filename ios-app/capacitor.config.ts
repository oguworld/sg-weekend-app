import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.dosuru',
  appName: 'おでかけNavi',
  webDir: '../public',
  ios: {
    contentInset: 'always',
  },
};

export default config;
