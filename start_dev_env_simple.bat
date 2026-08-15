@echo off
REM NOTE: The contract-address extraction below parses legacy Truffle
REM artifacts (build/contracts/*.json, network "5777"). With the Hardhat
REM toolchain, run `migrate.bat` (npx hardhat build + scripts/deploy.js)
REM and copy the printed CONTRACT_ADDRESS into .env instead.
echo.
echo ==================================================
echo  Starting Bond Trading Development Environment
echo ==================================================
echo.

REM Resolve key paths
set "ROOT=%~dp0"
set "API_DIR=%ROOT%api"
set "FRONTEND_DIR=%ROOT%frontend"
set "VENV_PY=%ROOT%.venv\Scripts\python.exe"
set "PY_CMD=python"

if exist "%VENV_PY%" (
	set "PY_CMD=%VENV_PY%"
	echo Using virtualenv Python at %VENV_PY%
) else (
	echo Virtualenv not found, falling back to system python on PATH
)

REM =============================================
REM Kill processes occupying required ports
REM =============================================
echo Clearing occupied ports (8545, 5000, 3000)...
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8545 ^| findstr LISTENING') do (
	taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
	taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
	taskkill /F /PID %%a 2>nul
)

timeout /t 2 /nobreak >nul

echo.
echo Starting Hardhat blockchain server...
echo.

REM Start the Hardhat node in a new window (deterministic test accounts,
REM account #0 is the owner; port 8545 matches .env.example)
start "Hardhat Node" cmd /k "npx hardhat node --port 8545"

timeout /t 5 /nobreak >nul

echo.
echo Deploying smart contracts to the local node...
echo.

call "%ROOT%migrate.bat"

echo.
echo Extracting deployed contract address and owner...
for /f "usebackq tokens=*" %%A in (`node -e "const f=require('./build/contracts/BondTrading.json'); const id='5777'; if(!f.networks||!f.networks[id]){console.error('No network 5777 deployment found'); process.exit(1);} console.log(f.networks[id].address);"`) do set CONTRACT_ADDRESS=%%A
for /f "usebackq tokens=*" %%A in (`node -e "const f=require('./build/contracts/BondToken.json'); const id='5777'; if(!f.networks||!f.networks[id]){console.error('No network 5777 deployment found'); process.exit(1);} console.log(f.networks[id].address);"`) do set TOKEN_ADDRESS=%%A

REM owner is the first account (accounts[0]) of the local node
for /f "usebackq tokens=*" %%A in (`powershell -Command "(Invoke-RestMethod -Uri 'http://127.0.0.1:8545' -Method Post -ContentType 'application/json' -Body '{\"jsonrpc\":\"2.0\",\"method\":\"eth_accounts\",\"params\":[],\"id\":1}').result[0]"`) do set OWNER_ADDRESS=%%A

if not defined CONTRACT_ADDRESS (
	echo Could not extract contract address. Please check migration output.
) else (
	echo Updating .env with CONTRACT_ADDRESS=%CONTRACT_ADDRESS%
	powershell -Command "(Get-Content '%ROOT%.env') -replace '^CONTRACT_ADDRESS=.*','CONTRACT_ADDRESS=%CONTRACT_ADDRESS%' | Set-Content '%ROOT%.env'"
)

if defined OWNER_ADDRESS (
	echo Updating .env with OWNER_ADDRESS=%OWNER_ADDRESS%
	powershell -Command "if (-not (Get-Content '%ROOT%.env' | Select-String '^OWNER_ADDRESS=')) { Add-Content '%ROOT%.env' 'OWNER_ADDRESS=%OWNER_ADDRESS%' } else { (Get-Content '%ROOT%.env') -replace '^OWNER_ADDRESS=.*','OWNER_ADDRESS=%OWNER_ADDRESS%' | Set-Content '%ROOT%.env' }"
)

echo.
echo Starting Bond Trading API...
echo.

REM Start API in a new window using the resolved Python interpreter
start "API Server" "%PY_CMD%" "%API_DIR%\app.py"

echo.
echo Installing frontend dependencies if needed...
echo.

REM Check if node_modules exists, install if missing
if not exist "%FRONTEND_DIR%\node_modules" (
	echo Running npm install in frontend directory...
	cd /d "%FRONTEND_DIR%"
	npm install
)

echo.
echo Starting Frontend dev server...
echo.

REM Start Frontend in a new window
start "Frontend" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

echo.
echo ==================================================
echo  Development environment started!
echo.
echo Hardhat  - running on port 8545  (new window)
echo API      - running on port 5000  (new window)
echo Frontend - running on port 3000  (new window)
echo.
echo Open browser to http://localhost:3000
echo API docs at  http://localhost:5000/docs
echo.
echo.
echo Done — all services running in their own windows.
echo Close those windows to stop the services.
