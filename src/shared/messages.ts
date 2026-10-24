// Baixar YouTube - messages.ts
// Sizes, durations and progress texts (port of messages.py of YouTubeDownloaderNVDA).

import { format, type Strings } from "./strings";

function decimal(s: Strings, value: number): string {
  return value.toFixed(1).replace(".", s.decimal);
}

export function size(s: Strings, value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value >= 1024 ** 3) return format(s.sizeGB, { size: decimal(s, value / 1024 ** 3) });
  if (value >= 1024 ** 2) return format(s.sizeMB, { size: decimal(s, value / 1024 ** 2) });
  return format(s.sizeKB, { size: Math.max(1, Math.round(value / 1024)) });
}

export function duration(s: Strings, seconds: number | null | undefined): string {
  const total = Math.trunc(seconds ?? 0);
  if (total >= 60) return format(s.minutesSeconds, { minutes: Math.floor(total / 60), seconds: total % 60 });
  return format(s.seconds, { seconds: total });
}

/** Text of the Status field while downloading. */
export function progressText(s: Strings, p: { percent: number; downloaded: number; total: number | null; eta: number | null }): string {
  if (p.total) {
    if (p.eta) {
      return format(s.downloadingSizeEta, {
        percent: p.percent,
        downloaded: size(s, p.downloaded),
        total: size(s, p.total),
        remaining: duration(s, p.eta),
      });
    }
    return format(s.downloadingSize, { percent: p.percent, downloaded: size(s, p.downloaded), total: size(s, p.total) });
  }
  return format(s.downloadingPercent, { percent: p.percent });
}

/** "Ctrl+Alt+Y" for the Electron accelerator "Control+Alt+Y". */
export function shortcutText(accelerator: string): string {
  return accelerator.replace(/\bControl\b|\bCommandOrControl\b|\bCmdOrCtrl\b/g, "Ctrl");
}
