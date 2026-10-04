import type { GamepadConfiguration, GamepadReport } from "../keyboard/gamepad";
import { fetchLocalService } from "./localServiceAccess";
import { hero68DeviceManager } from "./hero68/webhid";
import { hero68HallStream } from "./hero68/hallStream";
export type SharedHallSample = {
  keyId: string;
  pos: number;
  distanceUnits: number;
  adc: number;
  pressed: boolean;
  timestampMs: number;
  sequence: number;
  ageMs?: number;
};
export type HallKeyMetric = {
  pos: number;
  keyId: string;
  requestedHz: number;
  hz: number;
  intervalP99Ms: number;
  recentIntervalP99Ms?: number;
};
export type GamepadStatus = {
  firmwareRecoveryPending?: boolean;
  keyboardHookSupported?: boolean;
  fastInputSupported?: boolean;
  keyboardSuppressionActive?: boolean;
  keyboardSuppressionError?: string;
  driverAvailable?: boolean;
  xinputError?: number;
  actualReport?: GamepadReport;
  enabled: boolean;
  armed: boolean;
  stale: boolean;
  xinputVerified: boolean;
  userIndex: number;
  outputHz?: number;
  outputP99Ms?: number;
  neutralCount: number;
  error: string;
  report: GamepadReport;
  backend: "vigem";
  slot: number;
  configuration: GamepadConfiguration;
  capabilities: { gamepad: boolean; keyboardSuppression: boolean; keyboardHook?: boolean; fastInput?: boolean };
  hall: {
    consumers: { id: string; keys: string[]; hz: number }[];
    requests: number;
    timeouts: number;
    keys: HallKeyMetric[];
    nativeCpuPercent?: number;
    nativeRssMB?: number;
  };
  samples: SharedHallSample[];
};
export type GamepadInputFrame = Pick<GamepadStatus, "enabled" | "armed" | "stale" | "xinputVerified" | "report" | "samples"> & { sequence: number };
const endpoint = "http://127.0.0.1:16868";
export const VIGEMBUS_RELEASE = "https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0";
export const VIGEMBUS_DOWNLOAD = "https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe";
async function request(path: string, value?: unknown): Promise<GamepadStatus> {
  const r = await fetchLocalService(
    endpoint + path,
    {
      method: value === undefined ? "GET" : "POST",
      headers:
        value === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body: value === undefined ? undefined : JSON.stringify(value),
    },
    path === "/gamepad/start" ? 30000 : 5000,
  );
  const v = await r.json();
  if (!r.ok) throw Error(v.error ?? "Gamepad service unavailable");
  return v;
}
/** Stop and drain WebHID before giving the service ownership of the USB channel. */
export async function useSharedHallService() {
  if (hero68DeviceManager.viaService) return;
  if (
    hero68HallStream.getSnapshot().active ||
    hero68HallStream.getSnapshot().starting
  )
    await hero68HallStream.stop();
  if (hero68DeviceManager.connected) await hero68DeviceManager.disconnect();
  await hero68DeviceManager.connectViaService();
}
export const gamepadService = {
  inputStream(onFrame: (frame: GamepadInputFrame) => void, onError: () => void) {
    const stream = new EventSource(endpoint + "/gamepad/input/events");
    stream.onmessage = e => { try { onFrame(JSON.parse(e.data)); } catch { /* ignore invalid frame */ } };
    stream.onerror = onError;
    return () => stream.close();
  },
  status: () => request("/gamepad/status"),
  configure: (slot: number, configuration: GamepadConfiguration) =>
    request("/gamepad/config", { slot, configuration }),
  profile: (slot: number) => request("/gamepad/profile", { slot }),
  async start(slot: number, configuration: GamepadConfiguration) {
    await useSharedHallService();
    return request("/gamepad/start", { slot, configuration });
  },
  stop: () => request("/gamepad/stop", {}),
  stream(onStatus: (status: GamepadStatus) => void, onError: () => void) {
    const stream = new EventSource(endpoint + "/gamepad/events");
    stream.onmessage = (e) => {
      try {
        onStatus(JSON.parse(e.data));
      } catch {
        /* malformed event */
      }
    };
    stream.onerror = onError;
    return () => stream.close();
  },
};
