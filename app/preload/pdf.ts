import { ipcRenderer, webUtils } from "electron";

window.addEventListener(
  "dragover",
  (event: DragEvent) => {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

window.addEventListener(
  "drop",
  (event: DragEvent) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const filenames = Array.from(files, (file) =>
      webUtils.getPathForFile(file),
    ).filter((filename) => /\.pdf$/i.test(filename));
    if (filenames.length > 0) {
      ipcRenderer.send("open-dropped-pdfs", filenames);
    }
  },
  true,
);
