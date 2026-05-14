# Instala git-smart-flow en Windows
# Uso: iwr https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/windows/install.ps1 | iex

$ErrorActionPreference = "Stop"
Write-Host "Installing git-smart-flow..." -ForegroundColor Cyan

if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install -g git-smart-flow
    Write-Host "✅ Installed via npm" -ForegroundColor Green
    Write-Host "Run 'git-smart-flow setup' to get started"
    exit 0
}

Write-Host "Node.js/npm not found. Downloading standalone binary..."
$latest = (Invoke-RestMethod "https://api.github.com/repos/YOUR_USERNAME/git-smart-flow/releases/latest").tag_name
$url = "https://github.com/YOUR_USERNAME/git-smart-flow/releases/download/$latest/GitSmartFlow-Windows.zip"
$dest = "$env:TEMP\gsf-windows.zip"
Invoke-WebRequest -Uri $url -OutFile $dest
Expand-Archive -Path $dest -DestinationPath "$env:TEMP\gsf-windows" -Force
$target = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item "$env:TEMP\gsf-windows\git-smart-flow.exe" -Destination "$target\git-smart-flow.exe" -Force
Remove-Item $dest, "$env:TEMP\gsf-windows" -Recurse -Force

if ($env:PATH -notlike "*$target*") {
    [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$target", "User")
    Write-Host "Added $target to PATH (restart terminal to take effect)"
}
Write-Host "✅ Installed standalone binary to $target\git-smart-flow.exe" -ForegroundColor Green
Write-Host "Run 'git-smart-flow setup' to get started"
