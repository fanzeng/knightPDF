import type { MenuItemConstructorOptions } from "electron";
import { shell } from "electron";
import { openSettings } from "./settings";

function createMenu(
  recentlyClosedTabs: MenuItemConstructorOptions[],
  recentlyClosedWindows: MenuItemConstructorOptions[],
  navigateMenu?: MenuItemConstructorOptions[],
) {
  const menuTemplate: MenuItemConstructorOptions[] = [];
  menuTemplate.push(
    {
      role: "fileMenu",
      label: "File",
      submenu: [
        {
          label: "New Tab...",
          id: "file-new-tab",
        },
        {
          label: "New Window",
          id: "file-new-window",
          accelerator: "CmdOrCtrl+Shift+N",
        },
        { type: "separator" },
        {
          label: "Open...",
          id: "file-open",
          accelerator: "CmdOrCtrl+O",
        },
        {
          label: "Open Recent",
          submenu: [
            {
              label: "Recently Closed Tabs",
              id: "file-recent-tabs",
              submenu:
                recentlyClosedTabs.length > 0
                  ? [
                      ...recentlyClosedTabs,
                      { type: "separator" },
                      {
                        label: "Clear Recently Closed Tabs",
                        id: "file-clear-recent-tabs",
                      },
                    ]
                  : [
                      {
                        label: "No recently closed tabs",
                        enabled: false,
                      },
                    ],
            },
            {
              label: "Recently Closed Windows",
              id: "file-recent-windows",
              submenu:
                recentlyClosedWindows.length > 0
                  ? [
                      ...recentlyClosedWindows,
                      { type: "separator" },
                      {
                        label: "Clear Recently Closed Windows",
                        id: "file-clear-recent-windows",
                      },
                    ]
                  : [
                      {
                        label: "No recently closed windows",
                        enabled: false,
                      },
                    ],
            },
          ],
        },
        { type: "separator" },
        {
          label: "Print",
          id: "file-print",
          accelerator: "CmdOrCtrl+P",
          enabled: false,
        },
        {
          label: "Settings",
          id: "settings",
          accelerator: "Alt+s",
          click: async () => {
            openSettings();
          },
        },
        {
          label: "Quit",
          id: "file-quit",
          accelerator: "CmdOrCtrl+Q",
          enabled: true,
        },
      ],
    },
    {
      role: "editMenu",
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      role: "viewMenu",
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "windowMenu",
      label: "Window",
      submenu: [{ role: "minimize" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal(
              "https://github.com/Lunarequest/NightPDF#readme",
            );
          },
        },
        {
          label: "License",
          click: async () => {
            await shell.openExternal(
              "https://github.com/Lunarequest/NightPDF/blob/mistress/LICENSE",
            );
          },
        },
        {
          label: "Bugs",
          click: async () => {
            await shell.openExternal(
              "https://github.com/Lunarequest/NightPDF/issues",
            );
          },
        },
        {
          label: "Contact",
          click: async () => {
            await shell.openExternal("mailto:luna@nullrequest.com");
          },
        },
      ],
    },
  );
  if (navigateMenu) {
    menuTemplate.push({ label: "Navigate", submenu: navigateMenu });
  }
  return menuTemplate;
}

export { createMenu };
