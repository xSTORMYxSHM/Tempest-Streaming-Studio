param(
  [string]$OutputDirectory,
  [switch]$Trust,
  [switch]$Untrust
)

$ErrorActionPreference = 'Stop'
$workspaceDirectory = Split-Path -Parent $PSScriptRoot
$certificateDirectory = if ($OutputDirectory) { [System.IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $workspaceDirectory '.tempest-extension' }
$pfxPath = Join-Path $certificateDirectory 'localhost.pfx'
$cerPath = Join-Path $certificateDirectory 'localhost.cer'
$friendlyName = 'Tempest Twitch Extension Local Test'
$password = ConvertTo-SecureString -String 'tempest-local-dev' -AsPlainText -Force

function Remove-TempestCertificates {
  foreach ($storePath in @('Cert:\CurrentUser\My', 'Cert:\CurrentUser\Root')) {
    Get-ChildItem -Path $storePath | Where-Object { $_.FriendlyName -eq $friendlyName -and $_.Subject -eq 'CN=localhost' } | Remove-Item -Force
  }
}

if ($Untrust) {
  Remove-TempestCertificates
  Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $cerPath -Force -ErrorAction SilentlyContinue
  Write-Host 'Removed Tempest localhost certificates from the current user stores and deleted the generated certificate files.'
  exit 0
}

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
Remove-TempestCertificates
$certificate = New-SelfSignedCertificate -DnsName 'localhost' -Type SSLServerAuthentication -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName $friendlyName -NotAfter (Get-Date).AddYears(2) -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable
Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null

if ($Trust) {
  Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  Write-Host 'The localhost certificate was added to the current user trusted root store.'
} else {
  Write-Host 'Certificate created but not trusted. Re-run with -Trust if the Twitch local test iframe rejects it.'
}

Write-Host "PFX: $pfxPath"
