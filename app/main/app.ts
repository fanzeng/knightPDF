/*
NightPDF Dark mode for Ps
Copyright (C) 2021  Advaith Madhukar

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; version 2
of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
*/
/* eslint no-unused-vars: [ "error", { "argsIgnorePattern": "^_" } ] */
import {
  app,
  BrowserWindow,
  Menu,
  type MenuItem,
  type MenuItemConstructorOptions,
  dialog,
  ipcMain,
  shell,
  nativeTheme,
  Notification,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { parse, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { version } from "../../package.json";
import { autoUpdater } from "electron-updater";
import { readFileSync } from "node:fs";
import localShortcut from "electron-localshortcut";
import log from "electron-log";
import yargs from "yargs";
import Store from "electron-store";
import {
  nightpdf_schema,
  type NightPDFSettings,
  type Keybinds,
  nightpdf_default_settings,
  KeybindsHelper,
  type OpenedFile,
  type OpenedWindow,
  type FilterPreferences,
} from "../helpers/settings";
import { createMenu } from "./menutemplate";
import process from "node:process";

// Workaround if the schema is invalid
// see: https://github.com/sindresorhus/electron-store/issues/116#issuecomment-816515814
const makeStore = (
  options: Store.Options<NightPDFSettings>,
): Store<NightPDFSettings> => {
  try {
    return new Store<NightPDFSettings>(options);
  } catch (e) {
    console.error(e);
    console.log("Resetting configuration...");
    const store = new Store<NightPDFSettings>({
      ...options,
      schema: undefined,
    });
    store.clear();
    return new Store<NightPDFSettings>(options);
  }
};

const default_settings = nightpdf_default_settings(version);
const store = makeStore({
  schema: nightpdf_schema,
  defaults: default_settings,
  clearInvalidConfig: true,
});

let wins: BrowserWindow[] = [];
let updaterCheckStarted = false;
const windowSessionIds = new Map<number, string>();
const closeApprovals = new Set<number>();
const pendingCloseSaves = new Map<number, Promise<void>>();
const closeWaiters = new Map<number, () => void>();
const closeTimeouts = new Map<number, NodeJS.Timeout>();
const CLOSE_SAVE_TIMEOUT_MS = 1200;
const MAX_RECENTLY_CLOSED = 10;
let menuIsConfigured = false;

const DEBUG = process.env.DEBUG;
const FLATPAK = process.env.FLATPAK;
const linux = process.platform === "linux";
log.transports.file.level = "debug";

const NOTIFICATION_TITLE = "Trans rights";
const NOTIFICATION_BODY = "Trans rights are human rights 🏳️‍⚧️";

//in the future this can be use for migrations
const store_version = store.get("version");
if (store_version) {
  if (store_version !== version) {
    console.log(`update store to ${version}`);
    const general = store.get("general");
    if (general) {
      if (typeof general.DisplayThumbs !== "boolean") {
        general.DisplayThumbs = true;
      }
      if (typeof general.MultiWindow !== "boolean") {
        general.MultiWindow = false;
      }
      store.set("general", general);
    }
    store.set("version", version);
  }
} else {
  store.set("version", version);
}

const generalSettings = store.get("general");
if (typeof generalSettings.MultiWindow !== "boolean") {
  generalSettings.MultiWindow = false;
  store.set("general", generalSettings);
}

if (store.get("openedGroups").length === 0) {
  const legacyFiles = store.get("openedFiles");
  if (legacyFiles.length > 0) {
    store.set("openedGroups", [
      { id: randomUUID(), files: normalizeOpenedFiles(legacyFiles) },
    ]);
    store.set("openedFiles", []);
  }
}

function normalizeFilename(filename: string): string {
  return resolve(filename.replace(/^file:\/\//, ""));
}

function normalizeOpenedFiles(files: (OpenedFile | string)[]): OpenedFile[] {
  const normalized = new Map<string, OpenedFile>();
  for (const file of files) {
    const filename = normalizeFilename(
      typeof file === "string" ? file : file.filename,
    );
    normalized.set(filename, {
      filename,
      pageNumber: typeof file === "string" ? 0 : file.pageNumber,
    });
  }
  return [...normalized.values()];
}

function getOpenedGroupFiles(sessionId: string): OpenedFile[] {
  return (
    store.get("openedGroups").find((group) => group.id === sessionId)?.files ??
    []
  );
}

function setOpenedGroupFiles(
  sessionId: string,
  files: (OpenedFile | string)[],
) {
  const groups: OpenedWindow[] = store.get("openedGroups");
  const normalized = normalizeOpenedFiles(files);
  const groupIndex = groups.findIndex((group) => group.id === sessionId);
  if (normalized.length === 0) {
    store.set(
      "openedGroups",
      groups.filter((group) => group.id !== sessionId),
    );
  } else if (groupIndex === -1) {
    store.set("openedGroups", [
      ...groups,
      { id: sessionId, files: normalized },
    ]);
  } else {
    groups[groupIndex].files = normalized;
    store.set("openedGroups", groups);
  }
}

function appendOpenedFiles(win: BrowserWindow, filenames: string[]) {
  const sessionId = windowSessionIds.get(win.webContents.id);
  if (!sessionId) {
    return;
  }
  const currentFiles = getOpenedGroupFiles(sessionId);
  const existingFilenames = new Set(currentFiles.map((file) => file.filename));
  setOpenedGroupFiles(sessionId, [
    ...currentFiles,
    ...filenames
      .map((filename) => normalizeFilename(filename))
      .filter((filename) => !existingFilenames.has(filename))
      .map((filename) => ({ filename, pageNumber: 0 })),
  ]);
}

function getActivePDFWindow(): BrowserWindow | undefined {
  const focusedWin = BrowserWindow.getFocusedWindow();
  if (focusedWin && wins.includes(focusedWin)) {
    return focusedWin;
  }
  return wins.find((win) => !win.isDestroyed());
}

function rememberClosedTab(file: OpenedFile) {
  store.set(
    "recentlyClosedTabs",
    [
      {
        ...file,
        id: randomUUID(),
        filename: normalizeFilename(file.filename),
      },
      ...store.get("recentlyClosedTabs"),
    ].slice(0, MAX_RECENTLY_CLOSED),
  );
  refreshRecentlyClosedMenus();
}

function rememberClosedWindow(files: OpenedFile[]) {
  if (files.length === 0) {
    return;
  }
  const recentWindows: OpenedWindow[] = store.get("recentlyClosedWindows");
  store.set(
    "recentlyClosedWindows",
    [
      { id: randomUUID(), files: normalizeOpenedFiles(files) },
      ...recentWindows,
    ].slice(0, MAX_RECENTLY_CLOSED),
  );
  refreshRecentlyClosedMenus();
}

function findMenuItem(menu: Menu, id: string): MenuItem | undefined {
  for (const item of menu.items) {
    if (item.id === id) {
      return item;
    }
    if (item.submenu) {
      const nestedItem = findMenuItem(item.submenu, id);
      if (nestedItem) {
        return nestedItem;
      }
    }
  }
}

let openPdfDialog: (openInNewWindow?: boolean) => void = () => {};
let printingEnabled = false;
let navigateMenuItems: MenuItemConstructorOptions[] | undefined;

function buildApplicationMenu(): Menu {
  const recentlyClosedTabs: MenuItemConstructorOptions[] = store
    .get("recentlyClosedTabs")
    .map((file) => ({
      label: `${parse(file.filename).base} (page ${file.pageNumber})`,
      click: () => reopenRecentlyClosedTab(file.id),
    }));
  const recentlyClosedWindows: MenuItemConstructorOptions[] = store
    .get("recentlyClosedWindows")
    .filter((closedWindow) => closedWindow.files.length > 0)
    .map((closedWindow) => {
      const firstFile = closedWindow.files[0];
      const extraCount = closedWindow.files.length - 1;
      return {
        label: `${parse(firstFile.filename).base}${extraCount > 0 ? ` (+${extraCount} more)` : ""}`,
        click: () => reopenRecentlyClosedWindow(closedWindow.id),
      };
    });
  const menu = Menu.buildFromTemplate(
    createMenu(recentlyClosedTabs, recentlyClosedWindows, navigateMenuItems),
  );
  const fileNewTab = findMenuItem(menu, "file-new-tab");
  const fileOpen = findMenuItem(menu, "file-open");
  const fileNewWindow = findMenuItem(menu, "file-new-window");
  const print = findMenuItem(menu, "file-print");
  const fileQuit = findMenuItem(menu, "file-quit");

  if (fileNewTab) {
    fileNewTab.click = () => openPdfDialog(false);
  }
  if (fileOpen) {
    fileOpen.click = () => openPdfDialog();
  }
  if (fileNewWindow) {
    fileNewWindow.click = () => createWindow();
  }
  if (print) {
    print.enabled = printingEnabled;
    print.click = () => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      focusedWin?.webContents.send("file-print");
    };
  }
  if (fileQuit) {
    fileQuit.click = () => app.quit();
  }

  return menu;
}

function refreshRecentlyClosedMenus() {
  Menu.setApplicationMenu(buildApplicationMenu());
}

function reopenRecentlyClosedTab(id: string) {
  const closedTabs = store.get("recentlyClosedTabs");
  const index = closedTabs.findIndex((file) => file.id === id);
  if (index < 0) {
    return;
  }
  const [selectedTab] = closedTabs.splice(index, 1);
  store.set("recentlyClosedTabs", closedTabs);
  const targetWin = getActivePDFWindow();
  if (targetWin) {
    targetWin.webContents.send("file-open", [
      selectedTab.filename,
      selectedTab.pageNumber,
    ]);
  } else {
    createWindow(selectedTab.filename, selectedTab.pageNumber);
  }
  refreshRecentlyClosedMenus();
}

function reopenRecentlyClosedWindow(id: string) {
  const closedWindows = store.get("recentlyClosedWindows");
  const index = closedWindows.findIndex(
    (closedWindow) => closedWindow.id === id,
  );
  if (index < 0) {
    return;
  }
  const [selectedWindow] = closedWindows.splice(index, 1);
  store.set("recentlyClosedWindows", closedWindows);
  createWindow(
    selectedWindow.files.map((file) => file.filename),
    selectedWindow.files.map((file) => file.pageNumber),
  );
  refreshRecentlyClosedMenus();
}

function prepareWindowClose(win: BrowserWindow): Promise<void> {
  const webContentsId = win.webContents.id;
  if (closeApprovals.has(webContentsId)) {
    return Promise.resolve();
  }
  const existing = pendingCloseSaves.get(webContentsId);
  if (existing) {
    return existing;
  }

  const pending = new Promise<void>((resolvePromise) => {
    let completed = false;
    const complete = () => {
      if (completed) {
        return;
      }
      completed = true;
      const timeout = closeTimeouts.get(webContentsId);
      if (timeout) {
        clearTimeout(timeout);
        closeTimeouts.delete(webContentsId);
      }
      closeWaiters.delete(webContentsId);
      closeApprovals.add(webContentsId);
      pendingCloseSaves.delete(webContentsId);
      resolvePromise();
    };

    closeWaiters.set(webContentsId, complete);
    if (win.webContents.isDestroyed()) {
      complete();
      return;
    }
    try {
      win.webContents.send("prepare-to-close");
    } catch {
      complete();
      return;
    }
    closeTimeouts.set(
      webContentsId,
      setTimeout(complete, CLOSE_SAVE_TIMEOUT_MS),
    );
  });
  pendingCloseSaves.set(webContentsId, pending);
  return pending;
}

ipcMain.on("window-close-ready", (event: IpcMainEvent) => {
  closeWaiters.get(event.sender.id)?.();
});

let quitInProgress = false;
let appQuitApproved = false;
app.on("before-quit", (event) => {
  if (appQuitApproved) {
    return;
  }
  event.preventDefault();
  if (quitInProgress) {
    return;
  }
  quitInProgress = true;
  Promise.all(
    wins.filter((win) => !win.isDestroyed()).map(prepareWindowClose),
  ).then(() => {
    appQuitApproved = true;
    app.quit();
  });
});

function getpath(filePath: string) {
  return parse(filePath).base;
}

function versionString(): string {
  const pdfjsver = readFileSync(join(__dirname, "../../.pdfjs_version"));
  return `NightPDF: ${version} PDF.js: ${pdfjsver} Electron: v${process.versions.electron}`;
}

function setkeybind(id: string, command: Keybinds) {
  const storeKeybinds = store.get("keybinds");
  if (!storeKeybinds) {
    throw new Error("keybinds not found in store");
  }
  storeKeybinds[id] = command;
  console.debug("id", id);
  console.debug("command", command);
  console.debug(storeKeybinds);
  store.set("keybinds", storeKeybinds);
}

function createWindow(
  filename: string | string[] | null = null,
  page: number | number[] | null = null,
  sessionId: string = randomUUID(),
) {
  //force dark theme irespective of os theme
  //useful for linux since we don't have a standardised way of detecting dark theme
  nativeTheme.themeSource = "dark";
  // Create the browser window.
  const win = new BrowserWindow({
    width: 550,
    height: 420,
    minWidth: 565,
    icon: join(__dirname, "../assets/icon.png"),
    minHeight: 200,
    webPreferences: {
      sandbox: true,
      webviewTag: true,
      preload: resolve(join(__dirname, "../preload/preload.js")),
    },
    resizable: true,
    titleBarStyle: "default",
    show: false,
  });
  if (!(linux && FLATPAK) && !updaterCheckStarted) {
    updaterCheckStarted = true;
    try {
      autoUpdater.logger = log;
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      if (DEBUG) {
        log.error(e);
      }
    }
  }
  wins.push(win);
  windowSessionIds.set(win.webContents.id, sessionId);
  if (filename) {
    const filenames = Array.isArray(filename) ? filename : [filename];
    const files = filenames.map((path, index) => ({
      filename: normalizeFilename(path),
      pageNumber: Array.isArray(page)
        ? page[index] ?? 0
        : typeof page === "number"
          ? page
          : 0,
    }));
    setOpenedGroupFiles(sessionId, files);
  }

  // and load the index.html of the app.

  win.loadFile(join(__dirname, "../index.html"));
  const wc = win.webContents;
  // if the window url changes from the inital one,
  // block the change and use xdg-open to open it
  // @ts-ignore - will-navigate is not in the type definition
  wc.on("will-navigate", (e: Event, url: string) => {
    if (url !== wc.getURL()) {
      e.preventDefault();
      if (url.split("/")[0].indexOf("http") > -1) {
        shell.openExternal(url);
        log.debug(`${url} is 3rd party content opening externally`);
      }
    }
  });
  const webContentsId = win.webContents.id;
  win.on("close", (event) => {
    if (closeApprovals.has(webContentsId)) {
      closeApprovals.delete(webContentsId);
      return;
    }
    event.preventDefault();
    void prepareWindowClose(win).then(() => {
      if (!win.isDestroyed()) {
        win.close();
      }
    });
  });
  win.once("closed", () => {
    const sessionId = windowSessionIds.get(webContentsId);
    if (sessionId && !appQuitApproved) {
      const otherWindows = wins.filter(
        (openWin) => openWin !== win && !openWin.isDestroyed(),
      );
      const appWillQuit =
        process.platform !== "darwin" && otherWindows.length === 0;
      if (!appWillQuit) {
        rememberClosedWindow(getOpenedGroupFiles(sessionId));
        setOpenedGroupFiles(sessionId, []);
      }
    }
    wins = wins.filter((openWin) => openWin !== win && !openWin.isDestroyed());
    windowSessionIds.delete(webContentsId);
    closeApprovals.delete(webContentsId);
    closeWaiters.delete(webContentsId);
    const timeout = closeTimeouts.get(webContentsId);
    if (timeout) {
      clearTimeout(timeout);
      closeTimeouts.delete(webContentsId);
    }
  });

  win.webContents.removeAllListeners("did-finish-load");
  win.webContents.once("did-finish-load", () => {
    // avoid race condition
    if (DEBUG) {
      win.webContents.openDevTools();
    }
    if (filename) {
      if (page) {
        win.webContents.send("file-open", [filename, page]);
      } else {
        // biome-ignore lint: don't double wrap array
        filename = Array.isArray(filename) ? filename : [filename];
        win.webContents.send("file-open", filename);
      }
      win.show();
    } else {
      win.show();
    }
    if (filename && store.store.general.MaximizeOnOpen) {
      win.maximize();
    }
  });

  if (!menuIsConfigured) {
    Menu.setApplicationMenu(buildApplicationMenu());
    menuIsConfigured = true;
    refreshRecentlyClosedMenus();

    ipcMain.handle("getPath", (_e: IpcMainInvokeEvent, args: string) => {
      return getpath(args);
    });

    ipcMain.handle("ResolvePath", (_e: IpcMainInvokeEvent, args: string) => {
      return resolve(args);
    });

    ipcMain.on("openExternal", async (_e: IpcMainEvent, url: string) => {
      await shell.openExternal(url);
      log.debug(`${url} is 3rd party content opening externally`);
    });

    ipcMain.on(
      "SetBind",
      (_e: IpcMainEvent, newKeybind: [string, Keybinds]) => {
        setkeybind(newKeybind[0], newKeybind[1]);
      },
    );
    ipcMain.on(
      "SetSetting",
      (_e: IpcMainEvent, newSetting: [string, string, unknown]) => {
        const [settingGroup, key, value] = newSetting;
        const storeSettings = store.get(settingGroup);
        if (!storeSettings) {
          throw new Error(`${settingGroup} not found in store`);
        }
        if (!Object.prototype.hasOwnProperty.call(storeSettings, key)) {
          throw new Error(`${key} not found in ${settingGroup} in store`);
        }
        // @ts-ignore
        storeSettings[key] = value;
        store.set(settingGroup, storeSettings);
      },
    );
    ipcMain.handle(
      "SetFilterPreferences",
      (_event: IpcMainInvokeEvent, filterPreferences: FilterPreferences) => {
        store.set("filterPreferences", filterPreferences);
      },
    );
    ipcMain.handle(
      "SetOpenedFiles",
      (event: IpcMainInvokeEvent, openedFiles: (OpenedFile | string)[]) => {
        const sessionId = windowSessionIds.get(event.sender.id);
        if (sessionId) {
          setOpenedGroupFiles(sessionId, openedFiles ?? []);
        }
      },
    );
    ipcMain.handle("GetOpenedFiles", (event: IpcMainInvokeEvent) => {
      const sessionId = windowSessionIds.get(event.sender.id);
      return sessionId ? getOpenedGroupFiles(sessionId) : [];
    });
    ipcMain.handle(
      "ReceivePageNumber",
      (event: IpcMainInvokeEvent, filename: string, pageNumber: number) => {
        const sessionId = windowSessionIds.get(event.sender.id);
        if (!sessionId) {
          return;
        }
        const normalizedFilename = normalizeFilename(filename);
        const files = getOpenedGroupFiles(sessionId).map((file) =>
          file.filename === normalizedFilename ? { ...file, pageNumber } : file,
        );
        setOpenedGroupFiles(sessionId, files);
      },
    );
    ipcMain.handle(
      "RecordClosedTab",
      (event: IpcMainInvokeEvent, file: OpenedFile) => {
        const filename = normalizeFilename(file.filename);
        const sessionId = windowSessionIds.get(event.sender.id);
        const savedFile = sessionId
          ? getOpenedGroupFiles(sessionId).find(
              (openedFile) => openedFile.filename === filename,
            )
          : undefined;
        rememberClosedTab({
          filename,
          pageNumber:
            Number.isFinite(file.pageNumber) && file.pageNumber > 0
              ? file.pageNumber
              : savedFile?.pageNumber ?? 0,
        });
      },
    );
    ipcMain.handle(
      "RemoveRecentlyClosedTab",
      (_event: IpcMainInvokeEvent, filename: string) => {
        const closedTabs = store.get("recentlyClosedTabs");
        const index = closedTabs.findIndex(
          (file) => file.filename === normalizeFilename(filename),
        );
        if (index >= 0) {
          closedTabs.splice(index, 1);
          store.set("recentlyClosedTabs", closedTabs);
          refreshRecentlyClosedMenus();
        }
      },
    );

    ipcMain.handle("GetSettings", (_e: IpcMainInvokeEvent) => {
      return store.store;
    });

    ipcMain.handle("GetVersion", (_e: IpcMainInvokeEvent) => {
      return versionString();
    });
  }

  const openNewPDF = (openInNewWindow = store.get("general").MultiWindow) => {
    const focusedWin = getActivePDFWindow();
    const options: OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    };
    const dialogPromise = focusedWin
      ? dialog.showOpenDialog(focusedWin, options)
      : dialog.showOpenDialog(options);
    dialogPromise.then((dialogReturn: OpenDialogReturnValue) => {
      const filenames = dialogReturn.filePaths;
      if (filenames && filenames.length > 0) {
        if (openInNewWindow) {
          createWindow(filenames);
        } else {
          const targetWin = getActivePDFWindow();
          if (targetWin) {
            targetWin.webContents.send("file-open", filenames);
            appendOpenedFiles(targetWin, filenames);
            if (store.store.general.MaximizeOnOpen) {
              targetWin.maximize();
            }
          } else {
            createWindow(filenames);
          }
        }
      }
    });
  };
  openPdfDialog = openNewPDF;

  ipcMain.removeAllListeners("togglePrinting");
  ipcMain.on("togglePrinting", (_e: IpcMainEvent, msg: string) => {
    printingEnabled = Boolean(msg);
    const menu = Menu.getApplicationMenu();
    if (menu) {
      const print = findMenuItem(menu, "file-print");
      if (print) {
        print.enabled = printingEnabled;
      }
    }
  });

  ipcMain.removeAllListeners("newWindow");
  ipcMain.on("newWindow", (_event: IpcMainEvent, msg: string | string[]) => {
    const filenames = Array.isArray(msg) ? msg : msg ? [msg] : [];
    createWindow(filenames.length > 0 ? filenames : null);
  });

  ipcMain.removeAllListeners("resizeWindow");
  ipcMain.on("resizeWindow", (event: IpcMainEvent, _msg: string) => {
    const targetWin = wins.find(
      (openWin) => openWin.webContents.id === event.sender.id,
    );
    if (!targetWin) {
      return;
    }
    const { width, height } = targetWin.getBounds();
    if (width < 1000 || height < 650) {
      targetWin.setResizable(true);
      targetWin.setSize(1000, 650);
      targetWin.center();
    }
  });

  ipcMain.removeAllListeners("openNewPDF");
  ipcMain.on(
    "openNewPDF",
    (_e: IpcMainEvent, openInNewWindow: boolean | null) => {
      openNewPDF(openInNewWindow ?? store.get("general").MultiWindow);
    },
  );
}

let fileToOpen: string | (OpenedFile | string)[] = "";
let pageToOpen: number | number[] | null = null;

const argv = yargs
  .scriptName("NightPDF")
  .usage("Usage: $0 [-p] <pdf>")
  .example("$0 -p 5 pdf.pdf", "Loads pdf on the 5th page")
  .option("p", {
    alias: "pages",
    describe: "The page to open in the pdf",
    type: "number",
  })
  .positional("pdf", {
    describe: "The pdf to open",
    type: "string",
    alias: "pdf",
  })
  .array("pdf")
  .describe("help", "Show help.") // Override --help usage message.
  .version(versionString())
  .epilog(`copyright ${new Date().getFullYear()}`)
  .parseSync();

const { p, _ } = argv;
const pdf = _ as string[]; // string[] or number[] force only string[]

if (pdf.length > 0) {
  fileToOpen = pdf;
  if (p) {
    pageToOpen = p;
  }
}

// @ts-ignore - open-file is not in the electron type definitions
app.on("open-file", (e: Event, path: string) => {
  e.preventDefault();
  if (app.isReady()) {
    if (store.get("general").MultiWindow) {
      createWindow(path);
    } else {
      const targetWin = getActivePDFWindow();
      if (targetWin) {
        targetWin.webContents.send("file-open", [path]);
        appendOpenedFiles(targetWin, [path]);
      } else {
        createWindow(path);
      }
    }
  } else {
    fileToOpen = resolve(path);
  }
});

app.whenReady().then(() => {
  const keybinds: KeybindsHelper = new KeybindsHelper(
    store.get("keybinds") as Record<string, Keybinds>,
    process.platform,
  );
  const hasExplicitOpen = Array.isArray(fileToOpen)
    ? fileToOpen.length > 0
    : fileToOpen.length > 0;
  if (hasExplicitOpen) {
    let filenames: string | string[];
    if (typeof fileToOpen === "string") {
      filenames = fileToOpen.replace("file://", "");
    } else {
      filenames = [];
      pageToOpen = [];
      for (const [index, item] of fileToOpen.entries()) {
        if (typeof item === "string") {
          filenames.push(item.replace("file://", ""));
          pageToOpen.push(0);
        } else {
          filenames.push(item.filename.replace("file://", ""));
          pageToOpen.push(item.pageNumber);
        }
      }
    }
    if (pageToOpen) {
      createWindow(filenames, pageToOpen);
    } else {
      createWindow(filenames);
    }
  } else {
    const groups = store.get("openedGroups").filter((group) => {
      return group.files.length > 0;
    });
    if (groups.length > 0) {
      for (const group of groups) {
        createWindow(
          group.files.map((file) => file.filename),
          group.files.map((file) => file.pageNumber),
          group.id,
        );
      }
    } else {
      createWindow();
    }
  }

  if (process.env.EASTER_EGG) {
    localShortcut.register("shift+alt+T", () => {
      console.log(NOTIFICATION_BODY);
      new Notification({
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
      }).show();
    });
  }

  const sm: MenuItemConstructorOptions[] = [];
  for (const action of keybinds.actions) {
    const triggers = keybinds.getActionKeybindsTrigger(action);
    const cb = () => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (focusedWin) {
        focusedWin.webContents.send(
          keybinds.getAction(action),
          action === "openNewPDF" ? false : keybinds.getActionData(action),
        );
      }
    };
    for (const [index, accelerator] of triggers.entries()) {
      sm.push({
        label: `${keybinds.getActionDisplayName(action)}${index > 0 ? " (alternate)" : ""}`,
        accelerator,
        click: cb,
      });
    }
  }

  // register Ctrl+1 to Ctrl+9 shortcuts
  let k = "Ctrl";
  if (process.platform === "darwin") {
    k = "Cmd";
  }
  for (let i = 1; i <= 9; i++) {
    const acc = `${k}+${i}`;
    const cb = () => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (focusedWin) {
        focusedWin.webContents.send("switch-tab", i);
      }
    };
    localShortcut.register(acc, cb);
    sm.push({
      label: `Switch to tab ${i}`,
      accelerator: acc,
      click: cb,
    });
  }
  navigateMenuItems = sm;
  refreshRecentlyClosedMenus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
