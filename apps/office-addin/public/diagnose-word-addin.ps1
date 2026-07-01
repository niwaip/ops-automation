param(
    [string]$HostName = "localhost",
    [int]$AddinPort = 3000,
    [int]$ApiPort = 3443,
    [string]$AddinDir = "C:\OfficeAddins"
)

$ErrorActionPreference = "Stop"
$wizardPath = Join-Path $PSScriptRoot "office-addin-wizard.ps1"

if (!(Test-Path $wizardPath)) {
    throw "Wizard script not found: $wizardPath"
}

Write-Warning "diagnose-word-addin.ps1 is deprecated. Forwarding to office-addin-wizard.ps1."
& $wizardPath -HostName $HostName -AddinPort $AddinPort -ApiPort $ApiPort -AddinDir $AddinDir -Action Diagnose -App word
