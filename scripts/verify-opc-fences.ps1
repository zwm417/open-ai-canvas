[CmdletBinding()]
param(
    [switch]$Quiet,
    [switch]$UpdateBaseline,
    [switch]$SkipBaseline
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = $PSScriptRoot
$mediaLabDir = (Resolve-Path (Join-Path $scriptDir "..")).Path
$baselinePath = Join-Path $scriptDir "opc-fence-baseline.json"

$sourceRoots = @(
    (Join-Path $mediaLabDir "web\src"),
    (Join-Path $mediaLabDir "backend"),
    (Join-Path $mediaLabDir "plugins"),
    (Join-Path $mediaLabDir "plugin-packages"),
    (Join-Path $mediaLabDir "scripts")
)
$extensions = @("*.ts", "*.tsx", "*.css", "*.go", "*.ps1", "*.cmd", "*.sh")
$markerPattern = '@opc-(feature|adapter):\s*([a-z0-9][a-z0-9._-]*)\s+\[(start|end)\]'
$errors = New-Object System.Collections.Generic.List[string]
$fileCount = 0
$blockCount = 0

$scannedFences = @{}

foreach ($root in $sourceRoots) {
    if (-not (Test-Path -LiteralPath $root)) {
        continue
    }

    $files = Get-ChildItem -LiteralPath $root -Recurse -File -Include $extensions | Where-Object {
        $_.FullName -notmatch "\\node_modules\\|\\dist\\|\\\.vite\\|\\data\\|verify-opc-fences\.ps1$|sync-upstream\.ps1$"
    }
    foreach ($file in $files) {
        $fileCount++
        $relative = $file.FullName.Substring($mediaLabDir.Length).TrimStart("\", "/").Replace("\", "/")
        $stack = New-Object System.Collections.Generic.Stack[PSCustomObject]
        $lineNumber = 0
        $fileLines = [System.IO.File]::ReadAllLines($file.FullName)
        for ($i = 0; $i -lt $fileLines.Count; $i++) {
            $line = $fileLines[$i]
            $lineNumber = $i + 1
            $match = [System.Text.RegularExpressions.Regex]::Match($line, $markerPattern)
            if (-not $match.Success) {
                continue
            }

            $kind = $match.Groups[1].Value
            $key = $match.Groups[2].Value
            $action = $match.Groups[3].Value
            $blockKey = $kind + ":" + $key

            # 检测 TSX 文件中将单行 // 围栏错误置于 JSX 模板子节点导致的 UI 文本渲染泄漏
            if ($file.Extension -eq ".tsx" -and $line.Trim().StartsWith("//")) {
                $prevNonEmpty = ""
                for ($p = $i - 1; $p -ge 0; $p--) {
                    if ($fileLines[$p].Trim()) { $prevNonEmpty = $fileLines[$p].Trim(); break }
                }
                $nextNonEmpty = ""
                for ($n = $i + 1; $n -lt $fileLines.Count; $n++) {
                    if ($fileLines[$n].Trim()) { $nextNonEmpty = $fileLines[$n].Trim(); break }
                }
                if (($prevNonEmpty.EndsWith(">") -or $prevNonEmpty.EndsWith("}")) -and ($nextNonEmpty.StartsWith("<") -or $nextNonEmpty.StartsWith("{") -or $nextNonEmpty.StartsWith("</"))) {
                    $errors.Add("$($file.FullName):$lineNumber 语法错误：TSX 文件中的 JSX 模板子节点不得使用单行 '//' 围栏（会导致 React 将其作为文本渲染到界面）！请改用 '{/* @opc-${kind}: ${key} [${action}] */}'")
                }
            }
            if ($action -eq "start") {
                if ($stack.Count -gt 0) {
                    $top = $stack.Peek()
                    $errors.Add("$($file.FullName):$lineNumber 禁止围栏嵌套：在 $($top.Key)（始于第 $($top.Line) 行）内部又开启了 $blockKey")
                }
                $stack.Push([PSCustomObject]@{ Key = $blockKey; Line = $lineNumber })
                $blockCount++

                if (-not $scannedFences.ContainsKey($blockKey)) {
                    $scannedFences[$blockKey] = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
                }
                [void]$scannedFences[$blockKey].Add($relative)
            } elseif ($action -eq "end") {
                if ($stack.Count -eq 0) {
                    $errors.Add("$($file.FullName):$lineNumber 找不到对应 start 围栏 $blockKey")
                } else {
                    $top = $stack.Pop()
                    if ($top.Key -ne $blockKey) {
                        $errors.Add("$($file.FullName):$lineNumber 围栏交叉闭合错误：期望闭合 $($top.Key)（始于第 $($top.Line) 行），实际遇到 $blockKey")
                    }
                }
            }
        }

        while ($stack.Count -gt 0) {
            $unclosed = $stack.Pop()
            $errors.Add("$($file.FullName):$($unclosed.Line) 缺少 end 围栏 $($unclosed.Key)")
        }
    }
}

if ($errors.Count -gt 0) {
    foreach ($errorMessage in $errors) {
        Write-Error $errorMessage
    }
    exit 1
}

if ($UpdateBaseline) {
    $sorted = [ordered]@{}
    foreach ($key in ($scannedFences.Keys | Sort-Object)) {
        $sorted[$key] = @($scannedFences[$key] | Sort-Object)
    }
    $baselineObj = [ordered]@{
        version = "1.0"
        description = "OPC Media-Lab 核心隐式围栏基准清单（防上游更新覆盖与二开丢失）"
        updatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
        totalFences = $sorted.Count
        fences = $sorted
    }
    $baselineObj | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $baselinePath -Encoding utf8
    if (-not $Quiet) {
        Write-Host "OPC 围栏基准已更新：已将 $($sorted.Count) 个基准围栏保存至 $baselinePath" -ForegroundColor Green
    }
    exit 0
}

if (-not $SkipBaseline -and (Test-Path -LiteralPath $baselinePath)) {
    try {
        $baselineContent = Get-Content -LiteralPath $baselinePath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($baselineContent.fences) {
            $baselineFences = $baselineContent.fences
            $missingFences = New-Object System.Collections.Generic.List[string]
            foreach ($prop in $baselineFences.PSObject.Properties) {
                $fenceKey = $prop.Name
                $expectedFiles = @($prop.Value)
                if (-not $scannedFences.ContainsKey($fenceKey)) {
                    $missingFences.Add("缺少关键基准围栏：$fenceKey (预期文件: $($expectedFiles -join ', '))")
                    continue
                }
                $actualFiles = $scannedFences[$fenceKey]
                foreach ($expFile in $expectedFiles) {
                    $normExp = $expFile.Replace("\", "/")
                    if (-not $actualFiles.Contains($normExp)) {
                        $missingFences.Add("围栏在预期文件中丢失：$fenceKey 在 $normExp 中未找到！")
                    }
                }
            }

            if ($missingFences.Count -gt 0) {
                Write-Host ""
                Write-Host "===================================================" -ForegroundColor Red
                Write-Host "  [错误] 检测到本地二开 OPC 围栏发生丢失！" -ForegroundColor Red
                Write-Host "  这通常是由于上游整文件同步覆盖或误删导致。" -ForegroundColor Red
                Write-Host "===================================================" -ForegroundColor Red
                foreach ($missing in $missingFences) {
                    Write-Error $missing
                }
                exit 1
            }
        }
    } catch {
        Write-Error "读取基准文件失败 ($baselinePath): $($_.Exception.Message)"
        exit 1
    }
}

if (-not $Quiet) {
    Write-Host "OPC 围栏检查通过：扫描 $fileCount 个源码文件，发现 $blockCount 个围栏块，基准校验 100% 完整。" -ForegroundColor Green
}
exit 0
