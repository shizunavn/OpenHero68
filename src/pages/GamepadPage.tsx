import { useEffect, useMemo, useRef, useState } from "react";
import {
  Gamepad2,
  Play,
  Square,
  Download,
  Upload,
  RotateCcw,
} from "lucide-react";
import GamepadKeyboardPreview from "../components/GamepadKeyboardPreview";
import { AppSelect } from "../app/components/AppSelect";
import { useI18n } from "../i18n";
import { HERO68_LAYOUT } from "../keyboard/hero68Layout";
import {
  defaultGamepad,
  restoreGamepad,
  validateGamepad,
  mapGamepad,
  GAMEPAD_ACTIONS,
  GAMEPAD_BUTTONS,
  CURVE_PRESETS,
  type GamepadAction,
  type GamepadConfiguration,
  type CurvePoint,
} from "../keyboard/gamepad";
import { gamepadService, type GamepadStatus } from "../protocol/gamepadService";
import "./GamepadPage.css";
const storage = "openhero68:gamepad:v1";
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
  useEffect(() => {
    save(slot, config);
  }, [slot, config]);
  useEffect(() => {
    mounted.current = true;
    let active = true,
      close: (() => void) | undefined;
    close = gamepadService.stream(
      (v) => {
        if (active) {
          if (restoreFromService.current && v.slot === slot) {
            restoreFromService.current = false;
            setConfig(restoreGamepad(v.configuration));
          }
          setStatus(v);
          setLoading(false);
          setError((previous) =>
            previous === t("Service unavailable") ? "" : previous,
          );
        }
      },
      () => {
        if (active) {
          setError(t("Service unavailable"));
          setStatus((v) =>
            v
              ? {
                  ...v,
                  armed: false,
                  stale: true,
                  samples: [],
                  report: mapGamepad(config, {}),
                }
              : v,
          );
        }
      },
    );
    gamepadService
      .status()
      .then((v) => {
        if (!active) return;
        if (restoreFromService.current && v.slot === slot) {
          restoreFromService.current = false;
          setConfig(restoreGamepad(v.configuration));
        }
        setStatus(v);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      close?.();
    };
  }, []);
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
  const labels = Object.fromEntries(
      config.bindings.map((b) => [b.keyId, actionLabel(b.action)]),
    ),
    binding = config.bindings.find((b) => b.keyId === selected);
  const measuredKeys = (status?.hall.keys ?? []).filter((k) =>
    config.bindings.some((b) => b.keyId === k.keyId),
  );
  const measuredHz = measuredKeys.length
    ? Math.min(...measuredKeys.map((k) => k.hz)).toFixed(1)
    : "—";
  const dirty =
      JSON.stringify(config) !==
      JSON.stringify(status?.slot === slot ? status.configuration : null),
    disabled = busy || profileBusy;
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
  }
  async function action(start: boolean) {
    setBusy(true);
    if (start) setDemo(false);
    setError("");
    try {
      if (!status?.capabilities?.gamepad)
        throw Error(t("Update the Windows service to 0.4.0 or later."));
      const v = start
        ? await gamepadService.start(slot, config)
        : await gamepadService.stop();
      if (mounted.current) setStatus(v);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const v = await gamepadService.configure(slot, config);
      if (mounted.current) setStatus(v);
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
    <div className="gamepad-page page-enter">
      <div className="gp-heading">
        <h2>
          <Gamepad2 size={23} /> Gamepad <small>P{slot + 1}</small>
        </h2>
        <div className="gp-tools">
          <button disabled={disabled} onClick={() => file.current?.click()}>
            <Upload size={15} />
            {t("Import")}
          </button>
          <button onClick={exportConfig}>
            <Download size={15} />
            {t("Export")}
          </button>
          <button disabled={disabled} onClick={() => patch(defaultGamepad())}>
            <RotateCcw size={15} />
            {t("Reset")}
          </button>
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
          selectedKeys={new Set(selected ? [selected] : [])}
          keyLabels={labels}
          keyTooltips={Object.fromEntries(
            config.bindings.map((b) => [
              b.keyId,
              {
                title: `${physicalLabel(b.keyId)} → ${actionLabel(b.action)}`,
                detail: `${b.startMm.toFixed(2)}–${b.endMm.toFixed(2)} mm`,
              },
            ]),
          )}
          onToggleKey={(id) => {
            setSelected(id);
            if (tab === "tester") toggleDemoKey(id);
          }}
          onDropKey={(id, e) => {
            e.preventDefault();
            if (disabled) return;
            const a = e.dataTransfer.getData(
              "application/x-openhero-gamepad",
            ) as GamepadAction;
            if (GAMEPAD_ACTIONS.includes(a)) assign(id, a);
          }}
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
        <span>{t(dirty ? "Unsaved changes" : "Applied")}</span>
      </div>
      {tab === "setup" && (
        <div
          role="tabpanel"
          id="gp-setup"
          aria-labelledby="gp-tab-setup"
          className="gp-columns"
        >
          <section className="gp-card">
            <h3>{t("Enable Gamepad")}</h3>
            <button
              className="gp-primary"
              disabled={disabled || loading}
              onClick={() => void action(!status?.enabled)}
            >
              {status?.enabled ? <Square size={16} /> : <Play size={16} />}{" "}
              {t(status?.enabled ? "Stop Gamepad" : "Enable Gamepad")}
            </button>
            <label>
              Controller type
              <AppSelect
                value="xbox"
                options={[{ value: "xbox", label: "Xbox Controller (XInput)" }]}
                label="Controller type"
                onChange={() => {}}
              />
            </label>
            <label>
              Polling rate
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
            <p>
              {t(
                "Hall scanning follows active features; opening this editor does not start polling.",
              )}
            </p>
            <a
              href="https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0"
              target="_blank"
              rel="noreferrer"
            >
              {t("Install ViGEmBus")}
            </a>
            <button onClick={onSetup}>Windows service</button>
            {status && (
              <p>
                {t(
                  status.driverAvailable || status.enabled
                    ? "ViGEmBus ready"
                    : "ViGEmBus unavailable",
                )}
              </p>
            )}
          </section>
          <section className="gp-card">
            <h3>{t("Controller Mapping")}</h3>
            <p>
              {t(
                "Drag a control onto a key, or select a key and click a control. Right-click a key to remove its binding.",
              )}
            </p>
            <div className="gp-palette">
              {GAMEPAD_ACTIONS.map((a) => (
                <button
                  key={a}
                  className={"gp-action gp-action-" + a}
                  draggable={!disabled}
                  disabled={disabled}
                  aria-label={"Bind " + a}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/x-openhero-gamepad", a)
                  }
                  onClick={() => selected && assign(selected, a)}
                >
                  {actionLabel(a)}
                </button>
              ))}
            </div>
            <div className="gp-binding">
              <strong>
                {binding
                  ? `${physicalLabel(binding.keyId)} → ${actionLabel(binding.action)}`
                  : t("No gamepad binding selected")}
              </strong>
              {binding && (
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
            </div>
            <label className="gp-switch">
              {t("Keep keyboard keys")}
              <input type="checkbox" checked disabled />
            </label>
            <label className="gp-switch">
              {t("Mapped-key override")}
              <input type="checkbox" checked={false} disabled />
            </label>
            <p>
              {t(
                "Keyboard suppression is not verified on HERO68. Unbind duplicate keyboard controls in your game.",
              )}
            </p>
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
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                <g key={n}>
                  <line x1={30 + 270 * n} x2={30 + 270 * n} y1="20" y2="220" />
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
            <div className="gp-presets">
              {Object.keys(CURVE_PRESETS).map((name) => (
                <button
                  key={name}
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
                  {name}
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
                  patch({ curve: config.curve.filter((_, i) => i !== point) });
                  setPoint(1);
                }}
              >
                {t("Remove curve point")}
              </button>
            </div>
          </section>
          <section className="gp-card">
            <h3>{t("Response")}</h3>
            <p>
              {t(
                "Gamepad response is independent of Actuation Point and Rapid Trigger.",
              )}
            </p>
            {(
              [
                ["snappy", "Snappy Joystick"],
                ["square", "Square joystick output"],
                ["angleEnabled", "Angle adjustment"],
              ] as const
            ).map(([key, label]) => (
              <label className="gp-switch" key={key}>
                {t(label)}
                <input
                  type="checkbox"
                  checked={config[key]}
                  disabled={disabled}
                  onChange={(e) => patch({ [key]: e.target.checked })}
                />
              </label>
            ))}
            <label>
              {config.angle}°
              <input
                type="range"
                min="30"
                max="60"
                disabled={disabled || !config.angleEnabled}
                value={config.angle}
                onChange={(e) => patch({ angle: e.target.valueAsNumber })}
              />
            </label>
            <p>
              {t(
                "Snappy uses the stronger direction. Equal opposing inputs cancel.",
              )}
            </p>
            <p>
              {t(
                "Circle limits diagonal travel; square allows both axes to reach full output.",
              )}
            </p>
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
          <div className="gp-tools">
            <label className="gp-switch">
              {t("Try demo")}
              <input
                type="checkbox"
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
          <div className="gp-test-controls">
            {(["L", "R"] as const).map((prefix) => (
              <div className="gp-stick" key={prefix}>
                <svg viewBox="0 0 160 160" aria-label={prefix + " stick"}>
                  <circle cx="80" cy="80" r="65" />
                  <line x1="15" x2="145" y1="80" y2="80" />
                  <line y1="15" y2="145" x1="80" x2="80" />
                  <circle
                    className="gp-dot"
                    cx={
                      80 +
                      ((prefix === "L" ? report.lx : report.rx) / 32767) * 65
                    }
                    cy={
                      80 -
                      ((prefix === "L" ? report.ly : report.ry) / 32767) * 65
                    }
                    r="7"
                  />
                </svg>
                <span>
                  {prefix}: {prefix === "L" ? report.lx : report.rx},{" "}
                  {prefix === "L" ? report.ly : report.ry}
                </span>
              </div>
            ))}
            <div className="gp-triggers">
              {(["lt", "rt"] as const).map((key) => (
                <label key={key}>
                  {key.toUpperCase()} {report[key]}/255
                  <meter min="0" max="255" value={report[key]} />
                </label>
              ))}
            </div>
            <div className="gp-palette">
              {Object.entries(GAMEPAD_BUTTONS).map(([a, mask]) => (
                <span
                  key={a}
                  className={
                    "gp-action " + (report.buttons & mask! ? "held" : "")
                  }
                >
                  {actionLabel(a as GamepadAction)}
                </span>
              ))}
            </div>
          </div>
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
            {status?.stale ? "✓" : "—"} · Timeouts: {status?.hall.timeouts ?? 0}
          </p>
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
        </div>
      )}
      <div className="gp-footer">
        <button
          className="gp-primary"
          disabled={disabled || !status || !dirty}
          onClick={() => void apply()}
        >
          {t("Apply configuration")}
        </button>
      </div>
    </div>
  );
}
