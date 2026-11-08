// The version shown at the bottom of the account menu. vite.config.ts fills these in at build time.
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_ID__: string | undefined;
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : '';
export const versionLabel = () => `v${APP_VERSION}${BUILD_ID ? ` (${BUILD_ID})` : ''}`;
