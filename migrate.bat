@echo off
REM Helper script for truffle migration
cd /d "%~dp0"
npx truffle migrate --network development --reset
