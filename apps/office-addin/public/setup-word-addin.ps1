param(
    [string]$HostName = "192.168.100.143",
    [int]$AddinPort = 3000,
    [string]$AddinDir = "C:\OfficeAddins",
    [switch]$SkipCacheClear,
    [switch]$ImportCert,
    [switch]$OpenWord,
    [string]$ManifestRegistryName = "CarboneWordManifest"
)

$ErrorActionPreference = "Stop"
$wizardPath = Join-Path $PSScriptRoot "office-addin-wizard.ps1"

if (!(Test-Path $wizardPath)) {
    throw "Wizard script not found: $wizardPath"
}

Write-Warning "setup-word-addin.ps1 is deprecated. Forwarding to office-addin-wizard.ps1."
if ($ImportCert) {
    Write-Warning "The unified wizard installs the certificate during add-in setup. -ImportCert is no longer required."
}
if ($ManifestRegistryName -ne "CarboneWordManifest") {
    Write-Warning "The unified wizard uses CarboneWordManifest. Custom ManifestRegistryName is ignored."
}

$wizardArgs = @{
    HostName = $HostName
    AddinPort = $AddinPort
    AddinDir = $AddinDir
    Action = "InstallWord"
}

if ($SkipCacheClear) {
    $wizardArgs["SkipCacheClear"] = $true
}
if ($OpenWord) {
    $wizardArgs["OpenOffice"] = $true
}

& $wizardPath @wizardArgs
