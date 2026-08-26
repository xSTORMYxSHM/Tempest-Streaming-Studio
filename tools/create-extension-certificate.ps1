param(
  [string]$OutputDirectory,
  [switch]$Trust
)

$ErrorActionPreference = 'Stop'
$workspaceDirectory = Split-Path -Parent $PSScriptRoot
$certificateDirectory = if ($OutputDirectory) { [System.IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $workspaceDirectory '.tempest-extension' }
$pfxPath = Join-Path $certificateDirectory 'localhost.pfx'
$cerPath = Join-Path $certificateDirectory 'localhost.cer'
$password = ConvertTo-SecureString -String 'tempest-local-dev' -AsPlainText -Force

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
$certificate = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'Tempest Twitch Extension Local Test' -NotAfter (Get-Date).AddYears(2) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable
Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null

if ($Trust) {
  Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  Write-Host 'The localhost certificate was added to the current user trusted root store.'
} else {
  Write-Host 'Certificate created but not trusted. Re-run with -Trust if the Twitch local test iframe rejects it.'
}

Write-Host "PFX: $pfxPath"
