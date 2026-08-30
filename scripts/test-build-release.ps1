$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$scriptPath = Join-Path $repoRoot 'scripts/build-release.ps1'
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lingostack-build-release-test-" + [guid]::NewGuid())

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Assertion failed: $Message" }
}

function New-Fixture([string]$Version = '1.2.3', [string]$CargoVersion = $Version) {
    New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot 'src-tauri') | Out-Null
    $packageJson = @"
{
  "name": "fixture",
  "version": "$Version"
}

"@
    $cargoToml = @"
[workspace]
resolver = "2"

[workspace.package]
version = "$CargoVersion"
edition = "2021"
"@
    $tauriConfig = @"
{
  "productName": "Fixture",
  "version": "$Version"
}
"@
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'package.json') -NoNewline -Encoding utf8 -Value $packageJson
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'Cargo.toml') -NoNewline -Encoding utf8 -Value $cargoToml
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'src-tauri/tauri.conf.json') -NoNewline -Encoding utf8 -Value $tauriConfig
}

function Set-FakePnpm([int]$ResultCode) {
    $binDirectory = Join-Path $fixtureRoot 'fake-bin'
    New-Item -ItemType Directory -Force -Path $binDirectory | Out-Null
    Set-Content -LiteralPath (Join-Path $binDirectory 'pnpm.cmd') -NoNewline -Encoding ascii -Value "@echo off`r`necho fake pnpm output`r`nexit /b $ResultCode`r`n"
    return $binDirectory
}

function Invoke-Release([string[]]$Arguments) {
    $output = & pwsh -NoProfile -File $scriptPath -ProjectRoot $fixtureRoot @Arguments 2>&1
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output | Out-String) }
}

try {
    New-Fixture
    $portable = Invoke-Release @('-BuildType', 'portable', '-Version', '1.2.4', '-NoBuild')
    Assert-True ($portable.ExitCode -eq 0) "portable no-build should succeed: $($portable.Output)"
    Assert-True ($portable.Output -match 'pnpm tauri build --no-bundle') 'portable command plan should be shown'
    $package = (Get-Content -Raw (Join-Path $fixtureRoot 'package.json') | ConvertFrom-Json).version
    $cargo = ([regex]::Match((Get-Content -Raw (Join-Path $fixtureRoot 'Cargo.toml')), '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value)
    $tauri = (Get-Content -Raw (Join-Path $fixtureRoot 'src-tauri/tauri.conf.json') | ConvertFrom-Json).version
    Assert-True ($package -eq '1.2.4' -and $cargo -eq '1.2.4' -and $tauri -eq '1.2.4') 'all three versions should be synchronized'

    $installer = Invoke-Release @('-BuildType', 'installer', '-Version', '1.2.4', '-NoBuild')
    Assert-True ($installer.ExitCode -eq 0) "installer no-build should succeed: $($installer.Output)"
    Assert-True ($installer.Output -match 'pnpm tauri build --bundles nsis') 'installer command plan should be shown'

    # A nested field named version must never be modified in place of the root version.
    $packagePath = Join-Path $fixtureRoot 'package.json'
    Set-Content -LiteralPath $packagePath -NoNewline -Encoding utf8 -Value @"
{
  "metadata": { "version": "do-not-change" },
  "version": "1.2.4"
}
"@
    $nestedVersion = Invoke-Release @('-BuildType', 'portable', '-Version', '1.2.5', '-NoBuild')
    Assert-True ($nestedVersion.ExitCode -eq 0) "root version update should succeed: $($nestedVersion.Output)"
    $updatedPackageRaw = Get-Content -Raw $packagePath
    Assert-True ($updatedPackageRaw -match '"metadata": \{ "version": "do-not-change" \}') 'nested version field must remain unchanged'
    Assert-True (((ConvertFrom-Json $updatedPackageRaw).version) -eq '1.2.5') 'root package version should be updated'

    $prerelease = Invoke-Release @('-BuildType', 'portable', '-Version', '1.2.6-rc.1+build.7', '-NoBuild')
    Assert-True ($prerelease.ExitCode -eq 0) "valid prerelease SemVer should succeed: $($prerelease.Output)"

    $beforeInvalid = Get-Content -Raw (Join-Path $fixtureRoot 'package.json')
    $invalid = Invoke-Release @('-BuildType', 'portable', '-Version', '1.02.3', '-NoBuild')
    Assert-True ($invalid.ExitCode -ne 0) 'invalid SemVer should fail'
    Assert-True ((Get-Content -Raw (Join-Path $fixtureRoot 'package.json')) -eq $beforeInvalid) 'invalid SemVer must not modify files'

    $partialNonInteractive = Invoke-Release @('-BuildType', 'portable', '-NoBuild')
    Assert-True ($partialNonInteractive.ExitCode -ne 0) 'partial noninteractive arguments should fail instead of prompting'
    Assert-True ($partialNonInteractive.Output -notmatch '请选择构建类型|输入新版本号') 'noninteractive failure must not prompt'

    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    New-Fixture -Version '1.2.4' -CargoVersion '9.9.9'
    $mismatchBefore = Get-Content -Raw (Join-Path $fixtureRoot 'Cargo.toml')
    $mismatch = Invoke-Release @('-BuildType', 'portable', '-Version', '2.0.0', '-NoBuild')
    Assert-True ($mismatch.ExitCode -ne 0) 'mismatched source versions should fail'
    Assert-True ((Get-Content -Raw (Join-Path $fixtureRoot 'Cargo.toml')) -eq $mismatchBefore) 'mismatched versions must not modify files'

    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    New-Fixture
    $originalPath = $env:Path
    try {
        $fakeBin = Set-FakePnpm 0
        $env:Path = "$fakeBin;$originalPath"
        $staleArtifact = Join-Path $fixtureRoot 'target/release/lingostack-app.exe'
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $staleArtifact) | Out-Null
        Set-Content -LiteralPath $staleArtifact -NoNewline -Encoding ascii -Value 'old artifact'
        $stale = Invoke-Release @('-BuildType', 'portable', '-Version', '1.2.3')
        Assert-True ($stale.ExitCode -eq 3) "unchanged stale artifact must fail with exit 3: $($stale.Output)"
        Assert-True ($stale.Output -notmatch '\[成功\]') 'unchanged stale artifact must not be reported as success'

        $fakeBin = Set-FakePnpm 17
        $failedBuild = Invoke-Release @('-BuildType', 'portable', '-Version', '1.2.4')
        Assert-True ($failedBuild.ExitCode -eq 17) "external build exit code must be preserved: $($failedBuild.Output)"
        Assert-True (((Get-Content -Raw (Join-Path $fixtureRoot 'package.json') | ConvertFrom-Json).version) -eq '1.2.4') 'build failure must retain synchronized version'
    }
    finally {
        $env:Path = $originalPath
    }

    Write-Host 'PASS: build-release script regression tests' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
