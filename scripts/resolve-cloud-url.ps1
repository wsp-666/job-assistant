# Read cloud URL from scripts/deploy-cloud-url.txt or -CloudApiUrl parameter
param(
    [string]$Override = ""
)

$Root = Split-Path -Parent $PSScriptRoot
if ($Override) {
    return $Override.Trim().TrimEnd("/")
}

$urlFile = Join-Path $PSScriptRoot "deploy-cloud-url.txt"
if (Test-Path $urlFile) {
    foreach ($line in Get-Content $urlFile -Encoding UTF8) {
        $line = $line.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        return $line.TrimEnd("/")
    }
}

$prodEnv = Join-Path $Root "apps\web\.env.production"
if (Test-Path $prodEnv) {
    foreach ($line in Get-Content $prodEnv -Encoding UTF8) {
        if ($line -match '^\s*VITE_CLOUD_API_URL\s*=\s*(.+)\s*$') {
            $v = $Matches[1].Trim().Trim('"').Trim("'")
            if ($v -and $v -notmatch '你的') { return $v.TrimEnd("/") }
        }
    }
}

throw "Edit scripts\deploy-cloud-url.txt with your cloud URL, e.g. http://1.2.3.4"
