import { createAuthStore } from "@ops/user-core";
import { genericHost } from "./hosts/generic";

export interface SocialHost {
  name: string;
  openUrl(url: string): void;
}

export const bootstrapSocialPlatform = (host: SocialHost = genericHost) => {
  const authStore = createAuthStore();

  return {
    host,
    authStore,
  };
};
