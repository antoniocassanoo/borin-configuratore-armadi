@echo off
setlocal EnableExtensions DisableDelayedExpansion
title BORIN Configuratore - disinstallazione
rem BORIN Configuratore - disinstallazione per Windows. Doppio clic per lanciarla.
rem Toglie %APPDATA%\Adobe\CEP\extensions\com.borin.configuratore.
rem Lascia impostazioni e PSD scaricati in %APPDATA%\BORIN\Configuratore armadi,
rem e PlayerDebugMode, che puo' servire ad altre estensioni.
rem Solo caratteri ASCII e fine riga CRLF: lo controlla crea_pacchetti.sh.

set "ID=com.borin.configuratore"
echo BORIN Configuratore - disinstallazione
echo.

if not defined APPDATA goto :senza_appdata
set "DEST=%APPDATA%\Adobe\CEP\extensions\%ID%"
set "DATI=%APPDATA%\BORIN\Configuratore armadi"

if not exist "%DEST%\" goto :non_installato
rmdir /s /q "%DEST%"
if exist "%DEST%\" goto :errore
echo - BORIN Configuratore e' stato tolto da Photoshop.
goto :dati

:non_installato
echo - BORIN Configuratore non era installato: non c'era niente da togliere.

:dati
if exist "%DATI%\" echo - Le impostazioni e i PSD scaricati restano in "%DATI%"
if exist "%DATI%\" echo   e tornano se reinstalli. Per liberare spazio puoi cancellare quella cartella.
echo.
echo Chiudi e riapri Photoshop: il pannello non ci sara' piu'.
echo.
pause
exit /b 0

:senza_appdata
echo ERRORE: non trovo la cartella APPDATA di questo utente.
goto :fine_errore

:errore
echo ERRORE: non riesco a togliere "%DEST%"
goto :fine_errore

:fine_errore
echo.
echo La disinstallazione non e' finita. Chiudi Photoshop e riprova.
echo.
pause
exit /b 1
