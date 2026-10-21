@echo off
rem KitEscola: instala (1a vez), compila se preciso e abre no navegador.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale o Node 22.12+ em https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instalando dependencias... & call npm ci || (pause & exit /b 1))
if not exist .next\BUILD_ID (echo Compilando... & call npm run build || (pause & exit /b 1))
start "" http://localhost:3000
set "KITESCOLA_LOCAL=1"
call npm start
