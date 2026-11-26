/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_URL?: string;
  /**
   * Backend origin used by Socket.IO, Google login and static assets.
   * Required in production when VITE_API_BASE_URL is the same-origin `/api`
   * proxy path.
   */
  readonly VITE_BACKEND_ORIGIN?: string;
  /** Optional Socket.IO server override; defaults to VITE_BACKEND_ORIGIN. */
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google Sign-In Types
interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
        }) => void;
        renderButton: (
          parent: HTMLElement,
          options: {
            theme?: 'outline' | 'filled_blue' | 'filled_black';
            size?: 'large' | 'medium' | 'small';
            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
            shape?: 'rectangular' | 'pill' | 'circle' | 'square';
            width?: string | number;
            logo_alignment?: 'left' | 'center';
          }
        ) => void;
        prompt: () => void;
      };
    };
  };
}
