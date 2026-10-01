[CmdletBinding()]
param(
    [switch]$NoPause,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceRoot = (Resolve-Path (Join-Path $repoRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$webDir = Join-Path $repoRoot "web"
$toolsBin = Join-Path $workspaceRoot "tools\bin"
$browsersDir = Join-Path $workspaceRoot "tools\browsers"

# @opc-adapter: runtime-data-isolation [start]
$dataDir = Join-Path $workspaceRoot "workspace-data\runtime\media-lab"
$buildTempRoot = if ($env:OPC_BUILD_TEMP) { $env:OPC_BUILD_TEMP } else { Join-Path (Split-Path -Parent $workspaceRoot) "build-temp" }
$goBuildCache = Join-Path $buildTempRoot "media-lab\go-build"
$goModuleCache = Join-Path $buildTempRoot "media-lab\go-mod"
# @opc-adapter: runtime-data-isolation [end]

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  [opc-Copilot] 正在启动 media-lab 影视短剧与画布系统" -ForegroundColor Cyan
Write-Host "  共享工具链: $toolsBin" -ForegroundColor Gray
Write-Host "  运行时数据: $dataDir" -ForegroundColor Gray
Write-Host "===================================================" -ForegroundColor Cyan

if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    throw "未找到 go，请先安装 Go 语言运行环境。"
}

foreach ($directory in @($dataDir, $goBuildCache, $goModuleCache)) {
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
}

function Test-ListeningPort([int]$Port) {
    try {
        return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    } catch {
        return $false
    }
}

$backendRunning = Test-ListeningPort 8080
$frontendRunning = Test-ListeningPort 3000

if ($backendRunning) {
    Write-Host "[提示] 后端端口 8080 已处于监听状态，复用现有服务。" -ForegroundColor Yellow
} else {
    # @opc-adapter: local_channel_and_private_upstreams [start]
    $envVars = @(
        "PATH=$toolsBin;%PATH%",
        "CANVAS_BACKEND_ADDR=127.0.0.1:8080",
        "CANVAS_BACKEND_DATA_DIR=$dataDir",
        "CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS=10.66.0.1,127.0.0.1,localhost",
        "CANVAS_ALLOW_PRIVATE_UPSTREAMS=true",
        "CANVAS_DESKTOP_LOCAL_CHANNELS=true",
        "GOCACHE=$goBuildCache",
        "GOMODCACHE=$goModuleCache",
        "GOPROXY=https://goproxy.cn,direct",
        "CGO_ENABLED=0"
    )
    $setCmds = ($envVars | ForEach-Object { "set `"" + $_ + "`"" }) -join " && "
    $goCmd = "title media-lab-Backend (:8080) && $setCmds && cd /d `"$backendDir`" && go run ./cmd/server"
    # @opc-adapter: local_channel_and_private_upstreams [end]
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k `"$goCmd`"" -WorkingDirectory $backendDir
    Write-Host "[等待] 正在编译并启动 Go 后端服务 (:8080)..." -ForegroundColor Gray

    $backendReady = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-ListeningPort 8080) {
            $backendReady = $true
            break
        }
    }
    if ($backendReady) {
        Write-Host "[OK] media-lab Go 后端服务已就绪 (:8080)" -ForegroundColor Green
    } else {
        Write-Host "[提示] media-lab Go 后端窗口已唤起，正在后台编译中..." -ForegroundColor Yellow
    }
}

if ($frontendRunning) {
    Write-Host "[提示] 前端端口 3000 已处于监听状态，复用现有服务。" -ForegroundColor Yellow
} else {
    $pnpmCmd = "pnpm.cmd"
    if (-not (Get-Command $pnpmCmd -ErrorAction SilentlyContinue)) {
        $pnpmCmd = "pnpm"
    }

    $frontendCmd = "title media-lab-Frontend (:3000) && cd /d `"$webDir`" && set VITE_API_PROXY_TARGET=http://127.0.0.1:8080 && $pnpmCmd run dev"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k `"$frontendCmd`"" -WorkingDirectory $webDir
    Write-Host "[等待] 正在启动 Vite 前端服务并就绪端口 (:3000)..." -ForegroundColor Gray

    $frontendReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-ListeningPort 3000) {
            $frontendReady = $true
            break
        }
    }
    if ($frontendReady) {
        Write-Host "[OK] media-lab Vite 前端服务已就绪 (:3000)" -ForegroundColor Green
    } else {
        Write-Host "[提示] media-lab Vite 前端窗口已唤起，正在后台加载依赖中..." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  media-lab 启动成功！访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  后端 API 端口: http://127.0.0.1:8080" -ForegroundColor Gray
Write-Host "===================================================" -ForegroundColor Green

if (-not $NoBrowser) {
    try {
        Start-Process "http://localhost:3000"
    } catch {
        Write-Host "[提示] 无法自动打开浏览器，请手动访问: http://localhost:3000" -ForegroundColor Yellow
    }
}

if (-not $NoPause) {
    Write-Host "按任意键关闭此引导窗口（服务将在独立窗口中继续运行）..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
