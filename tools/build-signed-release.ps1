[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$tenantId = 'f4276e67-236b-451e-b6a9-58f15b25ad64'
$subscriptionId = '1aa73664-b888-4080-92d0-00975865a185'
$projectRoot = Split-Path -Parent $PSScriptRoot

$documentsDirectory = [Environment]::GetFolderPath('MyDocuments')
$powerShellModuleRoot = Join-Path $documentsDirectory 'PowerShell\Modules'
if ((Test-Path -LiteralPath $powerShellModuleRoot) -and (($env:PSModulePath -split ';') -notcontains $powerShellModuleRoot)) {
  $env:PSModulePath = "$powerShellModuleRoot;$env:PSModulePath"
}
Import-Module Az.Accounts -ErrorAction Stop
$context = Get-AzContext
if (-not $context -or $context.Subscription.Id -ne $subscriptionId -or $context.Tenant.Id -ne $tenantId) {
  $null = Connect-AzAccount -Tenant $tenantId -Subscription $subscriptionId
}
$null = Get-AzAccessToken -ResourceUrl 'https://codesigning.azure.net' -ErrorAction Stop

Remove-Item Env:AZURE_CLIENT_ID, Env:AZURE_CLIENT_SECRET -ErrorAction SilentlyContinue
$env:WINDOWS_SIGNING_PUBLISHER = 'CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US'
$env:AZURE_TRUSTED_SIGNING_ENDPOINT = 'https://wus2.codesigning.azure.net/'
$env:AZURE_TRUSTED_SIGNING_ACCOUNT = 'Tempest'
$env:AZURE_TRUSTED_SIGNING_PROFILE = 'TempestSoftwarePublic'

$nodePath = @(
  (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
  (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
  (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $nodePath) { throw 'Node.js was not found.' }
$nodeDirectory = Split-Path -Parent $nodePath
if (($env:Path -split ';') -notcontains $nodeDirectory) { $env:Path = "$nodeDirectory;$env:Path" }

$dotnetPath = Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnetPath)) { throw 'The .NET SDK was not found.' }
$dotnetDirectory = Split-Path -Parent $dotnetPath
if (($env:Path -split ';') -notcontains $dotnetDirectory) { $env:Path = "$dotnetDirectory;$env:Path" }

$pnpm = @(
  (Get-Command pnpm.cmd, pnpm -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
  (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $pnpm) { throw 'pnpm was not found.' }

Push-Location $projectRoot
try {
  $buildExitCode = 1
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    & $pnpm package:win
    $buildExitCode = $LASTEXITCODE
    if ($buildExitCode -eq 0) { break }
    if ($attempt -lt 2) {
      Write-Warning "The signed release build failed with exit code $buildExitCode; retrying once for transient signing or timestamp failures."
      Start-Sleep -Seconds 5
    }
  }
  if ($buildExitCode -ne 0) { throw "The signed Tempest Streaming Studio release build failed with exit code $buildExitCode after two attempts." }
} finally {
  Pop-Location
}

Write-Host 'TEMPEST_STREAMING_STUDIO_SIGNED_RELEASE_OK'
