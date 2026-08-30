[CmdletBinding()]
param(
    [string]$BuildType,
    [string]$Version,
    [string]$ProjectRoot,
    [switch]$NoBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$NonInteractiveInvocation = $PSBoundParameters.ContainsKey('BuildType') -or $PSBoundParameters.ContainsKey('Version') -or $NoBuild.IsPresent

$SemVerPattern = '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'

function Fail([string]$Message, [int]$ExitCode = 1) {
    Write-Host "[失败] $Message" -ForegroundColor Red
    return $ExitCode
}

function Get-VersionSources([string]$Root) {
    $packagePath = Join-Path $Root 'package.json'
    $cargoPath = Join-Path $Root 'Cargo.toml'
    $tauriPath = Join-Path $Root 'src-tauri/tauri.conf.json'
    foreach ($path in @($packagePath, $cargoPath, $tauriPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "缺少版本文件：$path"
        }
    }

    $packageRaw = Get-Content -LiteralPath $packagePath -Raw
    $cargoRaw = Get-Content -LiteralPath $cargoPath -Raw
    $tauriRaw = Get-Content -LiteralPath $tauriPath -Raw
    $packageVersion = (ConvertFrom-Json $packageRaw -AsHashtable).version
    $tauriVersion = (ConvertFrom-Json $tauriRaw -AsHashtable).version
    if ($null -eq $packageVersion -or $null -eq $tauriVersion) {
        throw 'package.json 或 tauri.conf.json 缺少根级 version 字段。'
    }

    $workspaceMatch = [regex]::Match($cargoRaw, '(?ms)^\[workspace\.package\]\s*$.*?(?=^\[|\z)')
    if (-not $workspaceMatch.Success) {
        throw 'Cargo.toml 缺少 [workspace.package] 区段。'
    }
    $cargoVersionMatch = [regex]::Match($workspaceMatch.Value, '(?m)^\s*version\s*=\s*"(?<version>[^"]+)"\s*(?:#.*)?$')
    if (-not $cargoVersionMatch.Success) {
        throw 'Cargo.toml 的 [workspace.package] 区段缺少 version 字段。'
    }

    return [pscustomobject]@{
        Package = [pscustomobject]@{ Path = $packagePath; Raw = $packageRaw; Version = [string]$packageVersion }
        Cargo = [pscustomobject]@{ Path = $cargoPath; Raw = $cargoRaw; Version = [string]$cargoVersionMatch.Groups['version'].Value }
        Tauri = [pscustomobject]@{ Path = $tauriPath; Raw = $tauriRaw; Version = [string]$tauriVersion }
    }
}

function Find-JsonStringEnd([string]$Raw, [int]$StartIndex) {
    for ($index = $StartIndex + 1; $index -lt $Raw.Length; $index++) {
        if ($Raw[$index] -eq '\\') {
            $index++
            continue
        }
        if ($Raw[$index] -eq '"') { return $index }
    }
    throw 'JSON 字符串未闭合。'
}

function Skip-JsonWhitespace([string]$Raw, [int]$StartIndex) {
    $index = $StartIndex
    while ($index -lt $Raw.Length -and [char]::IsWhiteSpace($Raw[$index])) { $index++ }
    return $index
}

function Set-RootJsonVersion([string]$Raw, [string]$NewVersion) {
    $depth = 0
    for ($index = 0; $index -lt $Raw.Length; $index++) {
        $character = $Raw[$index]
        if ($character -eq '{') {
            $depth++
            continue
        }
        if ($character -eq '}') {
            $depth--
            continue
        }
        if ($character -ne '"') { continue }

        $propertyEnd = Find-JsonStringEnd $Raw $index
        if ($depth -ne 1 -or $Raw.Substring($index + 1, $propertyEnd - $index - 1) -ne 'version') {
            $index = $propertyEnd
            continue
        }

        $cursor = Skip-JsonWhitespace $Raw ($propertyEnd + 1)
        if ($cursor -ge $Raw.Length -or $Raw[$cursor] -ne ':') {
            $index = $propertyEnd
            continue
        }
        $cursor = Skip-JsonWhitespace $Raw ($cursor + 1)
        if ($cursor -ge $Raw.Length -or $Raw[$cursor] -ne '"') {
            throw 'JSON 根级 version 字段必须是字符串。'
        }
        $valueEnd = Find-JsonStringEnd $Raw $cursor
        return $Raw.Substring(0, $cursor + 1) + $NewVersion + $Raw.Substring($valueEnd)
    }
    throw '未能精确定位 JSON 根级 version 字段，已停止写入。'
}

function Set-ReleaseVersion($Sources, [string]$NewVersion) {
    $cargoVersionPattern = '(?ms)(^\[workspace\.package\]\s*$.*?^\s*version\s*=\s*")[^"]*(")'
    $updatedPackage = Set-RootJsonVersion $Sources.Package.Raw $NewVersion
    $updatedTauri = Set-RootJsonVersion $Sources.Tauri.Raw $NewVersion
    if (-not [regex]::IsMatch($Sources.Cargo.Raw, $cargoVersionPattern)) {
        throw '未能精确定位 Cargo.toml 的 [workspace.package].version 字段，已停止写入。'
    }
    $updatedCargo = [regex]::Replace(
        $Sources.Cargo.Raw,
        $cargoVersionPattern,
        "`${1}$NewVersion`${2}",
        1
    )

    try {
        Set-Content -LiteralPath $Sources.Package.Path -Value $updatedPackage -NoNewline -Encoding utf8
        Set-Content -LiteralPath $Sources.Cargo.Path -Value $updatedCargo -NoNewline -Encoding utf8
        Set-Content -LiteralPath $Sources.Tauri.Path -Value $updatedTauri -NoNewline -Encoding utf8
        $verified = Get-VersionSources (Split-Path -Parent $Sources.Package.Path)
        if ($verified.Package.Version -ne $NewVersion -or $verified.Cargo.Version -ne $NewVersion -or $verified.Tauri.Version -ne $NewVersion) {
            throw '版本回读校验失败。'
        }
    }
    catch {
        foreach ($source in @($Sources.Package, $Sources.Cargo, $Sources.Tauri)) {
            try { Set-Content -LiteralPath $source.Path -Value $source.Raw -NoNewline -Encoding utf8 } catch { }
        }
        throw "版本写入失败，已尝试恢复三份原文件：$($_.Exception.Message)"
    }
}

function Get-ArtifactCandidates([string]$Root, [string]$Type) {
    if ($Type -eq 'portable') {
        $path = Join-Path $Root 'target/release/lingostack-app.exe'
        if (Test-Path -LiteralPath $path -PathType Leaf) { return @(Get-Item -LiteralPath $path) }
        return @()
    }
    $directory = Join-Path $Root 'target/release/bundle/nsis'
    if (Test-Path -LiteralPath $directory -PathType Container) { return @(Get-ChildItem -LiteralPath $directory -Filter '*.exe' -File) }
    return @()
}

function Get-ArtifactSnapshot([string]$Root, [string]$Type) {
    $snapshot = @{}
    foreach ($artifact in Get-ArtifactCandidates $Root $Type) {
        $snapshot[$artifact.FullName] = [pscustomobject]@{ LastWriteTimeUtc = $artifact.LastWriteTimeUtc; Length = $artifact.Length }
    }
    return $snapshot
}

function Get-UpdatedArtifacts([string]$Root, [string]$Type, [datetime]$BuildStartedAtUtc, $PreviousArtifacts) {
    return @(Get-ArtifactCandidates $Root $Type | Where-Object {
        $previous = $PreviousArtifacts[$_.FullName]
        $_.LastWriteTimeUtc -ge $BuildStartedAtUtc -and ($null -eq $previous -or $_.LastWriteTimeUtc -gt $previous.LastWriteTimeUtc -or $_.Length -ne $previous.Length)
    })
}

function Invoke-Main {
    try {
        $root = if ($ProjectRoot) { [System.IO.Path]::GetFullPath($ProjectRoot) } else { [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { return Fail "项目根目录不存在：$root" }
        $sources = Get-VersionSources $root
        $versions = @($sources.Package.Version, $sources.Cargo.Version, $sources.Tauri.Version)
        if (@($versions | Select-Object -Unique).Count -ne 1) {
            return Fail "三个版本来源不一致：package.json=$($sources.Package.Version)，Cargo.toml=$($sources.Cargo.Version)，tauri.conf.json=$($sources.Tauri.Version)。"
        }
        $currentVersion = $versions[0]
        Write-Host "当前版本：$currentVersion" -ForegroundColor Cyan

        if (-not $BuildType) {
            if ($NonInteractiveInvocation) { return Fail '非交互调用必须同时提供 -BuildType 和 -Version。' }
            Write-Host '请选择构建类型：'
            Write-Host '  1. 免安装版（portable）'
            Write-Host '  2. 安装版（NSIS installer）'
            $choice = Read-Host '输入 1 或 2'
            $BuildType = switch ($choice) { '1' { 'portable' } '2' { 'installer' } default { '' } }
        }
        if ($BuildType -notin @('portable', 'installer')) { return Fail '构建类型必须为 portable 或 installer。' }

        if (-not $Version) {
            if ($NonInteractiveInvocation) { return Fail '非交互调用必须同时提供 -BuildType 和 -Version。' }
            $Version = Read-Host "输入新版本号（留空使用当前版本 $currentVersion）"
        }
        if (-not $Version) { $Version = $currentVersion }
        if ($Version -notmatch $SemVerPattern) { return Fail "版本号不是合法 SemVer：$Version" }

        $buildArgs = if ($BuildType -eq 'portable') { @('tauri', 'build', '--no-bundle') } else { @('tauri', 'build', '--bundles', 'nsis') }
        if (-not $NoBuild -and -not (Get-Command pnpm -ErrorAction SilentlyContinue)) { return Fail '未找到 pnpm。请先安装 pnpm 并重新运行。' }
        Set-ReleaseVersion $sources $Version
        Write-Host "[完成] 版本已同步为 $Version" -ForegroundColor Green

        Write-Host "构建类型：$BuildType"
        Write-Host "实际命令：pnpm $($buildArgs -join ' ')"
        if ($NoBuild) {
            Write-Host '[跳过] -NoBuild 已启用；版本同步和命令规划已完成。' -ForegroundColor Yellow
            return 0
        }
        $logsDirectory = Join-Path $root 'target/release/logs'
        New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $logPath = Join-Path $logsDirectory "build-$Version-$timestamp.log"
        $artifactSnapshot = Get-ArtifactSnapshot $root $BuildType
        $buildStartedAtUtc = [datetime]::UtcNow
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        Write-Host "[构建开始] 完整日志：$logPath"
        Push-Location $root
        try {
            & pnpm @buildArgs 2>&1 | Tee-Object -FilePath $logPath | Out-Host
            $buildExitCode = $LASTEXITCODE
        }
        finally { Pop-Location }
        $stopwatch.Stop()

        if ($buildExitCode -ne 0) {
            Write-Host "[失败] 构建失败，退出码：$buildExitCode；耗时：$($stopwatch.Elapsed)；日志：$logPath" -ForegroundColor Red
            return [int]$buildExitCode
        }
        $artifacts = @(Get-UpdatedArtifacts $root $BuildType $buildStartedAtUtc $artifactSnapshot)
        if ($artifacts.Count -eq 0) {
            Write-Host "[失败] 构建退出码为 0，但未找到本次生成或更新的产物；耗时：$($stopwatch.Elapsed)；日志：$logPath" -ForegroundColor Red
            return 3
        }
        Write-Host "[成功] 构建完成；退出码：0；耗时：$($stopwatch.Elapsed)" -ForegroundColor Green
        Write-Host "日志：$logPath"
        foreach ($artifact in $artifacts) { Write-Host "产物：$($artifact.FullName)" }
        return 0
    }
    catch { return Fail $_.Exception.Message }
}

exit (Invoke-Main)
