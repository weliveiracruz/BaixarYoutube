// Baixar YouTube - main.ts
// Life cycle, the hardened window (RS-06), the IPC contract (SDD 7, RS-07), the notification
// area icon (RF-24), the global shortcut (RF-01) and the notifications (RF-22).

import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

import { Binaries, runCommand, type Runner } from "../core/binaries";
import { isFolder } from "../core/folders";
import { isFormat } from "../core/formats";
import * as urls from "../core/urls";
import { shortcutText } from "../shared/messages";
import { STRINGS, format, type Strings } from "../shared/strings";
import type { AppState, EventName, Events, SettingKey, Settings, StartRequest } from "../shared/types";
import { Controller, check } from "./controller";
import { SettingsStore, defaults, validSetting } from "./settings";

const APP_ID = "com.weliveiracruz.baixaryoutube";
const ORIGIN = "app://baixar";
const TEST = !app.isPackaged;
/** Test hooks, honoured only in the development build (never in the installed app). */
const env = (name: string): string | undefined => (TEST ? process.env[name] : undefined);

const ROOT = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..", "resources");
const BIN = path.join(ROOT, "bin");
const ICONS = path.join(ROOT, "icons");
const WEB = path.join(__dirname, "renderer");

if (env("BAIXAR_TEST_USERDATA")) app.setPath("userData", env("BAIXAR_TEST_USERDATA")!);
else app.setPath("userData", path.join(app.getPath("appData"), "BaixarYoutube"));
app.setAppUserModelId(APP_ID);

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true } }]);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let store: SettingsStore;
let controller: Controller;
let binaries: Binaries;

const testPrefix: string[] | null = (() => {
  const raw = env("BAIXAR_TEST_YTDLP");
  if (!raw) return null;
  const value = JSON.parse(raw);
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
})();

function strings(): Strings {
  return STRINGS[store.get().language];
}

function send<E extends EventName>(event: E, payload: Events[E]): void {
  if (win && !win.isDestroyed()) win.webContents.send(event, payload);
}

function currentShortcutText(): string {
  const s = store.get();
  return s.shortcutEnabled && globalShortcut.isRegistered(s.shortcut) ? shortcutText(s.shortcut) : "";
}

async function state(): Promise<AppState> {
  return {
    settings: store.get(),
    strings: strings(),
    clipboardLink: controller.busy ? null : await clipboardLink(),
    busy: controller.busy,
    version: app.getVersion(),
    shortcutText: currentShortcutText(),
  };
}

async function clipboardLink(): Promise<string | null> {
  try {
    return urls.findInText(await clipboard.readText());
  } catch {
    return null;
  }
}

// -- static files of the window (app://baixar/...) -------------------------------------------

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function serve(request: Request): Response {
  const url = new URL(request.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(WEB, rel);
  if (url.host !== "baixar" || !file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("not found", { status: 404 });
  }
  return new Response(fs.readFileSync(file), {
    headers: {
      "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
    },
  });
}

// -- security of every web contents (RS-06) ----------------------------------------------------

function harden(contents: WebContents): void {
  contents.on("will-navigate", (e, url) => {
    if (url !== contents.getURL()) e.preventDefault();
  });
  contents.on("will-redirect", (e) => e.preventDefault());
  contents.on("will-attach-webview", (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key.toLowerCase();
    if (input.control && !input.alt && (key === "=" || key === "+" || key === "add")) {
      contents.setZoomFactor(Math.min(3, contents.getZoomFactor() + 0.1));
      e.preventDefault();
    } else if (input.control && !input.alt && (key === "-" || key === "subtract")) {
      contents.setZoomFactor(Math.max(0.5, contents.getZoomFactor() - 0.1));
      e.preventDefault();
    } else if (input.control && !input.alt && key === "0") {
      contents.setZoomFactor(1);
      e.preventDefault();
    } else if (!TEST && ((input.control && (key === "r" || (input.shift && key === "i"))) || key === "f5" || key === "f12")) {
      e.preventDefault();
    }
  });
}

function fromApp(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  return url.startsWith(ORIGIN + "/") && !!win && event.sender === win.webContents;
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) throw new Error("refused");
    return fn(...args);
  });
}

// -- window ------------------------------------------------------------------------------------

function background(): string {
  const theme = store.get().theme;
  const dark = theme === "dark" || (theme === "system" && nativeTheme.shouldUseDarkColors);
  return dark ? "#1A0B29" : "#FFFFFF";
}

function createWindow(show: boolean): BrowserWindow {
  const w = new BrowserWindow({
    width: 680,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: strings().appTitle,
    icon: path.join(ICONS, "app.ico"),
    backgroundColor: background(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: TEST,
    },
  });
  w.removeMenu();
  w.on("page-title-updated", (e) => e.preventDefault());
  w.once("ready-to-show", () => {
    if (show) {
      w.show();
      w.focus();
    }
  });
  w.on("close", (e) => {
    if (quitting) return;
    if (controller.busy) {
      e.preventDefault();
      if (!w.isVisible()) w.show();
      w.focus();
      send("window:closeRequest", {});
      return;
    }
    quitting = true;
  });
  w.on("closed", () => {
    win = null;
  });
  void w.loadURL(`${ORIGIN}/index.html`);
  return w;
}

function showWindow(): void {
  if (!win) {
    win = createWindow(true);
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  void (async () => send("window:shown", { clipboardLink: controller.busy ? null : await clipboardLink() }))();
}

// -- tray, shortcut, notifications -------------------------------------------------------------

let trayPercent: number | null = null;

function updateTray(): void {
  if (!tray) return;
  const s = strings();
  tray.setToolTip(controller?.busy && trayPercent !== null ? format(s.trayBusy, { percent: trayPercent }) : s.trayIdle);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: s.trayOpen, click: showWindow },
      { label: s.trayCancel, visible: !!controller?.busy, click: () => controller.cancel() },
      { type: "separator" },
      { label: s.trayQuit, click: () => app.quit() },
    ]),
  );
}

function registerShortcut(settings: Settings): boolean {
  globalShortcut.unregisterAll();
  if (!settings.shortcutEnabled) return true;
  try {
    return globalShortcut.register(settings.shortcut, showWindow);
  } catch {
    return false;
  }
}

function notify(title: string, body: string): void {
  if (win && win.isVisible() && win.isFocused()) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(ICONS, "app.png"), silent: false });
  n.on("click", showWindow);
  n.show();
}

// -- IPC -----------------------------------------------------------------------------------------

function registerIpc(): void {
  handle("app:getState", () => state());
  handle("url:check", (url) => check(url));
  handle("url:preview", (url, key, token) => {
    if (isFormat(key) && typeof token === "number" && Number.isSafeInteger(token)) controller.preview(url, key, token);
  });
  handle("folder:choose", async (forSettings) => {
    const s = strings();
    let folder: string | null = env("BAIXAR_TEST_PICK_FOLDER") ?? null;
    if (!folder) {
      const result = await dialog.showOpenDialog(win!, { title: s.chooseFolderTitle, defaultPath: store.get().folder, properties: ["openDirectory", "createDirectory"] });
      folder = result.canceled || !result.filePaths.length ? null : result.filePaths[0];
    }
    if (folder && isFolder(folder)) {
      store.set("folder", folder);
      void forSettings;
      return folder;
    }
    return null;
  });
  handle("job:start", (request) => {
    const r = request as Partial<StartRequest> | null;
    if (!r || typeof r.url !== "string" || !isFormat(r.format) || (r.mode !== "video" && r.mode !== "playlist")) return { ok: false, error: "url" };
    store.set("format", r.format);
    const result = controller.start({ url: r.url, format: r.format, mode: r.mode });
    updateTray();
    return result;
  });
  handle("job:confirmPlaylist", (jobId, yes) => {
    if (typeof jobId === "number" && typeof yes === "boolean") controller.confirmPlaylist(jobId, yes);
  });
  handle("job:cancel", (jobId) => {
    if (typeof jobId === "number") controller.cancel(jobId);
  });
  handle("job:open", async (jobId, what) => {
    const result = typeof jobId === "number" ? controller.result(jobId) : null;
    if (!result || (what !== "file" && what !== "folder")) return { ok: false };
    if (what === "file") {
      if (!result.file || !fs.existsSync(result.file)) return { ok: false };
      if (env("BAIXAR_TEST_NO_OPEN")) return { ok: true };
      return { ok: (await shell.openPath(result.file)) === "" };
    }
    if (env("BAIXAR_TEST_NO_OPEN")) return { ok: fs.existsSync(result.folder) };
    if (result.file && fs.existsSync(result.file)) {
      shell.showItemInFolder(result.file);
      return { ok: true };
    }
    return { ok: (await shell.openPath(result.folder)) === "" };
  });
  handle("window:close", () => {
    win?.close();
  });
  handle("window:closeChoice", async (choice) => {
    if (choice === "background") {
      win?.hide();
      const s = strings();
      const shortcut = currentShortcutText();
      notify(s.appName, shortcut ? format(s.background, { shortcut }) : s.backgroundNoShortcut);
    } else if (choice === "cancel") {
      await controller.cancelAndWait();
      quitting = true;
      app.quit();
    }
  });
  handle("settings:set", (key, value) => {
    if (typeof key !== "string" || !validSetting(key, value)) return { ok: false, error: "invalid" };
    const k = key as SettingKey;
    const before = store.get();
    store.set(k, value as never);
    const after = store.get();
    if (k === "shortcut" || k === "shortcutEnabled") {
      if (!registerShortcut(after)) {
        store.set(k, before[k] as never);
        registerShortcut(store.get());
        return { ok: false, error: "taken" };
      }
    }
    if (k === "theme") nativeTheme.themeSource = after.theme;
    if (k === "startWithWindows" && app.isPackaged) app.setLoginItemSettings({ openAtLogin: after.startWithWindows, args: ["--hidden"] });
    if (k === "language") {
      win?.setTitle(strings().appTitle);
      updateTray();
    }
    send("app:settings", { settings: store.get(), strings: strings(), shortcutText: currentShortcutText() });
    return { ok: true };
  });
  handle("engine:version", async () => {
    if (testPrefix) {
      const [code, out] = await runCommand([...testPrefix, "--version"], 30000);
      return code === 0 ? out.trim() : "";
    }
    return binaries.version();
  });
  handle("engine:update", () => binaries.update());
  handle("app:manual", () => openManual());
}

function openManual(): void {
  const manual = new BrowserWindow({
    width: 760,
    height: 820,
    title: "Manual",
    icon: path.join(ICONS, "app.ico"),
    backgroundColor: background(),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, devTools: TEST },
  });
  manual.removeMenu();
  manual.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      e.preventDefault();
      manual.close();
    }
  });
  void manual.loadURL(`${ORIGIN}/manual/${store.get().language}.html`);
}

// -- start -------------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.on("web-contents-created", (_e, contents) => harden(contents));

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle("app", serve);

    const downloads = env("BAIXAR_TEST_DOWNLOADS") ?? app.getPath("downloads");
    store = new SettingsStore(path.join(app.getPath("userData"), "settings.json"), defaults(downloads, app.getLocale()), isFolder);
    nativeTheme.themeSource = store.get().theme;

    const userBin = path.join(app.getPath("userData"), "bin");
    const runner: Runner = testPrefix ? (cmd, t) => runCommand([...testPrefix, ...cmd.slice(1)], t) : runCommand;
    binaries = new Binaries(BIN, userBin, runner);
    // Thumbnails: a separate in-memory session, no cookies, nothing on disk (RS-11).
    const thumbSession = session.fromPartition("thumbnails", { cache: false });
    thumbSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));

    controller = new Controller({
      binaries,
      ytdlpCommand: () => testPrefix ?? binaries.ytdlpCommand(),
      ffmpegDir: binaries.ffmpegDir,
      preflight: () => (testPrefix ? Promise.resolve([]) : binaries.verify()),
      fetcher: (url, init) => thumbSession.fetch(url, init),
      thumbnailBase: env("BAIXAR_TEST_THUMB_BASE"),
      settings: () => store.get(),
      send,
      onProgress: (percent) => {
        trayPercent = percent;
        win?.setProgressBar(percent / 100);
        tray?.setToolTip(format(strings().trayBusy, { percent }));
      },
      onFinished: (kind, title, info) => {
        trayPercent = null;
        win?.setProgressBar(-1);
        updateTray();
        const s = strings();
        if (kind === "done") notify(s.notifyDone, format(s.doneShort, { title }));
        else if (kind === "error") notify(s.notifyError, s[`err_${info.code ?? "unknown"}` as keyof Strings]);
      },
    });

    registerIpc();
    registerShortcut(store.get());
    tray = new Tray(nativeImage.createFromPath(path.join(ICONS, "app.ico")));
    tray.on("click", showWindow);
    updateTray();

    const hidden = process.argv.includes("--hidden");
    win = createWindow(!hidden);
  });

  app.on("window-all-closed", () => {
    if (quitting || !controller?.busy) app.quit();
  });

  app.on("before-quit", (e) => {
    quitting = true;
    if (controller?.busy) {
      // RF-14: quitting during a download cancels it and deletes the partial files.
      e.preventDefault();
      void controller.cancelAndWait().then(() => app.quit());
    }
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    tray?.destroy();
  });
}
