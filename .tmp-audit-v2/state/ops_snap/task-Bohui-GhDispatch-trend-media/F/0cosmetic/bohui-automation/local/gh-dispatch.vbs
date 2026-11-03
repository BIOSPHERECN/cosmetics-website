' Hidden runner for Bohui-GhDispatch-* tasks. ASCII ONLY (VBScript reads ANSI).
' Usage: wscript.exe //B gh-dispatch.vbs <workflow>
Set sh = CreateObject("Wscript.Shell")
sh.Run "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File ""F:\0cosmetic\bohui-automation\local\gh-dispatch.ps1"" -Workflow " & WScript.Arguments(0), 0, False
