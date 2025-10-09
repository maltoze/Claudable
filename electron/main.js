const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const { spawn, fork, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const fixPath = require("fix-path");
const shellEnv = require("shell-env");
const isDev = require("electron-is-dev");
const { findFreePort } = require("./lib/utils");

// 初始化环境
fixPath();
process.env = shellEnv.shellEnvSync();

// 应用状态
let mainWindow = null;
let nextProcess = null;
let pythonProcess = null;
let NEXT_PORT = 18273;
let API_PORT = 18274;

// ============================================================================
// 服务检查和等待
// ============================================================================

/**
 * 检查服务是否可用
 * @param {string} url - 服务 URL
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<boolean>} 服务是否可用
 */
async function checkService(url, timeout = 2000) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on("error", () => resolve(false));
        req.setTimeout(timeout, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * 等待服务启动
 * @param {string} url - 服务 URL
 * @param {number} maxAttempts - 最大尝试次数
 * @param {number} interval - 检查间隔（毫秒）
 * @returns {Promise<boolean>} 服务是否启动成功
 */
async function waitForService(url, maxAttempts = 30, interval = 2000) {
    console.log(`⏳ Waiting for service at ${url}...`);

    for (let i = 0; i < maxAttempts; i++) {
        const isReady = await checkService(url);
        if (isReady) {
            console.log(`✅ Service ready at ${url}`);
            return true;
        }

        if (i < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }

    console.error(`❌ Service at ${url} not ready after ${maxAttempts} attempts`);
    return false;
}

// ============================================================================
// 服务启动
// ============================================================================

/**
 * 启动 Next.js 服务器
 * @returns {Promise<void>}
 */
async function startNextJS() {
    return new Promise((resolve, reject) => {
        const nextPath = path.join(__dirname, "..", "apps", "web");

        if (isDev) {
            // 开发模式
            console.log("🚀 Starting Next.js development server...");
            nextProcess = spawn("npm", ["run", "dev:no-open"], {
                cwd: nextPath,
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env, PORT: String(NEXT_PORT) },
                shell: true,
            });
        } else {
            // 生产模式：使用预构建的 standalone 版本
            const standalonePath = app.isPackaged
                ? path.join(process.resourcesPath, "standalone", "apps", "web")
                : path.join(nextPath, ".next", "standalone", "apps", "web");
            
            const serverPath = path.join(standalonePath, "server.js");

            if (!fs.existsSync(serverPath)) {
                return reject(
                    new Error(`Next.js standalone build not found at ${serverPath}`)
                );
            }

            console.log("🚀 Starting Next.js production server...");
            nextProcess = fork(serverPath, [], {
                cwd: standalonePath,
                stdio: ["ignore", "pipe", "pipe", "ipc"],
                env: { ...process.env, PORT: String(NEXT_PORT) },
            });
        }

        let resolved = false;

        nextProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log("[Next.js]", output);
            
            if (!resolved && (output.includes(`localhost:${NEXT_PORT}`) || output.includes("Ready"))) {
                resolved = true;
                resolve();
            }
        });

        nextProcess.stderr.on("data", (data) => {
            console.error("[Next.js Error]", data.toString());
        });

        nextProcess.on("error", (error) => {
            if (!resolved) {
                resolved = true;
                reject(error);
            }
        });

        nextProcess.on("exit", (code) => {
            console.log(`Next.js process exited with code ${code}`);
            if (!resolved && code !== 0 && code !== null) {
                resolved = true;
                reject(new Error(`Next.js exited with code ${code}`));
            }
        });

        // 超时保护
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        }, 10000);
    });
}

/**
 * 启动 FastAPI 服务器
 * @returns {Promise<void>}
 */
async function startPythonAPI() {
    return new Promise((resolve, reject) => {
        const apiPath = path.join(__dirname, "..", "apps", "api");

        if (isDev) {
            // 开发模式
            console.log("🐍 Starting FastAPI development server...");
            
            const venvPython = path.join(apiPath, ".venv", "bin", "python");
            const pythonCmd = fs.existsSync(venvPython) ? venvPython : "python";

            pythonProcess = spawn(
                pythonCmd,
                ["-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", String(API_PORT)],
                {
                    cwd: apiPath,
                    stdio: ["ignore", "pipe", "pipe"],
                    env: { ...process.env },
                    shell: true,
                }
            );
        } else {
            // 生产模式：使用预构建的二进制文件
            const binaryName = process.platform === "win32" ? "api-server.exe" : "api-server";
            const binaryPath = app.isPackaged
                ? path.join(process.resourcesPath, "python-dist", binaryName)
                : path.join(__dirname, "..", "electron", "python-dist", binaryName);

            if (!fs.existsSync(binaryPath)) {
                return reject(
                    new Error(`API binary not found at ${binaryPath}`)
                );
            }

            // 确保必要的目录存在
            const projectsRootPath = path.join(app.getPath("userData"), "projects");
            const dataPath = path.join(app.getPath("userData"), "data");
            
            [projectsRootPath, dataPath].forEach((dir) => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            });

            const databaseUrl = `sqlite:///${path.join(dataPath, "cc.db")}`;

            console.log("🐍 Starting FastAPI production server...");
            pythonProcess = spawn(binaryPath, [], {
                cwd: path.dirname(binaryPath),
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                    ...process.env,
                    PORT: String(API_PORT),
                    PROJECTS_ROOT: projectsRootPath,
                    DATABASE_URL: databaseUrl,
                },
            });
        }

        let resolved = false;

        pythonProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log("[FastAPI]", output);
            
            if (!resolved && (output.includes(`${API_PORT}`) || output.includes("Uvicorn running"))) {
                resolved = true;
                resolve();
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error("[FastAPI Error]", data.toString());
        });

        pythonProcess.on("error", (error) => {
            if (!resolved) {
                resolved = true;
                reject(error);
            }
        });

        pythonProcess.on("exit", (code) => {
            console.log(`FastAPI process exited with code ${code}`);
            if (!resolved && code !== 0 && code !== null) {
                resolved = true;
                reject(new Error(`FastAPI exited with code ${code}`));
            }
        });

        // 超时保护
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        }, 10000);
    });
}

/**
 * 清理所有子进程
 */
function cleanup() {
    console.log("🔄 Cleaning up processes...");
    
    if (nextProcess) {
        nextProcess.kill("SIGTERM");
        nextProcess = null;
    }

    if (pythonProcess) {
        pythonProcess.kill("SIGTERM");
        pythonProcess = null;
    }
}

// ============================================================================
// IPC 处理程序
// ============================================================================

/**
 * 执行 CLI 安装命令
 */
ipcMain.handle("execute-install-command", async (event, installCommand) => {
    try {
        console.log(`🔧 Executing install command: ${installCommand}`);

        return new Promise((resolve, reject) => {
            let finalCommand = installCommand;
            
            // macOS: 使用 AppleScript 请求管理员权限
            if (process.platform === 'darwin') {
                const escapedCommand = installCommand.replace(/"/g, '\\"');
                finalCommand = `osascript -e 'do shell script "${escapedCommand}" with administrator privileges'`;
            }

            const childProcess = exec(finalCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Install command failed: ${error.message}`);
                    return reject({
                        success: false,
                        error: error.message,
                        stderr,
                    });
                }

                console.log(`✅ Install command completed successfully`);
                resolve({
                    success: true,
                    stdout,
                    stderr,
                });
            });

            // 设置超时时间（5分钟）
            setTimeout(() => {
                childProcess.kill();
                reject({
                    success: false,
                    error: "Installation timeout (5 minutes)",
                    stderr: "",
                });
            }, 5 * 60 * 1000);
        });
    } catch (error) {
        console.error(`💥 Failed to execute install command: ${error.message}`);
        return {
            success: false,
            error: error.message,
            stderr: "",
        };
    }
});

/**
 * 执行 CLI 启动命令
 */
ipcMain.handle("execute-command", async (event, command) => {
    try {
        console.log(`🚀 Executing command: ${command}`);

        let terminalCommand, terminalArgs;
        
        if (process.platform === 'darwin') {
            // macOS - 使用 AppleScript 启动 Terminal
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
            const { execSync } = require('child_process');
            const terminals = ['gnome-terminal', 'konsole', 'xterm', 'x-terminal-emulator'];
            
            terminalCommand = terminals.find(term => {
                try {
                    execSync(`which ${term}`, { stdio: 'ignore' });
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

// ============================================================================
// 主窗口创建
// ============================================================================

/**
 * 创建并初始化主窗口
 * @returns {Promise<void>}
 */
async function createMainWindow() {
    try {
        // 动态分配可用端口
        console.log("🔍 Finding free ports...");
        NEXT_PORT = await findFreePort(18273);
        API_PORT = await findFreePort(18274);
        console.log(`✅ Allocated ports - Next.js: ${NEXT_PORT}, API: ${API_PORT}`);

        // 并行启动服务
        console.log("🚀 Starting services...");
        await Promise.all([startNextJS(), startPythonAPI()]);

        // 等待服务真正可用
        const [nextReady, apiReady] = await Promise.all([
            waitForService(`http://127.0.0.1:${NEXT_PORT}`),
            waitForService(`http://127.0.0.1:${API_PORT}/health`),
        ]);

        if (!nextReady || !apiReady) {
            throw new Error("Failed to start required services");
        }

        // 创建浏览器窗口
        mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 1000,
            minHeight: 600,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                webSecurity: true,
                preload: path.join(__dirname, "preload.js"),
                devTools: isDev,
            },
            icon: path.join(__dirname, "..", "assets", "Claudable_Icon.png"),
        });

        // 等待窗口准备好再显示
        mainWindow.once("ready-to-show", () => {
            mainWindow.show();
            if (isDev) {
                mainWindow.webContents.openDevTools();
            }
        });

        // 处理外部链接
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: "deny" };
        });

        // 加载应用
        await mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);

        mainWindow.on("closed", () => {
            mainWindow = null;
        });

        console.log("✅ Claudable started successfully!");
    } catch (error) {
        console.error("❌ Failed to start Claudable:", error);
        
        // 显示错误对话框
        const response = await dialog.showMessageBox({
            type: "error",
            title: "Startup Error",
            message: "Failed to start Claudable",
            detail: error.message,
            buttons: ["Quit", "Retry"],
        });

        // 清理进程
        cleanup();

        if (response.response === 1) {
            // 重试
            return createMainWindow();
        } else {
            // 退出
            app.quit();
        }
    }
}

// ============================================================================
// 应用生命周期事件
// ============================================================================

// 应用准备就绪
app.whenReady().then(createMainWindow);

// macOS 特殊处理：点击 dock 图标时重新创建窗口
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// 所有窗口关闭时的处理
app.on("window-all-closed", () => {
    // macOS 上除非用户明确退出，否则应用和菜单栏会保持活动状态
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// 应用退出前清理
app.on("before-quit", () => {
    console.log("🔄 Shutting down services...");
    cleanup();
});

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    cleanup();
    app.quit();
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
