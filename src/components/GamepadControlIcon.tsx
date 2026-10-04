import type { GamepadAction } from "../keyboard/gamepad";

export default function GamepadControlIcon({
  action,
}: {
  action: GamepadAction;
}) {
  if (["A", "B", "X", "Y"].includes(action))
    return (
      <span aria-hidden="true" className={`gp-face gp-face-${action}`}>
        {action}
      </span>
    );
  const stick = /^([LR])(Up|Down|Left|Right|Click)$/.exec(action);
  const direction = stick?.[2] ?? action;
  const rotation =
    { Up: 0, Right: 90, Down: 180, Left: 270 }[direction as "Up"] ?? 0;
  return (
    <svg aria-hidden="true" className="gp-control-icon" viewBox="0 0 44 44">
      {stick ? (
        <>
          <circle className="gp-icon-body" cx="22" cy="22" r="18" />
          {direction === "Click" ? (
            <circle
              className="gp-icon-accent"
              cx="22"
              cy="22"
              r="18"
              fill="none"
            />
          ) : (
            <path
              className="gp-icon-accent"
              d="M 9.3 9.3 A 18 18 0 0 1 34.7 9.3"
              fill="none"
              transform={`rotate(${rotation} 22 22)`}
            />
          )}
          <text x="22" y="29" textAnchor="middle">
            {stick[1]}
          </text>
        </>
      ) : ["Up", "Down", "Left", "Right"].includes(action) ? (
        <>
          <path
            className="gp-icon-body"
            d="M16 4h12v12h12v12H28v12H16V28H4V16h12z"
          />
          <path
            className="gp-icon-highlight"
            d="m17 12 5-6 5 6z"
            transform={`rotate(${rotation} 22 22)`}
          />
        </>
      ) : action === "Start" || action === "Back" ? (
        <>
          <rect
            className="gp-icon-body"
            x="3"
            y="11"
            width="38"
            height="23"
            rx="4"
          />
          <path
            className="gp-icon-highlight"
            d="m18 16 10 7-10 7z"
            transform={action === "Back" ? "rotate(180 22 23)" : undefined}
          />
        </>
      ) : action === "Guide" ? (
        <>
          <circle className="gp-icon-body" cx="22" cy="22" r="18" />
          <path className="gp-icon-accent" d="m10 9 24 26M34 9 10 35" />
        </>
      ) : (
        <>
          <rect
            className="gp-icon-body"
            x="3"
            y="5"
            width="38"
            height="34"
            rx="4"
          />
          <text x="22" y="28" textAnchor="middle" className="gp-icon-small">
            {action}
          </text>
        </>
      )}
    </svg>
  );
}
