@echo off
:: 关闭windows快捷编辑模式，防止阻塞
reg add HKEY_CURRENT_USER\Console /v QuickEdit /t REG_DWORD /d 00000000 /f
echo "Setting Windows CMD"
start client.bat