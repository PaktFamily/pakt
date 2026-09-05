/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_FACTORY_ADDRESS?: string;
  readonly VITE_ROUTER_ADDRESS?: string;
  readonly VITE_QUOTE_PRICER_ADDRESS?: string;
  readonly VITE_LOCKER_ADDRESS?: string;
  readonly VITE_FEE_ESCROW_ADDRESS?: string;
  readonly VITE_LAUNCH_CONFIG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
