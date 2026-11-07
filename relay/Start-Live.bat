@echo off
title Cricket Live - YouTube relay
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Live.ps1" %*
pause
