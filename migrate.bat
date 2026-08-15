@echo off
REM Helper script for contract deployment (Hardhat, replaces Truffle migrate)
cd /d "%~dp0"
echo.
echo [1/2] Compiling contracts...
npx hardhat build
echo.
echo [2/2] Deploying (requires a node on 8545 - start one with: npx hardhat node)
echo       External nodes: set PRIVATE_KEY first (see .env.example)
npx hardhat run scripts/deploy.js --network development
