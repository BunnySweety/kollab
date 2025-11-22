# Kollab Startup Verification Script for Windows PowerShell
# Usage: .\scripts\verify-startup.ps1

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Kollab - Startup Verification" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

function Test-Command {
    param($Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-Port {
    param($Port, $Name)
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -ErrorAction Stop
        if ($connection.TcpTestSucceeded) {
            Write-Host "+ Port $Port is accessible ($Name)" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "X Port $Port is not accessible ($Name)" -ForegroundColor Red
        return $false
    }
}

function Test-Url {
    param($Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "+ $Url responds correctly" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "X $Url does not respond" -ForegroundColor Red
        return $false
    }
}

# 1. Check Prerequisites
Write-Host "1. Checking Prerequisites..." -ForegroundColor Yellow
Write-Host "-----------------------------"

if (Test-Command "node") {
    Write-Host "+ Node.js is installed" -ForegroundColor Green
    $nodeVersion = node --version
    Write-Host "   Version: $nodeVersion"
} else {
    Write-Host "X Node.js is not installed" -ForegroundColor Red
    exit 1
}

if (Test-Command "npm") {
    Write-Host "+ npm is installed" -ForegroundColor Green
    $npmVersion = npm --version
    Write-Host "   Version: $npmVersion"
} else {
    Write-Host "X npm is not installed" -ForegroundColor Red
    exit 1
}

if (Test-Command "docker") {
    Write-Host "+ Docker is installed" -ForegroundColor Green
} else {
    Write-Host "X Docker is not installed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Check Docker
Write-Host "2. Checking Docker..." -ForegroundColor Yellow
Write-Host "---------------------"

try {
    docker ps | Out-Null
    Write-Host "+ Docker is running" -ForegroundColor Green
    
    $dockerPs = docker ps
    
    if ($dockerPs -match "kollab-postgres") {
        Write-Host "+ PostgreSQL container is running" -ForegroundColor Green
    } else {
        Write-Host "! PostgreSQL container is not running" -ForegroundColor Yellow
        Write-Host "   Start with: docker-compose up -d postgres"
    }
    
    if ($dockerPs -match "kollab-redis") {
        Write-Host "+ Redis container is running" -ForegroundColor Green
    } else {
        Write-Host "! Redis container is not running" -ForegroundColor Yellow
        Write-Host "   Start with: docker-compose up -d redis"
    }
} catch {
    Write-Host "X Docker is not running" -ForegroundColor Red
    Write-Host "   Start Docker Desktop and try again"
    exit 1
}

Write-Host ""

# 3. Check Ports
Write-Host "3. Checking Ports..." -ForegroundColor Yellow
Write-Host "--------------------"

$postgresOk = Test-Port -Port 5432 -Name "PostgreSQL"
if (-not $postgresOk) {
    Write-Host "   Start with: docker-compose up -d postgres"
}

$redisOk = Test-Port -Port 6379 -Name "Redis"
if (-not $redisOk) {
    Write-Host "   Start with: docker-compose up -d redis"
}

$apiRunning = Test-Port -Port 4000 -Name "API"
if (-not $apiRunning) {
    Write-Host '   Start with: cd apps/api ; npm run dev'
}

$webRunning = Test-Port -Port 3000 -Name "Web"
if (-not $webRunning) {
    Write-Host '   Start with: cd apps/web ; npm run dev'
}

Write-Host ""

# 4. Check HTTP Services
Write-Host "4. Checking HTTP Services..." -ForegroundColor Yellow
Write-Host "-----------------------------"

if ($apiRunning) {
    Test-Url -Url "http://localhost:4000/health" | Out-Null
} else {
    Write-Host "! API is not running, cannot test" -ForegroundColor Yellow
}

if ($webRunning) {
    Test-Url -Url "http://localhost:3000" | Out-Null
} else {
    Write-Host "! Web is not running, cannot test" -ForegroundColor Yellow
}

Write-Host ""

# 5. Summary
Write-Host "5. Verification Summary" -ForegroundColor Yellow
Write-Host "-----------------------"

$allOk = $true

if (-not $postgresOk) {
    Write-Host "X PostgreSQL is not accessible" -ForegroundColor Red
    $allOk = $false
} else {
    Write-Host "+ PostgreSQL is ready" -ForegroundColor Green
}

if (-not $redisOk) {
    Write-Host "X Redis is not accessible" -ForegroundColor Red
    $allOk = $false
} else {
    Write-Host "+ Redis is ready" -ForegroundColor Green
}

if (-not $apiRunning) {
    Write-Host "! API is not running" -ForegroundColor Yellow
    $allOk = $false
} else {
    Write-Host "+ API is running" -ForegroundColor Green
}

if (-not $webRunning) {
    Write-Host "! Web is not running" -ForegroundColor Yellow
    $allOk = $false
} else {
    Write-Host "+ Web is running" -ForegroundColor Green
}

Write-Host ""

if ($allOk) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "+ All services are operational" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Application accessible at:"
    Write-Host "  - Web: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  - API: http://localhost:4000" -ForegroundColor Cyan
    Write-Host "  - API Health: http://localhost:4000/health" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Demo credentials:"
    Write-Host "  - Email: demo@kollab.app" -ForegroundColor Cyan
    Write-Host "  - Password: Demo123456!" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "! Some services are not ready" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To start the complete application:"
    Write-Host "  Option 1 (Recommended): .\scripts\start.ps1"
    Write-Host "  Option 2: npm start"
    Write-Host "  Option 3 (Manual):"
    Write-Host "    1. docker-compose up -d"
    Write-Host "    2. In terminal 1: cd apps/api ; npm run dev"
    Write-Host "    3. In terminal 2: cd apps/web ; npm run dev"
    Write-Host ""
}

exit 0
