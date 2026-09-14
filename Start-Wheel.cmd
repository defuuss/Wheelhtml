@echo off
cd /d "%~dp0"
echo Opening the wheel at http://localhost:8000
echo Keep this window open while testing. Requires Python 3.
start "" http://localhost:8000
py -m http.server 8000 --bind 127.0.0.1
pause
