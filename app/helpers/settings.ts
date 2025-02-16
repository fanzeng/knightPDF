import type { Schema } from "electron-store";
import type { JSONSchema } from "json-schema-typed";

type NightPDFSettings = JSONSchema & {
  version: string;
  general: Record<string, boolean>;
  keybinds: Record<string, Keybinds>;
  openedFiles: string[];
};

// kebind config
type Keybinds = {
  keybind: Keybind[];
  readonly action: string;
  readonly data?: string;
  readonly displayName?: string;
};

// to use in settings save/display
type Keybind = {
  modifiers: ModifierKeyMap;
  key: string | null;
};

// A collection of modifier keys
type ModifierKeyMap = {
  [modifierKey: string]: ModifierKey;
};

// Modifier key definition (for keybinds)
type ModifierKey = {
  savesAs: string;
  osDependent: boolean;
  displayAs?: string;
  osVariants?: {
    [key: string]: string;
    default: string;
  };
};

class KeybindHelper {
  readonly keybind: Keybind;
  readonly platform: string;
  constructor(keybind: Keybind, platform: string) {
    this.keybind = keybind;
    this.platform = platform;
  }

  static fromKeybind(keybind: Keybind, platform: string): KeybindHelper {
    return new KeybindHelper(keybind, platform);
  }

  static fromTrigger(trigger: string, platform: string): KeybindHelper {
    const keybind: Keybind = {
      key: "",
      modifiers: {},
    };
    const keys = trigger.split("+");
    // last key is the non-modifier key
    keybind.key = keys.pop() ?? "";
    for (const key of keys) {
      keybind.modifiers[key] = ModifierKeys[key];
    }
    return KeybindHelper.fromKeybind(keybind, platform);
  }

  static keybindFromTriggerArray(
    triggers: string[],
    platform: string | null = null,
  ): Keybind[] {
    if (platform === null) {
      // biome-ignore lint: if we are using this to create initial config we don't care.
      platform = "none";
    }
    return triggers.map((trigger) =>
      // @ts-ignore platform is never null here
      KeybindHelper.fromTrigger(trigger, platform).getKeybind(),
    );
  }

  static fromKeybindArray(
    keybinds: Keybind[],
    platform: string,
  ): KeybindHelper[] {
    return keybinds.map((keybind) =>
      KeybindHelper.fromKeybind(keybind, platform),
    );
  }

  getKeybind(): Keybind {
    return this.keybind;
  }

  // This is to store the trigger keybinds in the settings file
  // the savesAs property is what it should be stored as
  toTrigger(): string {
    let trigger = "";
    if (this.keybind.modifiers) {
      for (const modifier in this.keybind.modifiers) {
        if (this.keybind.modifiers[modifier]) {
          trigger += `${ModifierKeys[modifier].savesAs}+`;
        }
      }
    }
    trigger += this.keybind.key;
    return trigger;
  }

  toString(): string {
    return this.toStringArray().join(" + ");
  }

  toStringArray(): string[] {
    const keybindStrings: string[] = [];
    if (this.keybind.key === null) {
      return keybindStrings;
    }
    if (this.keybind.modifiers) {
      for (const modifier in this.keybind.modifiers) {
        keybindStrings.push(modifierToString(modifier, this.platform));
      }
    }
    keybindStrings.push(this.keybind.key);
    return keybindStrings;
  }

  getModifierKeys(): ModifierKey[] {
    return Object.values(this.keybind.modifiers);
  }

  getKey(): string | null {
    return this.keybind.key;
  }
}

// Helper class for keybinds
class KeybindsHelper {
  readonly config: Record<string, Keybinds>;
  readonly platform: string;
  readonly actions: string[];

  constructor(config: Record<string, Keybinds>, platform: string) {
    this.config = config;
    this.platform = platform;
    this.actions = Object.keys(config);
  }

  getActionKeybinds(action: string): KeybindHelper[] {
    return KeybindHelper.fromKeybindArray(
      this.config[action].keybind,
      this.platform,
    );
  }

  getActionKeybind(action: string, index: number): KeybindHelper {
    return KeybindHelper.fromKeybind(
      this.config[action].keybind[index],
      this.platform,
    );
  }

  getActionKeybindsString(action: string): string[] {
    return this.getActionKeybinds(action).map((keybind) => keybind.toString());
  }

  getActionKeybindsTrigger(action: string): string[] {
    return this.getActionKeybinds(action).map((keybind) => keybind.toTrigger());
  }

  getActionDisplayName(action: string): string {
    return this.config[action].displayName ?? action;
  }

  getActionData(action: string): string | undefined {
    return this.config[action].data;
  }

  getAction(action: string): string {
    return this.config[action].action;
  }

  updateActionKeybind(
    action: string,
    index: number,
    keybind: Keybind,
  ): Keybinds {
    this.config[action].keybind[index] = keybind;
    return this.config[action];
  }

  removeActionKeybind(action: string, index: number): Keybinds {
    this.config[action].keybind.splice(index, 1);
    return this.config[action];
  }
}

function keybindPropertyDef(min = 0, max = 2): object {
  return {
    properties: {
      keybind: {
        type: "array", // Keybind[]
        items: {
          type: "object", // Keybind
          properties: {
            modifiers: {
              type: "object", // ModifierKeyMap
              patternProperties: {
                "^[a-zA-Z0-9]+$": {
                  type: "object", // ModifierKey
                  properties: {
                    savesAs: {
                      type: "string",
                    },
                    osDependent: {
                      type: "boolean",
                    },
                    displayAs: {
                      type: "string",
                    },
                    osVariants: {
                      type: "object",
                      patternProperties: {
                        "^[a-zA-Z0-9]+$": {
                          type: "string",
                        },
                      },
                      additionalProperties: false,
                    },
                  },
                  required: ["savesAs", "osDependent"],
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
            key: {
              type: ["string", "null"],
            },
          },
          required: ["modifiers", "key"],
          additionalProperties: false,
        },
        minItems: min,
        maxItems: max,
      },
      action: {
        type: "string",
      },
      data: {
        type: "string",
      },
      displayName: {
        type: "string",
      },
    },
    type: "object",
    required: ["keybind", "action"],
    additionalProperties: false,
  };
}

const nightpdf_schema: Schema<NightPDFSettings> = {
  version: {
    type: "string",
  },
  general: {
    properties: {
      MaximizeOnOpen: {
        type: "boolean",
      },
      DisplayThumbs: {
        type: "boolean",
      },
    },
    type: "object",
  },
  keybinds: {
    properties: {
      OpenWindow: keybindPropertyDef(),
      CloseTab: keybindPropertyDef(),
      ReOpen: keybindPropertyDef(),
      SwitchTab: keybindPropertyDef(),
      PreviousTab: keybindPropertyDef(),
      LeftTab: keybindPropertyDef(),
      RightTab: keybindPropertyDef(),
      StartTab: keybindPropertyDef(),
      EndTab: keybindPropertyDef(),
    },
    type: "object",
  },
  openedFiles: {
    type: "array",
  },
};

function nightpdf_default_settings(version: string): NightPDFSettings {
  return {
    version: version,
    general: {
      MaximizeOnOpen: true,
      DisplayThumbs: true,
    },
    keybinds: {
      OpenWindow: {
        keybind: KeybindHelper.keybindFromTriggerArray(["CmdOrCtrl+t"]),
        action: "openNewPDF",
        displayName: "Open New PDF",
      },
      CloseTab: {
        keybind: KeybindHelper.keybindFromTriggerArray([
          "CmdOrCtrl+w",
          "Ctrl+F4",
        ]),
        action: "close-tab",
        displayName: "Close Tab",
      },
      ReOpen: {
        keybind: KeybindHelper.keybindFromTriggerArray(["CmdOrCtrl+Shift+t"]),
        action: "reopen-tab",
        displayName: "Reopen Tab",
      },
      SwitchTab: {
        keybind: KeybindHelper.keybindFromTriggerArray([
          "Ctrl+Tab",
          "Ctrl+PageDown",
        ]),
        action: "switch-tab",
        data: "next",
        displayName: "Switch Tab",
      },
      PreviousTab: {
        keybind: KeybindHelper.keybindFromTriggerArray([
          "Ctrl+Shift+Tab",
          "Ctrl+PageUp",
        ]),
        action: "switch-tab",
        data: "prev",
        displayName: "Previous Tab",
      },
      LeftTab: {
        keybind: KeybindHelper.keybindFromTriggerArray(["Ctrl+Shift+PageUp"]),
        action: "move-tab",
        data: "prev",
        displayName: "Move Tab Left",
      },
      RightTab: {
        keybind: KeybindHelper.keybindFromTriggerArray(["Ctrl+Shift+PageDown"]),
        action: "move-tab",
        data: "next",
        displayName: "Move Tab Right",
      },
      StartTab: {
        keybind: KeybindHelper.keybindFromTriggerArray(["Ctrl+Shift+Home"]),
        action: "move-tab",
        data: "start",
        displayName: "Move Tab to Start",
      },
      EndTab: {
        keybind: KeybindHelper.keybindFromTriggerArray(["Ctrl+Shift+End"]),
        action: "move-tab",
        data: "end",
        displayName: "Move Tab to End",
      },
    },
    openedFiles: [],
  };
}

// The modifier keys allowed in NightPDF
const ModifierKeys: ModifierKeyMap = {
  CmdOrCtrl: {
    savesAs: "CmdOrCtrl",
    osDependent: true,
    osVariants: {
      darwin: "⌘",
      default: "Ctrl",
    },
  },
  Control: {
    savesAs: "Control",
    osDependent: false,
    displayAs: "Ctrl",
  },
  Meta: {
    savesAs: "Meta",
    osDependent: true,
    osVariants: {
      darwin: "⌘",
      win32: "Win",
      default: "Meta",
    },
  },
  Alt: {
    savesAs: "Alt",
    osDependent: false,
  },
  AltGraph: {
    savesAs: "AltGraph",
    osDependent: false,
    displayAs: "AltGr",
  },
  Shift: {
    savesAs: "Shift",
    osDependent: false,
  },
};

function modifierToString(name: string, platform: string): string {
  const modifier = ModifierKeys[name];
  const displayAs =
    !modifier.osDependent || !modifier.osVariants
      ? "displayAs" in modifier
        ? modifier.displayAs
        : name
      : platform in modifier.osVariants
        ? modifier.osVariants[platform]
        : modifier.osVariants?.default;
  return displayAs ?? name;
}

export {
  type NightPDFSettings,
  nightpdf_schema,
  type Keybind,
  type Keybinds,
  type ModifierKeyMap,
  ModifierKeys,
  nightpdf_default_settings,
  modifierToString,
  KeybindHelper,
  KeybindsHelper,
};
