param([Parameter(Mandatory)][string]$Package)
$ErrorActionPreference = 'Stop'
foreach ($name in @('MS_TENANT_ID','MS_CLIENT_ID','MS_CLIENT_SECRET')) {
  if (![Environment]::GetEnvironmentVariable($name)) { throw "Configure $name in the microsoft-store environment." }
}
$identity = Get-Content src-tauri/store-identity.json -Raw | ConvertFrom-Json
$token = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:MS_TENANT_ID/oauth2/token" -Body @{
  grant_type='client_credentials'; client_id=$env:MS_CLIENT_ID; client_secret=$env:MS_CLIENT_SECRET; resource='https://manage.devcenter.microsoft.com'
}
$headers = @{ Authorization="Bearer $($token.access_token)" }
$base = "https://manage.devcenter.microsoft.com/v1.0/my/applications/$($identity.storeId)"
$app = Invoke-RestMethod -Uri $base -Headers $headers
if (!$app.lastPublishedApplicationSubmission) { throw 'Complete the first Partner Center submission, age rating and API prerequisites before enabling automation.' }
$marker = "PiiiN automation $env:RELEASE_TAG"
if ($app.pendingApplicationSubmission) {
  $submission = Invoke-RestMethod -Uri "$base/submissions/$($app.pendingApplicationSubmission.id)" -Headers $headers
  if (!$submission.notesForCertification.StartsWith($marker)) { throw 'An unrelated submission is pending; it will not be overwritten.' }
  if ($submission.status -ne 'PendingCommit') { Write-Output "Submission $($submission.id) is already $($submission.status)."; exit 0 }
} else {
  $submission = Invoke-RestMethod -Method Post -Uri "$base/submissions" -Headers $headers
}
$upload = [uri]$submission.fileUploadUrl
if ($upload.Scheme -ne 'https' -or !$upload.Host.EndsWith('.blob.core.windows.net')) { throw 'Unexpected package upload host.' }
$name = Split-Path $Package -Leaf
$submission.applicationPackages = @($submission.applicationPackages | Where-Object { $_.fileName -ne $name })
foreach ($old in $submission.applicationPackages) { $old.fileStatus = 'PendingDelete' }
$submission.applicationPackages = @($submission.applicationPackages) + @{ fileName=$name; fileStatus='PendingUpload' }
$submission.targetPublishMode = 'Immediate'
$submission.notesForCertification = "$marker`nPiiiN: optional Google sign-in and consent-based posture habit analysis are in home profile > settings. All posture measurement remains usable without sign-in. No camera video or raw landmarks are uploaded. Privacy policy: https://www.piiin.app/privacy"
Invoke-RestMethod -Method Put -Uri "$base/submissions/$($submission.id)" -Headers $headers -ContentType 'application/json' -Body ($submission | ConvertTo-Json -Depth 100) | Out-Null
$zip = Join-Path $env:RUNNER_TEMP 'piiin-store-upload.zip'
Compress-Archive -Path $Package -DestinationPath $zip -Force
Invoke-WebRequest -Method Put -Uri $upload -Headers @{'x-ms-blob-type'='BlockBlob'} -InFile $zip -ContentType 'application/zip' | Out-Null
Invoke-RestMethod -Method Post -Uri "$base/submissions/$($submission.id)/commit" -Headers $headers | Out-Null
"Microsoft Store submission $($submission.id) committed; publication follows approval." | Add-Content $env:GITHUB_STEP_SUMMARY
