import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ohhoburgers.pos',
  appName: 'OHHO POS',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://ohho-burgers.vercel.app/dashboard',
    androidScheme: 'https'
  }
};

export default config;
