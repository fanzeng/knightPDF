/*
NightPDF Dark mode for Pdfs
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
//trans rights

import "electron-tabs";
import type { Tab, TabGroup } from "electron-tabs";
import type { API } from "nouislider";
import { handlePresetChange } from "../helpers/sliders";
import { hideDarkConfigurator, toggleDarkConfigurator } from "../helpers/css";
import { openFile } from "../helpers/file";
import type {
  Keybinds,
  NightPDFSettings,
  OpenedFile,
  FilterPreferences,
  FilterPreset,
} from "../helpers/settings";
import {
  focusTab,
  savePageNumber,
  setActiveFilterPreset,
} from "../helpers/private";

declare global {
  interface Window {
    api: {
      GetVersion(): Promise<string>;
      getFileName(arg0: string): Promise<string>;
      ResolvePath(arg0: string): Promise<string>;
      SetBind(key: string, value: Keybinds): Promise<null>;
      SetOpenedFiles(openedFiles: (OpenedFile | string)[]): Promise<null>;
      GetOpenedFiles(): Promise<(OpenedFile | string)[]>;
      ReceivePageNumber(filename: string, pageNumber: number): Promise<null>;
      RecordClosedTab(file: OpenedFile): Promise<null>;
      RemoveRecentlyClosedTab(filename: string): Promise<null>;
      restoreRecentlyClosedTab(id: string): null;
      restoreRecentlyClosedWindow(id: string): null;
      GetSettings(): Promise<NightPDFSettings>;
      SetFilterPreferences(filterPreferences: FilterPreferences): Promise<null>;
      SetSetting(group: string, key: string, value: unknown): Promise<null>;
      removeAllListeners(arg0: string): null;
      openNewPDF(openInNewWindow: boolean | null): null;
      newWindow(arg0: string | string[]): null;
      closeReady(): null;
      newTab(arg0: string | string[]): null;
      togglePrinting(arg0: boolean): null;
      resizeWindow(arg0: null | string): null;
      on(arg0: string, arg1: CallableFunction): null;
      openExternel(url: string): null;
      platform: string;
    };
  }
  interface HTMLElement {
    noUiSlider: API;
    insertCSS(css: string): Promise<string>;
  }
  interface File {
    path: string;
  }
  interface webviewTag extends HTMLElement {
    getURL(): string;
    stop(): void;
    executeJavaScript(s: string): Promise<unknown>;
  }
  interface EventNav extends Event {
    url: string;
  }
}

async function nightPDF() {
  console.log("loading");
  let filterPreferences = (await window.api.GetSettings()).filterPreferences;
  const appContainerElement: HTMLElement = document.getElementById(
    "appContainer",
  ) as HTMLElement;
  const headerElement: HTMLElement = document.getElementById(
    "header",
  ) as HTMLElement;
  const darkConfiguratorElement: HTMLElement = document.getElementById(
    "darkConfigurator",
  ) as HTMLElement;
  const brightnessSliderElement: HTMLElement = document.getElementById(
    "brightnessSlider",
  ) as HTMLElement;
  const grayscaleSliderElement: HTMLElement = document.getElementById(
    "grayscaleSlider",
  ) as HTMLElement;
  const invertSliderElement: HTMLElement = document.getElementById(
    "invertSlider",
  ) as HTMLElement;
  const sepiaSliderElement: HTMLElement = document.getElementById(
    "sepiaSlider",
  ) as HTMLElement;
  const hueSliderElement: HTMLElement = document.getElementById(
    "hueSlider",
  ) as HTMLElement;
  const extraBrightnessSliderElement: HTMLElement = document.getElementById(
    "extraBrightnessSlider",
  ) as HTMLElement;
  const splashElement: HTMLElement = document.getElementById(
    "splash-container",
  ) as HTMLElement;
  const recentHistoryElement: HTMLElement = document.getElementById(
    "recent-history",
  ) as HTMLElement;
  const recentTabsElement: HTMLElement = document.getElementById(
    "recent-tabs",
  ) as HTMLElement;
  const recentWindowsElement: HTMLElement = document.getElementById(
    "recent-windows",
  ) as HTMLElement;
  const crispyButton: HTMLElement = document.getElementById(
    "crispy-button",
  ) as HTMLElement;
  const sepiaButton: HTMLElement = document.getElementById(
    "sepia-button",
  ) as HTMLElement;
  const gentleButton: HTMLElement = document.getElementById(
    "gentle-button",
  ) as HTMLElement;
  const customButton: HTMLElement = document.getElementById(
    "custom-button",
  ) as HTMLElement;
  const customizeButton: HTMLButtonElement = document.getElementById(
    "customize-button",
  ) as HTMLButtonElement;
  const tabGroup: TabGroup = document.querySelector("tab-group") as TabGroup;
  const tabCssKey: Map<Tab, string> = new Map();
  const tabFilePath: Map<Tab, string> = new Map();
  const closedFileHistory: string[] = [];

  const presetButtons: Record<FilterPreset, HTMLElement> = {
    crispy: crispyButton,
    sepia: sepiaButton,
    gentle: gentleButton,
    custom: customButton,
  };
  const setActivePresetButton = (preset: FilterPreset) => {
    for (const [name, button] of Object.entries(presetButtons)) {
      button.className = name === preset ? "button active" : "button";
    }
  };
  const selectPreset = async (preset: FilterPreset) => {
    const settings = await window.api.GetSettings();
    setActiveFilterPreset(preset);
    handlePresetChange(
      preset,
      brightnessSliderElement,
      grayscaleSliderElement,
      invertSliderElement,
      sepiaSliderElement,
      extraBrightnessSliderElement,
      hueSliderElement,
      settings.filterPreferences.custom,
    );
    filterPreferences = {
      ...settings.filterPreferences,
      activePreset: preset,
    };
    setActivePresetButton(preset);
    await window.api.SetFilterPreferences(filterPreferences);
  };
  setActivePresetButton(filterPreferences.activePreset);

  const getDisplayName = (filename: string) =>
    filename.split(/[\\/]/).pop() || filename;
  const renderRecentHistory = async () => {
    const settings = await window.api.GetSettings();
    recentTabsElement.replaceChildren();
    recentWindowsElement.replaceChildren();
    for (const file of settings.recentlyClosedTabs) {
      const button = document.createElement("button");
      button.className = "recent-entry";
      button.textContent = `${getDisplayName(file.filename)} (page ${file.pageNumber})`;
      button.title = button.textContent;
      button.addEventListener("click", () => {
        window.api.restoreRecentlyClosedTab(file.id);
      });
      recentTabsElement.appendChild(button);
    }
    for (const closedWindow of settings.recentlyClosedWindows) {
      const firstFile = closedWindow.files[0];
      if (!firstFile) {
        continue;
      }
      const extraCount = closedWindow.files.length - 1;
      const button = document.createElement("button");
      button.className = "recent-entry";
      button.textContent = `${getDisplayName(firstFile.filename)}${extraCount > 0 ? ` (+${extraCount} more)` : ""}`;
      button.title = button.textContent;
      button.addEventListener("click", () => {
        window.api.restoreRecentlyClosedWindow(closedWindow.id);
      });
      recentWindowsElement.appendChild(button);
    }
    recentHistoryElement.hidden =
      settings.recentlyClosedTabs.length === 0 &&
      settings.recentlyClosedWindows.length === 0;
  };
  void renderRecentHistory();
  window.api.removeAllListeners("recent-history-updated");
  window.api.on("recent-history-updated", () => {
    void renderRecentHistory();
  });

  appContainerElement.style.display = "none";
  tabGroup?.on("ready", (tabGroup: TabGroup) => {
    // replace new tabe default "click" event handler
    tabGroup.buttonContainer.getElementsByTagName("button")[0].addEventListener(
      "click",
      (e: Event) => {
        e.stopImmediatePropagation();
        window.api.openNewPDF(false);
      },
      true,
    );

    console.info("TabGroup is ready, moving container");
    appContainerElement.appendChild(tabGroup.viewContainer);
    tabGroup?.viewContainer.addEventListener(
      "click",
      (e: Event) => {
        hideDarkConfigurator(darkConfiguratorElement);
        e.stopPropagation();
      },
      true,
    );
  });

  //setup electron listeners
  window.api.removeAllListeners("file-open");
  window.api.on(
    "file-open",
    async (
      _e: Event,
      msg: string | [string | string[], number | number[]] | [string],
      debug = false,
    ) => {
      let page: number | number[] | null = null;
      let files: string | string[];
      if (
        Array.isArray(msg) &&
        msg.length === 2 &&
        (typeof msg[1] === "number" || Array.isArray(msg[1]))
      ) {
        page = msg[1];
        files = msg[0];
      } else {
        // @ts-ignore we know this is string | string[]
        files = msg;
      }

      if (files?.length > 0) {
        splashElement.style.display = "none";
      }

      const settings = await window.api.GetSettings();

      await openFile(
        files,
        closedFileHistory,

        tabGroup,
        tabFilePath,
        tabCssKey,

        appContainerElement,
        splashElement,
        headerElement,
        brightnessSliderElement,
        grayscaleSliderElement,
        invertSliderElement,
        sepiaSliderElement,
        extraBrightnessSliderElement,
        hueSliderElement,
        settings.general.DisplayThumbs,
        page,
        debug,
      );
    },
  );

  window.api.removeAllListeners("prepare-to-close");
  window.api.on("prepare-to-close", async () => {
    try {
      const tabs = tabGroup?.getTabs() ?? [];
      await Promise.all(
        tabs.map((tab) => {
          const filename = tabFilePath.get(tab);
          return filename
            ? savePageNumber(tab.webview as webviewTag, filename)
            : Promise.resolve();
        }),
      );
      const openPaths = new Set(
        tabs
          .map((tab) => tabFilePath.get(tab))
          .filter((filename): filename is string => Boolean(filename)),
      );
      const openedFiles = await window.api.GetOpenedFiles();
      await window.api.SetOpenedFiles(
        openedFiles.filter((file) =>
          openPaths.has(typeof file === "string" ? file : file.filename),
        ),
      );
    } catch (error) {
      console.error("Error preparing PDF windows to close:", error);
    } finally {
      window.api.closeReady();
    }
  });

  window.api.removeAllListeners("file-print");
  window.api.on("file-print", (_e: Event, _msg: string) => {
    const tab = tabGroup?.getActiveTab();
    if (tab) {
      // the webview's window.print() method is intercepted
      // by pdfjs and opens the print dialog.
      // @ts-ignore
      tab.webview?.executeJavaScript("window.print();");
    }
  });

  // close-tab event
  window.api.removeAllListeners("close-tab");
  window.api.on("close-tab", async (_e: Event, _msg: string) => {
    const tab = tabGroup?.getActiveTab();
    const webview = tab.webview as webviewTag;
    if (webview) {
      webview.focus();
    }
    const iframe = webview.shadowRoot?.querySelector("iframe");
    if (iframe) {
      iframe.focus();
    }
    webview.blur();
    if (tab) {
      console.log("Closing active tab:", tab);
      setTimeout(() => {
        tab.close(false);
      }, 10);
    }
  });

  // blur-tab event
  window.api.removeAllListeners("blur-tab");
  window.api.on("blur-tab", async (_e: Event, _msg: string) => {
    const tab = tabGroup?.getActiveTab();
    const webview = tab.webview as webviewTag;
    if (webview) {
      webview.focus();
    }
    const iframe = webview.shadowRoot?.querySelector("iframe");
    if (iframe) {
      iframe.focus();
    }
    webview.blur();
  });

  // reopen-tab event
  window.api.removeAllListeners("reopen-tab");
  window.api.on(
    "reopen-tab",
    async (_e: Event, _msg: string, debug = false) => {
      if (closedFileHistory.length > 0) {
        const lastClosedFile = closedFileHistory.pop();
        if (lastClosedFile) {
          await window.api.RemoveRecentlyClosedTab(lastClosedFile);
          const settings = await window.api.GetSettings();
          await openFile(
            lastClosedFile,
            closedFileHistory,

            tabGroup,
            tabFilePath,
            tabCssKey,

            appContainerElement,
            splashElement,
            headerElement,
            brightnessSliderElement,
            grayscaleSliderElement,
            invertSliderElement,
            sepiaSliderElement,
            extraBrightnessSliderElement,
            hueSliderElement,
            settings.general.DisplayThumbs,
            0,
            debug,
          );
        }
      }
    },
  );

  // switch-tab event
  // expects "next", "prev" or a number from 1-9
  window.api.removeAllListeners("switch-tab");
  window.api.on("switch-tab", (_e: Event, msg: string | number) => {
    const tab = tabGroup?.getActiveTab();
    let target: Tab | null | undefined = null;
    if (tab) {
      if (typeof msg === "string") {
        const tabCount = tabGroup?.getTabs().length ?? 0;
        const currentPosition = tab.getPosition();
        switch (msg) {
          case "next":
            if (tabCount > 1) {
              target = tabGroup?.getTabByPosition(
                (currentPosition + 1) % tabCount,
              );
            }
            break;
          case "prev":
            if (tabCount > 1) {
              target = tabGroup?.getTabByPosition(
                (currentPosition - 1 + tabCount) % tabCount,
              );
            }
            break;
        }
      } else {
        if (msg >= 1 && msg <= 8) {
          target = tabGroup?.getTabByPosition(msg - 1);
        } else if (msg === 9) {
          // last tab
          target = tabGroup?.getTabByPosition(-1);
        }
      }
      if (target) {
        target.activate();
        focusTab(target);
      } else {
        focusTab(tab);
      }
    }
  });

  // move-tab event
  // expects "next" or "prev", "start" or "end"
  window.api.removeAllListeners("move-tab");
  window.api.on("move-tab", (_e: Event, msg: string) => {
    const tab = tabGroup?.getActiveTab();
    if (tab) {
      switch (msg) {
        case "next": {
          console.log("moving tab to next position");
          const targetPos = tab.getPosition() + 1;
          const tabCount = tabGroup?.tabContainer.childElementCount;
          console.log("Tab count", tabCount, "targetPos", targetPos);
          if (tabCount && targetPos < tabCount) {
            tab.setPosition(targetPos);
          }
          break;
        }
        case "prev": {
          console.log("moving tab to previous position");
          const targetPos = tab.getPosition() - 1;
          if (targetPos >= 0) {
            tab.setPosition(targetPos);
          }
          break;
        }
        case "start":
          console.log("moving tab to start");
          tab.setPosition(0);
          break;
        case "end":
          console.log("moving tab to end");
          tab.setPosition(-1);
          break;
      }
    }
  });

  // setup dom listeners
  crispyButton.addEventListener("click", async (e: Event) => {
    await selectPreset("crispy");
    e.stopPropagation();
  });
  sepiaButton.addEventListener("click", async (e: Event) => {
    await selectPreset("sepia");
    e.stopPropagation();
  });
  gentleButton.addEventListener("click", async (e: Event) => {
    await selectPreset("gentle");
    e.stopPropagation();
  });

  customButton.addEventListener("click", async (e: Event) => {
    await selectPreset("custom");
    e.stopPropagation();
  });

  customizeButton.addEventListener("click", async (e: Event) => {
    await selectPreset("custom");
    darkConfiguratorElement.style.visibility = "visible";
    e.stopPropagation();
  });

  headerElement.addEventListener("click", (_e: Event) => {
    hideDarkConfigurator(darkConfiguratorElement);
  });

  splashElement.addEventListener("click", (_e: Event) => {
    window.api.openNewPDF(null);
  });

  window.addEventListener("blur", () => {
    const activeElement = document.activeElement;
    if (activeElement) {
      if (activeElement.id === "pdfjs") {
        hideDarkConfigurator(darkConfiguratorElement);
      }
    }
  });

  splashElement.ondrop = async (e: DragEvent, debug = false) => {
    console.log("files dropped");
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;

    if (!files || files.length === 0) {
      return;
    }
    const settings = await window.api.GetSettings();
    await openFile(
      files,
      closedFileHistory,

      tabGroup,
      tabFilePath,
      tabCssKey,

      appContainerElement,
      splashElement,
      headerElement,
      brightnessSliderElement,
      grayscaleSliderElement,
      invertSliderElement,
      sepiaSliderElement,
      extraBrightnessSliderElement,
      hueSliderElement,
      settings.general.DisplayThumbs,
      null,
      debug,
    );
  };
  splashElement.ondragover = (e: Event) => {
    console.log("file dragged");
    e.preventDefault();
    e.stopPropagation();
  };
}

await nightPDF();
