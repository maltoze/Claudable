const { ipcMain } = require("electron");
const { spawn, exec } = require("child_process");

/**
 * 初始化所有 IPC 处理器
 */
function initializeIpcHandlers() {
    console.log("🔧 Initializing IPC handlers...");
    
    // 注册所有 IPC 处理器
    registerInstallCommandHandler();
    registerExecuteCommandHandler();
    
    console.log("✅ IPC handlers initialized successfully");
}

/**
 * 检查 Node.js 是否已安装
 */
async function checkNodeInstalled() {
    return new Promise((resolve) => {
        exec('node --version', (error, stdout, stderr) => {
            if (error) {
                console.log('� Node.js not found');
                resolve(false);
            } else {
                console.log(`📋 Node.js found: ${stdout.trim()}`);
                resolve(true);
            }
        });
    });
}

/**
 * 获取 Node.js 安装命令
 */
function getNodeInstallCommand() {
    if (process.platform === 'darwin') {
        // macOS - 检查是否有 Homebrew，优先使用 brew
        return new Promise((resolve) => {
            exec('which brew', (error) => {
                if (!error) {
                    resolve('brew install node');
                } else {
                    // 直接下载并安装 Node.js pkg
                    const downloadAndInstallCmd = `
                        curl -o /tmp/node-installer.pkg https://nodejs.org/dist/v20.11.0/node-v20.11.0.pkg &&
                        sudo installer -pkg /tmp/node-installer.pkg -target / &&
                        rm /tmp/node-installer.pkg &&
                        echo "Node.js installation completed"
                    `.replace(/\s+/g, ' ').trim();
                    
                    resolve(downloadAndInstallCmd);
                }
            });
        });
    } else if (process.platform === 'win32') {
        // Windows - 多种安装方式的回退机制
        return new Promise((resolve) => {
            // 首先检查 winget (Windows 10 1809+ / Windows 11)
            exec('winget --version 2>nul', (wingetError) => {
                if (!wingetError) {
                    resolve('winget install OpenJS.NodeJS --silent');
                } else {
                    // 检查 chocolatey
                    exec('choco --version 2>nul', (chocoError) => {
                        if (!chocoError) {
                            resolve('choco install nodejs -y');
                        } else {
                            // 检查 scoop
                            exec('scoop --version 2>nul', (scoopError) => {
                                if (!scoopError) {
                                    resolve('scoop install nodejs');
                                } else {
                                    // 最后回退：直接下载并安装 MSI
                                    const downloadAndInstallCmd = `
                                        $url = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
                                        $output = "$env:TEMP\\node-installer.msi"
                                        Write-Host "Downloading Node.js installer..."
                                        Invoke-WebRequest -Uri $url -OutFile $output
                                        Write-Host "Installing Node.js..."
                                        Start-Process msiexec.exe -ArgumentList "/i", $output, "/quiet", "/norestart" -Wait
                                        Remove-Item $output -Force
                                        Write-Host "Node.js installation completed"
                                    `.replace(/\n\s+/g, '; ');
                                    
                                    resolve(`powershell -Command "${downloadAndInstallCmd}"`);
                                }
                            });
                        }
                    });
                }
            });
        });
    } else {
        // Linux - 使用 apt, yum 或 dnf
        return new Promise((resolve) => {
            exec('which apt', (error) => {
                if (!error) {
                    resolve('sudo apt update && sudo apt install nodejs npm');
                } else {
                    exec('which yum', (yumError) => {
                        if (!yumError) {
                            resolve('sudo yum install nodejs npm');
                        } else {
                            exec('which dnf', (dnfError) => {
                                if (!dnfError) {
                                    resolve('sudo dnf install nodejs npm');
                                } else {
                                    // 使用官方 NodeSource 仓库安装
                                    resolve('curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs');
                                }
                            });
                        }
                    });
                }
            });
        });
    }
}

/**
 * IPC处理程序 - 执行CLI安装命令
 */
function registerInstallCommandHandler() {
    ipcMain.handle("execute-install-command", async (event, installCommand) => {
        try {
            console.log(`🔧 Executing install command: ${installCommand}`);

            // 检查是否是 Node.js 相关的安装命令或需要 Node.js
            const needsNode = installCommand.toLowerCase().includes('node') || 
                             installCommand.toLowerCase().includes('npm') || 
                             installCommand.toLowerCase().includes('npx');

            if (needsNode) {
                // 检查 Node.js 是否已安装
                const nodeInstalled = await checkNodeInstalled();
                
                if (!nodeInstalled) {
                    console.log('🔧 Node.js not found, installing automatically...');
                    
                    // 获取适合当前平台的安装命令
                    const nodeInstallCmd = await getNodeInstallCommand();
                    
                    // 先安装 Node.js
                    const nodeInstallResult = await executeCommand(nodeInstallCmd);
                    if (!nodeInstallResult.success) {
                        return {
                            success: false,
                            error: `Failed to install Node.js: ${nodeInstallResult.error}`,
                            stderr: nodeInstallResult.stderr,
                        };
                    }
                    
                    console.log('✅ Node.js installation completed');
                    
                    // 验证安装
                    const verifyInstalled = await checkNodeInstalled();
                    if (!verifyInstalled) {
                        return {
                            success: false,
                            error: "Node.js installation verification failed",
                            stderr: "",
                        };
                    }
                }
            }

            // 执行原始命令
            return await executeCommand(installCommand);

        } catch (error) {
            console.error(`💥 Failed to execute install command: ${error.message}`);
            return {
                success: false,
                error: error.message,
                stderr: "",
            };
        }
    });
}

/**
 * 执行单个命令的通用函数
 */
async function executeCommand(command) {
    return new Promise((resolve, reject) => {
        let finalCommand = command;
        let useShell = true;
        
        // 根据平台和命令类型选择执行方式
        if (process.platform === 'darwin') {
            // macOS: 只有 sudo 命令加管理员权限，brew install 不加
            const escapedCommand = command.replace(/"/g, '\\"').replace(/'/g, "\\'");
            if (command.includes('sudo')) {
                finalCommand = `osascript -e 'do shell script "${escapedCommand}" with administrator privileges'`;
                console.log(`🔧 Using AppleScript with admin privileges on macOS`);
            } else {
                finalCommand = `osascript -e 'do shell script "${escapedCommand}"'`;
                console.log(`🔧 Using AppleScript on macOS`);
            }
        } else if (process.platform === 'win32') {
            // Windows: PowerShell 命令需要特殊处理
            if (command.includes('powershell')) {
                useShell = true;
            }
        }

        // 执行选项
        const execOptions = {
            shell: useShell,
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large outputs
            timeout: 15 * 60 * 1000, // 15分钟超时
        };

        // 执行命令
        const childProcess = exec(finalCommand, execOptions, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Command failed: ${error.message}`);
                // 检查是否是超时错误
                if (error.killed && error.signal === 'SIGTERM') {
                    resolve({
                        success: false,
                        error: "Command timeout (15 minutes)",
                        stderr: stderr,
                    });
                } else {
                    resolve({
                        success: false,
                        error: error.message,
                        stderr: stderr,
                    });
                }
                return;
            }

            console.log(`✅ Command completed successfully`);
            if (stdout) console.log(`stdout: ${stdout.substring(0, 500)}...`); // 限制日志输出

            resolve({
                success: true,
                stdout: stdout,
                stderr: stderr,
            });
        });

        // 手动超时处理（作为备份）
        setTimeout(
            () => {
                if (!childProcess.killed) {
                    childProcess.kill('SIGTERM');
                    setTimeout(() => {
                        if (!childProcess.killed) {
                            childProcess.kill('SIGKILL');
                        }
                    }, 5000);
                }
            },
            15 * 60 * 1000,
        );
    });
}

/**
 * IPC处理程序 - 执行CLI启动命令
 */
function registerExecuteCommandHandler() {
    ipcMain.handle("execute-command", async (event, command) => {
        try {
            console.log(`🚀 Executing command: ${command}`);
            
            // 根据平台选择合适的终端和命令
            let terminalCommand, terminalArgs;
            
            if (process.platform === 'darwin') {
                // macOS - 使用 AppleScript 启动 Terminal 并执行命令
                terminalCommand = 'osascript';
                terminalArgs = [
                    '-e',
                    `tell application "Terminal"
                        activate
                        do script "${command}"
                    end tell`
                ];
            } else if (process.platform === 'win32') {
                // Windows - 使用 cmd
                terminalCommand = 'cmd';
                terminalArgs = ['/c', 'start', 'cmd', '/k', command];
            } else {
                // Linux - 尝试常见的终端
                const terminals = ['gnome-terminal', 'konsole', 'xterm', 'x-terminal-emulator'];
                terminalCommand = terminals.find(term => {
                    try {
                        require('child_process').execSync(`which ${term}`, { stdio: 'ignore' });
                        return true;
                    } catch {
                        return false;
                    }
                }) || 'xterm';
                
                if (terminalCommand === 'gnome-terminal') {
                    terminalArgs = ['--', 'bash', '-c', `${command}; exec bash`];
                } else if (terminalCommand === 'konsole') {
                    terminalArgs = ['-e', 'bash', '-c', `${command}; exec bash`];
                } else {
                    terminalArgs = ['-e', 'bash', '-c', `${command}; exec bash`];
                }
            }

            const childProcess = spawn(terminalCommand, terminalArgs, {
                detached: true,
                stdio: 'ignore'
            });

            childProcess.unref();

            console.log(`✅ Command executed successfully in terminal`);
            return {
                success: true,
                message: "Command executed in terminal"
            };

        } catch (error) {
            console.error(`💥 Failed to execute command: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    });
}

/**
 * 清理所有 IPC 处理器（可选，用于应用退出时清理）
 */
function cleanupIpcHandlers() {
    console.log("🧹 Cleaning up IPC handlers...");
    
    // 移除所有注册的处理器
    ipcMain.removeAllListeners("execute-install-command");
    ipcMain.removeAllListeners("execute-command");
    
    console.log("✅ IPC handlers cleaned up");
}

module.exports = {
    initializeIpcHandlers,
    cleanupIpcHandlers
};