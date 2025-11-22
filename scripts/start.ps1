# Script de demarrage simplifie pour Windows
# Usage: .\scripts\start.ps1 [-SkipDbSetup]
#
# Options:
#   -SkipDbSetup : Skip le setup de la base de donnees (pour redemarrages rapides)

param(
    [switch]$SkipDbSetup = $false
)

$ErrorActionPreference = "Stop"

function Check-Prerequisite {
    param([string]$Command, [string]$Name)
    
    try {
        $null = Get-Command $Command -ErrorAction Stop
    } catch {
        Write-Host "Erreur: $Name n'est pas installe ou n'est pas dans le PATH" -ForegroundColor Red
        Write-Host "   Veuillez installer $Name avant de continuer" -ForegroundColor Yellow
        exit 1
    }
}

function Wait-ForService {
    param([string]$ServiceName, [int]$MaxWait = 30)
    
    Write-Host "Attente de $ServiceName..." -ForegroundColor Yellow
    $waited = 0
    while ($waited -lt $MaxWait) {
        try {
            if ($ServiceName -eq "PostgreSQL") {
                $containerStatus = docker ps --filter "name=kollab-postgres" --format "{{.Status}}" 2>&1
                if ($LASTEXITCODE -eq 0 -and $containerStatus) {
                    $result = docker exec kollab-postgres pg_isready -U kollab 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "$ServiceName est pret" -ForegroundColor Green
                        return $true
                    }
                }
            } elseif ($ServiceName -eq "Redis") {
                $containerStatus = docker ps --filter "name=kollab-redis" --format "{{.Status}}" 2>&1
                if ($LASTEXITCODE -eq 0 -and $containerStatus) {
                    $result = docker exec kollab-redis redis-cli ping 2>&1
                    if ($LASTEXITCODE -eq 0 -and $result -eq "PONG") {
                        Write-Host "$ServiceName est pret" -ForegroundColor Green
                        return $true
                    }
                }
            } elseif ($ServiceName -eq "MeiliSearch") {
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:7700/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                    if ($response.StatusCode -eq 200) {
                        Write-Host "$ServiceName est pret" -ForegroundColor Green
                        return $true
                    }
                } catch {
                    # Continue waiting
                }
            } elseif ($ServiceName -eq "API") {
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                    if ($response.StatusCode -eq 200) {
                        Write-Host "$ServiceName est pret" -ForegroundColor Green
                        return $true
                    }
                } catch {
                    # Continue waiting
                }
            } elseif ($ServiceName -eq "Garage") {
                try {
                    $containerStatus = docker ps --filter "name=kollab-garage" --format "{{.Status}}" 2>&1
                    if ($LASTEXITCODE -ne 0 -or -not $containerStatus) {
                        continue
                    }
                    
                    # Méthode 1: Vérification HTTP rapide
                    try {
                        $response = Invoke-WebRequest -Uri "http://localhost:3900/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                        if ($response.StatusCode -eq 403 -or $response.StatusCode -eq 200 -or $response.StatusCode -eq 404) {
                            Write-Host "$ServiceName est pret (HTTP accessible)" -ForegroundColor Green
                            return $true
                        }
                    } catch {
                        # HTTP pas encore accessible
                    }
                    
                    # Méthode 2: Healthcheck Docker
                    $healthStatus = docker inspect --format='{{.State.Health.Status}}' kollab-garage 2>&1
                    if ($LASTEXITCODE -eq 0 -and $healthStatus -eq "healthy") {
                        Write-Host "$ServiceName est pret (healthcheck: healthy)" -ForegroundColor Green
                        return $true
                    }
                } catch {
                    # Continue waiting - Garage prend du temps à démarrer
                }
            }
        } catch {
            # Continue waiting
        }
        Start-Sleep -Seconds 1
        $waited++
    }
    Write-Host "Timeout: $ServiceName n'est pas pret apres ${MaxWait}s" -ForegroundColor Red
    return $false
}

Write-Host "Demarrage de Kollab..." -ForegroundColor Cyan
Write-Host ""

# Verifier les prerequis
Write-Host "Verification des prerequis..." -ForegroundColor Yellow
Check-Prerequisite "docker" "Docker"
Check-Prerequisite "node" "Node.js"
Check-Prerequisite "npm" "npm"

# Verifier que Docker est en cours d'execution
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erreur: Docker n'est pas en cours d'execution" -ForegroundColor Red
    Write-Host "   Veuillez demarrer Docker Desktop" -ForegroundColor Yellow
    exit 1
}
Write-Host "Prerequis OK" -ForegroundColor Green
Write-Host ""

# Verifier que nous sommes a la racine du projet
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "Erreur: Le script doit etre execute depuis la racine du projet" -ForegroundColor Red
    Write-Host "   Repertoire actuel: $(Get-Location)" -ForegroundColor Yellow
    Write-Host "   Veuillez executer: cd P:\kollab (ou le chemin de votre projet)" -ForegroundColor Yellow
    exit 1
}

# Step 1: Demarrer Docker
Write-Host "Etape 1: Demarrage des services Docker..." -ForegroundColor Yellow

# Temporarily change error action to prevent PowerShell from treating docker-compose stderr as errors
$oldErrorAction = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"

try {
    # docker-compose writes informational messages to stderr, so we need to handle it properly
    $output = docker-compose up -d 2>&1
    $exitCode = $LASTEXITCODE
    
    # Restore error action
    $ErrorActionPreference = $oldErrorAction
    
    if ($exitCode -ne 0) {
        Write-Host "Erreur lors du demarrage de Docker" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        exit 1
    }
    Write-Host "Docker demarre" -ForegroundColor Green
} catch {
    # Restore error action
    $ErrorActionPreference = $oldErrorAction
    Write-Host "Erreur lors du demarrage de Docker" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 2: Attendre que les services Docker soient prêts
Write-Host "Attente des services Docker..." -ForegroundColor Yellow

# Vérifier quels services existent
$garageContainer = docker ps --filter "name=kollab-garage" --format "{{.Names}}" 2>&1
$hasGarage = $LASTEXITCODE -eq 0 -and $garageContainer

$redisContainer = docker ps --filter "name=kollab-redis" --format "{{.Names}}" 2>&1
$hasRedis = $LASTEXITCODE -eq 0 -and $redisContainer

$meiliContainer = docker ps --filter "name=kollab-meilisearch" --format "{{.Names}}" 2>&1
$hasMeili = $LASTEXITCODE -eq 0 -and $meiliContainer

# Démarrer les vérifications en parallèle
$postgresReady = $false
$redisReady = if ($hasRedis) { $false } else { $true }
$meiliReady = if ($hasMeili) { $false } else { $true }
$garageReady = if ($hasGarage) { $false } else { $true }
$maxWait = 45  # Augmenté de 30s à 45s pour Garage
$waited = 0

while ($waited -lt $maxWait -and (-not $postgresReady -or -not $redisReady -or -not $meiliReady -or -not $garageReady)) {
    # Vérifier PostgreSQL (obligatoire)
    if (-not $postgresReady) {
        try {
            $result = docker exec kollab-postgres pg_isready -U kollab 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "PostgreSQL est pret" -ForegroundColor Green
                $postgresReady = $true
            }
        } catch {
            # Continue waiting
        }
    }
    
    # Vérifier Redis (si présent)
    if ($hasRedis -and -not $redisReady) {
        try {
            $result = docker exec kollab-redis redis-cli ping 2>&1
            if ($LASTEXITCODE -eq 0 -and $result -eq "PONG") {
                Write-Host "Redis est pret" -ForegroundColor Green
                $redisReady = $true
            }
        } catch {
            # Continue waiting
        }
    }
    
    # Vérifier MeiliSearch (si présent)
    if ($hasMeili -and -not $meiliReady) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:7700/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "MeiliSearch est pret" -ForegroundColor Green
                $meiliReady = $true
            }
        } catch {
            # Continue waiting
        }
    }
    
    # Vérifier Garage (si présent)
    if ($hasGarage -and -not $garageReady) {
        try {
            # Méthode 1: Vérification HTTP rapide
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:3900/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ($response.StatusCode -eq 403 -or $response.StatusCode -eq 200 -or $response.StatusCode -eq 404) {
                    Write-Host "Garage est pret (HTTP accessible)" -ForegroundColor Green
                    $garageReady = $true
                }
            } catch {
                # Méthode 2: Healthcheck Docker
                $healthStatus = docker inspect --format='{{.State.Health.Status}}' kollab-garage 2>&1
                if ($LASTEXITCODE -eq 0 -and $healthStatus -eq "healthy") {
                    Write-Host "Garage est pret (healthcheck: healthy)" -ForegroundColor Green
                    $garageReady = $true
                }
            }
        } catch {
            # Continue waiting
        }
    }
    
    Start-Sleep -Seconds 1
    $waited++
}

# Vérifier les résultats
if (-not $postgresReady) {
    Write-Host "Erreur: PostgreSQL n'est pas pret apres ${maxWait}s" -ForegroundColor Red
    exit 1
}

if ($hasRedis -and -not $redisReady) {
    Write-Host "Avertissement: Redis n'est pas pret, mais on continue" -ForegroundColor Yellow
}

if ($hasMeili -and -not $meiliReady) {
    Write-Host "Avertissement: MeiliSearch n'est pas pret, mais on continue" -ForegroundColor Yellow
}

if ($hasGarage -and -not $garageReady) {
    Write-Host "Avertissement: Garage n'est pas pret apres ${maxWait}s, mais on continue" -ForegroundColor Yellow
    Write-Host "   Garage peut encore demarrer en arriere-plan" -ForegroundColor Yellow
}

Write-Host ""

# Step 3: Setup de la base de donnees
if ($SkipDbSetup) {
    Write-Host "Etape 3: Configuration de la base de donnees... [SKIP]" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "Etape 3: Configuration de la base de donnees..." -ForegroundColor Yellow
    $originalLocation = Get-Location
    try {
        Set-Location apps/api
        
        # Verifier que le fichier .env existe
        if (-not (Test-Path ".env")) {
            Write-Host "Avertissement: Fichier .env non trouve dans apps/api/" -ForegroundColor Yellow
            Write-Host "   Veuillez creer le fichier .env avec les variables requises" -ForegroundColor Yellow
            Write-Host "   Voir apps/api/ENV_VARIABLES.md pour plus d'informations" -ForegroundColor Yellow
        }
        
        $dbSetupResult = npm run db:setup 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Erreur lors du setup de la base de donnees" -ForegroundColor Red
            Write-Host $dbSetupResult -ForegroundColor Red
            Set-Location $originalLocation
            exit 1
        }
    } finally {
        Set-Location $originalLocation
    }
    Write-Host "Base de donnees configuree" -ForegroundColor Green
    Write-Host ""
}

# Step 4: Verifier et arreter les processus existants
Write-Host "Etape 4: Verification des ports..." -ForegroundColor Yellow
function Stop-ProcessOnPort {
    param([int]$Port, [string]$ServiceName)
    
    $stopped = $false
    
    # Methode 1: Utiliser Get-NetTCPConnection
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $pids) {
                try {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($process) {
                        $processName = $process.ProcessName.ToLower()
                        if ($processName -eq "node" -or $processName -eq "tsx" -or $processName -like "*node*") {
                            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                            Write-Host "  Processus arrete sur le port $Port ($ServiceName, PID: $pid, Process: $($process.ProcessName))" -ForegroundColor Yellow
                            $stopped = $true
                        }
                    }
                } catch {
                    # Process already stopped or doesn't exist
                }
            }
        }
    } catch {
        # Get-NetTCPConnection might not be available
    }
    
    # Methode 2: Utiliser netstat comme fallback
    if (-not $stopped) {
        try {
            $netstatOutput = netstat -ano | Select-String ":$Port\s"
            if ($netstatOutput) {
                $lines = $netstatOutput | ForEach-Object { $_.Line }
                foreach ($line in $lines) {
                    if ($line -match '\s+(\d+)\s*$') {
                        $pid = [int]$matches[1]
                        try {
                            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                            if ($process) {
                                $processName = $process.ProcessName.ToLower()
                                if ($processName -eq "node" -or $processName -eq "tsx" -or $processName -like "*node*") {
                                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                                    Write-Host "  Processus arrete sur le port $Port ($ServiceName, PID: $pid, Process: $($process.ProcessName))" -ForegroundColor Yellow
                                    $stopped = $true
                                }
                            }
                        } catch {
                            # Process already stopped or doesn't exist
                        }
                    }
                }
            }
        } catch {
            # netstat might not be available
        }
    }
    
    return $stopped
}

# Arreter les processus existants sur les ports Kollab
$portsStopped = 0
if (Stop-ProcessOnPort -Port 3000 -ServiceName "Web") { $portsStopped++ }
if (Stop-ProcessOnPort -Port 4000 -ServiceName "API") { $portsStopped++ }
if (Stop-ProcessOnPort -Port 3001 -ServiceName "WebSocket") { $portsStopped++ }

if ($portsStopped -eq 0) {
    Write-Host "  Aucun processus a arreter" -ForegroundColor Gray
} else {
    Write-Host "  $portsStopped processus arrete(s)" -ForegroundColor Green
}

# Attendre un peu pour que les ports soient liberes
Start-Sleep -Seconds 1

# Verifier une derniere fois que les ports sont libres
Write-Host "  Verification finale des ports..." -ForegroundColor Gray
$portsFree = $true
foreach ($port in @(3000, 4000, 3001)) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $pids) {
                try {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($process) {
                        $processName = $process.ProcessName.ToLower()
                        if ($processName -eq "node" -or $processName -eq "tsx" -or $processName -like "*node*") {
                            Write-Host "  ATTENTION: Le port $port est encore utilise par PID $pid ($($process.ProcessName))" -ForegroundColor Red
                            Write-Host "    Tentative d'arret force..." -ForegroundColor Yellow
                            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                            Start-Sleep -Seconds 1
                            $portsFree = $false
                        }
                    }
                } catch {
                    # Process already stopped
                }
            }
        }
    } catch {
        # Ignore errors
    }
}

if ($portsFree) {
    Write-Host "  Tous les ports sont libres" -ForegroundColor Green
} else {
    Write-Host "  Certains ports peuvent encore etre utilises" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Demarrer les serveurs
Write-Host "Etape 5: Demarrage des serveurs..." -ForegroundColor Yellow
Write-Host "   API: http://localhost:4000" -ForegroundColor Cyan
Write-Host "   Web: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""

# Demarrer l'API en arriere-plan avec Start-Process
Write-Host "Demarrage de l'API..." -ForegroundColor Yellow

# Utiliser cmd.exe pour lancer npm (plus fiable sur Windows)
# cmd.exe peut acceder au PATH de l'utilisateur meme si PowerShell ne le peut pas
$apiWorkingDir = "$originalLocation\apps\api"
$apiProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "cd /d `"$apiWorkingDir`" && npm run dev" `
    -WorkingDirectory $apiWorkingDir `
    -PassThru `
    -WindowStyle Normal

# Attendre que l'API soit pret
Start-Sleep -Seconds 2
if (-not (Wait-ForService "API" 60)) {
    Write-Host "Avertissement: L'API n'est pas pret apres 60 secondes" -ForegroundColor Yellow
    Write-Host "   Verifiez les logs dans le terminal ou les erreurs ci-dessus" -ForegroundColor Yellow
    Write-Host "   L'API pourrait toujours demarrer, mais il y a peut-etre un probleme" -ForegroundColor Yellow
} else {
    Write-Host "API demarree avec succes" -ForegroundColor Green
}

Write-Host ""
Write-Host "Demarrage du serveur web..." -ForegroundColor Yellow

# Afficher le résumé des services
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  KOLLAB - Tous les services sont demarres!   " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services Web:" -ForegroundColor Yellow
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "  API:      http://localhost:4000" -ForegroundColor Green
Write-Host "  Health:   http://localhost:4000/health" -ForegroundColor Green
Write-Host ""
Write-Host "Services Docker:" -ForegroundColor Yellow
Write-Host "  PostgreSQL:  localhost:5432" -ForegroundColor Green
if ($hasRedis) { Write-Host "  Redis:       localhost:6379" -ForegroundColor Green }
if ($hasMeili) { Write-Host "  MeiliSearch: http://localhost:7700" -ForegroundColor Green }
if ($hasGarage) { Write-Host "  Garage S3:   http://localhost:3900" -ForegroundColor Green }
Write-Host ""
Write-Host "Outils d'administration:" -ForegroundColor Yellow
Write-Host "  pgAdmin:     http://localhost:8080" -ForegroundColor Gray
Write-Host "  RedisInsight: http://localhost:8081" -ForegroundColor Gray
Write-Host ""
Write-Host "Appuyez sur Ctrl+C pour arreter tous les serveurs" -ForegroundColor Yellow
Write-Host ""

# Demarrer le web en premier plan (pour voir les logs)
Set-Location apps/web
try {
    npm run dev
} finally {
    # Nettoyer le processus API si on sort
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Write-Host ""
        Write-Host "Arret de l'API..." -ForegroundColor Yellow
        Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "API arretee" -ForegroundColor Green
    }
}

