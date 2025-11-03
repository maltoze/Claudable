const { safeStorageSet } = require("./ipc-handlers");

let mainWindow = null;

/**
 * 设置主窗口引用
 */
function setMainWindow(window) {
    mainWindow = window;
}

/**
 * 处理 claudable:// protocol URL
 * @param {string} url - Protocol URL (e.g., claudable://app/callback?token=xxx&successUrl=...)
 */
function handleProtocolURL(url) {
    try {
        console.log('📝 Parsing protocol URL:', url);
        const urlObj = new URL(url);
        const token = urlObj.searchParams.get('token');
        const successUrl = urlObj.searchParams.get('successUrl');
        
        console.log('🔍 URL params - token:', token ? '***' : 'none', 'successUrl:', successUrl);
        
        if (!mainWindow) {
            console.warn('⚠️ Main window not ready, retrying...');
            setTimeout(() => handleProtocolURL(url), 500);
            return;
        }
        
        if (token) {
            console.log('🔑 Token received, saving...');
            // 直接在主进程中保存 token
            const saveSuccess = safeStorageSet('token', token);
            
            if (saveSuccess) {
                console.log('✅ Token saved to storage');
                // 然后通知渲染进程
                mainWindow.webContents.send('auth-token-received', { token });
            } else {
                console.error('❌ Failed to save token');
            }
        }
        
        // 聚焦窗口
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    } catch (error) {
        console.error('❌ Failed to parse protocol URL:', error);
    }
}

/**
 * 注册 protocol 处理器 (macOS)
 */
function registerProtocolHandlers(app) {
    // 注册 claudable:// protocol
    app.setAsDefaultProtocolClient('claudable');
    
    // 处理 claudable:// URL 协议
    app.on('open-url', (event, url) => {
        event.preventDefault();
        console.log('🔗 Opening URL (macOS):', url);
        handleProtocolURL(url);
    });
}

/**
 * 处理启动时的 protocol URL (Windows)
 */
function handleStartupProtocolURL(argv) {
    if (process.platform === 'win32' && argv && argv.length > 1) {
        const protocolUrl = argv.find(arg => arg.startsWith('claudable://'));
        if (protocolUrl) {
            console.log('🔗 Opening URL (Windows from argv):', protocolUrl);
            // 延迟处理，确保窗口已创建
            setTimeout(() => handleProtocolURL(protocolUrl), 1000);
        }
    }
}

module.exports = {
    setMainWindow,
    handleProtocolURL,
    registerProtocolHandlers,
    handleStartupProtocolURL,
};
