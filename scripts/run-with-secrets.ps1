<#
.SYNOPSIS
  Runs `npm run migrate` or `npm run seed` against the preview or production
  MongoDB database, with the same fail-closed checks the API uses on Vercel.

.DESCRIPTION
  Secrets are typed in hidden prompts (Read-Host -AsSecureString), set only in
  this PowerShell process's environment, and removed again in a finally block,
  even after an error or Ctrl+C. No value is ever printed.

  VERCEL=1, VERCEL_ENV and NODE_ENV=production are set as on a Vercel
  deployment, so server/src/config.js refuses to run with a missing or short
  secret instead of falling back to a development value.

  This file contains no secrets and is committed.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-with-secrets.ps1 -Script migrate -Environment preview
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("migrate", "seed")]
  [string]$Script,

  [Parameter(Mandatory = $true)]
  [ValidateSet("preview", "production")]
  [string]$Environment
)

$ErrorActionPreference = "Stop"

# ValidateSet is case-insensitive; normalise so nothing below sees "Preview".
$Script = $Script.ToLowerInvariant()
$Environment = $Environment.ToLowerInvariant()

if ($Environment -eq "preview") {
  $dbName = "ecosetu_preview"
} elseif ($Environment -eq "production") {
  $dbName = "ecosetu"
} else {
  throw "Environment must be 'preview' or 'production'."
}

$label = $Environment.ToUpperInvariant()

# Prompted as hidden input. Everything server/src/config.js requires in
# production that is a secret.
$secretNames = @(
  "MONGODB_URI",
  "ECOSETU_JWT_SECRET",
  "ECOSETU_JWT_REFRESH_SECRET",
  "PHONE_HASH_SECRET",
  "BLOB_READ_WRITE_TOKEN"
)

# Not secret: set directly.
$plainVars = [ordered]@{
  MONGODB_DB_NAME             = $dbName
  ECOSETU_FIREBASE_PROJECT_ID = "ecosetu-a83c8"
  NODE_ENV                    = "production"
  VERCEL                      = "1"
  VERCEL_ENV                  = $Environment
}

$allNames = @($secretNames) + @($plainVars.Keys)

function Read-SecretValue([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $secure.Dispose()
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
$exitCode = 1
try {
  Write-Host ""
  Write-Host "About to run:  npm run $Script"
  Write-Host "Environment:   $label"
  Write-Host "Database:      $dbName" -ForegroundColor Yellow
  Write-Host ""
  $typed = Read-Host -Prompt "Type the database name ($dbName) to confirm"
  if ($typed -cne $dbName) {
    Write-Host "Not confirmed. Nothing was run." -ForegroundColor Red
    exit 1
  }

  foreach ($name in $plainVars.Keys) {
    Set-Item -Path "Env:$name" -Value $plainVars[$name]
  }

  foreach ($name in $secretNames) {
    $value = Read-SecretValue "$label $name"
    if ([string]::IsNullOrWhiteSpace($value)) {
      $value = $null
      Write-Host "$label $name is empty. Nothing was run." -ForegroundColor Red
      exit 1
    }
    Set-Item -Path "Env:$name" -Value $value.Trim()
    $value = $null
  }

  Write-Host ""
  Write-Host "Running npm run $Script against $dbName ($label)..."
  & npm run $Script
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    Write-Host "Done: npm run $Script finished for $dbName." -ForegroundColor Green
  } else {
    Write-Host "npm run $Script failed (exit code $exitCode)." -ForegroundColor Red
  }
} finally {
  foreach ($name in $allNames) {
    Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  }
  Pop-Location
  Write-Host "Cleared: $($allNames -join ', ')"
}

exit $exitCode
