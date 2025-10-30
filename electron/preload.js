const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 执行安装命令
  executeInstallCommand: (installCommand) => ipcRenderer.invoke('execute-install-command', installCommand),
  
  // 执行启动命令
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  
  // safeStorage API
  safeStorage: {
    getItem: (key) => ipcRenderer.invoke('safe-storage-get', key),
    setItem: (key, value) => ipcRenderer.invoke('safe-storage-set', key, value),
    removeItem: (key) => ipcRenderer.invoke('safe-storage-remove', key),
  },
  
  // shell API - 打开外部URL
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell-open-external', url),
  },

  // 配置文件 API
  updateConfigFile: (options) => ipcRenderer.invoke('update-config-file', options),

  // 监听认证 token 事件
  onAuthTokenReceived: (callback) => {
    ipcRenderer.on('auth-token-received', (event, data) => {
      callback(data);
    });
  },

  // 移除监听
  offAuthTokenReceived: () => {
    ipcRenderer.removeAllListeners('auth-token-received');
  },
  
  // 检测是否在electron环境中
  isElectron: true,
  
  // 获取平台信息
  platform: process.platform
});
