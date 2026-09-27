$ErrorActionPreference = 'Stop'
$serviceExecutable = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\service\dist\Hero68RgbService.exe'))
Start-Process -FilePath $serviceExecutable -WindowStyle Hidden
Start-Sleep -Milliseconds 750
Invoke-RestMethod -Uri 'http://127.0.0.1:16868/status' | ConvertTo-Json
