param(
    [string]$HostName = "localhost",
    [int]$AddinPort = 3000,
    [int]$ApiPort = 3443,
    [string]$OutputDir = "$env:TEMP\ops-addin-cert-check",
    [switch]$ImportCert
)

$ErrorActionPreference = "Stop"
$wizardPath = Join-Path $PSScriptRoot "office-addin-wizard.ps1"

if (!(Test-Path $wizardPath)) {
    throw "Wizard script not found: $wizardPath"
}

Write-Warning "check-addin-cert.ps1 is deprecated. Forwarding to office-addin-wizard.ps1."

if ($ImportCert) {
    & $wizardPath -HostName $HostName -AddinPort $AddinPort -ApiPort $ApiPort -AddinDir $OutputDir -Action InstallCertificate
}

& $wizardPath -HostName $HostName -AddinPort $AddinPort -ApiPort $ApiPort -AddinDir $OutputDir -Action CheckCertificate
