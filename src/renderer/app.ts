// Baixar YouTube - app.ts
// The window: form, media card, status, access keys, dialogs and settings (SDD 6, RA-01..RA-18).

import type { ErrorCode } from "../core/errors";
import { FORMATS, type FormatKey } from "../core/formats";
import { duration, progressText } from "../shared/messages";
import { format, mnemonic, type StringKey, type Strings } from "../shared/strings";
import type { AppState, BaixarApi, Events, LinkKind, Settings, SettingKey } from "../shared/types";

declare global {
  interface Window {
    baixar: BaixarApi;
  }
}

const api = window.baixar;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  title: $("app-title"),
  viewMain: $("view-main"),
  viewSettings: $("view-settings"),
  form: $<HTMLFormElement>("form"),
  url: $<HTMLInputElement>("url"),
  urlError: $("url-error"),
  urlErrorText: $("url-error-text"),
  folder: $<HTMLInputElement>("folder"),
  folderError: $("folder-error"),
  folderErrorText: $("folder-error-text"),
  browse: $<HTMLButtonElement>("browse"),
  format: $<HTMLSelectElement>("format"),
  media: $("media"),
  mediaSkeleton: $("media-skeleton"),
  mediaImg: $<HTMLImageElement>("media-img"),
  mediaPlaceholder: $("media-placeholder"),
  mediaStrip: $("media-strip"),
  mediaTitle: $("media-title"),
  mediaLoading: $("media-loading"),
  mediaMeta: $("media-meta"),
  mediaBadge: $("media-badge"),
  go: $<HTMLButtonElement>("go"),
  goLabel: $("go-label"),
  goPath: document.getElementById("go-path") as unknown as SVGPathElement,
  statusCard: $("status-card"),
  statusIcon: $("status-icon"),
  status: $<HTMLTextAreaElement>("status"),
  progress: $<HTMLProgressElement>("progress"),
  progressTrack: $("progress-track"),
  progressValue: $("progress-value"),
  openFile: $<HTMLButtonElement>("open-file"),
  openFolder: $<HTMLButtonElement>("open-folder"),
  settings: $<HTMLButtonElement>("settings"),
  close: $<HTMLButtonElement>("close"),
  liveStatus: $("live-status"),
  liveAlert: $("live-alert"),
  // settings
  settingsTitle: $("settings-title"),
  settingsBack: $<HTMLButtonElement>("settings-back"),
  sFolder: $<HTMLInputElement>("s-folder"),
  sBrowse: $<HTMLButtonElement>("s-browse"),
  sThumbnails: $<HTMLInputElement>("s-thumbnails"),
  sLanguage: $<HTMLSelectElement>("s-language"),
  sShortcutEnabled: $<HTMLInputElement>("s-shortcut-enabled"),
  sShortcut: $<HTMLInputElement>("s-shortcut"),
  sShortcutReset: $<HTMLButtonElement>("s-shortcut-reset"),
  sShortcutMsg: $("s-shortcut-msg"),
  sStart: $<HTMLInputElement>("s-start"),
  sVersion: $<HTMLInputElement>("s-version"),
  sUpdate: $<HTMLButtonElement>("s-update"),
  sUpdateMsg: $("s-update-msg"),
};

const ICON_CHECK =
  '<svg viewBox="0 0 20 20" focusable="false"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="check-path" d="m6 10.5 2.6 2.6L14 7.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_WARN =
  '<svg viewBox="0 0 20 20" focusable="false"><path d="M10 2 1 18h18L10 2Zm0 5v5m0 2.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PATH_DOWNLOAD = "M10 3v10m0 0-4-4m4 4 4-4M4 17h12";
const PATH_CANCEL = "M5 5l10 10M15 5 5 15";

const FORMAT_LABEL: Record<FormatKey, StringKey> = {
  mp4best: "formatMp4best",
  mp4_720: "formatMp4_720",
  mp4_360: "formatMp4_360",
  mp3: "formatMp3",
  m4a: "formatM4a",
};

let s: Strings;
let settings: Settings;
let busy = false;
let jobId: number | null = null;
let jobIsPlaylist = false;
let itemTitle = "";
let previewToken = 0;
let previewLink = "";
let previewKind: LinkKind | null = null;
let previewPlaylistCount: number | null = null;
let announcedPreview = "";
let lastStatusAnnounce = "";

// -- announcements (RA-04) -----------------------------------------------------------------

let politeTimer: number | undefined;
/** Polite announcement; the region text is replaced, never accumulated. */
function say(text: string): void {
  window.clearTimeout(politeTimer);
  els.liveStatus.textContent = "";
  politeTimer = window.setTimeout(() => (els.liveStatus.textContent = text), 60);
}

let alertTimer: number | undefined;
/** Assertive announcement, only for errors. */
function alertText(text: string): void {
  window.clearTimeout(alertTimer);
  els.liveAlert.textContent = "";
  alertTimer = window.setTimeout(() => (els.liveAlert.textContent = text), 60);
}

function setStatus(text: string, opts: { announce?: boolean; kind?: "success" | "error" | null } = {}): void {
  els.status.value = text;
  els.statusCard.classList.toggle("is-success", opts.kind === "success");
  els.statusCard.classList.toggle("is-error", opts.kind === "error");
  els.statusIcon.innerHTML = opts.kind === "success" ? ICON_CHECK : opts.kind === "error" ? ICON_WARN : "";
  if (opts.announce && text !== lastStatusAnnounce) {
    lastStatusAnnounce = text;
    if (opts.kind === "error") alertText(text);
    else say(text);
  }
}

function setProgress(percent: number): void {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  els.progress.value = value;
  els.progress.setAttribute("aria-valuetext", `${value}%`);
  els.progressValue.textContent = `${value}%`;
  els.mediaStrip.style.transform = `scaleX(${value / 100})`;
}

// -- strings and access keys (RA-03) ---------------------------------------------------------

function renderLabel(el: HTMLElement, label: string): string | null {
  const m = mnemonic(label);
  el.textContent = "";
  if (m.key === null) {
    el.textContent = m.text;
    return null;
  }
  // One inline wrapper: inside a flex button, loose text nodes and the letter would become
  // separate flex items and the accessible name would be split ("A brir arquivo").
  const wrapper = document.createElement("span");
  const ak = document.createElement("span");
  ak.className = "ak";
  ak.textContent = m.text[m.index];
  wrapper.append(m.text.slice(0, m.index), ak, m.text.slice(m.index + 1));
  el.append(wrapper);
  return m.key;
}

/** The control that a label element names. */
function controlOf(el: HTMLElement): HTMLElement | null {
  if (el instanceof HTMLButtonElement) return el;
  if (el instanceof HTMLLabelElement && el.htmlFor) return document.getElementById(el.htmlFor);
  if (el.tagName === "LEGEND") {
    const fs = el.parentElement!;
    return (fs.querySelector("input:checked") as HTMLElement) ?? (fs.querySelector("input") as HTMLElement);
  }
  const label = el.closest("label");
  return label ? (label.querySelector("input") as HTMLElement) : null;
}

function renderStrings(): void {
  document.documentElement.lang = settings.language;
  document.title = s.appTitle;
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = s[el.dataset.i18n as StringKey];
  for (const el of document.querySelectorAll<HTMLElement>("[data-label]")) {
    const key = renderLabel(el, s[el.dataset.label as StringKey]);
    const control = controlOf(el);
    if (control && key) control.setAttribute("aria-keyshortcuts", `Alt+${key.toUpperCase()}`);
    el.dataset.key = key ?? "";
  }
  // Format list keeps the selection.
  const selected = (els.format.value as FormatKey) || settings.format;
  els.format.replaceChildren(
    ...FORMATS.map((key) => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = s[FORMAT_LABEL[key]];
      return o;
    }),
  );
  els.format.value = selected;
  renderGo();
  updateBadge();
}

function renderGo(): void {
  const key = renderLabel(els.goLabel, busy ? s.cancel : s.download);
  els.go.dataset.key = key ?? "";
  els.go.setAttribute("aria-keyshortcuts", `Alt+${(key ?? "").toUpperCase()}`);
  els.go.classList.toggle("btn-primary", !busy);
  els.go.classList.toggle("btn-danger", busy);
  els.goPath.setAttribute("d", busy ? PATH_CANCEL : PATH_DOWNLOAD);
}

/** Alt+letter: the visible, enabled control of the current view or dialog (RA-03). */
function accessKey(e: KeyboardEvent): boolean {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return false;
  const letter = e.key.toLowerCase();
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  const scope: ParentNode = dialog ?? (els.viewSettings.hidden ? els.viewMain : els.viewSettings);
  for (const el of scope.querySelectorAll<HTMLElement>("[data-key]")) {
    if (el.dataset.key !== letter) continue;
    const owner = el.id === "go-label" ? els.go : el;
    const control = owner === els.go ? els.go : controlOf(owner);
    if (!control || (control as HTMLButtonElement).disabled || control.closest("[hidden]")) continue;
    e.preventDefault();
    if (control instanceof HTMLButtonElement) {
      control.focus();
      control.click();
    } else {
      control.focus();
      if (control instanceof HTMLInputElement && control.type === "url") control.select();
    }
    return true;
  }
  return false;
}

// -- media card (RF-25) -------------------------------------------------------------------------

function isAudio(key: FormatKey): boolean {
  return key === "mp3" || key === "m4a";
}

function updateBadge(): void {
  const key = els.format.value as FormatKey;
  if (previewKind === "playlist" && previewPlaylistCount !== null) els.mediaBadge.textContent = format(s.badgePlaylist, { count: previewPlaylistCount });
  else els.mediaBadge.textContent = s[FORMAT_LABEL[key]];
  els.media.classList.toggle("is-audio", isAudio(key));
  els.media.classList.toggle("is-video", !isAudio(key));
}

function hideMedia(): void {
  els.media.hidden = true;
  previewLink = "";
  previewKind = null;
  previewPlaylistCount = null;
}

function showMediaLoading(kind: LinkKind): void {
  els.media.hidden = false;
  els.media.classList.remove("is-done");
  els.mediaImg.hidden = true;
  els.mediaImg.removeAttribute("src");
  els.mediaPlaceholder.hidden = true;
  els.mediaSkeleton.hidden = false;
  els.mediaTitle.textContent = "";
  els.mediaMeta.textContent = "";
  els.mediaLoading.hidden = false;
  previewKind = kind;
  previewPlaylistCount = null;
  setStripe(0);
  updateBadge();
}

function setStripe(percent: number): void {
  els.mediaStrip.style.transform = `scaleX(${percent / 100})`;
}

function setThumbnail(dataUrl: string | null): void {
  els.mediaSkeleton.hidden = true;
  if (dataUrl && dataUrl.startsWith("data:image/")) {
    els.mediaImg.src = dataUrl;
    els.mediaImg.hidden = false;
    els.mediaPlaceholder.hidden = true;
  } else {
    els.mediaImg.hidden = true;
    els.mediaImg.removeAttribute("src");
    els.mediaPlaceholder.hidden = false;
  }
}

function setMediaText(title: string, meta: string): void {
  els.mediaLoading.hidden = true;
  els.mediaTitle.textContent = title;
  els.mediaTitle.title = title;
  els.mediaMeta.textContent = meta;
}

let previewDebounce: number | undefined;
async function onUrlInput(): Promise<void> {
  clearFieldError(els.url, els.urlError);
  window.clearTimeout(previewDebounce);
  previewDebounce = window.setTimeout(() => void refreshPreview(), 150);
}

async function refreshPreview(): Promise<void> {
  if (busy) return;
  const result = await api.checkUrl(els.url.value);
  if (!result.ok) {
    hideMedia();
    previewToken++;
    return;
  }
  if (result.canonical === previewLink) return;
  previewLink = result.canonical;
  showMediaLoading(result.kind);
  const token = ++previewToken;
  await api.preview(result.canonical, els.format.value as FormatKey, token);
}

// -- validation (RA-05, RA-06) -------------------------------------------------------------------

function fieldError(input: HTMLElement, box: HTMLElement, text: HTMLElement, message: string, focus: HTMLElement): void {
  text.textContent = message;
  box.hidden = false;
  input.setAttribute("aria-invalid", "true");
  setStatus(message, { kind: "error" });
  alertText(message);
  focus.focus();
}

function clearFieldError(input: HTMLElement, box: HTMLElement): void {
  if (box.hidden) return;
  box.hidden = true;
  input.removeAttribute("aria-invalid");
}

// -- busy state ----------------------------------------------------------------------------------

function setBusy(value: boolean): void {
  busy = value;
  // A control that is about to be disabled loses the focus: it goes to Cancel, never to the page.
  const active = document.activeElement;
  const losesFocus = value && (active === els.url || active === els.browse || active === els.format);
  els.url.disabled = value;
  els.browse.disabled = value;
  els.format.disabled = value;
  els.settings.disabled = false;
  if (value) {
    els.openFile.disabled = true;
    els.openFolder.disabled = true;
  }
  renderGo();
  if (losesFocus || (value && document.activeElement === document.body)) els.go.focus();
}

function working(on: boolean): void {
  els.progressTrack.classList.toggle("is-working", on);
}

// -- download -----------------------------------------------------------------------------------

type Choice = "video" | "playlist" | "back";
/** When the last dialog closed: Chromium closes a dialog on Esc before the page sees the key,
 * and that same Esc must not also close the window. */
let dialogClosedAt = -Infinity;

function ask<T extends string>(dialog: HTMLDialogElement, defaultValue: T, cancelValue: T): Promise<T> {
  const origin = document.activeElement as HTMLElement | null;
  return new Promise((resolve) => {
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button[data-value]")];
    const done = (value: T) => {
      for (const b of buttons) b.onclick = null;
      dialog.oncancel = null;
      if (dialog.open) dialog.close();
      dialogClosedAt = performance.now();
      // Focus goes back to where it was (RA-07), or to the main button.
      const usable = origin && origin !== document.body && document.contains(origin) && !(origin as HTMLButtonElement).disabled && !origin.closest("[hidden]");
      const target = usable ? origin : els.go;
      target.focus();
      resolve(value);
    };
    for (const b of buttons) b.onclick = () => done(b.dataset.value as T);
    dialog.oncancel = (e) => {
      e.preventDefault();
      done(cancelValue);
    };
    dialog.showModal();
    // The focus goes to the default button at once, without waiting for the animation (A-11).
    (buttons.find((b) => b.dataset.value === defaultValue) ?? buttons[0]).focus();
  });
}

async function onSubmit(e: Event): Promise<void> {
  e.preventDefault();
  if (busy) {
    if (jobId !== null) {
      setStatus(s.cancelling, { announce: true });
      await api.cancel(jobId);
    }
    return;
  }
  const result = await api.checkUrl(els.url.value);
  if (!result.ok) {
    const message = result.reason === "empty" ? s.urlEmpty : result.reason === "video" ? s.urlVideo : s.urlHost;
    fieldError(els.url, els.urlError, els.urlErrorText, message, els.url);
    return;
  }
  els.url.value = result.canonical;
  let mode: "video" | "playlist" = result.kind === "playlist" ? "playlist" : "video";
  if (result.kind === "both") {
    const choice = await ask<Choice>($<HTMLDialogElement>("dlg-choice"), "video", "back");
    if (choice === "back") return;
    mode = choice;
  }
  await startDownload(result.canonical, mode);
}

async function startDownload(url: string, mode: "video" | "playlist"): Promise<void> {
  const key = els.format.value as FormatKey;
  const r = await api.start({ url, format: key, mode });
  if (!r.ok) {
    if (r.error === "folder") fieldError(els.folder, els.folderError, els.folderErrorText, s.err_permission, els.browse);
    else if (r.error === "url") fieldError(els.url, els.urlError, els.urlErrorText, r.reason === "empty" ? s.urlEmpty : r.reason === "video" ? s.urlVideo : s.urlHost, els.url);
    return;
  }
  jobId = r.jobId;
  jobIsPlaylist = mode === "playlist";
  itemTitle = "";
  lastStatusAnnounce = "";
  setBusy(true);
  setProgress(0);
  working(false);
  setStatus(jobIsPlaylist ? s.readingPlaylist : s.readingVideo, { announce: true });
  if (els.media.hidden) showMediaLoading(jobIsPlaylist ? "playlist" : "video");
  els.media.classList.remove("is-done");
}

function finish(): void {
  setBusy(false);
  working(false);
}

const handlers: { [E in keyof Events]?: (p: Events[E]) => void } = {
  "preview:thumbnail": (p) => {
    if (p.token === previewToken) setThumbnail(p.dataUrl);
  },
  "preview:info": (p) => {
    if (p.token !== previewToken) return;
    if (p.kind === "video") {
      const meta = [p.channel, p.duration ? duration(s, p.duration) : ""].filter(Boolean).join(" · ");
      setMediaText(p.title, meta);
      const text = p.duration ? format(s.previewVideo, { title: p.title, duration: duration(s, p.duration) }) : format(s.previewVideoNoDuration, { title: p.title });
      if (announcedPreview !== previewLink && !busy) {
        announcedPreview = previewLink;
        say(text);
      }
    } else if (p.kind === "playlist") {
      previewPlaylistCount = p.count;
      setMediaText(p.title, "");
      updateBadge();
      if (announcedPreview !== previewLink && !busy) {
        announcedPreview = previewLink;
        say(format(s.previewPlaylist, { title: p.title, count: p.count }));
      }
    } else {
      // The error is said when the person presses Download; the card only stops loading.
      els.mediaLoading.hidden = true;
      if (!els.mediaImg.src) setThumbnail(null);
    }
  },
  "job:info": (p) => {
    if (p.jobId !== jobId) return;
    const meta = [p.channel, p.duration ? duration(s, p.duration) : ""].filter(Boolean).join(" · ");
    setMediaText(p.title, meta);
    setStatus(format(s.downloadingTitle, { title: p.title }), { announce: true });
  },
  "job:playlistInfo": async (p) => {
    if (p.jobId !== jobId) return;
    previewPlaylistCount = p.count;
    previewKind = "playlist";
    setMediaText(p.title, "");
    updateBadge();
    $("dlg-confirm-text").textContent = format(s.dlgConfirmText, { title: p.title, count: p.count, folder: p.folder });
    const answer = await ask<"yes" | "no">($<HTMLDialogElement>("dlg-confirm"), "yes", "no");
    await api.confirmPlaylist(p.jobId, answer === "yes");
    if (answer === "yes") setStatus(format(s.playlistDownloading, { title: p.title, count: p.count }), { announce: true });
  },
  "job:progress": (p) => {
    if (p.jobId !== jobId) return;
    setProgress(p.percent);
    setStatus(progressText(s, p));
    if (p.milestone !== null) say(format(s.milestone, { percent: p.milestone }));
  },
  "job:stage": (p) => {
    if (p.jobId !== jobId) return;
    setProgress(100);
    working(true);
    setStatus(p.stage === "merging" ? s.merging : s.converting, { announce: true });
  },
  "job:item": (p) => {
    if (p.jobId !== jobId) return;
    itemTitle = p.title;
    working(false);
    const text = format(s.playlistItem, { index: p.index, total: p.total, title: p.title });
    setStatus(text, { announce: settings.announce !== 0 });
  },
  "job:itemProgress": (p) => {
    if (p.jobId !== jobId) return;
    setProgress(p.percent);
    setStatus(format(s.playlistItemPercent, { index: p.index, total: p.total, title: itemTitle, percent: p.itemPercent }));
  },
  "job:thumbnail": (p) => {
    if (p.jobId === jobId && p.dataUrl) setThumbnail(p.dataUrl);
  },
  "job:done": (p) => {
    if (p.jobId !== jobId) return;
    finish();
    setProgress(100);
    els.media.classList.add("is-done");
    if (p.isPlaylist) {
      const total = p.total ?? 0;
      const done = p.done ?? 0;
      const text =
        done >= total
          ? format(s.playlistDone, { done, folder: p.folder })
          : format(s.playlistDonePartial, { done, total, folder: p.folder, failed: total - done });
      setStatus(text, { announce: true, kind: "success" });
      els.openFolder.disabled = false;
    } else {
      setStatus(format(s.done, { title: p.title, folder: p.folder }), { kind: "success" });
      say(format(s.doneShort, { title: p.title }));
      els.openFile.disabled = false;
      els.openFolder.disabled = false;
    }
  },
  "job:error": (p) => {
    if (p.jobId !== jobId) return;
    finish();
    setStatus(errorText(p.code), { announce: true, kind: "error" });
  },
  "job:cancelled": (p) => {
    if (p.jobId !== jobId) return;
    finish();
    setProgress(0);
    if (p.kept && p.folder) {
      setStatus(format(s.cancelledKept, { done: p.kept, folder: p.folder }), { announce: true });
      els.openFolder.disabled = false;
    } else {
      setStatus(s.cancelled, { announce: true });
    }
  },
  "window:shown": (p) => {
    if (!busy && p.clipboardLink && p.clipboardLink !== els.url.value) {
      els.url.value = p.clipboardLink;
      void refreshPreview();
    }
    if (!els.viewMain.hidden && !busy) {
      els.url.focus();
      els.url.select();
    }
  },
  "window:closeRequest": async () => {
    const choice = await ask<"background" | "cancel" | "back">($<HTMLDialogElement>("dlg-close"), "background", "back");
    await api.closeChoice(choice);
  },
  "app:settings": (p) => {
    const languageChanged = p.settings.language !== settings.language;
    settings = p.settings;
    s = p.strings;
    applyMotion();
    if (languageChanged) {
      renderStrings();
      if (!busy && !jobId) setStatus(s.initial);
    }
    fillSettings();
  },
  "app:openSettings": () => openSettings(),
};

function errorText(code: ErrorCode): string {
  return s[`err_${code}` as StringKey] ?? s.err_unknown;
}

// -- settings view (SDD 6.2) ------------------------------------------------------------------------

function applyMotion(): void {
  document.documentElement.dataset.motion = settings.motion;
}

function fillSettings(): void {
  els.folder.value = settings.folder;
  els.sFolder.value = settings.folder;
  for (const name of ["announce", "theme", "motion"] as const) {
    for (const r of document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) r.checked = r.value === String(settings[name]);
  }
  els.sThumbnails.checked = settings.thumbnails;
  els.sLanguage.value = settings.language;
  els.sShortcutEnabled.checked = settings.shortcutEnabled;
  els.sShortcut.value = settings.shortcut.replace("Control", "Ctrl");
  els.sShortcut.disabled = !settings.shortcutEnabled;
  els.sShortcutReset.disabled = !settings.shortcutEnabled;
  els.sStart.checked = settings.startWithWindows;
}

async function save<K extends SettingKey>(key: K, value: Settings[K], announce = true): Promise<boolean> {
  const r = await api.setSetting(key, value);
  if (r.ok && announce) say(s.saved);
  return r.ok;
}

function openSettings(): void {
  els.viewMain.hidden = true;
  els.viewSettings.hidden = false;
  fillSettings();
  els.settingsTitle.focus();
  els.sVersion.value = s.engineVersionReading;
  void api.ytdlpVersion().then((v) => (els.sVersion.value = v || s.engineVersionUnknown));
}

function closeSettings(): void {
  els.viewSettings.hidden = true;
  els.viewMain.hidden = false;
  els.settings.focus();
}

function acceleratorFrom(e: KeyboardEvent): string | null {
  if (!e.ctrlKey && !e.altKey) return null;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(e.key)) key = e.key;
  if (!key) return null;
  return [e.ctrlKey ? "Control" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : "", key].filter(Boolean).join("+");
}

function wireSettings(): void {
  els.settings.addEventListener("click", openSettings);
  els.settingsBack.addEventListener("click", closeSettings);
  els.sBrowse.addEventListener("click", async () => {
    const folder = await api.chooseFolder(true);
    if (folder) {
      settings.folder = folder;
      fillSettings();
      say(s.saved);
    }
    els.sBrowse.focus();
  });
  for (const name of ["announce", "theme", "motion"] as const) {
    for (const r of document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
      r.addEventListener("change", () => {
        if (!r.checked) return;
        const value = name === "announce" ? (Number(r.value) as Settings["announce"]) : r.value;
        // The radio itself already says its new state: no "Saved" on every arrow key.
        void save(name, value as never, false);
      });
    }
  }
  els.sThumbnails.addEventListener("change", () => void save("thumbnails", els.sThumbnails.checked));
  els.sLanguage.addEventListener("change", () => void save("language", els.sLanguage.value as Settings["language"]));
  els.sShortcutEnabled.addEventListener("change", async () => {
    const ok = await save("shortcutEnabled", els.sShortcutEnabled.checked);
    if (!ok) {
      els.sShortcutEnabled.checked = !els.sShortcutEnabled.checked;
      showShortcutMessage(s.shortcutTaken);
    }
  });
  els.sShortcut.addEventListener("keydown", async (e) => {
    // Tab, Shift+Tab and Esc always leave the field: no keyboard trap.
    if (e.key === "Tab" || e.key === "Escape" || ["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const accelerator = acceleratorFrom(e);
    if (!accelerator) {
      showShortcutMessage(s.shortcutInvalid);
      return;
    }
    const r = await api.setSetting("shortcut", accelerator);
    if (r.ok) {
      els.sShortcutMsg.hidden = true;
      say(`${accelerator.replace("Control", "Ctrl")}. ${s.saved}`);
    } else {
      showShortcutMessage(r.error === "taken" ? s.shortcutTaken : s.shortcutInvalid);
    }
  });
  els.sShortcutReset.addEventListener("click", async () => {
    if (await save("shortcut", "Control+Alt+Y")) els.sShortcutMsg.hidden = true;
    else showShortcutMessage(s.shortcutTaken);
  });
  els.sStart.addEventListener("change", () => void save("startWithWindows", els.sStart.checked));
  els.sUpdate.addEventListener("click", async () => {
    els.sUpdate.disabled = true;
    els.sUpdateMsg.hidden = false;
    els.sUpdateMsg.classList.remove("is-error");
    els.sUpdateMsg.textContent = s.updating;
    say(s.updating);
    const r = await api.updateEngine();
    const text = r.status === "updated" ? format(s.updated, { version: r.version }) : r.status === "current" ? format(s.upToDate, { version: r.version }) : s.updateFailed;
    els.sUpdateMsg.textContent = text;
    els.sUpdateMsg.classList.toggle("is-error", r.status === "failed");
    if (r.status === "failed") alertText(text);
    else say(text);
    if (r.status !== "failed") els.sVersion.value = r.version;
    els.sUpdate.disabled = false;
    els.sUpdate.focus();
  });
}

function showShortcutMessage(text: string): void {
  els.sShortcutMsg.textContent = text;
  els.sShortcutMsg.hidden = false;
  alertText(text);
}

// -- start ------------------------------------------------------------------------------------------

function wire(): void {
  els.form.addEventListener("submit", (e) => void onSubmit(e));
  els.url.addEventListener("input", () => void onUrlInput());
  els.format.addEventListener("change", () => updateBadge());
  els.browse.addEventListener("click", async () => {
    const folder = await api.chooseFolder(false);
    if (folder) {
      settings.folder = folder;
      els.folder.value = folder;
      els.sFolder.value = folder;
      clearFieldError(els.folder, els.folderError);
    }
    els.browse.focus();
  });
  els.openFile.addEventListener("click", async () => {
    if (jobId === null) return;
    const r = await api.open(jobId, "file");
    if (!r.ok) alertText(s.openFileFailed);
  });
  els.openFolder.addEventListener("click", async () => {
    if (jobId === null) return;
    const r = await api.open(jobId, "folder");
    if (!r.ok) alertText(s.openFolderFailed);
  });
  els.close.addEventListener("click", () => void api.close());
  els.mediaImg.addEventListener("error", () => setThumbnail(null));
  wireSettings();

  document.addEventListener("keydown", (e) => {
    if (accessKey(e)) return;
    if (e.key === "F1") {
      e.preventDefault();
      void api.openManual();
    } else if (e.key === "Escape" && !document.querySelector("dialog[open]") && performance.now() - dialogClosedAt > 300) {
      e.preventDefault();
      if (!els.viewSettings.hidden) closeSettings();
      else void api.close();
    } else if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "l" && !els.viewMain.hidden && !busy) {
      e.preventDefault();
      els.url.focus();
      els.url.select();
    }
  });

  for (const [event, handler] of Object.entries(handlers)) api.on(event as keyof Events, handler as (p: unknown) => void);
}

async function init(): Promise<void> {
  const state: AppState = await api.getState();
  s = state.strings;
  settings = state.settings;
  applyMotion();
  els.format.value = settings.format;
  renderStrings();
  els.format.value = settings.format;
  fillSettings();
  setStatus(s.initial);
  setProgress(0);
  wire();
  if (state.clipboardLink) {
    els.url.value = state.clipboardLink;
    void refreshPreview();
  }
  els.url.focus();
  els.url.select();
  if (!settings.noticeSeen) {
    await ask<"ok">($<HTMLDialogElement>("dlg-notice"), "ok", "ok");
    void api.setSetting("noticeSeen", true);
    els.url.focus();
  }
  document.body.dataset.ready = "true";
}

void init();
