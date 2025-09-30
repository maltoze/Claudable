const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 执行安装命令
  executeInstallCommand: (installCommand) => ipcRenderer.invoke('execute-install-command', installCommand),
  
  // 执行启动命令
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  
  // 检测是否在electron环境中
  isElectron: true,
  
  // 获取平台信息
  platform: process.platform
});
