; Included in the Windows installer (electron-builder.yml's nsis.include). A .pho is a PNG with a Phosphor project
; inside: pointed at Windows' own photo thumbnail provider, Explorer previews it as the PNG it is. SHCTX is the per-user
; or per-machine registry, whichever the install is, as electron-builder's own file associations use.

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\.pho\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}" "" "{C7657C4A-9F68-40fa-A4DF-96BC08EB3551}"
  WriteRegStr SHCTX "Software\Classes\.pho" "PerceivedType" "image"
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\.pho\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.pho\ShellEx"
  DeleteRegValue SHCTX "Software\Classes\.pho" "PerceivedType"
!macroend
