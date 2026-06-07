import type { SocketPort, SocketSubscription } from "@ops/user-core";

const noopSubscription: SocketSubscription = {
  unsubscribe: () => undefined,
};

export const noopSocket: SocketPort = {
  connect: () => undefined,
  disconnect: () => undefined,
  emit: () => undefined,
  subscribe: () => noopSubscription,
  getState: () => ({ connected: false }),
};
