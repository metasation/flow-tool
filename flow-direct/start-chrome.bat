@echo off
REM Mở Chrome THẬT với remote debugging, để flow-direct nối vào qua CDP (--cdp).
REM Không banner automation, không login lại — xài luôn session Chrome thật của bạn.
set PROFILE=%USERPROFILE%\.flow-direct-chrome-profile
set PORT=9222
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=%PORT% --user-data-dir="%PROFILE%" https://flow.google.com
echo Chrome da mo. Kiem tra: node flow-direct.mjs cdp-status
