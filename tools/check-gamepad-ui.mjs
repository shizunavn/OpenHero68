// Browser checks use this local fixture. It never opens a keyboard or driver.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rolldown } from "rolldown";
async function bundle(input) {
  const b = await rolldown({ input });
  try {
    const { output } = await b.generate({
      format: "esm",
      codeSplitting: false,
    });
    return import(
      `data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`
    );
  } finally {
    await b.close();
  }
}
const { defaultGamepad, validateGamepad } = await bundle(
    "src/keyboard/gamepad.ts",
  ),
  { buildReport } = await bundle("src/protocol/hero68/codec.ts");
const root = path.resolve(".refactor/gamepad-ui-fixture");
await build({
  configFile: false,
  plugins: [
    react(),
    {
      name: "fixture-service",
      enforce: "pre",
      transform(code, id) {
        if (
          [
            "/src/protocol/gamepadService.ts",
            "/src/protocol/rgbService.ts",
          ].some((p) => id.replaceAll("\\", "/").endsWith(p))
        )
          return code.replace(
            "http://127.0.0.1:16868",
            "http://127.0.0.1:5191",
          );
      },
    },
  ],
  build: {
    outDir: root,
    rollupOptions: { input: "tests/fixtures/gamepad-ui.html" },
  },
});
const config = {
    0: defaultGamepad(),
    1: defaultGamepad(),
    2: defaultGamepad(),
  },
  clients = new Set(),
  inputClients = new Set(),
  requests = [];
let enabled = false,
  slot = 0,
  offline = false,
  driverAvailable = true,
  compatible = true;
const status = () => ({
  keyboardHookSupported:true,fastInputSupported:true,
  driverAvailable,
  enabled,
  armed: enabled,
  stale: !enabled,
  xinputVerified: enabled,
  userIndex: enabled ? 0 : -1,
  outputHz: enabled ? 200 : 0,
  outputP99Ms: 5.2,
  neutralCount: 0,
  error: "",
  report: { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 },
  backend: "vigem",
  slot,
  configuration: config[slot],
  capabilities: { gamepad: compatible, keyboardSuppression: true,keyboardHook:true,fastInput:true },
  hall: {
    requests: 0,
    timeouts: 0,
    keys: [],
    consumers: enabled
      ? [
          {
            id: "gamepad:analog",
            hz: 200,
            keys: config[slot].bindings.map((b) => b.keyId),
          },
        ]
      : [],
  },
  samples: [],
});
const publish = () => {
  for (const res of clients) res.write(`data: ${JSON.stringify(status())}\n\n`);
};
let inputSequence=0;
setInterval(()=>{
  if(!inputClients.size)return
  const distance=enabled?1.7+Math.sin(performance.now()/300)*1.7:0
  const frame={...status(),sequence:++inputSequence,report:{...status().report,ly:Math.round(distance/3.4*32767)},samples:enabled?[{keyId:'KeyW',pos:30,distanceUnits:Math.round(distance*100),adc:1234,pressed:distance>1.6,timestampMs:performance.now(),sequence:inputSequence,ageMs:0}]:[]}
  for(const res of inputClients)if(!res.writableLength)res.write(`data: ${JSON.stringify(frame)}\n\n`)
},1000/60).unref();
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:5191"),
    json = (value, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
  let input = {};
  if (req.method === "POST") {
    let text = "";
    for await (const part of req) text += part;
    input = JSON.parse(text || "{}");
    requests.push({ path: url.pathname, input });
  }
  if (url.pathname === "/test/state") {
    if (input.offline !== undefined) offline = input.offline;
    if (input.driverAvailable !== undefined)
      driverAvailable = input.driverAvailable;
    if (input.compatible !== undefined) compatible = input.compatible;
    if (offline) {
      for (const client of clients) client.end();
      for (const client of inputClients) client.end();
      inputClients.clear();
      clients.clear();
    } else publish();
    json({ requests, offline, driverAvailable, compatible,inputClients:inputClients.size });
    return;
  }
  if (
    url.pathname.startsWith("/gamepad/") ||
    url.pathname === "/device/request"
  ) {
    if (offline) {
      json({ error: "Fixture service unavailable" }, 503);
      return;
    }
    if (url.pathname === "/gamepad/status") {
      json(status());
      return;
    }
    if(url.pathname==='/gamepad/input/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();inputClients.add(res);req.on('close',()=>inputClients.delete(res));return;
    }
    if (url.pathname === "/gamepad/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify(status())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/device/request") {
      const packet = Buffer.from(input.hex, "hex");
      json({
        hex: Buffer.from(
          buildReport({
            command: packet[1],
            zone: packet[2],
            data: [0x11, 0, 0, 0, 0, 3],
          }),
        ).toString("hex"),
      });
      return;
    }
    if (input.configuration)
      config[input.slot] = validateGamepad(input.configuration);
    if (url.pathname === "/gamepad/start") {
      slot = input.slot;
      enabled = true;
    }
    if (url.pathname === "/gamepad/stop") enabled = false;
    if (url.pathname === "/gamepad/profile") slot = input.slot;
    publish();
    json(status());
    return;
  }
  const file = path.resolve(
    root,
    "." +
      (url.pathname === "/" ? "/tests/fixtures/gamepad-ui.html" : url.pathname),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".woff2": "font/woff2",
        }[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(5191, "127.0.0.1", () =>
  console.log("Gamepad UI fixture: http://127.0.0.1:5191/"),
);
