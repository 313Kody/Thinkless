@echo off
echo ============================================
echo   Thinkless - Reset base de donnees
echo ============================================
echo.
echo ATTENTION : Cette action va supprimer le volume MySQL local.
echo Toutes les donnees non exportees seront perdues.
echo.
set /p confirm="Continuer ? (o/N) : "
if /i not "%confirm%"=="o" (
    echo Annule.
    exit /b 0
)

echo.
echo [1/4] Arret de Thinkless et suppression du volume...
cd /d "%~dp0"
docker compose down -v

echo.
echo [2/4] Demarrage de Docker-Tools (PhpMyAdmin)...
cd ..\Docker-Tools
docker compose up -d
cd ..\Thinkless

echo.
echo [3/4] Demarrage de Thinkless et reinitialisation de la base...
docker compose up -d

echo.
echo [4/4] Attente du demarrage de MySQL (15s)...
timeout /t 15 /nobreak >nul

echo.
echo Termine ! La base a ete rechargee depuis database/thinkless_db.sql
echo Site disponible sur       : http://localhost:81
echo PhpMyAdmin disponible sur : http://localhost:8080
echo.
pause
