param(
    [string]$HostName = "192.168.100.143",
    [int]$AddinPort = 3000,
    [int]$ApiPort = 3443,
    [string]$AddinDir = "C:\OfficeAddins",
    [ValidateSet("Menu", "InstallCertificate", "CheckCertificate", "InstallWord", "InstallExcel", "InstallWordExcel", "InstallPpt", "Diagnose")]
    [string]$Action = "Menu",
    [ValidateSet("word", "excel", "ppt")]
    [string]$App = "word",
    [switch]$SkipCacheClear,
    [switch]$OpenOffice
)

$ErrorActionPreference = "Stop"

$script:AppConfigs = @{
    word = @{
        Key = "word"
        Label = "Word"
        ManifestFile = "manifest-word.xml"
        RegistryName = "CarboneWordManifest"
        ProcessName = "WINWORD"
        Executable = "winword.exe"
    }
    excel = @{
        Key = "excel"
        Label = "Excel"
        ManifestFile = "manifest-excel.xml"
        RegistryName = "CarboneExcelManifest"
        ProcessName = "EXCEL"
        Executable = "excel.exe"
    }
    ppt = @{
        Key = "ppt"
        Label = "PowerPoint"
        ManifestFile = "manifest-ppt.xml"
        RegistryName = "CarbonePptManifest"
        ProcessName = "POWERPNT"
        Executable = "powerpnt.exe"
    }
}

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-AppConfig {
    param([string]$Name)
    $config = $script:AppConfigs[$Name]
    if ($null -eq $config) {
        throw "Unsupported app: $Name"
    }
    return $config
}

function Ensure-AddinDirectory {
    if (!(Test-Path $AddinDir)) {
        New-Item -ItemType Directory -Path $AddinDir -Force | Out-Null
        Write-Ok "Created directory: $AddinDir"
    }
}

function Download-FileInsecure {
    param(
        [string]$Url,
        [string]$OutFile
    )
    $oldCallback = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $client = New-Object System.Net.WebClient
    try {
        $client.DownloadFile($Url, $OutFile)
    } finally {
        $client.Dispose()
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $oldCallback
    }
}

function Invoke-WebDownload {
    param(
        [string]$Url,
        [string]$OutFile
    )
    Download-FileInsecure -Url $Url -OutFile $OutFile
    if (!(Test-Path $OutFile)) {
        throw "Download failed: $Url"
    }
}

function Get-RemoteCertificate {
    param(
        [string]$TargetHost,
        [int]$TargetPort
    )
    $client = New-Object Net.Sockets.TcpClient
    try {
        $client.Connect($TargetHost, $TargetPort)
        $ssl = New-Object Net.Security.SslStream($client.GetStream(), $false, ({ $true }))
        try {
            $ssl.AuthenticateAsClient($TargetHost)
            return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
        } finally {
            $ssl.Dispose()
        }
    } finally {
        $client.Dispose()
    }
}

function Test-StrictHttps {
    param([string]$Url)
    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
        return $true
    } catch {
        return $false
    }
}

function Get-StoreMatch {
    param(
        [string]$Thumbprint,
        [string]$StorePath
    )
    $cert = Get-ChildItem -Path $StorePath -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq $Thumbprint }
    return $null -ne $cert
}

function Get-RegistryValue {
    param(
        [string]$Path,
        [string]$Name
    )
    try {
        return (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name
    } catch {
        $regPath = Convert-ToRegExePath -Path $Path
        try {
            $output = & reg.exe query $regPath /v $Name 2>$null
            if ($LASTEXITCODE -eq 0 -and $output) {
                $line = $output | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s+REG_\w+\s+" } | Select-Object -First 1
                if ($line) {
                    return (($line -split "REG_\w+\s+", 2)[1]).Trim()
                }
            }
        } catch {
        }
        return $null
    }
}

function Convert-ToRegExePath {
    param([string]$Path)
    if ($Path -like "HKCU:\*") {
        return $Path -replace "^HKCU:\\", "HKCU\"
    }
    if ($Path -like "HKLM:\*") {
        return $Path -replace "^HKLM:\\", "HKLM\"
    }
    return $Path
}

function Set-RegistryStringValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Value
    )
    New-Item -Path $Path -Force | Out-Null
    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType String -Force | Out-Null
    Set-ItemProperty -Path $Path -Name $Name -Value $Value -Force
    $regPath = Convert-ToRegExePath -Path $Path
    & reg.exe add $regPath /v $Name /t REG_SZ /d $Value /f | Out-Null
}

function Set-RegistryDefaultValue {
    param(
        [string]$Path,
        [string]$Value
    )
    New-Item -Path $Path -Force | Out-Null
    Set-ItemProperty -Path $Path -Name "(default)" -Value $Value -ErrorAction SilentlyContinue
    $regPath = Convert-ToRegExePath -Path $Path
    & reg.exe add $regPath /ve /t REG_SZ /d $Value /f | Out-Null
}

function Get-RegistryDefaultValue {
    param([string]$Path)
    $regPath = Convert-ToRegExePath -Path $Path
    try {
        $output = & reg.exe query $regPath /ve 2>$null
        if ($LASTEXITCODE -eq 0 -and $output) {
            $line = $output | Where-Object { $_ -match "^\s*\(Default\)\s+REG_\w+\s+" } | Select-Object -First 1
            if ($line) {
                return (($line -split "REG_\w+\s+", 2)[1]).Trim()
            }
        }
    } catch {
    }
    return $null
}

function Stop-OfficeProcesses {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
        if ($procs) {
            Write-Warn "Stopping process: $name"
            $procs | Stop-Process -Force
        }
    }
}

function Clear-DirectoryContents {
    param([string]$Path)
    if (Test-Path $Path) {
        Write-Warn "Clearing cache: $Path"
        Get-ChildItem -Path $Path -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Import-CertToStores {
    param([string]$FilePath)
    $stores = @("Cert:\CurrentUser\Root", "Cert:\CurrentUser\TrustedPeople")
    if (Test-IsAdministrator) {
        $stores += @("Cert:\LocalMachine\Root", "Cert:\LocalMachine\TrustedPeople")
    } else {
        Write-Warn "Current session is not elevated. Skipping LocalMachine certificate stores."
    }

    foreach ($store in $stores) {
        try {
            Import-Certificate -FilePath $FilePath -CertStoreLocation $store | Out-Null
            Write-Ok "Imported cert into $store"
        } catch {
            Write-Warn "Import to $store failed: $($_.Exception.Message)"
        }
    }
}

function Get-BaseUrl {
    return "https://$HostName`:$AddinPort"
}

function Get-CertUrl {
    return "$(Get-BaseUrl)/server.crt"
}

function Get-ApiHealthUrl {
    return "https://$HostName`:$ApiPort/health"
}

function Get-AppManifestUrl {
    param([hashtable]$AppConfig)
    return "$(Get-BaseUrl)/$($AppConfig.ManifestFile)"
}

function Get-AppManifestPath {
    param([hashtable]$AppConfig)
    return (Join-Path $AddinDir $AppConfig.ManifestFile)
}

function Get-CertPath {
    return (Join-Path $AddinDir "server.crt")
}

function Test-ManifestHost {
    param(
        [string]$Content,
        [string]$ExpectedHost
    )
    if (-not $Content) {
        return $false
    }
    return $Content.Contains("https://$ExpectedHost") -or $Content.Contains("://$ExpectedHost`:")
}

function Show-ManifestSourceLocations {
    param([string]$ManifestPath)
    try {
        $manifestXml = New-Object System.Xml.XmlDocument
        $manifestXml.Load($ManifestPath)
        $sourceLocationNodes = $manifestXml.SelectNodes("//*[local-name()='SourceLocation']")
        if ($sourceLocationNodes -and $sourceLocationNodes.Count -gt 0) {
            foreach ($node in $sourceLocationNodes) {
                $sourceLocation = $null
                if ($node -is [System.Xml.XmlElement]) {
                    $sourceLocation = $node.GetAttribute("DefaultValue")
                }
                if ($sourceLocation) {
                    Write-Info "Manifest SourceLocation: $sourceLocation"
                }
            }
        } else {
            Write-Warn "Manifest XML loaded, but no SourceLocation nodes were found"
        }
    } catch {
        Write-Warn "Manifest XML parse failed: $($_.Exception.Message)"
    }
}

function Get-ManifestId {
    param([string]$ManifestPath)
    try {
        $manifestXml = New-Object System.Xml.XmlDocument
        $manifestXml.Load($ManifestPath)
        $idNode = $manifestXml.SelectSingleNode("//*[local-name()='OfficeApp']/*[local-name()='Id']")
        if ($idNode -and -not [string]::IsNullOrWhiteSpace($idNode.InnerText)) {
            return $idNode.InnerText.Trim()
        }
    } catch {
        Write-Warn "Failed to read manifest Id: $($_.Exception.Message)"
    }
    return $null
}

function Install-Certificate {
    Ensure-AddinDirectory
    $certUrl = Get-CertUrl
    $certPath = Get-CertPath

    Write-Info "Downloading certificate: $certUrl"
    Invoke-WebDownload -Url $certUrl -OutFile $certPath
    Write-Ok "Downloaded certificate: $certPath"
    Import-CertToStores -FilePath $certPath
    return $certPath
}

function Show-CertificateStatus {
    Ensure-AddinDirectory
    $addinHealthUrl = "$(Get-BaseUrl)/health"
    $apiHealthUrl = Get-ApiHealthUrl
    $certUrl = Get-CertUrl
    $localCertPath = Get-CertPath

    Write-Info "Download cert: $certUrl"
    Invoke-WebDownload -Url $certUrl -OutFile $localCertPath
    $localCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($localCertPath)

    Write-Info "Read remote certificates (TLS handshake)"
    $addinRemoteCert = Get-RemoteCertificate -TargetHost $HostName -TargetPort $AddinPort
    $apiRemoteCert = Get-RemoteCertificate -TargetHost $HostName -TargetPort $ApiPort

    $localThumb = $localCert.Thumbprint
    $addinThumb = $addinRemoteCert.Thumbprint
    $apiThumb = $apiRemoteCert.Thumbprint

    Write-Host ""
    Write-Host "=== Certificate Thumbprints ===" -ForegroundColor Magenta
    Write-Host "Local server.crt : $localThumb"
    Write-Host "Addin:$AddinPort : $addinThumb"
    Write-Host "API:$ApiPort     : $apiThumb"

    if ($localThumb -eq $addinThumb) { Write-Ok "Local cert == Add-in cert" } else { Write-Fail "Local cert != Add-in cert" }
    if ($localThumb -eq $apiThumb) { Write-Ok "Local cert == API cert" } else { Write-Fail "Local cert != API cert" }
    if ($addinThumb -eq $apiThumb) { Write-Ok "Add-in cert == API cert" } else { Write-Warn "Add-in cert != API cert (should usually be same)" }

    Write-Host ""
    Write-Host "=== SAN Check ===" -ForegroundColor Magenta
    $san = $localCert.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.17" }
    if ($san) {
        $sanText = $san.Format($true)
        Write-Host $sanText
        if ($sanText -match [Regex]::Escape($HostName)) {
            Write-Ok "SAN contains host: $HostName"
        } else {
            Write-Fail "SAN does NOT contain host: $HostName"
        }
    } else {
        Write-Fail "No SAN extension found (OID 2.5.29.17)"
    }

    Write-Host ""
    Write-Host "=== Trust Store Check ===" -ForegroundColor Magenta
    $stores = @(
        "Cert:\CurrentUser\Root",
        "Cert:\CurrentUser\TrustedPeople",
        "Cert:\LocalMachine\Root",
        "Cert:\LocalMachine\TrustedPeople"
    )
    foreach ($store in $stores) {
        if (Get-StoreMatch -Thumbprint $localThumb -StorePath $store) {
            Write-Ok "$store has cert"
        } else {
            Write-Warn "$store missing cert"
        }
    }

    Write-Host ""
    Write-Host "=== Strict HTTPS Health Check ===" -ForegroundColor Magenta
    $addinStrict = Test-StrictHttps -Url $addinHealthUrl
    $apiStrict = Test-StrictHttps -Url $apiHealthUrl
    if ($addinStrict) { Write-Ok "$addinHealthUrl OK" } else { Write-Fail "$addinHealthUrl FAILED" }
    if ($apiStrict) { Write-Ok "$apiHealthUrl OK" } else { Write-Fail "$apiHealthUrl FAILED" }

    Write-Host ""
    Write-Host "=== Next Actions ===" -ForegroundColor Magenta
    Write-Host "1) If trust is missing, choose menu 1 to import the certificate."
    Write-Host "2) If strict HTTPS still fails, confirm HostName matches the certificate SAN."
    Write-Host "3) If certificate looks good, continue with menu 3/4/5, or use menu 6 to install Word + Excel together."
}

function Show-InstallSummary {
    param(
        [hashtable]$AppConfig,
        [string]$ManifestPath,
        [string]$CertPath,
        [string]$RegistryEntryName,
        [string]$RegistryValue,
        [string]$DevLocation,
        [string]$CompatRegistryValue,
        [string]$LegacyRegistryValue
    )
    Write-Host ""
    Write-Host "=== Install Summary ===" -ForegroundColor Magenta
    Write-Host "App                  : $($AppConfig.Label)"
    Write-Host "Manifest file        : $ManifestPath"
    Write-Host "Certificate file     : $CertPath"
    Write-Host "Registry value name  : $RegistryEntryName"
    Write-Host "Registry value path  : HKCU\SOFTWARE\Microsoft\Office\16.0\WEF\Developer"
    Write-Host "Registry manifest    : $RegistryValue"
    Write-Host "Compat key path      : HKCU\SOFTWARE\Microsoft\Office\16.0\WEF\Developer\$RegistryEntryName"
    Write-Host "Compat key default   : $CompatRegistryValue"
    Write-Host "Legacy alias name    : $($AppConfig.RegistryName)"
    Write-Host "Legacy alias value   : $LegacyRegistryValue"
    Write-Host "DevelopmentLocation  : $DevLocation"
    Write-Host ""
}

function Get-AppRegistrationSnapshot {
    param([string]$AppName)

    $appConfig = Get-AppConfig -Name $AppName
    $manifestPath = Get-AppManifestPath -AppConfig $appConfig
    $devPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\WEF\Developer"
    $wefPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\WEF"
    $manifestId = $null
    $manifestReg = $null
    $compatManifestReg = $null

    if (Test-Path $manifestPath) {
        $manifestId = Get-ManifestId -ManifestPath $manifestPath
        if ($manifestId) {
            $compatManifestPath = Join-Path $devPath $manifestId
            $manifestReg = Get-RegistryValue -Path $devPath -Name $manifestId
            $compatManifestReg = Get-RegistryDefaultValue -Path $compatManifestPath
        }
    }

    $legacyManifestReg = Get-RegistryValue -Path $devPath -Name $appConfig.RegistryName
    $devLocation = Get-RegistryValue -Path $wefPath -Name "DevelopmentLocation"
    $registeredById = $manifestId -and (($manifestReg -ieq $manifestPath) -or ($compatManifestReg -ieq $manifestPath))
    $registeredByLegacy = ($legacyManifestReg -ieq $manifestPath)

    return [PSCustomObject]@{
        AppName = $appName
        Label = $appConfig.Label
        ManifestFile = $appConfig.ManifestFile
        ManifestPath = $manifestPath
        ManifestId = $manifestId
        ManifestExists = Test-Path $manifestPath
        RegisteredById = [bool]$registeredById
        RegisteredByLegacy = [bool]$registeredByLegacy
        DevelopmentLocation = $devLocation
        DevelopmentLocationMatches = ($devLocation -ieq $AddinDir)
    }
}

function Show-BatchInstallSummary {
    param([object[]]$Snapshots)

    Write-Host ""
    Write-Host "=== Batch Install Summary ===" -ForegroundColor Magenta
    foreach ($snapshot in $Snapshots) {
        $status = if ($snapshot.RegisteredById) {
            "OK (GUID)"
        } elseif ($snapshot.RegisteredByLegacy) {
            "OK (legacy alias)"
        } else {
            "MISSING"
        }

        Write-Host "$($snapshot.Label):"
        Write-Host "  Manifest      : $($snapshot.ManifestPath)"
        Write-Host "  Manifest Id   : $($snapshot.ManifestId)"
        Write-Host "  Registration  : $status"
    }

    $allDevLocationOk = ($Snapshots | Where-Object { -not $_.DevelopmentLocationMatches }).Count -eq 0
    if ($allDevLocationOk -and $Snapshots.Count -gt 0) {
        Write-Ok "DevelopmentLocation points to $AddinDir"
    } else {
        Write-Warn "DevelopmentLocation is not aligned with $AddinDir"
    }
    Write-Host ""
}

function Install-OfficeAddin {
    param(
        [string]$AppName,
        [switch]$LaunchOffice,
        [switch]$SuppressExplorer,
        [switch]$SuppressNextActions,
        [string]$PreinstalledCertPath = ""
    )

    $appConfig = Get-AppConfig -Name $AppName
    $manifestUrl = Get-AppManifestUrl -AppConfig $appConfig
    $manifestPath = Get-AppManifestPath -AppConfig $appConfig
    if (-not [string]::IsNullOrWhiteSpace($PreinstalledCertPath) -and (Test-Path $PreinstalledCertPath)) {
        $certPath = $PreinstalledCertPath
        Write-Info "Reusing certificate: $certPath"
    } else {
        $certPath = Install-Certificate
    }
    $devPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\WEF\Developer"
    $wefPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\WEF"

    Write-Info "Installing $($appConfig.Label) add-in"
    Stop-OfficeProcesses -Names @("WINWORD", "EXCEL", "POWERPNT")

    Write-Info "Downloading manifest: $manifestUrl"
    Invoke-WebDownload -Url $manifestUrl -OutFile $manifestPath
    Write-Ok "Downloaded manifest: $manifestPath"

    $manifestContent = Get-Content -Path $manifestPath -Raw -ErrorAction SilentlyContinue
    if (Test-ManifestHost -Content $manifestContent -ExpectedHost $HostName) {
        Write-Ok "Manifest contains host: $HostName"
    } else {
        Write-Warn "Manifest does not contain expected host: $HostName"
    }
    Show-ManifestSourceLocations -ManifestPath $manifestPath

    $manifestId = Get-ManifestId -ManifestPath $manifestPath
    if ([string]::IsNullOrWhiteSpace($manifestId)) {
        throw "Manifest Id is missing. Cannot register add-in."
    }
    Write-Info "Manifest Id: $manifestId"
    $compatManifestPath = Join-Path $devPath $manifestId

    Set-RegistryStringValue -Path $devPath -Name $manifestId -Value $manifestPath
    Set-RegistryStringValue -Path $wefPath -Name "DevelopmentLocation" -Value $AddinDir
    Set-RegistryDefaultValue -Path $compatManifestPath -Value $manifestPath
    Set-RegistryStringValue -Path $devPath -Name $appConfig.RegistryName -Value $manifestPath

    $manifestReg = Get-RegistryValue -Path $devPath -Name $manifestId
    $devLocation = Get-RegistryValue -Path $wefPath -Name "DevelopmentLocation"
    $compatManifestReg = Get-RegistryDefaultValue -Path $compatManifestPath
    $legacyManifestReg = Get-RegistryValue -Path $devPath -Name $appConfig.RegistryName

    $registrationMatches = ($manifestReg -ieq $manifestPath) -or ($compatManifestReg -ieq $manifestPath)
    $legacyRegistrationMatches = ($legacyManifestReg -ieq $manifestPath)

    if ($registrationMatches) {
        Write-Ok "Registry verify: $manifestId OK"
    } elseif ($legacyRegistrationMatches) {
        Write-Warn "Registry verify: using legacy alias $($appConfig.RegistryName)"
    } else {
        Write-Fail "Registry verify: $manifestId mismatch"
    }
    if ($devLocation -ieq $AddinDir) {
        Write-Ok "Registry verify: DevelopmentLocation OK"
    } else {
        Write-Fail "Registry verify: DevelopmentLocation mismatch"
    }

    if (-not $SkipCacheClear) {
        $wefPaths = @(
            "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef",
            "$env:LOCALAPPDATA\Microsoft\Office\16.0\WebServiceCache"
        )
        foreach ($path in $wefPaths) {
            Clear-DirectoryContents -Path $path
        }
        Write-Ok "Office cache cleared"
    }

    Show-InstallSummary -AppConfig $appConfig -ManifestPath $manifestPath -CertPath $certPath -RegistryEntryName $manifestId -RegistryValue $manifestReg -DevLocation $devLocation -CompatRegistryValue $compatManifestReg -LegacyRegistryValue $legacyManifestReg

    if (-not $SuppressExplorer) {
        Write-Info "Opening add-in directory"
        Start-Process explorer.exe $AddinDir
    }

    if ($LaunchOffice) {
        Write-Info "Opening $($appConfig.Label)"
        Start-Process $appConfig.Executable
    }

    if (-not $SuppressNextActions) {
        Write-Host ""
        Write-Host "=== Next Actions ===" -ForegroundColor Magenta
        Write-Host "1) Confirm the sideload entry exists under HKCU\SOFTWARE\Microsoft\Office\16.0\WEF\Developer using manifest Id $manifestId"
        Write-Host "2) Open $($appConfig.Label) and check My Add-ins / Shared Folder."
        Write-Host "3) If the add-in still does not appear, choose menu 7 for deep diagnosis."
    }
}

function Install-WordExcelAddins {
    param([switch]$LaunchWord, [switch]$LaunchExcel)

    Write-Info "Installing Word + Excel add-ins in one pass"
    $sharedCertPath = Install-Certificate

    Install-OfficeAddin -AppName "word" -PreinstalledCertPath $sharedCertPath -SuppressExplorer -SuppressNextActions
    Install-OfficeAddin -AppName "excel" -PreinstalledCertPath $sharedCertPath -SuppressExplorer -SuppressNextActions

    $snapshots = @(
        Get-AppRegistrationSnapshot -AppName "word"
        Get-AppRegistrationSnapshot -AppName "excel"
    )
    Show-BatchInstallSummary -Snapshots $snapshots

    Write-Info "Opening add-in directory"
    Start-Process explorer.exe $AddinDir

    if ($LaunchWord) {
        $wordConfig = Get-AppConfig -Name "word"
        Write-Info "Opening $($wordConfig.Label)"
        Start-Process $wordConfig.Executable
    }

    if ($LaunchExcel) {
        $excelConfig = Get-AppConfig -Name "excel"
        Write-Info "Opening $($excelConfig.Label)"
        Start-Process $excelConfig.Executable
    }

    Write-Host ""
    Write-Host "=== Next Actions ===" -ForegroundColor Magenta
    Write-Host "1) Open Word and verify the Word add-in appears under My Add-ins / Shared Folder."
    Write-Host "2) Open Excel and verify the Excel add-in appears under My Add-ins / Shared Folder."
    Write-Host "3) If one side is still missing, use menu 7 and diagnose that host separately."
}

function Show-PolicyValues {
    param([string]$Path)
    if (Test-Path $Path) {
        Write-Warn "Policy key exists: $Path"
        $props = Get-ItemProperty -Path $Path
        $props.PSObject.Properties |
            Where-Object { $_.Name -notlike "PS*" } |
            ForEach-Object { Write-Host ("       {0} = {1}" -f $_.Name, $_.Value) }
    }
}

function Show-Diagnosis {
    param([string]$AppName)

    $appConfig = Get-AppConfig -Name $AppName
    $baseUrl = Get-BaseUrl
    $addinHealthUrl = "$baseUrl/health"
    $apiHealthUrl = Get-ApiHealthUrl
    $manifestPath = Get-AppManifestPath -AppConfig $appConfig
    $certPath = Get-CertPath
    $wefDir = "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef"
    $webCacheDir = "$env:LOCALAPPDATA\Microsoft\Office\16.0\WebServiceCache"
    $devPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\WEF\Developer"
    $wefPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\WEF"
    $devLocation = Get-RegistryValue -Path $wefPath -Name "DevelopmentLocation"
    $manifestId = $null
    $manifestReg = $null
    $compatManifestReg = $null
    if (Test-Path $manifestPath) {
        $manifestId = Get-ManifestId -ManifestPath $manifestPath
        if ($manifestId) {
            $compatManifestPath = Join-Path $devPath $manifestId
            $manifestReg = Get-RegistryValue -Path $devPath -Name $manifestId
            $compatManifestReg = Get-RegistryDefaultValue -Path $compatManifestPath
        }
    }
    $legacyManifestReg = Get-RegistryValue -Path $devPath -Name $appConfig.RegistryName

    Write-Host ""
    Write-Host "=== Basic Inputs ===" -ForegroundColor Magenta
    Write-Host "App           : $($appConfig.Label)"
    Write-Host "HostName      : $HostName"
    Write-Host "AddinPort     : $AddinPort"
    Write-Host "ApiPort       : $ApiPort"
    Write-Host "AddinDir      : $AddinDir"
    Write-Host "ManifestPath  : $manifestPath"
    Write-Host "ManifestId    : $manifestId"
    Write-Host "CertPath      : $certPath"

    Write-Host ""
    Write-Host "=== HTTPS Check ===" -ForegroundColor Magenta
    $addinStrict = Test-StrictHttps -Url $addinHealthUrl
    $apiStrict = Test-StrictHttps -Url $apiHealthUrl
    if ($addinStrict) { Write-Ok "$addinHealthUrl OK" } else { Write-Fail "$addinHealthUrl FAILED" }
    if ($apiStrict) { Write-Ok "$apiHealthUrl OK" } else { Write-Fail "$apiHealthUrl FAILED" }

    Write-Host ""
    Write-Host "=== File Check ===" -ForegroundColor Magenta
    if (Test-Path $manifestPath) { Write-Ok "Manifest exists: $manifestPath" } else { Write-Fail "Manifest missing: $manifestPath" }
    if (Test-Path $certPath) { Write-Ok "Cert exists: $certPath" } else { Write-Fail "Cert missing: $certPath" }

    if (Test-Path $manifestPath) {
        $manifestContent = Get-Content -Path $manifestPath -Raw -ErrorAction SilentlyContinue
        if (Test-ManifestHost -Content $manifestContent -ExpectedHost $HostName) {
            Write-Ok "Manifest contains host: $HostName"
        } else {
            Write-Warn "Manifest does not contain host: $HostName"
        }
    }

    Write-Host ""
    Write-Host "=== Registry Check ===" -ForegroundColor Magenta
    $registrationMatches = ($manifestReg -and ($manifestReg -ieq $manifestPath)) -or ($compatManifestReg -and ($compatManifestReg -ieq $manifestPath))
    $legacyRegistrationMatches = ($legacyManifestReg -and ($legacyManifestReg -ieq $manifestPath))

    if ($manifestId) {
        if ($manifestReg) { Write-Ok "Registry $manifestId = $manifestReg" } elseif ($legacyRegistrationMatches) { Write-Warn "Registry $manifestId missing, but legacy alias is active" } else { Write-Fail "Registry $manifestId missing" }
        if ($compatManifestReg) { Write-Ok "Registry $manifestId default = $compatManifestReg" } else { Write-Warn "Registry compat key default missing" }
    } else {
        Write-Fail "Manifest Id could not be determined"
    }
    if ($legacyManifestReg) {
        if ($legacyRegistrationMatches) {
            Write-Ok "Legacy alias $($appConfig.RegistryName) = $legacyManifestReg"
        } else {
            Write-Warn "Legacy alias $($appConfig.RegistryName) = $legacyManifestReg"
        }
    } else {
        Write-Info "Legacy alias $($appConfig.RegistryName) not present"
    }
    if ($devLocation) { Write-Ok "Registry DevelopmentLocation = $devLocation" } else { Write-Fail "Registry DevelopmentLocation missing" }
    if ($registrationMatches) {
        Write-Ok "Registry manifest path matches local file"
    } elseif ($legacyRegistrationMatches) {
        Write-Warn "Registry manifest path matches via legacy alias"
    } elseif ($manifestReg) {
        Write-Warn "Registry manifest path does not match expected file"
    } elseif ($compatManifestReg) {
        Write-Warn "Registry compat default does not match expected file"
    }
    if ($devLocation -and ($devLocation -ieq $AddinDir)) {
        Write-Ok "Registry development directory matches expected path"
    } elseif ($devLocation) {
        Write-Warn "Registry development directory does not match expected path"
    }

    Write-Host ""
    Write-Host "=== Certificate Store Check ===" -ForegroundColor Magenta
    if (Test-Path $certPath) {
        try {
            $localCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
            $thumb = $localCert.Thumbprint
            Write-Host "Thumbprint    : $thumb"
            $stores = @(
                "Cert:\CurrentUser\Root",
                "Cert:\CurrentUser\TrustedPeople",
                "Cert:\LocalMachine\Root",
                "Cert:\LocalMachine\TrustedPeople"
            )
            foreach ($store in $stores) {
                if (Get-StoreMatch -Thumbprint $thumb -StorePath $store) {
                    Write-Ok "$store has cert"
                } else {
                    Write-Warn "$store missing cert"
                }
            }
        } catch {
            Write-Fail "Failed to parse local cert: $certPath"
        }
    }

    Write-Host ""
    Write-Host "=== Runtime Check ===" -ForegroundColor Magenta
    $proc = Get-Process -Name $appConfig.ProcessName -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Warn "$($appConfig.ProcessName) is currently running. Restart Office after changes."
    } else {
        Write-Info "$($appConfig.ProcessName) is not running."
    }

    if (Test-Path $wefDir) {
        Write-Info "WEF dir: $wefDir"
        $wefItems = Get-ChildItem -Path $wefDir -Force -ErrorAction SilentlyContinue
        Write-Host "       item count = $($wefItems.Count)"
        if ($wefItems.Count -gt 0) {
            $wefItems | Select-Object -First 10 | ForEach-Object { Write-Host "       $($_.FullName)" }
        } else {
            Write-Warn "WEF directory is empty"
        }
    } else {
        Write-Warn "WEF directory does not exist"
    }

    if (Test-Path $webCacheDir) {
        $webCacheItems = Get-ChildItem -Path $webCacheDir -Force -ErrorAction SilentlyContinue
        Write-Info "WebServiceCache item count = $($webCacheItems.Count)"
    } else {
        Write-Warn "WebServiceCache directory does not exist"
    }

    Write-Host ""
    Write-Host "=== Policy Hints ===" -ForegroundColor Magenta
    Show-PolicyValues -Path "HKCU:\SOFTWARE\Policies\Microsoft\Office\16.0\WEF"
    Show-PolicyValues -Path "HKLM:\SOFTWARE\Policies\Microsoft\Office\16.0\WEF"
    Show-PolicyValues -Path "HKCU:\SOFTWARE\Policies\Microsoft\Office\16.0\Common\OfficeUpdate"
    Show-PolicyValues -Path "HKLM:\SOFTWARE\Policies\Microsoft\Office\16.0\Common\OfficeUpdate"

    Write-Host ""
    Write-Host "=== Conclusion ===" -ForegroundColor Magenta
    $registrationOk = (Test-Path $manifestPath) -and ($manifestReg -or $compatManifestReg -or $legacyManifestReg) -and $devLocation
    $certOk = $addinStrict -and $apiStrict
    $wefEmpty = $true
    if (Test-Path $wefDir) {
        $wefEmpty = ((Get-ChildItem -Path $wefDir -Force -ErrorAction SilentlyContinue).Count -eq 0)
    }

    if (-not $certOk) {
        Write-Fail "More likely: certificate/trust issue. Browser/Office will keep warning until 3000 and 3443 both pass strict HTTPS."
    } elseif (-not $registrationOk) {
        Write-Fail "More likely: registration/bootstrap issue. Manifest file or registry values are incomplete."
    } elseif ($legacyRegistrationMatches -and -not $registrationMatches) {
        Write-Warn "Add-in works through the legacy alias registration path. This is acceptable for now, but the GUID-based sideload entry was not observed."
    } elseif ($wefEmpty) {
        Write-Warn "More likely: the sideload entry has not been loaded yet, or the feature is blocked by policy/account state."
    } else {
        Write-Warn "Local registration looks mostly OK. If the add-in still shows nothing, policy/account restriction is the likely cause."
    }
}

function Read-YesNo {
    param(
        [string]$Prompt,
        [bool]$DefaultYes = $true
    )
    $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
    $answer = Read-Host "$Prompt $suffix"
    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $DefaultYes
    }
    return @("y", "yes", "1") -contains $answer.Trim().ToLowerInvariant()
}

function Read-AppChoice {
    Write-Host ""
    Write-Host "Choose target app:" -ForegroundColor Cyan
    Write-Host "1. Word"
    Write-Host "2. Excel"
    Write-Host "3. PowerPoint"
    $choice = Read-Host "Enter number"
    switch ($choice) {
        "1" { return "word" }
        "2" { return "excel" }
        "3" { return "ppt" }
        default {
            Write-Warn "Invalid choice. Defaulting to Word."
            return "word"
        }
    }
}

function Pause-ForMenu {
    Write-Host ""
    $null = Read-Host "Press Enter to continue"
}

function Show-Menu {
    while ($true) {
        Clear-Host
        Write-Host "================ Carbone Office Add-in Wizard ================" -ForegroundColor Magenta
        Write-Host "HostName   : $HostName"
        Write-Host "AddinPort  : $AddinPort"
        Write-Host "ApiPort    : $ApiPort"
        Write-Host "AddinDir   : $AddinDir"
        Write-Host ""
        Write-Host "1. Install certificate"
        Write-Host "2. Check certificate status"
        Write-Host "3. Install Word"
        Write-Host "4. Install Excel"
        Write-Host "5. Install PowerPoint"
        Write-Host "6. Install Word + Excel"
        Write-Host "7. Deep diagnosis"
        Write-Host "0. Exit"
        Write-Host ""

        $choice = Read-Host "Choose action"
        try {
            switch ($choice) {
                "1" {
                    Install-Certificate | Out-Null
                    Pause-ForMenu
                }
                "2" {
                    Show-CertificateStatus
                    Pause-ForMenu
                }
                "3" {
                    $open = Read-YesNo -Prompt "Open Word after install?" -DefaultYes $true
                    Install-OfficeAddin -AppName "word" -LaunchOffice:$open
                    Pause-ForMenu
                }
                "4" {
                    $open = Read-YesNo -Prompt "Open Excel after install?" -DefaultYes $true
                    Install-OfficeAddin -AppName "excel" -LaunchOffice:$open
                    Pause-ForMenu
                }
                "5" {
                    $open = Read-YesNo -Prompt "Open PowerPoint after install?" -DefaultYes $true
                    Install-OfficeAddin -AppName "ppt" -LaunchOffice:$open
                    Pause-ForMenu
                }
                "6" {
                    $openWord = Read-YesNo -Prompt "Open Word after install?" -DefaultYes $true
                    $openExcel = Read-YesNo -Prompt "Open Excel after install?" -DefaultYes $true
                    Install-WordExcelAddins -LaunchWord:$openWord -LaunchExcel:$openExcel
                    Pause-ForMenu
                }
                "7" {
                    $targetApp = Read-AppChoice
                    Show-Diagnosis -AppName $targetApp
                    Pause-ForMenu
                }
                "0" {
                    return
                }
                default {
                    Write-Warn "Invalid choice: $choice"
                    Pause-ForMenu
                }
            }
        } catch {
            Write-Fail $_.Exception.Message
            Pause-ForMenu
        }
    }
}

switch ($Action) {
    "Menu" {
        Show-Menu
    }
    "InstallCertificate" {
        Install-Certificate | Out-Null
    }
    "CheckCertificate" {
        Show-CertificateStatus
    }
    "InstallWord" {
        Install-OfficeAddin -AppName "word" -LaunchOffice:$OpenOffice
    }
    "InstallExcel" {
        Install-OfficeAddin -AppName "excel" -LaunchOffice:$OpenOffice
    }
    "InstallWordExcel" {
        Install-WordExcelAddins -LaunchWord:$OpenOffice -LaunchExcel:$OpenOffice
    }
    "InstallPpt" {
        Install-OfficeAddin -AppName "ppt" -LaunchOffice:$OpenOffice
    }
    "Diagnose" {
        Show-Diagnosis -AppName $App
    }
}
