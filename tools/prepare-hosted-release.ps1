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
    Invoke-Checked pnpm extensions:package
    Invoke-Checked pnpm --filter '@tempest/twitch-extension' test
    Invoke-Checked pnpm --filter '@tempest/twitch-streaming-extension' test
    Invoke-Checked pnpm hosted:verify

    Write-Host "Mainframe hosted bundle: $workspace\apps\twitch-extension\release-assets\tempest-mainframe-0.2.0.zip"
    Write-Host "Streaming hosted bundle: $workspace\apps\twitch-bits-extension\release-assets\tempest-streaming-0.1.0.zip"
    Write-Host "Railway image source: $workspace\Dockerfile"
} finally {
    [Environment]::SetEnvironmentVariable('TEMPEST_EXTENSION_EBS_URL', $previousEbsOrigin, 'Process')
    [Environment]::SetEnvironmentVariable('TEMPEST_EXTENSION_MOCK_MODE', $previousMockMode, 'Process')
    Pop-Location
}
