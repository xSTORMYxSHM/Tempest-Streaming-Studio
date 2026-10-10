$ErrorActionPreference = "Stop"

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$package = Get-Content -Raw (Join-Path $appRoot "package.json") | ConvertFrom-Json
$distDirectory = Join-Path $appRoot "dist"
$releaseDirectory = Join-Path $appRoot "release-assets"
$archivePath = Join-Path $releaseDirectory "tempest-streaming-$($package.version).zip"

$requiredFiles = @(
  "config.html",
  "mobile.html",
  "panel.html",
  "runtime-config.json",
  "styles.css",
  "video_component.html",
  "video_overlay.html",
  "viewer.js"
)

foreach ($requiredFile in $requiredFiles) {
  $candidate = Join-Path $distDirectory $requiredFile
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Missing required hosted Extension asset: $requiredFile"
  }
}

[System.IO.Directory]::CreateDirectory($releaseDirectory) | Out-Null
Compress-Archive -Path (Join-Path $distDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal -Force

Write-Output "Created Twitch hosted-assets archive: $archivePath"
