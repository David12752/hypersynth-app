param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("run", "build")]
    [string]$Mode
)

$cargo = (Get-Command cargo -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
if (-not $cargo) {
    $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
    if (Test-Path $fallback) {
        $cargo = $fallback
    }
}

if (-not $cargo) {
    Write-Error "Cargo was not found. Install Rust or add cargo.exe to PATH."
    exit 1
}

function Set-OptionalEnvVar {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Candidates
    )

    if ([Environment]::GetEnvironmentVariable($Name)) {
        return
    }

    foreach ($candidate in $Candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
            Set-Item -Path "Env:$Name" -Value $candidate
            return
        }
    }
}

$projectRoot = Join-Path $PSScriptRoot ".."
$cargoTargetDir = "C:\hypersynth-target"
$asioCandidates = @(
    (Join-Path $projectRoot "third_party\asio_sdk"),
    (Join-Path $env:TEMP "asio_sdk"),
    (Join-Path $env:USERPROFILE "asio_sdk")
)
$llvmCandidates = @(
    "C:\Program Files\LLVM\bin",
    "C:\Program Files (x86)\LLVM\bin"
)

Set-OptionalEnvVar -Name "CPAL_ASIO_DIR" -Candidates $asioCandidates
Set-OptionalEnvVar -Name "LIBCLANG_PATH" -Candidates $llvmCandidates
if (-not $env:CARGO_TARGET_DIR) {
    Set-Item -Path "Env:CARGO_TARGET_DIR" -Value $cargoTargetDir
}
if (-not (Test-Path $env:CARGO_TARGET_DIR)) {
    New-Item -ItemType Directory -Force -Path $env:CARGO_TARGET_DIR | Out-Null
}

Push-Location (Join-Path $PSScriptRoot "..\hypersynth-engine")
try {
    if ($Mode -eq "run") {
        & $cargo run -p hypersynth-standalone
    } else {
        & $cargo build --release -p hypersynth-standalone
    }

    exit $LASTEXITCODE
} finally {
    Pop-Location
}