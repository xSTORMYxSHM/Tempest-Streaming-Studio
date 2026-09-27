param(
  [string]$Source = (Join-Path $PSScriptRoot "..\release-assets\source\tempest-streaming-logo-concept.png"),
  [string]$DiscoverySource = (Join-Path $PSScriptRoot "..\release-assets\source\discovery-background-source.png"),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\release-assets")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$resolvedSource = (Resolve-Path -LiteralPath $Source).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

function Export-ImageAsset {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Image]$Image,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($Image, 0, 0, $Width, $Height)
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$sourceImage = [System.Drawing.Image]::FromFile($resolvedSource)
try {
  Export-ImageAsset -Image $sourceImage -Width 100 -Height 100 -OutputPath (Join-Path $resolvedOutput "logo-100x100.png")
  Export-ImageAsset -Image $sourceImage -Width 24 -Height 24 -OutputPath (Join-Path $resolvedOutput "taskbar-icon-24x24.png")
}
finally {
  $sourceImage.Dispose()
}

$resolvedDiscoverySource = (Resolve-Path -LiteralPath $DiscoverySource).Path
$discoveryImage = [System.Drawing.Image]::FromFile($resolvedDiscoverySource)
try {
  Export-ImageAsset -Image $discoveryImage -Width 300 -Height 200 -OutputPath (Join-Path $resolvedOutput "discovery-300x200.png")
}
finally {
  $discoveryImage.Dispose()
}

Write-Output "Exported logo-100x100.png, taskbar-icon-24x24.png, and discovery-300x200.png to $resolvedOutput"
