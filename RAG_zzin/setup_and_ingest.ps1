#requires -Version 5.0
[CmdletBinding()]
param (
    [string]$Python = "python",
    [string]$DataPath = "data"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
Set-Location $scriptDir

$venvPath = Join-Path $scriptDir ".venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Creating virtual environment at $venvPath"
    & $Python -m venv $venvPath
}

$venvPython = Join-Path $venvPath "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    throw "Failed to locate virtual environment interpreter at $venvPython"
}

Write-Host "Upgrading pip"
& $venvPython -m pip install --upgrade pip

$requirementsPath = Join-Path $scriptDir "requirements.txt"
if (-not (Test-Path $requirementsPath)) {
    throw "requirements.txt not found at $requirementsPath"
}

Write-Host "Installing dependencies from $requirementsPath"
& $venvPython -m pip install -r $requirementsPath

$dataFullPath = Join-Path $scriptDir $DataPath
if (-not (Test-Path $dataFullPath)) {
    throw "Data path not found: $dataFullPath"
}

Write-Host "Building vector index from $dataFullPath"
& $venvPython -m RAG.ingest --input $dataFullPath

Write-Host "Setup complete."
