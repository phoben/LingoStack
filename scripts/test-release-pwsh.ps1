$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Assertion failed: $Message" }
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lingostack-release-pwsh-test-" + [guid]::NewGuid())

try {
    New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null

    $argumentChild = Join-Path $fixtureRoot 'arguments.ps1'
    Set-Content -LiteralPath $argumentChild -NoNewline -Encoding utf8 -Value @'
[Console]::Out.Write(($args -join "`n"))
'@
    $received = & pwsh -NoProfile -File $argumentChild -p lingostack-app --release
    if ($LASTEXITCODE -ne 0) { throw "pwsh failed with exit code $LASTEXITCODE" }
    Assert-True (($received -join "`n") -eq "-p`nlingostack-app`n--release") 'dash-prefixed native arguments must reach the child unchanged'

    $failingChild = Join-Path $fixtureRoot 'failing.ps1'
    Set-Content -LiteralPath $failingChild -NoNewline -Encoding utf8 -Value 'exit 23'
    $sentinel = Join-Path $fixtureRoot 'sentinel.txt'
    try {
        & pwsh -NoProfile -File $failingChild
        if ($LASTEXITCODE -ne 0) { throw "pwsh failed with exit code $LASTEXITCODE" }
        Set-Content -LiteralPath $sentinel -NoNewline -Encoding utf8 -Value 'must-not-run'
    }
    catch {
        # The release step stops here; assertions below prove the sentinel was not reached.
    }
    Assert-True (-not (Test-Path -LiteralPath $sentinel)) 'a failing native command must stop before the next release action'

    $notesChild = Join-Path $fixtureRoot 'notes.ps1'
    Set-Content -LiteralPath $notesChild -NoNewline -Encoding utf8 -Value "[Console]::Out.Write('release notes')"
    $notes = & pwsh -NoProfile -File $notesChild
    if ($LASTEXITCODE -ne 0) { throw "pwsh failed with exit code $LASTEXITCODE" }
    $notesOutput = Join-Path $fixtureRoot 'release-notes.md'
    Set-Content -LiteralPath $notesOutput -NoNewline -Encoding utf8 -Value $notes
    Assert-True ((Get-Content -Raw -LiteralPath $notesOutput) -eq 'release notes') 'captured native stdout must remain available for release notes'

    # This reproduces the former workflow pattern: interpolating a Windows path
    # into Python source turns `\a` into a bell character before COS is called.
    $windowsManifest = 'D:\a\_temp\latest.json'
    $inlinePython = "import json; print(json.dumps('D:\a' + r'\_temp\latest.json'))"
    $inlineManifest = & python -c $inlinePython
    if ($LASTEXITCODE -ne 0) { throw "python failed with exit code $LASTEXITCODE" }
    $corruptedInlinePath = ($inlineManifest -join "`n") | ConvertFrom-Json
    Assert-True ($corruptedInlinePath -ne $windowsManifest) 'interpolating a Windows manifest path into Python source must corrupt it'
    Assert-True ($corruptedInlinePath.Contains([char]7)) 'the former inline pattern must turn \\a into a bell character'

    # The stable publisher receives that same path as one argv value instead.
    $stablePublisher = & python scripts/publish-stable-manifest.py --dry-run --bucket fixture-bucket --region ap-shanghai --key lingostack/channels/stable/latest.json --manifest $windowsManifest
    if ($LASTEXITCODE -ne 0) { throw "python failed with exit code $LASTEXITCODE" }
    $stableArguments = ($stablePublisher -join "`n") | ConvertFrom-Json
    Assert-True ($stableArguments.manifest -eq $windowsManifest) 'stable publisher must receive the untouched Windows manifest path through argv'
    Assert-True ($stableArguments.key -eq 'lingostack/channels/stable/latest.json') 'stable publisher must receive the target key through argv'

    $missingManifestOutput = & python scripts/publish-stable-manifest.py --bucket fixture-bucket --region ap-shanghai --key lingostack/channels/stable/latest.json --manifest $windowsManifest 2>&1
    Assert-True ($LASTEXITCODE -ne 0) 'a missing stable manifest must be rejected before publishing'
    Assert-True (($missingManifestOutput -join "`n") -match '--manifest must name an existing file') 'missing manifest errors must fail locally before reading production credentials'

    Write-Host 'PASS: release PowerShell native-command regression tests' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
