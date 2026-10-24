// Baixar YouTube - folders.ts
// The check that a folder can be written (RF-03, RF-05). The Downloads folder
// itself comes from Electron (app.getPath("downloads")).

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** True when a file can be created in the folder (it exists and there is permission). */
export function isWritable(folder: string | null | undefined): boolean {
  if (!folder) return false;
  try {
    if (!fs.statSync(folder).isDirectory()) return false;
  } catch {
    return false;
  }
  const probe = path.join(folder, `.baixar-${crypto.randomBytes(6).toString("hex")}`);
  let fd: number;
  try {
    fd = fs.openSync(probe, "wx");
  } catch {
    return false;
  }
  fs.closeSync(fd);
  try {
    fs.unlinkSync(probe);
  } catch {
    // left behind only if another program locked it at once
  }
  return true;
}

export function isFolder(folder: string | null | undefined): boolean {
  if (!folder) return false;
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}
