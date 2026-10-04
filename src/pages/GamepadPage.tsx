import { useEffect, useMemo, useRef, useState } from "react";
import {
  Gamepad2,
  Info,
  RefreshCw,
  Download,
  Upload,
  RotateCcw,
} from "lucide-react";
import GamepadKeyboardPreview from "../components/GamepadKeyboardPreview";
import GamepadLiveControls from "../components/GamepadLiveControls";
import {GamepadLiveStore} from "../protocol/gamepadLive";
import GamepadControlIcon from "../components/GamepadControlIcon";
import GamepadDragPreview from "../components/GamepadDragPreview";
import { AppSelect } from "../app/components/AppSelect";
import { useI18n } from "../i18n";
import { HERO68_LAYOUT } from "../keyboard/hero68Layout";
import {
  defaultGamepad,
  restoreGamepad,
  validateGamepad,
  mapGamepad,
  GAMEPAD_ACTIONS,
  isAnalogAction,
  CURVE_PRESETS,
  type GamepadAction,
  type GamepadConfiguration,
  type CurvePoint,
} from "../keyboard/gamepad";
import { gamepadService, VIGEMBUS_DOWNLOAD, type GamepadStatus } from "../protocol/gamepadService";
import { gamepadAccess } from "../protocol/gamepadAccess";
import { GamepadAutoApply, type GamepadSaveState } from "../protocol/gamepadAutoApply";
import "./GamepadPage.css";
const storage = "openhero68:gamepad:v1";
const neutralLighting = Object.fromEntries(
  HERO68_LAYOUT.flat().map((k) => [k.id, "#35393b"]),
);
const palette: GamepadAction[] = [
  "A",
  "B",
  "X",
  "Y",
  "Start",
  "Back",
  "Guide",
  "Up",
  "Down",
  "Left",
  "Right",
  "LUp",
  "LDown",
  "LLeft",
  "LRight",
  "LClick",
  "RUp",
  "RDown",
  "RLeft",
  "RRight",
  "RClick",
  "LB",
  "LT",
  "RB",
  "RT",
];
function load(slot: number) {
  try {
    return restoreGamepad(
      JSON.parse(localStorage.getItem(storage) ?? "{}")[slot],
    );
  } catch {
    return defaultGamepad();
  }
}
function hasDraft(slot: number) {
  try {
    return Boolean(JSON.parse(localStorage.getItem(storage) ?? "{}")[slot]);
  } catch {
    return false;
  }
}
function save(slot: number, value: GamepadConfiguration) {
  try {
    const v = JSON.parse(localStorage.getItem(storage) ?? "{}");
    v[slot] = value;
    localStorage.setItem(storage, JSON.stringify(v));
  } catch {
    /* retain draft in memory */
  }
}
const physicalLabel = (id: string) =>
  HERO68_LAYOUT.flat().find((k) => k.id === id)?.label ?? id;
const actionLabel = (a: GamepadAction) =>
  (
    ({
      LUp: "L ↑",
      LDown: "L ↓",
      LLeft: "L ←",
      LRight: "L →",
      RUp: "R ↑",
      RDown: "R ↓",
      RLeft: "R ←",
      RRight: "R →",
      LClick: "L ⦿",
      RClick: "R ⦿",
    }) as Record<string, string>
  )[a] ?? a;
const VI: Record<string, string> = {
  "Changes apply automatically": "Thay đổi được áp dụng tự động",
  "Applying changes…": "Đang áp dụng…",
  "Waiting to sync": "Đang chờ đồng bộ",
  "Could not sync changes": "Chưa đồng bộ được thay đổi",
  "Drop onto a key": "Thả vào phím để gán",
  "Uses this key's Actuation Point and Rapid Trigger settings.": "Dùng Actuation Point và Rapid Trigger đã đặt cho phím này.",
  "Digital button · Actuation Point + Rapid Trigger": "Nút digital · Actuation Point + Rapid Trigger",
  "Analog stick and trigger travel is independent of Actuation Point and Rapid Trigger. Digital buttons follow the keyboard settings.": "Hành trình stick và trigger analog độc lập với Actuation Point và Rapid Trigger. Nút digital dùng cài đặt của bàn phím.",
"Windows hook fallback":"Hook Windows dự phòng",
"Off by default. Firmware blocking is preferred; enable this only when you need the Windows hook fallback.":"Mặc định tắt. Ưu tiên chặn từ firmware; chỉ bật khi cần dùng hook Windows dự phòng.",
"Windows hooking can conflict with anti-cheat. Turn off Gamepad and this fallback before playing VALORANT or League of Legends (Vanguard), Fortnite (EAC), or other games using kernel anti-cheat. Other games may work if their rules allow it; user-mode anti-cheat is not a guarantee.":"Hook Windows có thể xung đột với anti-cheat. Hãy tắt Gamepad và phương án hook trước khi chơi VALORANT, League of Legends (Vanguard), Fortnite (EAC) hoặc game có anti-cheat kernel khác. Các game khác có thể dùng được nếu quy định cho phép; anti-cheat user mode không bảo đảm tương thích.",
"Mapped keys can be disabled directly in firmware and restored when Gamepad stops.":"Có thể vô hiệu hóa phím đã gán ngay từ firmware và khôi phục khi tắt Gamepad.",
"Firmware: mapped keys use empty action 0x00000000. Original remaps are backed up and restored on Stop.":"Firmware: phím đã gán dùng empty action 0x00000000. Remap gốc được sao lưu và khôi phục khi Stop.",
"Fallback: Windows WH_KEYBOARD_LL. It affects matching keys on every keyboard and may not block Raw Input.":"Dự phòng: Windows WH_KEYBOARD_LL. Chặn phím cùng mã trên mọi bàn phím và có thể không chặn được Raw Input.",
"Update the full Windows service package to 0.4.1 or later for mapped-key blocking.":"Cập nhật gói Windows service đầy đủ lên 0.4.1 hoặc mới hơn để chặn phím đã gán.",
"Keyboard remap recovery is pending. Reconnect the original HERO68; Stop retries recovery.":"Đang chờ khôi phục remap. Kết nối lại HERO68 ban đầu; nhấn Stop để thử khôi phục.",
  "Background service required": "Cần Windows service",
  "ViGEmBus required": "Cần driver ViGEmBus",
  "Service update required": "Cần cập nhật service",
  "Download Windows service": "Tải Windows service",
  "Check again": "Kiểm tra lại",
  "Run the Windows service to configure and use Gamepad.":
    "Chạy Windows service để cấu hình và sử dụng Gamepad.",
  "Install ViGEmBus v1.22.0, restart the Windows service, then check again.":
    "Cài ViGEmBus v1.22.0, khởi động lại Windows service, rồi kiểm tra lại.",
  "Your HERO68 can work as an Xbox controller, using analog key travel.":
    "HERO68 có thể hoạt động như tay cầm Xbox với hành trình phím analog.",
  "Controller type": "Loại tay cầm",
  "Polling rate": "Tần số tay cầm",
  "Test Gamepad": "Kiểm tra tay cầm",
  "Start Gamepad to view live controller input.":
    "Bật Gamepad để xem đầu vào tay cầm trực tiếp.",
  Diagnostics: "Thông tin chi tiết",
  "Adjust the forward diagonal angle from 30° to 60°.":
    "Điều chỉnh góc di chuyển chéo về phía trước từ 30° đến 60°.",
  "Stop Gamepad": "Tắt Gamepad",
  "Snappy uses the stronger direction. Equal opposing inputs cancel.":
    "Snappy chọn hướng mạnh hơn. Hai hướng mạnh bằng nhau trả về giữa.",
  "Circle limits diagonal travel; square allows both axes to reach full output.":
    "Circle giới hạn di chuyển chéo; square cho phép cả hai trục đạt tối đa.",
  Output: "Đầu ra",
  "Stale samples": "Mẫu quá hạn",
  "Setup & Remap": "Thiết lập & Gán phím",
  Configuration: "Cấu hình",
  "Gamepad Tester": "Kiểm tra tay cầm",
  "Enable Gamepad": "Bật Gamepad",
  "Apply configuration": "Áp dụng cấu hình",
  "Controller Mapping": "Gán tay cầm",
  "Drag a control onto a key, or select a key and click a control. Right-click a key to remove its binding.":
    "Kéo nút vào phím, hoặc chọn phím rồi chọn nút tay cầm. Chuột phải để xóa.",
  "Analog Curve": "Đường cong analog",
  Response: "Phản hồi",
  "Snappy Joystick": "Snappy Joystick",
  "Square joystick output": "Đầu ra joystick vuông",
  "Angle adjustment": "Điều chỉnh góc",
  "Start travel": "Bắt đầu hành trình",
  "Full output at": "Đạt đầu ra tối đa tại",
  "Keep keyboard keys": "Giữ phím bàn phím",
  "Mapped-key override": "Chặn phím đã gán",
  "Keyboard suppression is not verified on HERO68. Unbind duplicate keyboard controls in your game.":
    "Chặn phím chưa được xác minh trên HERO68. Bỏ gán phím trùng trong game.",
  "Waiting for all bound keys to rest": "Chờ thả tất cả phím đã gán",
  Running: "Đang chạy",
  Stopped: "Đã tắt",
  Demo: "Mô phỏng",
  "Try demo": "Thử mô phỏng",
  "Release all": "Thả tất cả",
  "Service unavailable": "Service chưa khả dụng",
  "Install ViGEmBus": "Cài ViGEmBus",
  "ViGEmBus ready": "ViGEmBus sẵn sàng",
  "ViGEmBus unavailable": "ViGEmBus chưa khả dụng",
  "Update the Windows service to 0.4.0 or later.":
    "Cập nhật Windows service lên 0.4.0 hoặc mới hơn.",
  Requested: "Yêu cầu",
  Measured: "Thực tế",
  "Hall consumers": "Consumer Hall",
  Import: "Nhập",
  Export: "Xuất",
  Reset: "Đặt lại",
  "Unsaved changes": "Chưa áp dụng",
  Applied: "Đã áp dụng",
  "XInput verified": "XInput đã xác minh",
  "XInput pending": "Đang chờ XInput",
  "No gamepad binding selected": "Chưa chọn phím gán tay cầm",
  "Hall scanning follows active features; opening this editor does not start polling.":
    "Chỉ quét Hall khi tính năng đang chạy; mở editor không bắt đầu polling.",
  "Loading service": "Đang kiểm tra service",
  "Gamepad response is independent of Actuation Point and Rapid Trigger.":
    "Analog Gamepad độc lập với Actuation Point và Rapid Trigger.",
  "Choose a preset": "Chọn preset",
  "Add curve point": "Thêm điểm curve",
  "Remove curve point": "Xóa điểm curve",
};
export default function GamepadPage({
  slot,
  busy: profileBusy = false,
  onSetup,
}: {
  slot: number;
  busy?: boolean;
  onSetup: () => void;
}) {
  const { language } = useI18n(),
    t = (s: string) => (language === "vi" ? (VI[s] ?? s) : s);
  const [config, setConfig] = useState(() => load(slot)),
    [tab, setTab] = useState<"setup" | "configuration" | "tester">("setup"),
    [selected, setSelected] = useState<string | null>(null),
    [status, setStatus] = useState<GamepadStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [serviceConnected, setServiceConnected] = useState(false),
    [connectionAttempt, setConnectionAttempt] = useState(0),
    [saveState, setSaveState] = useState<GamepadSaveState>("saved"),
    [dragged, setDragged] = useState<{action:GamepadAction;x:number;y:number}|null>(null),
    [dropTarget, setDropTarget] = useState<string|null>(null),
    [assigned, setAssigned] = useState<{keyId:string;sequence:number}|null>(null),
    [curveDragging, setCurveDragging] = useState(false),
    [demo, setDemo] = useState(false),
    [demoSamples, setDemoSamples] = useState<
      Record<string, { distanceMm: number; pressed: boolean }>
    >({}),
    [point, setPoint] = useState(1);
  const file = useRef<HTMLInputElement>(null),
    curveSvg = useRef<SVGSVGElement>(null),
    drag = useRef<number | null>(null),
    mounted = useRef(true),
    restoreFromService = useRef(!hasDraft(slot));
  const emptyDragImage = useRef<HTMLSpanElement>(null);
  const curveBeforeDrag = useRef<CurvePoint[] | null>(null);
  const autoApply = useRef<GamepadAutoApply<GamepadStatus> | null>(null);
  useEffect(() => {
    if (!curveDragging) save(slot, config);
  }, [slot, config, curveDragging]);
  useEffect(() => {
    mounted.current = true;
    let active = true,
      streamRevision = 0,
      close: (() => void) | undefined;
    close = gamepadService.stream(
      (v) => {
        if (active) {
          streamRevision++;
          if (restoreFromService.current && v.slot === slot) {
            restoreFromService.current = false;
            setConfig(restoreGamepad(v.configuration));
          }
          setStatus(v);
          setServiceConnected(true);
          setLoading(false);
          setError((previous) =>
            previous === t("Service unavailable") ? "" : previous,
          );
        }
      },
      () => {
        if (active) {
          streamRevision++;
          setLoading(false);
          setStatus(null);
          setServiceConnected(false);
        }
      },
    );
    gamepadService
      .status()
      .then((v) => {
        if (!active || streamRevision !== 0) return;
        if (restoreFromService.current && v.slot === slot) {
          restoreFromService.current = false;
          setConfig(restoreGamepad(v.configuration));
        }
        setStatus(v);
        setServiceConnected(true);
      })
      .catch(() => {
        if (active && streamRevision === 0) setStatus(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      close?.();
    };
  }, [connectionAttempt]);
  const access = gamepadAccess(status, loading, serviceConnected),
    locked = access !== "ready",
    // Keep controls inert while checking, without flashing the missing-service
    // overlay on every mount. A retry keeps an already confirmed gate visible.
    showGate = locked && (access !== "checking" || connectionAttempt > 0);
  const refreshConnection = () => {
    setLoading(true);
    setStatus(null);
    setServiceConnected(false);
    setError("");
    setConnectionAttempt((n) => n + 1);
  };
  useEffect(() => {
    let active = true;
    const queue = new GamepadAutoApply(
      (draft) => gamepadService.configure(slot, draft),
      (value) => { if (active) setStatus(value); },
      (phase, failure) => {
        if (!active) return;
        setSaveState(phase);
        if (phase === 'error') setError(failure instanceof Error ? failure.message : String(failure));
        else if (phase === 'saving') setError('');
      },
    );
    autoApply.current = queue;
    return () => { active = false; queue.dispose(); };
  }, [slot]);
  useEffect(() => {
    autoApply.current?.setAvailable(!locked && !profileBusy && !curveDragging);
    autoApply.current?.update(config, status?.slot === slot ? status.configuration : undefined);
  }, [config, locked, profileBusy, slot, curveDragging]);
  const liveStore=useMemo(()=>new GamepadLiveStore(),[]);
  useEffect(()=>{document.addEventListener("visibilitychange",liveStore.visibility);return()=>{document.removeEventListener("visibilitychange",liveStore.visibility);liveStore.dispose()}},[liveStore]);
  const samples = useMemo(
    () =>
      demo && tab === "tester"
        ? demoSamples
        : Object.fromEntries(
            (status?.samples ?? [])
              .filter((s) => (s.ageMs ?? 0) < 50)
              .map((s) => [
                s.keyId,
                { distanceMm: s.distanceUnits / 100, pressed: s.pressed },
              ]),
          ),
    [demo, demoSamples, status, tab],
  );
  const report =
    demo && tab === "tester"
      ? mapGamepad(config, samples)
      : (status?.report ?? mapGamepad(config, {}));
  useEffect(()=>{liveStore.configure(tab==='tester'&&!locked,status,demo?{report,samples:Object.entries(demoSamples).map(([keyId,s])=>({keyId,pos:0,adc:0,distanceUnits:s.distanceMm*100,pressed:s.pressed,timestampMs:0,sequence:1,ageMs:0})),source:'demo'}:null)},[liveStore,tab,locked,status,demo,demoSamples,config]);
  const labels = Object.fromEntries(
      config.bindings.map((b) => [b.keyId, actionLabel(b.action)]),
    ),
    binding = config.bindings.find((b) => b.keyId === selected);
  const measuredKeys = (status?.hall.keys ?? []).filter((k) =>
    config.bindings.some((b) => b.keyId === k.keyId && isAnalogAction(b.action)),
  );
  const measuredHz = measuredKeys.length
    ? Math.min(...measuredKeys.map((k) => k.hz)).toFixed(1)
    : "—";
  const disabled = busy || profileBusy || locked;
  function patch(next: Partial<GamepadConfiguration>) {
    restoreFromService.current = false;
    setConfig((c) => ({ ...c, ...next }));
  }
  function assign(keyId: string, action: GamepadAction) {
    restoreFromService.current = false;
    setConfig((c) => ({
      ...c,
      bindings: [
        ...c.bindings.filter((b) => b.keyId !== keyId),
        { keyId, action, startMm: 0.1, endMm: 3.4 },
      ],
    }));
    setSelected(keyId);
    setAssigned({keyId,sequence:Date.now()});
  }
  useEffect(() => {
    if (!assigned) return;
    const timer = setTimeout(() => setAssigned(null), 700);
    return () => clearTimeout(timer);
  }, [assigned]);
  useEffect(() => {
    if (locked || profileBusy) { setDragged(null); setDropTarget(null); }
    if ((locked || profileBusy) && drag.current !== null) finishCurve(true);
  }, [locked, profileBusy]);
  function finishCurve(cancel = false) {
    if (drag.current === null) return;
    if (cancel && curveBeforeDrag.current) patch({curve:curveBeforeDrag.current});
    curveBeforeDrag.current = null;
    drag.current = null;
    setCurveDragging(false);
  }
  useEffect(() => {
    if (!curveDragging) return;
    if (tab !== 'configuration') { finishCurve(true); return; }
    const cancel = () => finishCurve(true);
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility); };
  }, [curveDragging, tab]);
  async function action(start: boolean) {
    if (locked) return;
    setBusy(true);
    if (start) setDemo(false);
    setError("");
    try {
      if (!status?.capabilities?.gamepad)
        throw Error(t("Update the Windows service to 0.4.0 or later."));
      await autoApply.current?.run(() => start
        ? gamepadService.start(slot, config)
        : gamepadService.stop());
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function exportConfig() {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ version: 1, slot, configuration: config }, null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `HERO68-gamepad-P${slot + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const changeCurve = (index: number, x: number, y: number) => {
    if (disabled || index <= 0 || index >= config.curve.length - 1) return;
    const next = config.curve.map((p) => [...p] as CurvePoint),
      before = next[index - 1],
      after = next[index + 1],
      gap = Math.min(0.005, (after[0] - before[0]) / 3);
    next[index] = [
      Math.max(before[0] + gap, Math.min(after[0] - gap, x)),
      Math.max(before[1], Math.min(after[1], y)),
    ];
    patch({ curve: next });
  };
  const toggleDemoKey = (id: string) => {
    if (!demo) return;
    setDemoSamples((v) => ({
      ...v,
      [id]: { distanceMm: v[id]?.pressed ? 0 : 3.4, pressed: !v[id]?.pressed },
    }));
  };
  return (
    <div className="gp-gate page-enter">
      <span ref={emptyDragImage} className="gp-empty-drag-image" aria-hidden="true"/>
      {dragged && <GamepadDragPreview {...dragged} label={t("Drop onto a key")}/>}
      <div
        className={`gamepad-page ${showGate ? "gp-locked" : ""}`}
        inert={locked}
        aria-busy={loading}
      >
        <div className="gp-heading">
          <h2>
            <Gamepad2 size={23} /> Gamepad <small>P{slot + 1}</small>
          </h2>
          <div className="gp-tabs" role="tablist" aria-label="Gamepad">
            {(["setup", "configuration", "tester"] as const).map((id, i) => (
              <button
                role="tab"
                aria-selected={tab === id}
                aria-controls={"gp-" + id}
                id={"gp-tab-" + id}
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {t(["Setup & Remap", "Configuration", "Gamepad Tester"][i])}
              </button>
            ))}
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 65536) throw Error("File too large");
              const v = JSON.parse(await f.text());
              patch(validateGamepad(v.configuration ?? v));
              setError("");
            } catch (err) {
              setError(String(err));
            }
            e.target.value = "";
          }}
        />
        <div className="gp-keyboard">
          <GamepadKeyboardPreview
            lightingSource="local"
            lightingFrame={neutralLighting}
            selectedKeys={new Set(selected ? [selected] : [])}
            liveStore={liveStore}
            keyLabels={labels}
            keyDecorations={{...Object.fromEntries(config.bindings.map(b=>[b.keyId,<span key={`${b.keyId}:${assigned?.keyId===b.keyId?assigned.sequence:0}`} className={assigned?.keyId===b.keyId?'gp-assigned-pop':''}><GamepadControlIcon action={b.action}/></span>])),...(dropTarget&&dragged?{[dropTarget]:<span className="gp-drop-preview"><GamepadControlIcon action={dragged.action}/></span>}:{})}}
            keyClassNames={Object.fromEntries(HERO68_LAYOUT.flat().map(k=>[k.id,k.id===dropTarget&&dragged?'gp-drop-target':'']))}
            keyTooltips={Object.fromEntries(
              config.bindings.map((b) => [
                b.keyId,
                {
                  title: `${physicalLabel(b.keyId)} → ${actionLabel(b.action)}`,
                  detail: isAnalogAction(b.action) ? `${b.startMm.toFixed(2)}–${b.endMm.toFixed(2)} mm` : t("Digital button · Actuation Point + Rapid Trigger"),
                },
              ]),
            )}
            onToggleKey={(id) => {
              setSelected(id);
              if (tab === "tester") toggleDemoKey(id);
            }}
            onDropKey={(id, e) => {
              e.preventDefault();
              setDragged(null);setDropTarget(null);
              if (disabled) return;
              const a = e.dataTransfer.getData(
                "application/x-openhero-gamepad",
              ) as GamepadAction;
              if (GAMEPAD_ACTIONS.includes(a)) assign(id, a);
            }}
            onDragOverKey={(id,e)=>{if(dragged&&!disabled){e.dataTransfer.dropEffect='copy';setDropTarget(id)}}}
            onDragLeaveKey={(id)=>setDropTarget(current=>current===id?null:current)}
            onRemoveKey={(id) => {
              if (!disabled)
                patch({
                  bindings: config.bindings.filter((b) => b.keyId !== id),
                });
            }}
            overlayMode={tab === "tester" ? "stream" : "none"}
            streamPreviewValues={Object.fromEntries(
              Object.entries(samples).map(([id, s]) => [
                id,
                { distanceMm: s.distanceMm, rawAdc: 0, pressed: s.pressed },
              ]),
            )}
          />
        </div>
        {error && (
          <p className="gp-error" role="alert">
            {error}
          </p>
        )}
        <div className="gp-status">
          <span className={status?.enabled ? "on" : ""}>
            {t(
              loading
                ? "Loading service"
                : demo && tab === "tester"
                  ? "Demo"
                  : status?.enabled
                    ? status.armed
                      ? "Running"
                      : "Waiting for all bound keys to rest"
                    : status
                      ? "Stopped"
                      : "Service unavailable",
            )}
          </span>
          <span>
            {config.rate} Hz {t("Requested")}
          </span>
          <span>
            {measuredHz} Hz {t("Measured")}
          </span>
          <span role="status">{t(saveState === 'saving' ? "Applying changes…" : saveState === 'pending' ? "Waiting to sync" : saveState === 'error' ? "Could not sync changes" : "Applied")}</span>
        </div>
        {tab === "setup" && (
          <div
            role="tabpanel"
            id="gp-setup"
            aria-labelledby="gp-tab-setup"
            className="gp-columns"
          >
            <section className="gp-card">
              <div className="gp-card-heading">
                <h3>{t("Enable Gamepad")}</h3>
                <button
                  className="gp-enable-switch"
                  role="switch"
                  aria-checked={status?.enabled === true}
                  aria-label={t("Enable Gamepad")}
                  disabled={disabled || loading}
                  onClick={() => void action(!status?.enabled)}
                >
                  <span />
                </button>
              </div>
              <p>
                {t(
                  "Your HERO68 can work as an Xbox controller, using analog key travel.",
                )}
              </p>
              <label>
                <span className="gp-field-title">{t("Controller type")}</span>
                <AppSelect
                  value="xbox"
                  options={[
                    { value: "xbox", label: "Xbox Controller (XInput)" },
                  ]}
                  label="Controller type"
                  onChange={() => {}}
                />
              </label>
              <label>
                <span className="gp-field-title">{t("Polling rate")}</span>
                <AppSelect
                  value={config.rate}
                  options={[50, 100, 200].map((value) => ({
                    value,
                    label: `${value} Hz`,
                  }))}
                  label="Polling rate"
                  disabled={disabled}
                  onChange={(v) => patch({ rate: v as 50 | 100 | 200 })}
                />
              </label>
              <div className="gp-info">
                <Info size={20} />
                <p>
                  {t(
                    config.keyboardSuppressionMode === "hook" ? "Windows hooking can conflict with anti-cheat. Turn off Gamepad and this fallback before playing VALORANT or League of Legends (Vanguard), Fortnite (EAC), or other games using kernel anti-cheat. Other games may work if their rules allow it; user-mode anti-cheat is not a guarantee." : "Mapped keys can be disabled directly in firmware and restored when Gamepad stops.",
                  )}
                </p>
              </div>
            </section>
            <section className="gp-card">
              <h3>{t("Controller Mapping")}</h3>
              <p>
                {t(
                  "Drag a control onto a key, or select a key and click a control. Right-click a key to remove its binding.",
                )}
              </p>
              <div className="gp-palette">
                {palette.map((a) => (
                  <button
                    key={a}
                    className={"gp-action gp-action-" + a + (dragged?.action===a?' is-dragging':'')}
                    draggable={!disabled}
                    disabled={disabled}
                    aria-label={"Bind " + a}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-openhero-gamepad",a);
                      e.dataTransfer.effectAllowed='copy';
                      if(emptyDragImage.current)e.dataTransfer.setDragImage(emptyDragImage.current,0,0);
                      setDragged({action:a,x:e.clientX,y:e.clientY});
                    }}
                    onDragEnd={()=>{setDragged(null);setDropTarget(null)}}
                    onClick={() => selected && assign(selected, a)}
                  >
                    <GamepadControlIcon action={a} />
                  </button>
                ))}
              </div>
              <div className="gp-binding">
                <strong>
                  {binding
                    ? `${physicalLabel(binding.keyId)} → ${actionLabel(binding.action)}`
                    : t("No gamepad binding selected")}
                </strong>
                {binding && isAnalogAction(binding.action) && (
                  <>
                    <label>
                      {t("Start travel")}
                      <input
                        type="number"
                        min="0"
                        max={binding.endMm - 0.01}
                        step=".01"
                        value={binding.startMm}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          if (
                            Number.isFinite(n) &&
                            n >= 0 &&
                            n <= binding.endMm - 0.01
                          )
                            patch({
                              bindings: config.bindings.map((b) =>
                                b === binding ? { ...b, startMm: n } : b,
                              ),
                            });
                        }}
                      />
                    </label>
                    <label>
                      {t("Full output at")}
                      <input
                        type="number"
                        min={binding.startMm + 0.01}
                        max="3.4"
                        step=".01"
                        value={binding.endMm}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          if (
                            Number.isFinite(n) &&
                            n >= binding.startMm + 0.01 &&
                            n <= 3.4
                          )
                            patch({
                              bindings: config.bindings.map((b) =>
                                b === binding ? { ...b, endMm: n } : b,
                              ),
                            });
                        }}
                      />
                    </label>
                  </>
                )}
                {binding && !isAnalogAction(binding.action) && <p className="gp-digital-note"><Info size={16}/>{t("Uses this key's Actuation Point and Rapid Trigger settings.")}</p>}
              </div>
              <label className="gp-switch">
                {t("Keep keyboard keys")}
                <input type="checkbox" role="switch" checked={!config.suppressMappedKeys} disabled={disabled || !status?.capabilities.keyboardSuppression} onChange={e=>patch({suppressMappedKeys:!e.target.checked})}/>
              </label>
              <label className="gp-switch">
                {t("Mapped-key override")}
                <input type="checkbox" role="switch" checked={config.suppressMappedKeys} disabled={disabled || !status?.capabilities.keyboardSuppression} onChange={e=>patch({suppressMappedKeys:e.target.checked})}/>
              </label>
              <p>{t(config.keyboardSuppressionMode==='hook' ? "Fallback: Windows WH_KEYBOARD_LL. It affects matching keys on every keyboard and may not block Raw Input." : "Firmware: mapped keys use empty action 0x00000000. Original remaps are backed up and restored on Stop.")}</p>
              {!status?.capabilities.keyboardSuppression&&<p>{t("Update the full Windows service package to 0.4.1 or later for mapped-key blocking.")}</p>}
              {status?.keyboardSuppressionError&&<p className="gp-error" role="alert">{status.keyboardSuppressionError}</p>}
              {status?.firmwareRecoveryPending&&<p className="gp-error" role="alert">{t("Keyboard remap recovery is pending. Reconnect the original HERO68; Stop retries recovery.")}</p>}
            </section>
          </div>
        )}
        {tab === "configuration" && (
          <div
            role="tabpanel"
            id="gp-configuration"
            aria-labelledby="gp-tab-configuration"
            className="gp-columns"
          >
            <section className="gp-card">
              <h3>{t("Analog Curve")}</h3>
              <svg
                ref={curveSvg}
                className="gp-curve"
                viewBox="0 0 320 250"
                onPointerMove={(e) => {
                  if (drag.current === null || disabled) return;
                  const rect = curveSvg.current!.getBoundingClientRect();
                  changeCurve(
                    drag.current,
                    (((e.clientX - rect.left) / rect.width) * 320 - 30) / 270,
                    (220 - ((e.clientY - rect.top) / rect.height) * 250) / 200,
                  );
                }}
                onPointerUp={() => finishCurve()}
                onPointerCancel={() => finishCurve(true)}
                onLostPointerCapture={() => finishCurve(true)}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                  <g key={n}>
                    <line
                      x1={30 + 270 * n}
                      x2={30 + 270 * n}
                      y1="20"
                      y2="220"
                    />
                    <line
                      x1="30"
                      x2="300"
                      y1={220 - 200 * n}
                      y2={220 - 200 * n}
                    />
                  </g>
                ))}
                <polygon
                  points={
                    "30,220 " +
                    config.curve
                      .map(([x, y]) => `${30 + x * 270},${220 - y * 200}`)
                      .join(" ") +
                    " 300,220"
                  }
                />
                <polyline
                  points={config.curve
                    .map(([x, y]) => `${30 + x * 270},${220 - y * 200}`)
                    .join(" ")}
                />
                {config.curve.map(([x, y], i) => (
                  <circle
                    key={i}
                    role="slider"
                    tabIndex={i > 0 && i < config.curve.length - 1 ? 0 : -1}
                    aria-label={"Curve point " + i}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(y * 100)}
                    cx={30 + x * 270}
                    cy={220 - y * 200}
                    r="6"
                    onPointerDown={(e) => {
                      setPoint(i);
                        if(disabled || e.button!==0 || !e.isPrimary || i===0 || i===config.curve.length-1)return;
                      curveBeforeDrag.current = config.curve.map(p=>[...p] as CurvePoint);
                      autoApply.current?.setAvailable(false);
                      setCurveDragging(true);
                      drag.current = i;
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onKeyDown={(e) => {
                      if (
                        [
                          "ArrowUp",
                          "ArrowDown",
                          "ArrowLeft",
                          "ArrowRight",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        changeCurve(
                          i,
                          x +
                            (e.key === "ArrowRight"
                              ? 0.01
                              : e.key === "ArrowLeft"
                                ? -0.01
                                : 0),
                          y +
                            (e.key === "ArrowUp"
                              ? 0.01
                              : e.key === "ArrowDown"
                                ? -0.01
                                : 0),
                        );
                      }
                    }}
                  />
                ))}
                <text x="30" y="244">
                  0%
                </text>
                <text x="270" y="244">
                  100%
                </text>
              </svg>
              <p className="gp-field-title">{t("Choose a preset")}</p>
              <div className="gp-presets">
                {Object.keys(CURVE_PRESETS).map((name) => (
                  <button
                    key={name}
                    className={
                      JSON.stringify(config.curve) ===
                      JSON.stringify(CURVE_PRESETS[name])
                        ? "active"
                        : ""
                    }
                    disabled={disabled}
                    onClick={() => {
                      patch({
                        curve: CURVE_PRESETS[name].map(
                          (p) => [...p] as CurvePoint,
                        ),
                      });
                      setPoint(1);
                    }}
                  >
                    <svg viewBox="0 0 60 44" aria-hidden="true">
                      <polyline
                        points={CURVE_PRESETS[name]
                          .map(([x, y]) => `${4 + 52 * x},${40 - 36 * y}`)
                          .join(" ")}
                      />
                    </svg>
                    <span>{name}</span>
                  </button>
                ))}
              </div>
              <div className="gp-tools">
                <button
                  disabled={disabled || config.curve.length >= 16}
                  onClick={() => {
                    let index = 1;
                    for (let i = 2; i < config.curve.length; i++)
                      if (
                        config.curve[i][0] - config.curve[i - 1][0] >
                        config.curve[index][0] - config.curve[index - 1][0]
                      )
                        index = i;
                    const a = config.curve[index - 1],
                      b = config.curve[index];
                    const curve = [...config.curve];
                    curve.splice(index, 0, [
                      (a[0] + b[0]) / 2,
                      (a[1] + b[1]) / 2,
                    ]);
                    patch({ curve });
                    setPoint(index);
                  }}
                >
                  {t("Add curve point")}
                </button>
                <button
                  disabled={
                    disabled || point <= 0 || point >= config.curve.length - 1
                  }
                  onClick={() => {
                    patch({
                      curve: config.curve.filter((_, i) => i !== point),
                    });
                    setPoint(1);
                  }}
                >
                  {t("Remove curve point")}
                </button>
              </div>
            </section>
            <section className="gp-card">
              <h3>{t("Response")}</h3>
              <div className="gp-response-setting">
                <label className="gp-switch">{t("Windows hook fallback")}<input type="checkbox" role="switch" checked={config.keyboardSuppressionMode==='hook'} disabled={disabled || !status?.capabilities.keyboardHook} onChange={e=>patch({keyboardSuppressionMode:e.target.checked?'hook':'firmware'})}/></label>
                <p>{t("Off by default. Firmware blocking is preferred; enable this only when you need the Windows hook fallback.")}</p>
                {config.keyboardSuppressionMode==='hook'&&<p className="gp-warning" role="note">{t("Windows hooking can conflict with anti-cheat. Turn off Gamepad and this fallback before playing VALORANT or League of Legends (Vanguard), Fortnite (EAC), or other games using kernel anti-cheat. Other games may work if their rules allow it; user-mode anti-cheat is not a guarantee.")}</p>}
              </div>
              <p>
                {t(
                  "Analog stick and trigger travel is independent of Actuation Point and Rapid Trigger. Digital buttons follow the keyboard settings.",
                )}
              </p>
              {(
                [
                  ["angleEnabled", "Angle adjustment"],
                  ["square", "Square joystick output"],
                  ["snappy", "Snappy Joystick"],
                ] as const
              ).map(([key, label]) => (
                <div className="gp-response-setting" key={key}>
                  <label className="gp-switch">
                    {t(label)}
                    <input
                      type="checkbox"
                      role="switch"
                      checked={config[key]}
                      disabled={disabled}
                      onChange={(e) => patch({ [key]: e.target.checked })}
                    />
                  </label>
                  <p>
                    {t(
                      key === "angleEnabled"
                        ? "Adjust the forward diagonal angle from 30° to 60°."
                        : key === "square"
                          ? "Circle limits diagonal travel; square allows both axes to reach full output."
                          : "Snappy uses the stronger direction. Equal opposing inputs cancel.",
                    )}
                  </p>
                  {key === "angleEnabled" && config.angleEnabled && (
                    <label className="gp-angle">
                      {config.angle}°
                      <input
                        aria-label={t("Angle adjustment")}
                        type="range"
                        min="30"
                        max="60"
                        disabled={disabled}
                        value={config.angle}
                        onChange={(e) =>
                          patch({ angle: e.target.valueAsNumber })
                        }
                      />
                    </label>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
        {tab === "tester" && (
          <div
            role="tabpanel"
            id="gp-tester"
            aria-labelledby="gp-tab-tester"
            className="gp-card"
          >
            <h3>{t("Test Gamepad")}</h3>
            {!status?.enabled && !demo && (
              <p>{t("Start Gamepad to view live controller input.")}</p>
            )}
            <div className="gp-tools">
              <label className="gp-switch">
                {t("Try demo")}
                <input
                  type="checkbox"
                  role="switch"
                  checked={demo}
                  onChange={(e) => {
                    setDemo(e.target.checked);
                    setDemoSamples({});
                  }}
                />
              </label>
              <button disabled={!demo} onClick={() => setDemoSamples({})}>
                {t("Release all")}
              </button>
              <span>
                {demo
                  ? t("Demo")
                  : t(
                      status?.xinputVerified
                        ? "XInput verified"
                        : "XInput pending",
                    )}
              </span>
            </div>
            <GamepadLiveControls store={liveStore}/>
            {demo && (
              <div className="gp-demo-sliders">
                {config.bindings.map((b) => (
                  <label key={b.keyId}>
                    {physicalLabel(b.keyId)} → {actionLabel(b.action)}
                    <input
                      type="range"
                      min="0"
                      max="3.4"
                      step=".01"
                      value={demoSamples[b.keyId]?.distanceMm ?? 0}
                      onChange={(e) => {
                        const distanceMm = e.target.valueAsNumber;
                        setDemoSamples((v) => ({
                          ...v,
                          [b.keyId]: { distanceMm, pressed: distanceMm >= 1.6 },
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
            <p>
              {t("Output")}: {(status?.outputHz ?? 0).toFixed(1)} Hz · p99{" "}
              {(status?.outputP99Ms ?? 0).toFixed(2)} ms · {t("Stale samples")}:{" "}
              {status?.stale ? "✓" : "—"} · Timeouts:{" "}
              {status?.hall.timeouts ?? 0}
            </p>
            <details className="gp-diagnostics">
              <summary>{t("Diagnostics")}</summary>
              <h3>{t("Hall consumers")}</h3>
              <div className="gp-consumers">
                {status?.hall.consumers.map((c) => (
                  <span key={c.id}>
                    {c.id.startsWith("web:") ? "Hall Stream" : c.id}:{" "}
                    {c.keys.length} keys · {c.hz} Hz
                  </span>
                ))}
              </div>
              <div className="gp-samples">
                {(status?.hall.keys ?? []).map((k) => (
                  <div key={k.pos}>
                    <b>{physicalLabel(k.keyId)}</b>
                    <span>
                      {k.hz.toFixed(1)}/{k.requestedHz} Hz
                    </span>
                    <small>p99 {k.intervalP99Ms.toFixed(2)} ms</small>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
        <div className="gp-footer">
          <span className="gp-auto-save"><Info size={15}/>{t("Changes apply automatically")}</span>
          <div className="gp-tools">
            <button disabled={disabled} onClick={() => file.current?.click()}>
              <Upload size={15} />
              {t("Import")}
            </button>
            <button disabled={disabled} onClick={exportConfig}>
              <Download size={15} />
              {t("Export")}
            </button>
            <button disabled={disabled} onClick={() => patch(defaultGamepad())}>
              <RotateCcw size={15} />
              {t("Reset")}
            </button>
          </div>
        </div>
      </div>
      {showGate && (
        <div className="gp-lock-overlay">
          <section className="gp-lock-card" role="status" aria-live="polite">
            <span className="gp-lock-icon">
              <Gamepad2 size={28} />
            </span>
            <h2>
              {t(
                access === "checking"
                  ? "Loading service"
                  : access === "driver"
                    ? "ViGEmBus required"
                    : access === "update"
                      ? "Service update required"
                      : "Background service required",
              )}
            </h2>
            <p>
              {t(
                access === "driver"
                  ? "Install ViGEmBus v1.22.0, restart the Windows service, then check again."
                  : access === "update"
                    ? "Update the Windows service to 0.4.0 or later."
                    : "Run the Windows service to configure and use Gamepad.",
              )}
            </p>
            <div className="gp-lock-actions">
              {access === "driver" ? (
                <a
                  className="gp-lock-primary"
                  href={VIGEMBUS_DOWNLOAD}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={16} />
                  {t("Install ViGEmBus")}
                </a>
              ) : (
                <button className="gp-lock-primary" onClick={onSetup}>
                  <Download size={16} />
                  {t("Download Windows service")}
                </button>
              )}
              <button disabled={loading} onClick={refreshConnection}>
                <RefreshCw size={15} />
                {t("Check again")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
