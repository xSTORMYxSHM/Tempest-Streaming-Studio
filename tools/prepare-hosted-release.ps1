[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$officialEbsOrigin = 'https://signal.tempestmainframe.com'
$previousEbsOrigin = [Environment]::GetEnvironmentVariable('TEMPEST_EXTENSION_EBS_URL', 'Process')
$previousMockMode = [Environment]::GetEnvironmentVariable('TEMPEST_EXTENSION_MOCK_MODE', 'Process')

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE."
    }
}

Push-Location $workspace
try {
    $env:TEMPEST_EXTENSION_EBS_URL = $officialEbsOrigin
    [Environment]::SetEnvironmentVariable('TEMPEST_EXTENSION_MOCK_MODE', $null, 'Process')

    Invoke-Checked pnpm ebs:build
    Invoke-Checked pnpm --filter '@tempest/twitch-ebs' test
    Invoke-Checked pnpm extension:build
    Invoke-Checked pnpm --filter '@tempest/twitch-extension' test

    $extensionVersion = node -p "require('./apps/twitch-extension/package.json').version"
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the Extension version.' }
    $releaseDirectory = Join-Path $workspace 'release'
    $extensionOutput = Join-Path $workspace 'apps/twitch-extension/dist'
    $archivePath = Join-Path $releaseDirectory "Tempest-Streaming-Extension-$extensionVersion-hosted.zip"
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -Path (Join-Path $extensionOutput '*') -DestinationPath $archivePath -CompressionLevel Optimal
    Invoke-Checked node tools/verify-hosted-release.mjs --archive $archivePath

    Write-Host "Hosted Extension bundle: $archivePath"
    Write-Host "Railway image source: $workspace\Dockerfile"
} finally {
    [Environment]::SetEnvironmentVariable('TEMPEST_EXTENSION_EBS_URL', $previousEbsOrigin, 'Process')
    [Environment]::SetEnvironmentVariable('TEMPEST_EXTENSION_MOCK_MODE', $previousMockMode, 'Process')
    Pop-Location
}
