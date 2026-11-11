import type { TabGroup, Tab } from "electron-tabs";
import type { OpenedFile } from "./settings";
import { setupTab, focusTab, savePageNumber } from "./private";

async function openFile(
  files: string | string[] | FileList,
  closedFileHistory: string[],

  tabGroup: TabGroup,
  tabFilePath: Map<Tab, string>,
  tabCssKey: Map<Tab, string>,

  appContainerElement: HTMLElement,
  splashElement: HTMLElement,
  headerElement: HTMLElement,
  brightnessSliderElement: HTMLElement,
  grayscaleSliderElement: HTMLElement,
  invertSliderElement: HTMLElement,
  sepiaSliderElement: HTMLElement,
  extraBrightnessSliderElement: HTMLElement,
  hueSliderElement: HTMLElement,
  DisplayThumbs: boolean,

  page: number | number[] | null = null,
  debug = false,
) {
  const tabs = tabGroup?.getTabs();
  const openedFilesToPersist: OpenedFile[] = [];
  if (!tabs || tabs.length === 0) {
    console.debug("No tabs yet, creating new tab");
  }

  if (typeof files === "string") {
    // wrap in array
    // biome-ignore lint: ensure files is an array to use a for loop
    files = [files];
  }
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = typeof file === "string" ? file : file.path;
    const resolved_file = await window.api.ResolvePath(path);
    const title = await window.api.getFileName(path);
    // check if file is already open
    let fileAlreadyOpen = false;
    tabGroup?.eachTab((tab) => {
      if (tabFilePath.get(tab) === resolved_file) {
        fileAlreadyOpen = true;
        console.info("file already open");
        tab.activate();
        focusTab(tab);
      }
    });

    let pageArg = "";
    const pageNumber = Array.isArray(page)
      ? page[i] ?? 0
      : typeof page === "number"
        ? page
        : 0;
    const pageToRestore = Array.isArray(page) ? page[i] : i === 0 ? page : null;
    if (typeof pageToRestore === "number" && pageToRestore > 0) {
      pageArg = `page=${pageToRestore}`;
    } else {
      console.log("Cannot open to last visited pages:", file);
      pageArg = "";
    }

    if (DisplayThumbs) {
      if (pageArg) {
        pageArg = `${pageArg}&pagemode=thumbs`;
      } else {
        pageArg = "pagemode=thumbs";
      }
    }

    if (!fileAlreadyOpen) {
      openedFilesToPersist.push({
        filename: resolved_file,
        pageNumber,
      });
      const entry = {
        title: `\u202A${title}\u202A`,
        active: true,
        src: "",
        ready: (tab: Tab) => {
          console.info("tab loaded");
          tabFilePath.set(tab, resolved_file);
          tab.element.classList.add("document-tab");
          headerElement.style.visibility = "visible";
          appContainerElement.style.display = "block";
          splashElement.style.display = "none";
          window.api.togglePrinting(true);
          setupTab(tab, tabCssKey, resolved_file, debug);
          focusTab(tab);
        },
      };
      if (pageArg) {
        entry.src = `libs/pdfjs/web/viewer.html?file=${encodeURIComponent(
          resolved_file,
        )}#${pageArg}`;
      } else {
        entry.src = `libs/pdfjs/web/viewer.html?file=${encodeURIComponent(
          resolved_file,
        )}`;
      }
      const tab = tabGroup?.addTab(entry);
      const webview = tab?.webview as webviewTag;
      tabFilePath.set(tab, resolved_file);
      tab.element.addEventListener("contextmenu", (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        window.api.showTabMenu(tab.id, resolved_file);
      });
      webview.addEventListener("will-navigate", (e) => {
        const event = e as EventNav;
        const url = event.url;
        if (url !== webview.getURL()) {
          event.preventDefault();
          webview.stop();
          if (url.split("/")[0].indexOf("http") > -1) {
            window.api.openExternel(url);
          }
        }
      });
      tab?.on("close", async () => {
        console.debug("tab closed");
        const tabFile = tabFilePath.get(tab);
        if (tabFile) {
          closedFileHistory.push(tabFile);
          const pageNumber = await savePageNumber(
            tab.webview as webviewTag,
            tabFile,
          );
          await window.api.RecordClosedTab({
            filename: tabFile,
            pageNumber: pageNumber ?? 0,
          });
          const openedFiles = await window.api.GetOpenedFiles();
          await window.api.SetOpenedFiles(
            openedFiles.filter((file) =>
              typeof file === "string"
                ? file !== tabFile
                : file.filename !== tabFile,
            ),
          );
        }
        tabFilePath.delete(tab);
        tabGroup?.tabs.length;
        if (tabGroup?.getTabs().length === 0) {
          headerElement.style.visibility = "hidden";
          splashElement.style.display = "flex";
          appContainerElement.style.display = "none";
          window.api.togglePrinting(false);
        }
      });
    }
  }
  if (openedFilesToPersist.length > 0) {
    const currentFiles = await window.api.GetOpenedFiles();
    const filesByPath = new Map(
      currentFiles.map((file) => [
        typeof file === "string" ? file : file.filename,
        typeof file === "string" ? { filename: file, pageNumber: 0 } : file,
      ]),
    );
    for (const file of openedFilesToPersist) {
      if (!filesByPath.has(file.filename)) {
        filesByPath.set(file.filename, file);
      }
    }
    await window.api.SetOpenedFiles([...filesByPath.values()]);
  }
  return true;
}

export { openFile };
