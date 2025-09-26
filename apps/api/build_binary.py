#!/usr/bin/env python3
"""
Build script for creating PyInstaller binary of the FastAPI application
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def run_command(cmd, cwd=None):
    """Run a command and handle errors"""
    print(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            shell=isinstance(cmd, str)
        )
        print(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        sys.exit(1)

def main():
    # Get current directory (should be apps/api)
    current_dir = Path.cwd()
    project_root = current_dir.parent.parent
    
    print(f"Building from: {current_dir}")
    print(f"Project root: {project_root}")
    
    # Ensure we're in the API directory
    if not (current_dir / "app" / "main.py").exists():
        print("Error: Please run this script from the apps/api directory")
        sys.exit(1)
    
    # Create python-dist directory in electron folder
    electron_dir = project_root / "electron"
    python_dist_dir = electron_dir / "python-dist"
    
    if python_dist_dir.exists():
        print("Cleaning existing python-dist directory...")
        shutil.rmtree(python_dist_dir)
    
    python_dist_dir.mkdir(parents=True, exist_ok=True)
    
    # Create PyInstaller spec file
    spec_content = '''
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# Data files to include
datas = []

# Hidden imports (add any missing imports here)
hiddenimports = [
    'uvicorn.loops.auto',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.http.auto',
    'uvicorn.lifespan.on',
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.pool',
    'multipart',
    'app.models',
    'app.api.projects',
    'app.api.repo',
    'app.api.commits',
    'app.api.env',
    'app.api.assets',
    'app.api.chat',
    'app.api.tokens',
    'app.api.settings',
    'app.api.project_services',
    'app.api.github',
    'app.api.vercel',
]

a = Analysis(
    ['app/main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# 使用 onedir 模式而不是 onefile 来避免代码签名问题
coll = COLLECT(
    EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name='api-server',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=True,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    ),
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='api-server',
)
'''
    
    spec_file = current_dir / "api-server.spec"
    with open(spec_file, "w") as f:
        f.write(spec_content)
    
    print("Building binary with PyInstaller...")
    
    # Run PyInstaller
    run_command([
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        str(spec_file)
    ], cwd=current_dir)
    
    # Copy the built binary to electron/python-dist
    dist_dir = current_dir / "dist"
    source_dir = dist_dir / "api-server"  # onedir 模式生成的是目录
    
    if source_dir.exists():
        target_dir = python_dist_dir
        print(f"Copying binary directory from {source_dir} to {target_dir}")
        
        # 复制整个目录
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(source_dir, target_dir)
        
        # 确保主执行文件可执行
        binary_name = "api-server.exe" if os.name == 'nt' else "api-server"
        main_binary = target_dir / binary_name
        if os.name != 'nt' and main_binary.exists():
            os.chmod(main_binary, 0o755)
        
        print(f"✅ Binary built successfully: {main_binary}")
        if main_binary.exists():
            print(f"Binary size: {main_binary.stat().st_size / 1024 / 1024:.1f} MB")
    else:
        print(f"❌ Binary directory not found at {source_dir}")
        sys.exit(1)
    
    # Clean up
    print("Cleaning up build artifacts...")
    if (current_dir / "build").exists():
        shutil.rmtree(current_dir / "build")
    if (current_dir / "dist").exists():
        shutil.rmtree(current_dir / "dist")
    if spec_file.exists():
        spec_file.unlink()
    
    print("✅ Build completed successfully!")

if __name__ == "__main__":
    main()