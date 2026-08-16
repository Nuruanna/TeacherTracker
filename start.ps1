param(
    [int]$Port = 4173,
    [switch]$NoBrowser
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$siteRoot = Join-Path $projectRoot 'dist'
$entryPoint = Join-Path $siteRoot 'index.html'

if (-not (Test-Path -LiteralPath $entryPoint)) {
    Write-Host 'The production build is missing. Run npm install and npm run build first.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
}

try {
    $listener = $null
    $address = $null
    foreach ($candidatePort in $Port..($Port + 20)) {
        $candidate = [System.Net.HttpListener]::new()
        $candidateAddress = "http://localhost:$candidatePort/"
        $candidate.Prefixes.Add($candidateAddress)
        try {
            $candidate.Start()
            $listener = $candidate
            $address = $candidateAddress
            break
        }
        catch [System.Net.HttpListenerException] {
            $candidate.Close()
        }
    }

    if ($null -eq $listener) {
        throw "Could not find a free local port between $Port and $($Port + 20)."
    }

    Write-Host "Teacher Lesson Tracker is running at $address" -ForegroundColor Green
    Write-Host 'Press Ctrl+C to stop.'
    if (-not $NoBrowser) { Start-Process $address }

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
        $candidate = [IO.Path]::GetFullPath((Join-Path $siteRoot $relativePath))
        $resolvedRoot = [IO.Path]::GetFullPath($siteRoot) + [IO.Path]::DirectorySeparatorChar

        if (-not $candidate.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $candidate = $entryPoint
        }

        try {
            $bytes = [IO.File]::ReadAllBytes($candidate)
            $extension = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
            $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        finally {
            $context.Response.OutputStream.Close()
        }
    }
}
finally {
    if ($null -ne $listener) {
        if ($listener.IsListening) { $listener.Stop() }
        $listener.Close()
    }
}
