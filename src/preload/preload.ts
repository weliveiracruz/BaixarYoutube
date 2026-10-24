// Baixar YouTube - preload.ts
// The only bridge between the window and the main process (RS-07): named functions,
// never ipcRenderer itself, and only the events listed in EVENT_NAMES.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { EVENT_NAMES, type BaixarApi, type EventName } from "../shared/types";

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: BaixarApi = {
  getState: () => invoke("app:getState"),
  checkUrl: (url) => invoke("url:check", url),
  preview: (url, format, token) => invoke("url:preview", url, format, token),
  chooseFolder: (forSettings) => invoke("folder:choose", forSettings),
  start: (request) => invoke("job:start", request),
  confirmPlaylist: (jobId, yes) => invoke("job:confirmPlaylist", jobId, yes),
  cancel: (jobId) => invoke("job:cancel", jobId),
  open: (jobId, what) => invoke("job:open", jobId, what),
  close: () => invoke("window:close"),
  closeChoice: (choice) => invoke("window:closeChoice", choice),
  setSetting: (key, value) => invoke("settings:set", key, value),
  ytdlpVersion: () => invoke("engine:version"),
  updateEngine: () => invoke("engine:update"),
  openManual: () => invoke("app:manual"),
  on: (event, listener) => {
    if (!(EVENT_NAMES as readonly string[]).includes(event)) throw new Error("unknown event");
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => (listener as (p: unknown) => void)(payload);
    ipcRenderer.on(event as EventName, wrapped);
    return () => ipcRenderer.removeListener(event, wrapped);
  },
};

contextBridge.exposeInMainWorld("baixar", api);
