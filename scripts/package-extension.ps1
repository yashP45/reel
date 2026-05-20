# Build and zip the Chrome extension for submission
Set-Location "$PSScriptRoot\..\extension"
npm run build
npm run zip
Write-Host "Extension zip created in extension\.output\"
Get-ChildItem extension\.output -Filter *.zip -Recurse | Select-Object FullName
