import { authStore } from "../auth/authStore";
import { browserRuntimeConfig } from "../runtime/browserRuntime";
import { createBrowserSocket } from "./browserSocket";

export const runtimeSocket = createBrowserSocket({
  runtimeConfig: browserRuntimeConfig,
  getAccessToken: async () => {
    const currentState = authStore.getState();
    return currentState.accessToken || null;
  },
});
