interface ElectronBridge {
  dbLoad: () => Promise<ArrayBuffer | null>;
  dbSave: (arrayBuffer: ArrayBuffer) => Promise<boolean>;
  dbCreateBackup: (arrayBuffer: ArrayBuffer, customPath?: string | null) => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  readExternalFile: (filePath: string) => Promise<ArrayBuffer>;
  saveFileDialog: (options: { defaultName: string; filters: { name: string; extensions: string[] }[]; arrayBuffer: ArrayBuffer }) => Promise<string | null>;
  loadWasm: () => Promise<ArrayBuffer>;
  logError: (message: string) => void;
}

interface Window {
  electron: ElectronBridge;
}
