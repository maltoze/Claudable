// Electron API类型声明
interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  executeInstallCommand: (installCommand: string) => Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
  }>;
  executeCommand: (command: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
