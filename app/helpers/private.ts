import type { TabGroup, Tab } from "electron-tabs";
import type { FilterPreferences, FilterPreset } from "./settings";
import { handlePresetChange } from "./sliders";
import { create } from "nouislider";

function updateCustomPreview(custom: FilterPreferences["custom"]) {
  const preview = document.getElementById("custom-preview");
  if (preview) {
    preview.style.filter = `brightness(${(100 - custom.brightness) / 100}) grayscale(${custom.grayscale / 100}) invert(${custom.invert / 100}) sepia(${custom.sepia / 100}) hue-rotate(${custom.hue}deg) brightness(${(custom.extraBrightness + 100) / 100})`;
  }
}

// Code to inject into the webview, to prevent jsPDF from intercepting keybinds
const keyInterceptor: string = `
var _ctrlCmdKeybinds = ["o", "p", "t", "w", "Tab", "F4", "PageUp", "PageDown", "ArrowLeft", "ArrowRight", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
var _ctrlCmdPlusShiftKeybinds = ["t", "w", "Tab", "PageUp", "PageDown", "Home", "End"];
function handleKeys(e) {
	// ctrl / cmd
	if (e.ctrlKey || e.metaKey) {
		if (_ctrlCmdKeybinds.includes(e.key)) {
			e.stopPropagation();
		}
		// ctrl / cmd + shift
		if (e.shiftKey) {
			if (_ctrlCmdPlusShiftKeybinds.includes(e.key)) {
				e.stopPropagation();
			}
		}
	}
};
document.addEventListener("keydown", handleKeys, true);
`;

const addPagechangeListener: string = `
  let eventBus = window.PDFViewerApplication.eventBus;
  eventBus.on('pagechanging', (e) => {
    window.pageNumber = e.pageNumber;
  });
`;

let activeFilterPreset: FilterPreset = "crispy";
let currentFilterRule = "div#viewer .page {border-image: none;}";

function setActiveFilterPreset(preset: FilterPreset) {
  activeFilterPreset = preset;
}

function _try(func: CallableFunction, fallbackValue: number) {
  try {
    const value = func();
    return value === null || value === undefined ? fallbackValue : value;
  } catch (e) {
    return fallbackValue;
  }
}

const focusTab = (tab: Tab) => {
  const webview = tab.webview as Electron.WebviewTag;
  const iframe = webview.shadowRoot?.querySelector("iframe");
  if (iframe) {
    iframe.focus();
  }
};

function setupTab(
  tab: Tab,
  tabCssKey: Map<Tab, string>,
  filename: string,
  debug = false,
) {
  tab.once("webview-dom-ready", () => {
    const content = tab.webview;
    if (debug) {
      // @ts-ignore
      content?.openDevTools();
    }
    // @ts-ignore
    content?.executeJavaScript(keyInterceptor);
    // @ts-ignore
    content?.executeJavaScript(addPagechangeListener);
    // @ts-ignore
    content
      ?.insertCSS(currentFilterRule)
      .then((key: string) => {
        console.info("inserted style", key);
        tabCssKey.set(tab, key);
      })
      .then(() => {
        focusTab(tab);
      });
    // .viewerContainer scrollbar dark colors
    content
      ?.insertCSS(
        `
			:root {
				--dark-scrollbar-color: #1e1e1e;
				--dark-scrollbar-bg-color: #444444;
			}
			#viewerContainer {
				scrollbar-color: var(--dark-scrollbar-color) var(--dark-scrollbar-bg-color) !important;
			}
			#viewerContainer::-webkit-scrollbar {
				width: 15px !important;
				height: 15px !important;
			}
			#viewerContainer::-webkit-scrollbar-track {
				background-color: var(--dark-scrollbar-bg-color) !important;
			}
			#viewerContainer::-webkit-scrollbar-thumb {
				background-color: var(--dark-scrollbar-color) !important;
			}
			#viewerContainer::-webkit-scrollbar-track-piece {
				background-color: var(--dark-scrollbar-bg-color) !important;
			}
			#viewerContainer::-webkit-scrollbar-corner {
				background-color: var(--dark-scrollbar-bg-color) !important;
			}`,
      )
      .then((key: string) => {
        console.info("inserted style", key);
        content.addEventListener("blur", (e: FocusEvent) => {
          updatePageNumber(e, filename);
        });
        content.addEventListener("mouseleave", (e: Event) => {
          updatePageNumber(e, filename);
        });
        focusTab(tab);
      });
  });
  tab.on("close", (tab: Tab) => {
    const key = tabCssKey.get(tab);
    if (key) {
      tabCssKey.delete(tab);
    }
  });
}

function updateDarkSettings(
  cssFilter: string,
  tabGroup: TabGroup,
  tabCssKey: Map<Tab, string>,
) {
  let cssRule: string;
  cssRule = "div#viewer .page {";
  cssRule += cssFilter;
  cssRule += "border-image: none;";
  cssRule += "}";
  currentFilterRule = cssRule;
  tabGroup?.eachTab((tab) => {
    const content = tab.webview;
    if (content) {
      if (tabCssKey.has(tab)) {
        const key = tabCssKey.get(tab);
        // @ts-ignore
        content.removeInsertedCSS(key);
      }
      // @ts-ignore
      content.insertCSS(cssRule).then((key: string) => {
        console.info("inserted style", key);
        tabCssKey.set(tab, key);
      });
    }
  });
}

function updateCSS(
  brightnessSliderElement: HTMLElement,
  grayscaleSliderElement: HTMLElement,
  invertSliderElement: HTMLElement,
  sepiaSliderElement: HTMLElement,
  extraBrightnessSliderElement: HTMLElement,
  hueSliderElement: HTMLElement,
  tabGroup: TabGroup,
  tabCssKey: Map<Tab, string>,
) {
  const brightness = _try(() => brightnessSliderElement.noUiSlider.get(), 0);
  const grayness = _try(() => grayscaleSliderElement.noUiSlider.get(), 0);
  const inversion = _try(() => invertSliderElement.noUiSlider.get(), 0);
  const sepia = _try(() => sepiaSliderElement.noUiSlider.get(), 0);
  const hue = _try(() => hueSliderElement.noUiSlider.get(), 0);
  const extraBrightness = _try(
    () => extraBrightnessSliderElement.noUiSlider.get(),
    0,
  );

  let cssRule = "";
  cssRule += "filter: ";
  cssRule += `brightness(${(100 - brightness) / 100}) `;
  cssRule += `grayscale(${grayness / 100}) `;
  cssRule += `invert(${inversion / 100}) `;
  cssRule += `sepia(${sepia / 100}) `;
  cssRule += `hue-rotate(${hue}deg) `;
  cssRule += `brightness(${(Math.round(extraBrightness) + 100.0) / 100});`;

  updateDarkSettings(cssRule, tabGroup, tabCssKey);
}

function setupSliders(
  brightnessSliderElement: HTMLElement,
  grayscaleSliderElement: HTMLElement,
  invertSliderElement: HTMLElement,
  sepiaSliderElement: HTMLElement,
  extraBrightnessSliderElement: HTMLElement,
  hueSliderElement: HTMLElement,
  tabGroup: TabGroup,
  tabCssKey: Map<Tab, string>,
  filterPreferences: FilterPreferences,
) {
  activeFilterPreset = filterPreferences.activePreset;
  create(brightnessSliderElement, {
    start: 7,
    step: 1,
    connect: "lower",
    range: {
      min: 0,
      max: 100,
    },
    tooltips: [
      {
        // 'to' the formatted value. Receives a number.
        to: (value: number) => {
          return `${Math.round(value)}%`;
        },
        // 'from' the formatted value.
        // Receives a string, should return a number.
        from: (value: string) => {
          return Number(value.replace("%", ""));
        },
      },
    ],
  });

  create(grayscaleSliderElement, {
    start: 95,
    step: 1,
    connect: "lower",
    range: {
      min: 0,
      max: 100,
    },
    tooltips: [
      {
        // 'to' the formatted value. Receives a number.
        to: (value: number) => {
          return `${Math.round(value)}%`;
        },
        // 'from' the formatted value.
        // Receives a string, should return a number.
        from: (value: string) => {
          return Number(value.replace("%", ""));
        },
      },
    ],
  });

  create(invertSliderElement, {
    start: 95,
    step: 1,
    connect: "lower",
    range: {
      min: 0,
      max: 100,
    },
    tooltips: [
      {
        // 'to' the formatted value. Receives a number.
        to: (value: number) => {
          return `${Math.round(value)}%`;
        },
        // 'from' the formatted value.
        // Receives a string, should return a number.
        from: (value: string) => {
          return Number(value.replace("%", ""));
        },
      },
    ],
  });

  create(sepiaSliderElement, {
    start: 55,
    step: 1,
    connect: "lower",
    range: {
      min: 0,
      max: 100,
    },
    tooltips: [
      {
        // 'to' the formatted value. Receives a number.
        to: (value: number) => {
          return `${Math.round(value)}%`;
        },
        // 'from' the formatted value.
        // Receives a string, should return a number.
        from: (value: string) => {
          return Number(value.replace("%", ""));
        },
      },
    ],
  });

  create(hueSliderElement, {
    start: 180,
    step: 1,
    connect: "lower",
    range: {
      min: 0,
      max: 360,
    },
    tooltips: [
      {
        // 'to' the formatted value. Receives a number.
        to: (value: number) => {
          return `${Math.round(value)}%`;
        },
        // 'from' the formatted value.
        // Receives a string, should return a number.
        from: (value: string) => {
          return Number(value.replace("°", ""));
        },
      },
    ],
  });

  create(extraBrightnessSliderElement, {
    start: 0,
    step: 1,
    connect: "lower",
    range: {
      min: -100,
      max: 200,
    },
    tooltips: [
      {
        // 'to' the formatted value. Receives a number.
        to: (value: number) => {
          return `${Math.round(value)}%`;
        },
        // 'from' the formatted value.
        // Receives a string, should return a number.
        from: (value: string) => {
          return Number(value.replace("%", ""));
        },
      },
    ],
  });

  const sliders = [
    brightnessSliderElement,
    grayscaleSliderElement,
    invertSliderElement,
    sepiaSliderElement,
    hueSliderElement,
    extraBrightnessSliderElement,
  ];
  let cssUpdateScheduled = false;
  const scheduleCSSUpdate = () => {
    if (cssUpdateScheduled) {
      return;
    }
    cssUpdateScheduled = true;
    requestAnimationFrame(() => {
      cssUpdateScheduled = false;
      updateCSS(
        brightnessSliderElement,
        grayscaleSliderElement,
        invertSliderElement,
        sepiaSliderElement,
        extraBrightnessSliderElement,
        hueSliderElement,
        tabGroup,
        tabCssKey,
      );
    });
  };
  for (const slider of sliders) {
    const namespace = brightnessSliderElement.id;
    const eventName = `update.${namespace}`;
    slider.noUiSlider.on(eventName, scheduleCSSUpdate);
    slider.noUiSlider.on("change.persistCustom", async () => {
      if (activeFilterPreset !== "custom") {
        return;
      }
      const currentSettings = await window.api.GetSettings();
      await window.api.SetFilterPreferences({
        ...currentSettings.filterPreferences,
        custom: {
          brightness: Number(brightnessSliderElement.noUiSlider.get()),
          grayscale: Number(grayscaleSliderElement.noUiSlider.get()),
          invert: Number(invertSliderElement.noUiSlider.get()),
          sepia: Number(sepiaSliderElement.noUiSlider.get()),
          hue: Number(hueSliderElement.noUiSlider.get()),
          extraBrightness: Number(
            extraBrightnessSliderElement.noUiSlider.get(),
          ),
        },
      });
      const savedSettings = await window.api.GetSettings();
      updateCustomPreview(savedSettings.filterPreferences.custom);
    });
  }

  handlePresetChange(
    filterPreferences.activePreset,
    brightnessSliderElement,
    grayscaleSliderElement,
    invertSliderElement,
    sepiaSliderElement,
    extraBrightnessSliderElement,
    hueSliderElement,
    filterPreferences.custom,
  );
  updateCustomPreview(filterPreferences.custom);
  updateCSS(
    brightnessSliderElement,
    grayscaleSliderElement,
    invertSliderElement,
    sepiaSliderElement,
    extraBrightnessSliderElement,
    hueSliderElement,
    tabGroup,
    tabCssKey,
  );
}

// This is not used at the moment.
// It requires mapping between the fingerprint encoded by pdfjs and the filenames to work.
const getPageNumberFromHistory = (e: FocusEvent) => {
  const target = e?.currentTarget as Window;
  if (target?.localStorage) {
    console.log(target.localStorage["pdfjs.history"]);
    const history = target.localStorage["pdfjs.history"];
    const parsedHistory = JSON.parse(history);
    const historyLen = parsedHistory.files.length;
    if (historyLen > 0) {
      // This won't work.
      return parsedHistory.files[historyLen - 1].page;
    }
  }
};

const updatePageNumber = (e: Event, filename: string) => {
  return savePageNumber(e.target as webviewTag, filename);
};

const savePageNumber = async (
  webview: webviewTag,
  filename: string,
): Promise<number | null> => {
  if (!webview) {
    return null;
  }
  try {
    const page = await webview.executeJavaScript("window.pageNumber");
    const pageNumber = Number.parseInt(String(page), 10);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
      return null;
    }
    if (filename.length > 0) {
      await window.api.ReceivePageNumber(filename, pageNumber);
      return pageNumber;
    }
    return null;
  } catch (error) {
    console.error("Error saving PDF page number:", error);
    return null;
  }
};

export {
  setupSliders,
  setupTab,
  focusTab,
  savePageNumber,
  setActiveFilterPreset,
  updateCustomPreview,
};
