# Generate 1024x1024 app icon source (V0 placeholder: brand blue #2563eb + white glyph)
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/gen-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Brand blue #2563eb (section 12 accent color)
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
$g.FillRectangle($bg, 0, 0, $size, $size)

# White glyph U+8BD1 ("translate"); project name means "translation stack".
$glyph = ([char]0x8BD1).ToString()
$font = New-Object System.Drawing.Font('Microsoft YaHei', 560, [System.Drawing.FontStyle]::Bold)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$g.DrawString($glyph, $font, $white, $rect, $sf)

$out = Join-Path (Join-Path $PSScriptRoot '..') 'app-icon.png'
$out = [System.IO.Path]::GetFullPath($out)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "Generated: $out"
