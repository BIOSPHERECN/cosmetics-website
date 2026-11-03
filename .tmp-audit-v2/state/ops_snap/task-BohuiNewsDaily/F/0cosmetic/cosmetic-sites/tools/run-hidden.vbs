' Hidden runner for scheduled tasks: launches a .bat with window style 0 (no console flash).
' ASCII ONLY in this file. VBScript reads ANSI; the previous Chinese comments were
' UTF-8 bytes that broke the parser ("object required: sh") and wscript //B swallowed
' the error, so every task exited 0 while doing nothing. Founder-visible symptom: no updates.
Set sh = CreateObject("Wscript.Shell")
sh.Run """" & WScript.Arguments(0) & """", 0, False
