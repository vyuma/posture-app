param([Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Run on a disposable CI desktop; never interrupt an installed user's measurement.
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run this smoke test in GitHub Actions.' }
$exe = (Resolve-Path $Executable).Path
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class CloseSmoke {
  private delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  public static IntPtr Find(uint pid, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => {
      uint owner; GetWindowThreadProcessId(h, out owner);
      var text = new StringBuilder(256); GetWindowText(h, text, text.Capacity);
      if (owner == pid && text.ToString() == title) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@

foreach ($overlayVisible in @($false, $true)) {
  $app = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
  $tracked = [System.Collections.Generic.HashSet[int]]::new()
  [void]$tracked.Add($app.Id)
  try {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
      $main = [CloseSmoke]::Find($app.Id, 'PiiiN')
      $overlay = [CloseSmoke]::Find($app.Id, 'character-overlay')
      if ($app.HasExited) { throw "App exited before close: $($app.ExitCode)" }
      if ($main -ne [IntPtr]::Zero -and $overlay -ne [IntPtr]::Zero) { break }
      Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($main -eq [IntPtr]::Zero -or $overlay -eq [IntPtr]::Zero) { throw 'Main and overlay windows must both exist before the test.' }
    if ($overlayVisible) { [void][CloseSmoke]::ShowWindow($overlay, 4) }
    # Wait for both real WebView2 instances to start, then track only this app's descendants.
    Start-Sleep -Seconds 3
    $processes = @(Get-CimInstance Win32_Process)
    do {
      $added = $false
      foreach ($proc in $processes) {
        if ($tracked.Contains([int]$proc.ParentProcessId)) {
          if ($tracked.Add([int]$proc.ProcessId)) { $added = $true }
        }
      }
    } while ($added)
    $webviews = @($processes | Where-Object { $tracked.Contains([int]$_.ProcessId) -and $_.Name -eq 'msedgewebview2.exe' })
    if ($webviews.Count -eq 0) { throw 'WebView2 did not start; this would not validate process cleanup.' }
    Write-Output "Closing main window with overlayVisible=$overlayVisible; tracked processes=$($tracked.Count), WebView2=$($webviews.Count)"
    # SC_CLOSE follows the title-bar X / Alt+F4 path, not a process kill.
    if (![CloseSmoke]::PostMessage($main, 0x0112, [IntPtr]0xF060, [IntPtr]::Zero)) { throw 'Could not send SC_CLOSE.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
      $remaining = @(Get-Process -Id @($tracked) -ErrorAction SilentlyContinue)
      if ($remaining.Count -eq 0) { break }
      Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($remaining.Count -gt 0) {
      throw "FAIL: processes survived main X: $(($remaining | ForEach-Object { "$($_.ProcessName):$($_.Id)" }) -join ', ')"
    }
    $app.WaitForExit()
    if ($app.ExitCode -ne 0) { throw "App exited with code $($app.ExitCode)" }
    Write-Output "PASS: X closed PiiiN, overlay and WebView2 (overlayVisible=$overlayVisible)."
  } finally {
    # Only clean up the CI-launched process tree after recording a failure.
    if (!$app.HasExited) { & taskkill.exe /PID $app.Id /T /F | Out-Null }
    foreach ($processId in $tracked) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
    $app.Dispose()
  }
}
