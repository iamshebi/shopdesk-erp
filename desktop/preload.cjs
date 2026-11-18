// Small, safe bridge between the app pages and the desktop shell (printing, licence, printer setup).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shopdeskDesktop", {
  /** kind: "receipt" | "label" | "a4". size: label size like "50x25" (mm), or receipt width "80" / "58". */
  print: (kind, size) => ipcRenderer.invoke("sd:print", { kind, size }),
  /** Prints another page of the app in the background, e.g. "/print/invoice/12?format=thermal". */
  printUrl: (path, kind, size) => ipcRenderer.invoke("sd:print-url", { path, kind, size }),
  license: {
    info: () => ipcRenderer.invoke("sd:license-info"),
    activate: (key) => ipcRenderer.invoke("sd:license-activate", key),
    whatsapp: () => ipcRenderer.invoke("sd:license-whatsapp"),
    copy: (text) => ipcRenderer.invoke("sd:copy", text),
    quit: () => ipcRenderer.invoke("sd:quit"),
  },
  printers: {
    list: () => ipcRenderer.invoke("sd:printers-list"),
    save: (prefs) => ipcRenderer.invoke("sd:printers-save", prefs),
    test: (kind) => ipcRenderer.invoke("sd:printers-test", kind),
  },
});
