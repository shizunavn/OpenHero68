$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distribution = Join-Path $workspace 'service\dist'
$releaseDirectory = Join-Path $workspace 'service\releases'
[System.IO.Directory]::CreateDirectory($releaseDirectory) | Out-Null
$archivePath = Join-Path $releaseDirectory 'OpenHero68-RGB-Windows-x64.zip'
$files = @('Hero68RgbService.exe', 'hid-bridge.exe', 'runtime.exe', 'service.cjs', 'NODE-LICENSE.txt', 'README.txt')
foreach ($name in $files) { if (!(Test-Path -LiteralPath (Join-Path $distribution $name))) { throw "Missing package file: $name" } }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($name in $files) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $distribution $name), ('OpenHero68-RGB\' + $name).Replace('\','/'), [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
$stream = [System.IO.File]::OpenRead($archivePath)
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
finally { $stream.Dispose(); $sha.Dispose() }
[System.IO.File]::WriteAllText((Join-Path $releaseDirectory 'SHA256SUMS.txt'), "$hash  OpenHero68-RGB-Windows-x64.zip`n")
Get-Item -LiteralPath $archivePath | Select-Object Name, Length
Write-Output "SHA256 $hash"
