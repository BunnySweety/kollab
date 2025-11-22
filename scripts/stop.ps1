# Script d'arret simplifie pour Windows
# Usage: .\scripts\stop.ps1

$ErrorActionPreference = "Stop"

Write-Host "Arret de Kollab..." -ForegroundColor Cyan
Write-Host ""

# Verifier que nous sommes a la racine du projet
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "Avertissement: Le script devrait etre execute depuis la racine du projet" -ForegroundColor Yellow
    Write-Host "   Repertoire actuel: $(Get-Location)" -ForegroundColor Yellow
    Write-Host "   Continuation de l'arret des processus..." -ForegroundColor Yellow
    Write-Host ""
}

# Step 1: Arreter les processus Node.js sur les ports Kollab
Write-Host "Etape 1: Arret des processus Node.js Kollab..." -ForegroundColor Yellow

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
                        # Vérifier si c'est un processus Node.js (node, tsx, etc.)
                        if ($processName -eq "node" -or $processName -eq "tsx" -or $processName -like "*node*") {
                            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                            Write-Host "  Processus arrete sur le port $Port ($ServiceName, PID: $pid, Process: $($process.ProcessName))" -ForegroundColor Green
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
                                    Write-Host "  Processus arrete sur le port $Port ($ServiceName, PID: $pid, Process: $($process.ProcessName))" -ForegroundColor Green
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

$portsStopped = 0

# Arreter les processus sur les ports Kollab
if (Stop-ProcessOnPort -Port 3000 -ServiceName "Web") { $portsStopped++ }
if (Stop-ProcessOnPort -Port 4000 -ServiceName "API") { $portsStopped++ }
if (Stop-ProcessOnPort -Port 3001 -ServiceName "WebSocket") { $portsStopped++ }

# Attendre un peu pour que les processus se terminent
Start-Sleep -Seconds 2

# Verifier si des processus sont encore en cours
$remaining = @()
foreach ($port in @(3000, 4000, 3001)) {
    $hasProcess = $false
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
                            $hasProcess = $true
                            break
                        }
                    }
                } catch {
                    # Process doesn't exist
                }
            }
        }
    } catch {
        # Try netstat as fallback
        try {
            $netstatOutput = netstat -ano | Select-String ":$port\s"
            if ($netstatOutput) {
                $hasProcess = $true
            }
        } catch {
            # Ignore
        }
    }
    
    if ($hasProcess) {
        switch ($port) {
            3000 { $remaining += "Web (3000)" }
            4000 { $remaining += "API (4000)" }
            3001 { $remaining += "WebSocket (3001)" }
        }
    }
}

if ($remaining.Count -eq 0) {
    if ($portsStopped -gt 0) {
        Write-Host "Tous les processus Kollab ont ete arretes" -ForegroundColor Green
    } else {
        Write-Host "Aucun processus Kollab en cours d'execution" -ForegroundColor Green
    }
} else {
    Write-Host "Avertissement: Les ports suivants sont encore utilises: $($remaining -join ', ')" -ForegroundColor Yellow
    Write-Host "  Vous pouvez les arreter manuellement si necessaire" -ForegroundColor Gray
}
Write-Host ""

# Step 2: Arreter les services Docker
Write-Host "Etape 2: Arret des services Docker..." -ForegroundColor Yellow

# Compter les conteneurs avant l'arrêt
$containersBefore = @(docker ps --filter "name=kollab-" --format "{{.Names}}" 2>&1)
$dockerStopped = 0

if (Test-Path "docker-compose.yml") {
    $oldErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    
    try {
        # Essayer docker-compose (ancienne syntaxe)
        $output = docker-compose down 2>&1
        $exitCode = $LASTEXITCODE
        
        $ErrorActionPreference = $oldErrorAction
        
        if ($exitCode -eq 0) {
            $dockerStopped = $containersBefore.Count
            Write-Host "Services Docker arretes ($dockerStopped conteneur(s))" -ForegroundColor Green
        } else {
            # Essayer avec "docker compose" (nouvelle syntaxe)
            $ErrorActionPreference = "SilentlyContinue"
            $output2 = docker compose down 2>&1
            $exitCode2 = $LASTEXITCODE
            $ErrorActionPreference = $oldErrorAction
            
            if ($exitCode2 -eq 0) {
                $dockerStopped = $containersBefore.Count
                Write-Host "Services Docker arretes ($dockerStopped conteneur(s))" -ForegroundColor Green
            } else {
                Write-Host "Avertissement: Erreur lors de l'arret des services Docker" -ForegroundColor Yellow
                Write-Host "   Certains conteneurs peuvent encore etre en cours d'arret" -ForegroundColor Gray
            }
        }
    } catch {
        $ErrorActionPreference = $oldErrorAction
        Write-Host "Avertissement: Impossible d'executer docker-compose" -ForegroundColor Yellow
        Write-Host "   $($_.Exception.Message)" -ForegroundColor Gray
    }
    
    # Vérifier qu'ils sont vraiment arrêtés
    Start-Sleep -Seconds 2
    $containersAfter = @(docker ps --filter "name=kollab-" --format "{{.Names}}" 2>&1)
    if ($containersAfter.Count -gt 0) {
        Write-Host "   Avertissement: $($containersAfter.Count) conteneur(s) encore en cours" -ForegroundColor Yellow
        foreach ($container in $containersAfter) {
            Write-Host "     - $container" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "Avertissement: docker-compose.yml non trouve, skip de l'arret Docker" -ForegroundColor Yellow
}
Write-Host ""

# Résumé final
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  KOLLAB - Arret termine" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Statistiques:" -ForegroundColor Yellow
Write-Host "  Processus Node.js arretes: $portsStopped" -ForegroundColor $(if ($portsStopped -gt 0) { "Green" } else { "Gray" })
Write-Host "  Conteneurs Docker arretes: $dockerStopped" -ForegroundColor $(if ($dockerStopped -gt 0) { "Green" } else { "Gray" })
Write-Host ""
Write-Host "Tous les services Kollab ont ete arretes" -ForegroundColor Green
Write-Host ""

