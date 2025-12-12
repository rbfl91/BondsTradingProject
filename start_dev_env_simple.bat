@echo off
echo.
echo ==================================================
echo  Starting Bond Trading Development Environment
echo ==================================================
echo.

REM Resolve key paths
set "ROOT=%~dp0"
set "API_DIR=%ROOT%api"
set "VENV_PY=%ROOT%.venv\Scripts\python.exe"
set "PY_CMD=python"

if exist "%VENV_PY%" (
	set "PY_CMD=%VENV_PY%"
	echo Using virtualenv Python at %VENV_PY%
) else (
	echo Virtualenv not found, falling back to system python on PATH
)

echo Starting Ganache blockchain server...
echo.

REM Start Ganache in a new window with proper error handling
start "Ganache" cmd /k "ganache --port 8545 --networkId 5777 --gasLimit 8000000 --accounts 10 --defaultBalanceEther 100"

timeout /t 5 /nobreak >nul

echo.
echo Deploying smart contracts to Ganache...
echo.
call cmd /c "cd /d "%ROOT%" ^& npx truffle migrate --network development --reset"

echo.
echo Extracting deployed contract address and owner...
for /f "usebackq tokens=*" %%A in (`node -e "const f=require('./build/contracts/BondTrading.json'); const id='5777'; if(!f.networks||!f.networks[id]){console.error('No network 5777 deployment found'); process.exit(1);} console.log(f.networks[id].address);"`) do set CONTRACT_ADDRESS=%%A
for /f "usebackq tokens=*" %%A in (`node -e "const f=require('./build/contracts/BondToken.json'); const id='5777'; if(!f.networks||!f.networks[id]){console.error('No network 5777 deployment found'); process.exit(1);} console.log(f.networks[id].address);"`) do set TOKEN_ADDRESS=%%A

REM owner is the first account (accounts[0]) used by truffle migrate
for /f "usebackq tokens=*" %%A in (`node -e "const Web3=require('web3'); const w=new Web3('http://127.0.0.1:8545'); w.eth.getAccounts().then(a=>{if(!a.length) process.exit(1); console.log(a[0]);});"`) do set OWNER_ADDRESS=%%A

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
start "API Server" cmd /k ""%PY_CMD%" "%API_DIR%\app.py""

echo.
echo ==================================================
echo  Development environment started!
echo.
echo Ganache is running on port 8545 (new window)
echo API is running on port 5000 (new window)
echo.
echo Open browser to http://localhost:5000/docs to test authentication
echo.
echo Press any key to exit...
pause
