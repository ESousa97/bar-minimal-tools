!ifndef BMT_NSIS_HOOKS_INCLUDED
!define BMT_NSIS_HOOKS_INCLUDED

!define BMT_PRODUCT_NAME "BarMinimalTools"
!define BMT_IDENTIFIER "com.barminimal.tools"

Var bmtKeepNotes
Var bmtNotesDir

Function un.bmt_DetectNotesDir
  StrCpy $bmtNotesDir ""

  IfFileExists "$APPDATA\${BMT_PRODUCT_NAME}\notes.json" 0 +3
    StrCpy $bmtNotesDir "$APPDATA\${BMT_PRODUCT_NAME}"
    Return

  IfFileExists "$APPDATA\${BMT_IDENTIFIER}\notes.json" 0 +3
    StrCpy $bmtNotesDir "$APPDATA\${BMT_IDENTIFIER}"
    Return

  IfFileExists "$LOCALAPPDATA\${BMT_PRODUCT_NAME}\notes.json" 0 +3
    StrCpy $bmtNotesDir "$LOCALAPPDATA\${BMT_PRODUCT_NAME}"
    Return

  IfFileExists "$LOCALAPPDATA\${BMT_IDENTIFIER}\notes.json" 0 +3
    StrCpy $bmtNotesDir "$LOCALAPPDATA\${BMT_IDENTIFIER}"
    Return
FunctionEnd

!macro NSIS_HOOK_PREUNINSTALL
  StrCpy $bmtKeepNotes "0"
  Call un.bmt_DetectNotesDir

  StrCmp $bmtNotesDir "" bmt_no_notes

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Encontramos notas salvas.\r\n\r\nDeseja manter suas notas após a desinstalação?\r\n\r\n(Sim = manter | Não = apagar)" \
    IDYES bmt_keep_notes IDNO bmt_delete_notes

  bmt_keep_notes:
    StrCpy $bmtKeepNotes "1"
    Goto bmt_no_notes

  bmt_delete_notes:
    StrCpy $bmtKeepNotes "0"

  bmt_no_notes:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove possible autostart registry entries (best effort).
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${BMT_PRODUCT_NAME}"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${BMT_PRODUCT_NAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "bar-minimal-tools"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "bar-minimal-tools"

  ; Remove all app data/cache folders. If the user chose to keep notes,
  ; keep the folder that contains notes.json.

  StrCmp $bmtKeepNotes "1" 0 bmt_remove_appdata_product
    StrCmp "$APPDATA\${BMT_PRODUCT_NAME}" $bmtNotesDir 0 bmt_remove_appdata_product
    Goto bmt_skip_appdata_product
  bmt_remove_appdata_product:
    RMDir /r "$APPDATA\${BMT_PRODUCT_NAME}"
  bmt_skip_appdata_product:

  StrCmp $bmtKeepNotes "1" 0 bmt_remove_appdata_identifier
    StrCmp "$APPDATA\${BMT_IDENTIFIER}" $bmtNotesDir 0 bmt_remove_appdata_identifier
    Goto bmt_skip_appdata_identifier
  bmt_remove_appdata_identifier:
    RMDir /r "$APPDATA\${BMT_IDENTIFIER}"
  bmt_skip_appdata_identifier:

  StrCmp $bmtKeepNotes "1" 0 bmt_remove_local_product
    StrCmp "$LOCALAPPDATA\${BMT_PRODUCT_NAME}" $bmtNotesDir 0 bmt_remove_local_product
    Goto bmt_skip_local_product
  bmt_remove_local_product:
    RMDir /r "$LOCALAPPDATA\${BMT_PRODUCT_NAME}"
  bmt_skip_local_product:

  StrCmp $bmtKeepNotes "1" 0 bmt_remove_local_identifier
    StrCmp "$LOCALAPPDATA\${BMT_IDENTIFIER}" $bmtNotesDir 0 bmt_remove_local_identifier
    Goto bmt_skip_local_identifier
  bmt_remove_local_identifier:
    RMDir /r "$LOCALAPPDATA\${BMT_IDENTIFIER}"
  bmt_skip_local_identifier:
!macroend

!endif
