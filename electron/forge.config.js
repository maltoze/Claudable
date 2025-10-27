const dotenv = require("dotenv");
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const path = require("path");
const fs = require("fs");

dotenv.config();

module.exports = {
    packagerConfig: {
        name: "Claudecode desktop",
        executableName: "Claudecode desktop",
        icon: "../assets/icon",
        asar: true,
        ignore: [/\.git/, /\.DS_Store/, /node_modules\/\.cache/, /out/],
        extraResource: [
            "../apps/web/.next/standalone",
            "../apps/web/.next/static",
            "../apps/web/public",
            "./python-dist",
        ],
        osxSign: process.env.ELECTRON_IS_DEV
            ? false
            : {
                  entitlements: "./entitlements.mac.plist",
                  "entitlements-inherit": "./entitlements.mac.plist",
              },
        osxNotarize: process.env.ELECTRON_IS_DEV
            ? undefined
            : {
                  appleId: process.env.APPLE_ID,
                  appleIdPassword: process.env.APPLE_PASSWORD,
                  teamId: process.env.APPLE_TEAM_ID,
              },
        extendInfo: {
            NSAppleEventsUsageDescription:
                "Claudable needs to control Terminal.app to launch CLI tools for development.",
        },
        afterCopyExtraResources: [
            (buildPath, electronVersion, platform, arch, callback) => {
                let resourcesPath = path.join(buildPath, "resources");
                if (platform === "darwin") {
                    resourcesPath = path.join(
                        buildPath,
                        "Claudecode desktop.app",
                        "Contents",
                        "Resources",
                    );
                }
                fs.renameSync(
                    path.join(resourcesPath, "public"),
                    path.join(
                        resourcesPath,
                        "standalone",
                        "apps",
                        "web",
                        "public",
                    ),
                );
                // move static to standalone .next
                fs.renameSync(
                    path.join(resourcesPath, "static"),
                    path.join(
                        resourcesPath,
                        "standalone",
                        "apps",
                        "web",
                        ".next",
                        "static",
                    ),
                );
                callback();
            },
        ],
    },
    makers: [
        {
            name: "@electron-forge/maker-squirrel",
            config: {
                name: "claudable",
                exe: "Claudecode desktop.exe",
                setupExe: "Claudecode-desktop-Setup.exe",
                setupIcon: "../assets/icon.ico",
                skipUpdateIcon: false,
                skipUpdateBinary: false,
            },
        },
        {
            name: "@electron-forge/maker-zip",
            platforms: ["darwin"],
        },
        {
            name: "@electron-forge/maker-dmg",
            config: {
                name: "Claudecode desktop",
                format: "ULFO",
            },
        },
        {
            name: "@electron-forge/maker-deb",
            config: {
                options: {
                    maintainer: "Claudable Team",
                    homepage: "https://github.com/maltoze/Claudable",
                    icon: "../assets/Claudable_Icon.png",
                },
            },
        },
        {
            name: "@electron-forge/maker-rpm",
            config: {
                options: {
                    maintainer: "Claudable Team",
                    homepage: "https://github.com/maltoze/Claudable",
                    icon: "../assets/Claudable_Icon.png",
                },
            },
        },
    ],
    publishers: [
        {
            name: "@electron-forge/publisher-github",
            config: {
                repository: {
                    owner: "maltoze",
                    name: "Claudable",
                },
                prerelease: false,
                draft: true,
            },
        },
    ],
    plugins: [
        {
            name: "@electron-forge/plugin-auto-unpack-natives",
            config: {},
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: true,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: false,
        }),
    ],
};
