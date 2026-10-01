[CmdletBinding()]
param(
    [string]$Branch = "main",
    [string]$Tag = "",
    [switch]$NoPause,
    [switch]$AutoCommit,
    [switch]$Verify
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = $PSScriptRoot
$mediaLabDir = (Resolve-Path (Join-Path $scriptDir "..")).Path
$workspaceRoot = (Resolve-Path (Join-Path $mediaLabDir "..")).Path
$backendDir = Join-Path $mediaLabDir "backend"
$webDir = Join-Path $mediaLabDir "web"
$upstreamRepoUrl = "https://github.com/ddcat-ai/open-ai-canvas.git"
$opcRoot = Split-Path -Parent $workspaceRoot
$buildTempRoot = if ($env:OPC_BUILD_TEMP) { $env:OPC_BUILD_TEMP } else { Join-Path $opcRoot "build-temp" }
$syncRoot = Join-Path $buildTempRoot "media-lab"
$tempSyncDir = if (Test-Path (Join-Path $syncRoot "upstream-latest")) { Join-Path $syncRoot "upstream-latest" } else { Join-Path $syncRoot "upstream" }
$fenceChecker = Join-Path $scriptDir "verify-opc-fences.ps1"

if (-not (Test-Path -LiteralPath $buildTempRoot)) {
    New-Item -ItemType Directory -Force -Path $buildTempRoot | Out-Null
}
New-Item -ItemType Directory -Force -Path $syncRoot | Out-Null
$resolvedBuildTempRoot = (Resolve-Path $buildTempRoot).Path.TrimEnd("\") + "\"
$resolvedTempSyncDir = [System.IO.Path]::GetFullPath($tempSyncDir)
if (-not $resolvedTempSyncDir.StartsWith($resolvedBuildTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "同步临时目录必须位于 build-temp 下：$resolvedTempSyncDir"
}

function Invoke-Git([string[]]$GitArguments) {
    & git @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git 命令失败：git $($GitArguments -join ' ')"
    }
}

function Normalize-Text([string]$Value) {
    return ($Value -replace "\r\n", "\n" -replace "\r", "\n")
}

function Get-FencedRelativePaths {
    $roots = @(
        (Join-Path $mediaLabDir "web\src"),
        (Join-Path $mediaLabDir "backend"),
        (Join-Path $mediaLabDir "plugins"),
        (Join-Path $mediaLabDir "plugin-packages"),
        (Join-Path $mediaLabDir "scripts")
    )
    $extensions = @("*.ts", "*.tsx", "*.css", "*.go", "*.ps1", "*.cmd", "*.sh")
    $markerPattern = '@opc-(feature|adapter):\s*[a-z0-9][a-z0-9._-]*\s+\[(start|end)\]'
    $result = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }
        $files = Get-ChildItem -LiteralPath $root -Recurse -File -Include $extensions | Where-Object {
            $_.FullName -notmatch "\\node_modules\\|\\dist\\|\\\.vite\\|verify-opc-fences\.ps1$|sync-upstream\.ps1$"
        }
        foreach ($file in $files) {
            if ([System.Text.RegularExpressions.Regex]::IsMatch([System.IO.File]::ReadAllText($file.FullName), $markerPattern)) {
                $relative = $file.FullName.Substring($mediaLabDir.Length).TrimStart("\", "/")
                [void]$result.Add($relative.Replace("/", "\"))
            }
        }
    }
    return @($result)
}

function Assert-CleanMediaLab {
    $gitDir = Join-Path $workspaceRoot ".git"
    if (-not (Test-Path -LiteralPath $gitDir)) {
        Write-Host "  [提示] 根目录未初始化 Git 仓库，跳过工作区干净度检查。" -ForegroundColor Yellow
        return
    }
    $rawStatus = @(& git -C $workspaceRoot status --porcelain --untracked-files=all -- media-lab)
    if ($LASTEXITCODE -ne 0) {
        throw "无法读取 media-lab Git 状态。"
    }
    $status = @($rawStatus | Where-Object { $_ -notmatch "media-lab[/\\]scripts[/\\]sync-upstream\.ps1$" })
    if ($status.Count -gt 0) {
        $details = ($status | Select-Object -First 20) -join "`n"
        throw "media-lab 工作区不干净。请先提交或另存本地修改，再执行上游同步：`n$details"
    }
}

function Invoke-FenceCheck {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $fenceChecker -Quiet
    if ($LASTEXITCODE -ne 0) {
        throw "OPC 围栏检查失败，已中止同步。"
    }
}

function Invoke-Verification {
    $previousGoCache = $env:GOCACHE
    $previousGoModuleCache = $env:GOMODCACHE
    $env:GOCACHE = Join-Path $syncRoot "go-build"
    $env:GOMODCACHE = Join-Path $syncRoot "go-mod"
    New-Item -ItemType Directory -Force -Path $env:GOCACHE, $env:GOMODCACHE | Out-Null
    try {
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            throw "未找到 bun，无法执行 -Verify。"
        }
        if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
            throw "未找到 go，无法执行 -Verify。"
        }
        Push-Location $webDir
        try {
            & bun run typecheck
            if ($LASTEXITCODE -ne 0) { throw "web typecheck 失败。" }
        } finally {
            Pop-Location
        }
        Push-Location $backendDir
        try {
            & go test ./...
            if ($LASTEXITCODE -ne 0) { throw "backend go test 失败。" }
        } finally {
            Pop-Location
        }
    } finally {
        $env:GOCACHE = $previousGoCache
        $env:GOMODCACHE = $previousGoModuleCache
    }
}

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  [media-lab] 受控上游同步" -ForegroundColor Cyan
Write-Host "  上游地址: $upstreamRepoUrl" -ForegroundColor Gray
Write-Host "  目标工作区: $mediaLabDir" -ForegroundColor Gray
Write-Host "===================================================" -ForegroundColor Cyan

try {
    Write-Host "[1/6] 检查工作区和本地围栏..." -ForegroundColor Yellow
    Assert-CleanMediaLab
    Invoke-FenceCheck

    Write-Host "[2/6] 拉取上游代码..." -ForegroundColor Yellow
    $cloneSuccess = $false
    if (Test-Path -LiteralPath $tempSyncDir) {
        $existingHead = (& git -C $tempSyncDir rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $existingHead) {
            Write-Host "  检测到已就绪的上游克隆目录，直接复用: $($existingHead.Substring(0, 8))" -ForegroundColor Green
            $cloneSuccess = $true
        } else {
            Remove-Item -Recurse -Force -LiteralPath $tempSyncDir
        }
    }
    if (-not $cloneSuccess) {
        $cloneArgs = @("clone", "--depth", "1", "--progress")
        if ($Tag -ne "") {
            $cloneArgs += @("--branch", $Tag)
        } else {
            $cloneArgs += @("--branch", $Branch)
        }
        $cloneArgs += @($upstreamRepoUrl, $tempSyncDir)
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            & git @cloneArgs
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $tempSyncDir)) {
                $cloneSuccess = $true
                break
            }
            if (Test-Path -LiteralPath $tempSyncDir) {
                Remove-Item -Recurse -Force -LiteralPath $tempSyncDir
            }
            if ($attempt -lt 3) {
                Write-Host "  网络中断，2 秒后重试（$attempt/3）..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
        }
        if (-not $cloneSuccess) {
            throw "上游仓库克隆失败，请检查网络连接。"
        }
    }

    $upstreamCommit = (git -C $tempSyncDir rev-parse --short HEAD).Trim()
    $upstreamVersion = ""
    $versionPath = Join-Path $tempSyncDir "VERSION"
    if (Test-Path -LiteralPath $versionPath) {
        $upstreamVersion = [System.IO.File]::ReadAllText($versionPath).Trim()
    }
    Write-Host "  上游版本: $upstreamVersion ($upstreamCommit)" -ForegroundColor Green

    Write-Host "[3/6] 识别带围栏的原生文件..." -ForegroundColor Yellow
    $fencedRelativePaths = @(Get-FencedRelativePaths)
    $fencedChangedPaths = New-Object System.Collections.Generic.List[string]
    $excludedFiles = @(
        "AGENTS.md",
        ".gitignore",
        "start.cmd",
        "sync-upstream.cmd",
        "scripts\start-local.ps1",
        "scripts\sync-upstream.ps1",
        "scripts\verify-opc-fences.ps1",
        "docs\upstream-sync-and-extension-guide.md",
        "plugin-packages\opc-infinite-README.md",
        "backend\go.mod",
        "backend\go.sum"
    )
    $excludedDirectories = @(
        ".git",
        "web\src\extensions",
        "backend\internal\custom",
        "plugin-packages\autodl-comfyui",
        "plugin-packages\opc-infinite-video-reverse",
        "plugin-packages\opc-plugin-image-cinema",
        "plugin-packages\opc-plugin-image-ecommerce",
        "plugin-packages\opc-plugin-image-oriental",
        "plugin-packages\opc-plugin-image-portrait",
        "plugin-packages\opc-plugin-image-social",
        "plugin-packages\opc-plugin-image-spatial",
        "docs\opc-infinite",
        "web\public\images\skills",
        "web\src\pages\prompts",
        "web\src\components\prompts"
    )
    foreach ($relative in $fencedRelativePaths) {
        $targetFile = Join-Path $mediaLabDir $relative
        $sourceFile = Join-Path $tempSyncDir $relative
        if (Test-Path -LiteralPath $sourceFile) {
            $targetText = Normalize-Text ([System.IO.File]::ReadAllText($targetFile))
            $sourceText = Normalize-Text ([System.IO.File]::ReadAllText($sourceFile))
            if ($targetText -ne $sourceText) {
                $fencedChangedPaths.Add($relative)
                $excludedFiles += $relative
            }
        } else {
            $fencedChangedPaths.Add($relative + " (上游已删除，保留本地文件)")
        }
    }

    Write-Host "[4/6] 同步上游文件（不覆盖本地扩展和带围栏文件）..." -ForegroundColor Yellow
    $robocopyArgs = @($tempSyncDir, $mediaLabDir, "/E", "/R:1", "/W:1", "/NFL", "/NDL")
    $robocopyArgs += "/XD"
    foreach ($directory in $excludedDirectories) {
        $robocopyArgs += (Join-Path $tempSyncDir $directory)
    }
    $robocopyArgs += "/XF"
    $robocopyArgs += @("sync-upstream.cmd", "sync-upstream.ps1", "start.cmd", "verify-opc-fences.ps1")
    foreach ($file in $excludedFiles) {
        $robocopyArgs += (Join-Path $tempSyncDir $file)
    }
    & robocopy @robocopyArgs | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "上游文件同步失败，robocopy exit code=$LASTEXITCODE。"
    }

    $auditLogPath = Join-Path $workspaceRoot "workspace-data\runtime\media-lab\upstream-sync-audit.json"
    $auditDir = Split-Path $auditLogPath -Parent
    if (-not (Test-Path -LiteralPath $auditDir)) {
        New-Item -ItemType Directory -Force -Path $auditDir | Out-Null
    }
    $auditData = [PSCustomObject]@{
        Timestamp = (Get-Date).ToString("o")
        UpstreamCommit = $upstreamCommit
        UpstreamVersion = $upstreamVersion
        FencedSkippedFiles = @($fencedChangedPaths)
        ExcludedDirectories = @($excludedDirectories)
    }
    $auditData | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $auditLogPath -Encoding utf8

    if ($fencedChangedPaths.Count -gt 0) {
        Write-Host "  以下带围栏文件未自动覆盖，请人工迁移围栏后再同步：" -ForegroundColor Yellow
        foreach ($path in $fencedChangedPaths) { Write-Host "    $path" -ForegroundColor Yellow }
        Write-Host "  审计清单已写入: $auditLogPath" -ForegroundColor Cyan
    }

    Write-Host "[5/6] 同步后围栏检查..." -ForegroundColor Yellow
    Invoke-FenceCheck
    if ($Verify) {
        Write-Host "  执行 web typecheck 和 backend go test..." -ForegroundColor Yellow
        Invoke-Verification
    }

    $gitDir = Join-Path $workspaceRoot ".git"
    if (-not (Test-Path -LiteralPath $gitDir)) {
        Write-Host "[6/6] 未检测到 Git 仓库，变更已准备就绪（跳过自动提交）。" -ForegroundColor Yellow
    } else {
        # 安全阻断校验：检查受保护的排除目录是否有任何未提交的变更
        $violationChanges = New-Object System.Collections.Generic.List[string]
        foreach ($dir in $excludedDirectories) {
            $checkRel = Join-Path "media-lab" $dir
            $dirChanged = @(& git -C $workspaceRoot status --porcelain -- $checkRel)
            if ($dirChanged.Count -gt 0) {
                foreach ($line in $dirChanged) {
                    $violationChanges.Add($line)
                }
            }
        }
        if ($violationChanges.Count -gt 0) {
            Write-Host "安全拦截：检测到受保护的排除目录存在未保护改动或被意外修改：" -ForegroundColor Red
            foreach ($v in $violationChanges) {
                Write-Host "  $v" -ForegroundColor Red
            }
            throw "安全阻断：受保护的排除目录存在变更，拒绝自动提交！请先还原排除目录的改动。"
        }

        $changed = @(& git -C $workspaceRoot status --porcelain --untracked-files=all -- media-lab)
        if ($changed.Count -eq 0) {
            Write-Host "  没有检测到同步变更。" -ForegroundColor Gray
        } elseif ($AutoCommit) {
            Write-Host "[6/6] 仅提交 media-lab 范围..." -ForegroundColor Yellow
            Invoke-Git @("-C", $workspaceRoot, "add", "--", "media-lab")
            $versionLabel = if ($upstreamVersion) { $upstreamVersion } else { "commit-$upstreamCommit" }
            $commitMessage = "chore(media-lab): sync upstream open-ai-canvas to $versionLabel ($upstreamCommit)"
            Invoke-Git @("-C", $workspaceRoot, "commit", "-m", $commitMessage)
            Write-Host "  Git 提交完成：$commitMessage" -ForegroundColor Green
        } else {
            Write-Host "[6/6] 未提交变更（默认安全模式）。" -ForegroundColor Green
            Write-Host "  审查完成后可执行 git add -- media-lab 与 git commit，或重新传入 -AutoCommit。" -ForegroundColor Gray
        }
    }

    Write-Host "同步完成。上游提交：$upstreamCommit" -ForegroundColor Green
} finally {
    if ($tempSyncDir -notmatch "upstream-latest$" -and (Test-Path -LiteralPath $tempSyncDir)) {
        Remove-Item -Recurse -Force -LiteralPath $tempSyncDir
    }
    if (-not $NoPause) {
        Write-Host "按任意键退出..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}
