import { BrowserWindow } from "electron";
import { join, resolve } from "node:path";

const DEBUG = process.env.DEBUG;

function openSettings() {
  const focusedWin = BrowserWindow.getFocusedWindow();
  if (focusedWin) {
    const win = new BrowserWindow({
      parent: focusedWin,
      icon: join(__dirname, "../assets/icon.png"),
      webPreferences: {
        preload: resolve(join(__dirname, "../preload/preload.js")),
        contextIsolation: true,
      },
    });
    win.webContents.once("did-finish-load", () => {
      // avoid race condition
      if (DEBUG) {
        win.webContents.openDevTools();
      }
    });
    win.removeMenu();
    win.loadFile(join(__dirname, "../settings.html"));
    win.show();
  }
}

export { openSettings };
