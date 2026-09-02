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

    Write-Host 'PASS: release PowerShell native-command regression tests' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
