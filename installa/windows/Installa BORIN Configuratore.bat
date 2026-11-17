@echo off
setlocal EnableExtensions DisableDelayedExpansion
title BORIN Configuratore - installazione
rem BORIN Configuratore - installatore per Windows. Doppio clic per lanciarlo.
rem - Copia l'estensione com.borin.configuratore (la cartella accanto a questo file) in
rem   %APPDATA%\Adobe\CEP\extensions, al posto della versione di prima.
rem - Accende PlayerDebugMode (CSXS 9-15): serve a Photoshop per caricare un'estensione non firmata.
rem Non servono i permessi di amministratore e non tocca impostazioni e PSD in %APPDATA%\BORIN\Configuratore armadi.
rem Lanciato dalla cartella di lavoro (installa\windows), prende l'estensione da ..\..\estensione.
rem Solo caratteri ASCII e fine riga CRLF: lo controlla crea_pacchetti.sh.

set "ID=com.borin.configuratore"
echo BORIN Configuratore - installazione
echo.

if not defined APPDATA goto :senza_appdata
set "DEST_DIR=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_DIR%\%ID%"

set "SRC=%~dp0%ID%"
if not exist "%SRC%\CSXS\manifest.xml" set "SRC=%~dp0..\..\estensione\%ID%"
if not exist "%SRC%\CSXS\manifest.xml" goto :manca
for %%I in ("%SRC%") do set "SRC=%%~fI"

if not exist "%DEST_DIR%\" mkdir "%DEST_DIR%" >nul 2>&1
if not exist "%DEST_DIR%\" goto :errore_cartella

rem /MIR rende la copia uguale al pacchetto e toglie i file della versione di prima.
robocopy "%SRC%" "%DEST%" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :errore_copia
echo - Estensione copiata in "%DEST%"

set "SBAGLIATO="
for /L %%N in (9,1,15) do (
  reg add "HKCU\Software\Adobe\CSXS.%%N" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1 || set "SBAGLIATO=%%N"
)
if defined SBAGLIATO goto :errore_registro
echo - Photoshop puo' caricare estensioni non firmate (PlayerDebugMode 1, CSXS 9-15).

echo.
echo Fatto: BORIN Configuratore e' installato.
echo Chiudi Photoshop se e' aperto e riaprilo. Il pannello e' in
echo Finestra ^> Estensioni (precedenti) ^> BORIN Configuratore.
echo Alla prima apertura scarica da solo i progetti PSD degli armadi (circa 85 MB).
echo.
pause
exit /b 0

:manca
echo ERRORE: non trovo la cartella %ID% accanto a questo file.
echo Se hai ricevuto uno zip: clic destro sullo zip ^> Estrai tutto,
echo poi lancia l'installatore dalla cartella estratta.
goto :fine_errore

:senza_appdata
echo ERRORE: non trovo la cartella APPDATA di questo utente.
goto :fine_errore

:errore_cartella
echo ERRORE: non riesco a creare la cartella "%DEST_DIR%"
goto :fine_errore

:errore_copia
echo ERRORE: non riesco a copiare l'estensione in "%DEST%"
goto :fine_errore

:errore_registro
echo ERRORE: non riesco a scrivere PlayerDebugMode per CSXS.%SBAGLIATO% nel registro.
goto :fine_errore

:fine_errore
echo.
echo L'installazione non e' finita. Chiudi Photoshop e riprova; se l'errore torna,
echo manda una foto di questa finestra a chi ti ha dato BORIN Configuratore.
echo.
pause
exit /b 1
