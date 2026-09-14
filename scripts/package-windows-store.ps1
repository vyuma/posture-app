param(
  [Parameter(Mandatory)][string]$IdentityName,
  [Parameter(Mandatory)][string]$Publisher,
  [Parameter(Mandatory)][string]$PublisherDisplayName,
  [Parameter(Mandatory)][string]$WebView2Directory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($IdentityName -notmatch '^[A-Za-z0-9.-]{3,50}$' -or !$Publisher.StartsWith('CN=')) {
  throw 'Use the exact Package/Identity/Name and Publisher assigned by Partner Center.'
}
$runtime = (Resolve-Path $WebView2Directory).Path
$runtimeExe = Join-Path $runtime 'msedgewebview2.exe'
if (!(Test-Path $runtimeExe)) { throw 'Select the extracted x64 Fixed Version WebView2 directory.' }
$signature = Get-AuthenticodeSignature $runtimeExe
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
  throw 'The WebView2 executable must have a valid Microsoft signature.'
}
$config = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$version = $config.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'MSIX Store releases require a stable numeric version.' }
$output = Join-Path (Get-Location) "release-artifacts/windows-$version"
if (Test-Path $output) { throw 'Release output already exists. Move the previous output before rebuilding.' }
$stage = Join-Path $output 'package'
New-Item -ItemType Directory -Path "$stage/Assets" -Force | Out-Null
$override = Join-Path $output 'tauri-store.json'
@{ bundle = @{ createUpdaterArtifacts = $false; windows = @{ webviewInstallMode = @{ type = 'fixedRuntime'; path = 'WebView2' } } } } |
  ConvertTo-Json -Depth 8 | Set-Content $override -Encoding utf8
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS = '-C target-feature=+crt-static'
bun run tauri build --target x86_64-pc-windows-msvc --no-bundle --config $override
if ($LASTEXITCODE -ne 0) { throw 'Tauri Windows build failed.' }
Copy-Item src-tauri/target/x86_64-pc-windows-msvc/release/posture-app.exe $stage
Copy-Item $runtime "$stage/WebView2" -Recurse
foreach ($logo in @('Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png')) {
  Copy-Item "src-tauri/icons/$logo" "$stage/Assets/$logo"
}
function EscapeXml([string]$value) { return [System.Security.SecurityElement]::Escape($value) }
$nameXml = EscapeXml $IdentityName
$publisherXml = EscapeXml $Publisher
$publisherDisplayXml = EscapeXml $PublisherDisplayName
@"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 rescap">
 <Identity Name="$nameXml" Publisher="$publisherXml" Version="$version.0" ProcessorArchitecture="x64" />
 <Properties><DisplayName>PiiiN</DisplayName><PublisherDisplayName>$publisherDisplayXml</PublisherDisplayName><Logo>Assets\StoreLogo.png</Logo></Properties>
 <Resources><Resource Language="ja-jp" /></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Applications><Application Id="PiiiN" Executable="posture-app.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
  <uap:VisualElements DisplayName="PiiiN" Description="良い姿勢を続けてピンアナゴを集めよう" BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" />
 </Application></Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
"@ | Set-Content "$stage/AppxManifest.xml" -Encoding utf8
$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/makeappx.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1
if (!$makeappx) { throw 'Install the Windows 10/11 SDK (MakeAppx.exe).' }
$package = Join-Path $output "PiiiN_${version}_x64.msix"
& $makeappx.FullName pack /d $stage /p $package /o
if ($LASTEXITCODE -ne 0) { throw 'MSIX manifest/package validation failed.' }
Get-FileHash $package -Algorithm SHA256 | Format-List | Out-File "$output/SHA256SUMS.txt"
Write-Output "Unsigned Store submission package ready: $package. Microsoft Store supplies the distribution signature."
