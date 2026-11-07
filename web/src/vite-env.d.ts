/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Injected by vite.config.ts; matches the `buildId` in version.json. */
declare const __BUILD_ID__: string

/** Injected by vite.config.ts from the CHIPS_UPLOAD_TOKEN build secret; "" when unset. */
declare const __CHIPS_UPLOAD_TOKEN__: string
