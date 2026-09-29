param(
  [string]$OutputDirectory,
  [switch]$Trust,
  [switch]$Untrust,
  [switch]$UseWindowsCertificate
)

$ErrorActionPreference = 'Stop'
$workspaceDirectory = Split-Path -Parent $PSScriptRoot
$certificateDirectory = if ($OutputDirectory) { [System.IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $workspaceDirectory '.tempest-extension' }
$pfxPath = Join-Path $certificateDirectory 'localhost.pfx'
$cerPath = Join-Path $certificateDirectory 'localhost.cer'
$metadataPath = Join-Path $certificateDirectory 'certificate.json'
$mkcertVersion = '1.4.4'
$mkcertUrl = 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe'
$mkcertSha256 = 'D2660B50A9ED59EADA480750561C96ABC2ED4C9A38C6A24D93E30E0977631398'
$mkcertDirectory = Join-Path $certificateDirectory 'mkcert-tool'
$mkcertPath = Join-Path $mkcertDirectory "mkcert-v$mkcertVersion-windows-amd64.exe"
$mkcertCaDirectory = Join-Path $certificateDirectory 'mkcert-ca'
$mkcertP12Path = Join-Path $certificateDirectory 'localhost-mkcert.p12'
$friendlyName = 'Tempest Twitch Extension Local Test'
$passwordText = 'tempest-local-dev'
$password = ConvertTo-SecureString -String $passwordText -AsPlainText -Force

function Remove-TempestCertificates {
  foreach ($storePath in @('Cert:\CurrentUser\My', 'Cert:\CurrentUser\Root')) {
    Get-ChildItem -Path $storePath | Where-Object { $_.FriendlyName -eq $friendlyName -and $_.Subject -eq 'CN=localhost' } | Remove-Item -Force
  }
}

function Invoke-CheckedProcess {
  param([string]$FilePath, [string[]]$ArgumentList)
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "$([System.IO.Path]::GetFileName($FilePath)) failed with exit code $LASTEXITCODE." }
}

function Get-VerifiedMkcert {
  New-Item -ItemType Directory -Path $mkcertDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $mkcertPath) {
    $existingHash = (Get-FileHash -LiteralPath $mkcertPath -Algorithm SHA256).Hash
    if ($existingHash -eq $mkcertSha256) { return $mkcertPath }
    Remove-Item -LiteralPath $mkcertPath -Force
  }

  $downloadPath = "$mkcertPath.download"
  Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $mkcertUrl -OutFile $downloadPath -UseBasicParsing
    $downloadHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash
    if ($downloadHash -ne $mkcertSha256) {
      throw "The downloaded mkcert hash did not match the pinned official v$mkcertVersion Windows build."
    }
    Move-Item -LiteralPath $downloadPath -Destination $mkcertPath -Force
    return $mkcertPath
  } finally {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  }
}

function Write-CertificateMetadata {
  param(
    [string]$Provider,
    [string]$ProviderVersion,
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,
    [string[]]$Hosts,
    [bool]$Trusted
  )
  $metadata = [ordered]@{
    schemaVersion = 1
    provider = $Provider
    providerVersion = $ProviderVersion
    trusted = $Trusted
    hosts = $Hosts
    thumbprint = $Certificate.Thumbprint
    expiresAt = $Certificate.NotAfter.ToUniversalTime().ToString('o')
    createdAt = [DateTime]::UtcNow.ToString('o')
  }
  $metadataJson = $metadata | ConvertTo-Json
  [System.IO.File]::WriteAllText($metadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))
}

function Remove-MkcertTrust {
  if (Test-Path -LiteralPath $mkcertPath) {
    $hash = (Get-FileHash -LiteralPath $mkcertPath -Algorithm SHA256).Hash
    if ($hash -eq $mkcertSha256 -and (Test-Path -LiteralPath $mkcertCaDirectory)) {
      $previousCaRoot = $env:CAROOT
      try {
        $env:CAROOT = $mkcertCaDirectory
        & $mkcertPath -uninstall | Out-Host
      } finally {
        if ($null -eq $previousCaRoot) { Remove-Item Env:CAROOT -ErrorAction SilentlyContinue } else { $env:CAROOT = $previousCaRoot }
      }
    }
  }
}

function New-MkcertCertificate {
  $verifiedMkcert = Get-VerifiedMkcert
  New-Item -ItemType Directory -Path $mkcertCaDirectory -Force | Out-Null
  $previousCaRoot = $env:CAROOT
  try {
    $env:CAROOT = $mkcertCaDirectory
    if ($Trust) { Invoke-CheckedProcess -FilePath $verifiedMkcert -ArgumentList @('-install') }
    Invoke-CheckedProcess -FilePath $verifiedMkcert -ArgumentList @('-pkcs12', '-p12-file', $mkcertP12Path, 'localhost', '127.0.0.1', '::1')

    $collection = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
    $collection.Import($mkcertP12Path, 'changeit', [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
    $leaf = $collection | Where-Object { $_.HasPrivateKey -and $_.Subject -match 'CN=localhost' } | Select-Object -First 1
    if (-not $leaf) { throw 'mkcert did not produce a localhost certificate with an exportable private key.' }
    [System.IO.File]::WriteAllBytes($pfxPath, $collection.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $passwordText))
    Write-CertificateMetadata -Provider 'mkcert' -ProviderVersion $mkcertVersion -Certificate $leaf -Hosts @('localhost', '127.0.0.1', '::1') -Trusted ([bool]$Trust)
  } finally {
    Remove-Item -LiteralPath $mkcertP12Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $previousCaRoot) { Remove-Item Env:CAROOT -ErrorAction SilentlyContinue } else { $env:CAROOT = $previousCaRoot }
  }
}

function New-WindowsCertificate {
  Remove-TempestCertificates
  $certificate = New-SelfSignedCertificate -DnsName 'localhost' -Type SSLServerAuthentication -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName $friendlyName -NotAfter (Get-Date).AddYears(2) -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable
  Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password | Out-Null
  Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null
  if ($Trust) { Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null }
  Write-CertificateMetadata -Provider 'windows-native' -ProviderVersion ([Environment]::OSVersion.VersionString) -Certificate $certificate -Hosts @('localhost') -Trusted ([bool]$Trust)
}

if ($Untrust) {
  Remove-MkcertTrust
  Remove-TempestCertificates
  foreach ($file in @($pfxPath, $cerPath, $metadataPath, $mkcertP12Path)) {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
  foreach ($directory in @($mkcertCaDirectory, $mkcertDirectory)) {
    Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'Removed the Tempest localhost certificate, its trust entries, and the isolated local CA files.'
  exit 0
}

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
if ($UseWindowsCertificate) {
  New-WindowsCertificate
} else {
  try {
    New-MkcertCertificate
  } catch {
    Write-Warning "mkcert could not prepare the local certificate: $($_.Exception.Message)"
    Write-Warning 'Using Studio''s offline Windows certificate generator instead.'
    Remove-MkcertTrust
    New-WindowsCertificate
  }
}

if ($Trust) {
  Write-Host 'The localhost certificate is ready and trusted for the current Windows user.'
} else {
  Write-Host 'Certificate created but not trusted. Re-run with -Trust if the Twitch local test iframe rejects it.'
}
Write-Host "PFX: $pfxPath"
