@echo off
setlocal
set "ROOT=%~dp0"
pushd "%ROOT%" >nul
where pwsh.exe >nul 2>nul
if %errorlevel% equ 0 (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-local.ps1" %*
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-local.ps1" %*
)
if errorlevel 1 pause
popd >nul
