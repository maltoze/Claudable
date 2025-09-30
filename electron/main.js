const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const { spawn, fork } = require("child_process");
const path = require("path");
const fs = require("fs");
const fixPath = require("fix-path");
const shellEnv = require("shell-env");

fixPath();

process.env = shellEnv.shellEnvSync();

// 简化的开发模式检测，不依赖外部模块
const isDev =
    process.env.ELECTRON_IS_DEV === "true" ||
    process.env.NODE_ENV === "development" ||
    !app.isPackaged;

let mainWindow = null;
let nextProcess = null;
let pythonProcess = null;
let isStarting = false; // 防止重复启动

const NEXT_PORT = 18273;
const API_PORT = 18274;

// 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on("second-instance", (event, commandLine, workingDirectory) => {
        // 当运行第二个实例时，将会聚焦到 mainWindow 这个窗口
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// 检查服务是否可用
async function checkService(url, timeout = 2000) {
    try {
        console.log(`🔍 Checking service: ${url}`);

        // 使用简单的 HTTP 请求检查，避免 node-fetch 依赖问题
        const http = require("http");
        return new Promise((resolve) => {
            const req = http.get(url, (res) => {
                console.log(
                    `📡 Service ${url} responded with status: ${res.statusCode}`,
                );
                resolve(res.statusCode === 200);
            });

            req.on("error", (error) => {
                console.log(`❌ Service ${url} error:`, error.message);
                resolve(false);
            });

            req.setTimeout(timeout, () => {
                console.log(`⏱️ Service ${url} timeout after ${timeout}ms`);
                req.destroy();
                resolve(false);
            });
        });
    } catch (error) {
        console.log(`💥 Service ${url} exception:`, error.message);
        return false;
    }
}

// 等待服务启动
async function waitForService(url, maxAttempts = 30, interval = 2000) {
    console.log(
        `⏳ Waiting for service at ${url}... (max ${maxAttempts} attempts, ${interval}ms interval)`,
    );

    for (let i = 0; i < maxAttempts; i++) {
        console.log(`🔄 Attempt ${i + 1}/${maxAttempts} for ${url}`);

        const isReady = await checkService(url);
        if (isReady) {
            console.log(`✅ Service ready at ${url}`);
            return true;
        }

        if (i < maxAttempts - 1) {
            console.log(`⏸️ Waiting ${interval}ms before next attempt...`);
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }

    console.error(
        `❌ Service at ${url} not ready after ${maxAttempts} attempts`,
    );
    return false;
}

// 启动 Next.js 开发服务器或生产服务器
async function startNextJS() {
    return new Promise((resolve, reject) => {
        const nextPath = path.join(__dirname, "..", "apps", "web");

        console.log(`🔍 Development mode: ${isDev}`);
        console.log(`🔍 Next.js path: ${nextPath}`);

        if (isDev) {
            console.log("🚀 Starting Next.js development server...");
            nextProcess = spawn("npm", ["run", "dev:no-open"], {
                cwd: nextPath,
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env, PORT: String(NEXT_PORT) },
            });
        } else {
            // 生产模式：使用预构建的 standalone 版本
            let standalonePath, serverPath;

            if (app.isPackaged) {
                // 打包后的应用，文件在 resources 目录下
                standalonePath = path.join(
                    process.resourcesPath,
                    "standalone",
                    "apps",
                    "web",
                );
                serverPath = path.join(standalonePath, "server.js");
            } else {
                // 未打包的应用，使用原来的路径
                standalonePath = path.join(
                    nextPath,
                    ".next",
                    "standalone",
                    "apps",
                    "web",
                );
                serverPath = path.join(standalonePath, "server.js");
            }

            console.log(`🔍 Looking for standalone build at: ${serverPath}`);

            if (!fs.existsSync(serverPath)) {
                reject(
                    new Error(
                        `Next.js standalone build not found at ${serverPath}. Please ensure the build is properly included.`,
                    ),
                );
                return;
            }

            console.log(
                "🚀 Starting Next.js production server...",
                process.execPath,
            );
            nextProcess = fork(serverPath, [], {
                cwd: standalonePath,
                stdio: ["ignore", "pipe", "pipe", "ipc"],
                env: {
                    ...process.env,
                    PORT: String(NEXT_PORT),
                },
            });
        }

        nextProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log("[Next.js]", output);
            if (
                output.includes(`localhost:${NEXT_PORT}`) ||
                output.includes("Ready")
            ) {
                resolve();
            }
        });

        nextProcess.stderr.on("data", (data) => {
            console.error("[Next.js Error]", data.toString());
        });

        nextProcess.on("error", (error) => {
            console.error("Failed to start Next.js:", error);
            reject(error);
        });

        nextProcess.on("exit", (code) => {
            console.log(`Next.js process exited with code ${code}`);
            if (code !== 0 && code !== null) {
                reject(new Error(`Next.js exited with code ${code}`));
            }
        });

        // 如果没有通过 stdout 检测到启动，则等待一段时间
        setTimeout(() => {
            resolve();
        }, 5000);
    });
}

// 启动 FastAPI 后端
async function startPythonAPI() {
    return new Promise((resolve, reject) => {
        const apiPath = path.join(__dirname, "..", "apps", "api");

        if (isDev) {
            // 开发模式：直接运行 Python
            console.log("🐍 Starting FastAPI development server...");

            // 检查是否有虚拟环境
            const venvPython = path.join(apiPath, ".venv", "bin", "python");
            const pythonCmd = fs.existsSync(venvPython) ? venvPython : "python";

            pythonProcess = spawn(
                pythonCmd,
                [
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--reload",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    String(API_PORT),
                ],
                {
                    cwd: apiPath,
                    stdio: ["ignore", "pipe", "pipe"],
                    env: { ...process.env },
                },
            );
        } else {
            // 生产模式：使用预构建的二进制文件（onedir 模式）
            const platform = process.platform;
            const binaryName =
                platform === "win32" ? "api-server.exe" : "api-server";
            let binaryPath;

            if (app.isPackaged) {
                // 打包后的应用，二进制文件在目录中
                binaryPath = path.join(
                    process.resourcesPath,
                    "python-dist",
                    binaryName,
                );
            } else {
                // 未打包的应用，二进制文件在目录中
                binaryPath = path.join(pythonDistPath, binaryName);
            }

            console.log(`🔍 Looking for API binary at: ${binaryPath}`);

            if (!fs.existsSync(binaryPath)) {
                reject(
                    new Error(
                        `API binary not found at ${binaryPath}. Please ensure the binary is built.`,
                    ),
                );
                return;
            }

            const projectsRootPath = path.join(
                app.getPath("userData"),
                "projects",
            );
            console.log(`🔍 Projects root path: ${projectsRootPath}`);
            if (!fs.existsSync(projectsRootPath)) {
                fs.mkdirSync(projectsRootPath, { recursive: true });
            }

            const dataPath = path.join(app.getPath("userData"), "data");
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }
            const databaseUrl = `sqlite:///${path.join(app.getPath("userData"), "data", "cc.db")}`;
            console.log(`🔍 Database URL: ${databaseUrl}`);

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

        pythonProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log("[FastAPI]", output);
            if (
                output.includes(`${API_PORT}`) ||
                output.includes("Uvicorn running")
            ) {
                resolve();
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error("[FastAPI Error]", data.toString());
        });

        pythonProcess.on("error", (error) => {
            console.error("Failed to start FastAPI:", error);
            reject(error);
        });

        pythonProcess.on("exit", (code) => {
            console.log(`FastAPI process exited with code ${code}`);
            if (code !== 0 && code !== null) {
                reject(new Error(`FastAPI exited with code ${code}`));
            }
        });

        // 等待一段时间让服务启动
        setTimeout(() => {
            resolve();
        }, 3000);
    });
}

// IPC处理程序 - 执行CLI安装命令
ipcMain.handle("execute-install-command", async (event, installCommand) => {
    try {
        console.log(`🔧 Executing install command: ${installCommand}`);

        return new Promise((resolve, reject) => {
            const { exec } = require("child_process");

            // 执行安装命令
            const process = exec(installCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(
                        `❌ Install command failed: ${error.message}`,
                    );
                    reject({
                        success: false,
                        error: error.message,
                        stderr: stderr,
                    });
                    return;
                }

                console.log(`✅ Install command completed successfully`);
                console.log(`stdout: ${stdout}`);

                resolve({
                    success: true,
                    stdout: stdout,
                    stderr: stderr,
                });
            });

            // 设置超时时间（5分钟）
            setTimeout(
                () => {
                    process.kill();
                    reject({
                        success: false,
                        error: "Installation timeout (5 minutes)",
                        stderr: "",
                    });
                },
                5 * 60 * 1000,
            );
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

// IPC处理程序 - 执行CLI启动命令
ipcMain.handle("execute-command", async (event, command) => {
    try {
        console.log(`🚀 Executing command: ${command}`);

        const { spawn } = require("child_process");
        
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

// 创建主窗口
async function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            preload: path.join(__dirname, "preload.js"),
            devTools: isDev,
        },
        icon: path.join(__dirname, "..", "assets", "Claudable_Icon.png"),
        // titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false,
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
    try {
        await mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);
    } catch (error) {
        console.error("Failed to load main window:", error);

        // 显示错误页面
        const errorHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Application Error</h1>
          <p>Failed to start the application services.</p>
          <p>Error: ${error.message}</p>
          <button onclick="window.close()">Close Application</button>
        </body>
      </html>
    `;

        await mainWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`,
        );
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// 应用启动
app.whenReady().then(async () => {
    // 防止重复启动
    if (isStarting) {
        console.log(
            "⚠️ App is already starting, ignoring duplicate ready event",
        );
        return;
    }
    isStarting = true;

    try {
        console.log("🚀 Starting Claudable Electron App...");

        // 并行启动服务
        const startServices = async () => {
            const nextPromise = startNextJS();
            const pythonPromise = startPythonAPI();

            // 等待两个服务都启动
            await Promise.all([nextPromise, pythonPromise]);

            // 等待服务真正可用
            const nextReady = await waitForService(
                `http://127.0.0.1:${NEXT_PORT}`,
            );
            const apiReady = await waitForService(
                `http://127.0.0.1:${API_PORT}/health`,
            );

            if (!nextReady || !apiReady) {
                throw new Error("Failed to start required services");
            }
        };

        await startServices();
        await createMainWindow();

        console.log("✅ Claudable started successfully!");
        isStarting = false;
    } catch (error) {
        console.error("❌ Failed to start Claudable:", error);
        isStarting = false;

        const response = await dialog.showMessageBox({
            type: "error",
            title: "Startup Error",
            message: "Failed to start Claudable",
            detail: error.message,
            buttons: ["Quit", "Retry"],
        });

        if (response.response === 1) {
            isStarting = false;
            app.relaunch();
        }

        app.quit();
    }
});

function cleanup() {
    if (nextProcess) {
        nextProcess.kill("SIGTERM");
        nextProcess = null;
    }

    if (pythonProcess) {
        pythonProcess.kill("SIGTERM");
        pythonProcess = null;
    }
}

// macOS 特殊处理
app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
    }
});

// 应用退出处理
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    console.log("🔄 Shutting down services...");
    cleanup();
});

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    cleanup();
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    cleanup();
});
