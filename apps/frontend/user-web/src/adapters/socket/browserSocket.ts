import type { RuntimeConfigPort, SocketPort, SocketSubscription } from "@ops/user-core";
import { io, type Socket } from "socket.io-client";

interface CreateBrowserSocketOptions {
  runtimeConfig: RuntimeConfigPort;
  getAccessToken?: () => string | null | Promise<string | null>;
}

type SocketListener = (payload: unknown) => void;

const applySocketAuth = (
  targetSocket: Socket,
  token: string | null | undefined,
): void => {
  targetSocket.auth = token ? { token } : {};
};

const resolveSocketBaseUrl = (runtimeConfig: RuntimeConfigPort): string => {
  if (runtimeConfig.websocketBaseUrl?.trim()) {
    return runtimeConfig.websocketBaseUrl.trim();
  }

  if (/^https?:\/\//i.test(runtimeConfig.apiBaseUrl)) {
    return runtimeConfig.apiBaseUrl.replace(/\/api\/?$/i, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return runtimeConfig.apiBaseUrl;
};

export const createBrowserSocket = (options: CreateBrowserSocketOptions): SocketPort => {
  let socket: Socket | null = null;
  let connected = false;
  let lastError: string | undefined;
  const subscriptions = new Map<string, Set<SocketListener>>();

  const bindSubscription = (event: string, listener: SocketListener) => {
    if (!socket) {
      return;
    }

    socket.on(event, listener);
  };

  const ensureSocket = async (): Promise<Socket> => {
    if (socket) {
      return socket;
    }

    const token = await options.getAccessToken?.();
    const nextSocket = io(resolveSocketBaseUrl(options.runtimeConfig), {
      autoConnect: false,
      transports: ["websocket"],
    });
    applySocketAuth(nextSocket, token);

    nextSocket.on("connect", () => {
      connected = true;
      lastError = undefined;
    });
    nextSocket.on("disconnect", () => {
      connected = false;
    });
    nextSocket.on("connect_error", (error: Error) => {
      connected = false;
      lastError = error.message;
    });

    subscriptions.forEach((listeners, event) => {
      listeners.forEach((listener) => bindSubscription(event, listener));
    });

    socket = nextSocket;
    return nextSocket;
  };

  return {
    connect: async () => {
      const currentSocket = await ensureSocket();
      const token = await options.getAccessToken?.();
      applySocketAuth(currentSocket, token);
      if (currentSocket.connected) {
        connected = true;
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const handleConnect = () => {
          currentSocket.off("connect_error", handleError);
          resolve();
        };
        const handleError = (error: Error) => {
          currentSocket.off("connect", handleConnect);
          reject(error);
        };

        currentSocket.once("connect", handleConnect);
        currentSocket.once("connect_error", handleError);
        currentSocket.connect();
      });
    },
    disconnect: () => {
      socket?.disconnect();
      socket = null;
      connected = false;
      lastError = undefined;
    },
    emit: async (event, payload) => {
      const currentSocket = await ensureSocket();
      currentSocket.emit(event, payload);
    },
    subscribe: (event, listener): SocketSubscription => {
      const listeners = subscriptions.get(event) || new Set<SocketListener>();
      listeners.add(listener);
      subscriptions.set(event, listeners);
      bindSubscription(event, listener);

      return {
        unsubscribe: () => {
          listeners.delete(listener);
          if (listeners.size === 0) {
            subscriptions.delete(event);
          }
          socket?.off(event, listener);
        },
      };
    },
    getState: () => ({
      connected,
      lastError,
    }),
  };
};
