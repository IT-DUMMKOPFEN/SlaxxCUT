<p align="center"><img src="src/renderer/assets/logo-512.png" width="160" alt="SlaxxCUT"></p>

<h1 align="center">SlaxxCUT</h1>
<p align="center"><b>Modernes Videoschnittprogramm · Modern video editor</b><br>macOS (Apple Silicon) · Windows · Linux (AppImage)<br><i>Done by IT-DUMMKOPFEN</i></p>

---

## 🇩🇪 Deutsch

### Download
Die fertigen Programme findest du unter **[Releases](https://github.com/IT-DUMMKOPFEN/SlaxxCUT/releases)**:

| System | Datei |
|---|---|
| macOS (Apple Silicon M1–M4) | `SlaxxCUT-x.y.z-macOS-AppleSilicon.dmg` |
| Windows | `SlaxxCUT-x.y.z-Windows-Setup.exe` (Installer) oder `…-Portable.exe` |
| Linux | `SlaxxCUT-x.y.z-Linux-x86_64.AppImage` |

**macOS:** DMG öffnen, SlaxxCUT in „Programme“ ziehen. Weil die App nicht von Apple notarisiert ist, einmalig im Terminal:
```
xattr -cr /Applications/SlaxxCUT.app
```
**Linux:** `chmod +x SlaxxCUT-*.AppImage` und starten (ggf. wird `libfuse2` benötigt).

### Funktionen
- **Oberfläche:** links Medien / Effekte / Übergänge (Reiter), Mitte Quellvorschau, rechts Schnitt-Vorschau, darunter Werkzeugleiste und Timeline
- **Import** per Knopf oder Drag & Drop: Video (MP4, MOV, MKV, AVI, WebM …), Audio (MP3, WAV, FLAC, AAC, OGG …), Bilder (JPG, PNG, WebP, HEIC …) – nicht direkt abspielbare Formate bekommen automatisch eine Vorschau-Datei (Proxy)
- **Timeline** mit bis zu 10 Spuren (+/−), Magnet/Einrasten (abschaltbar), Zoom per **mittlerer Maustaste + hoch/runter**, Strg/⌘ + Mausrad oder Trackpad-Pinch
- Schneiden, Trimmen, Klinge, Löschen mit Lückenschluss, Kopieren/Einfügen, Rückgängig/Wiederholen
- **Ein-/Ausblenden** direkt am Clip (Anfasser oben links/rechts) für Bild und Ton
- **Effekte (über 40):** Bewegung (Zoom, Pan & Scan, Wackeln, Parallax, Takt-Zoom, Drehen, Zeitlupe/-raffer, Rückwärts, Standbild, Verwackeln reduzieren) · Look (S/W, Sepia, Vintage, Film, Color Grading + LUT, Duotone, HDR, Negativ, Farbton, Comic, VHS, Leuchten, Vignette) · Bild (Weichzeichner, Schärfen, Spiegeln, Drehen, Zuschneiden, Verpixeln auch nur eines Bereichs, Greenscreen, Bild-im-Bild)
- **Keyframes** für Größe, Position, Drehung, Deckkraft und Lautstärke · **Marker** im Zeitlineal
- **Übergänge (15) mit Richtung:** Ein-/Ausblenden, Blitz, Überblendung, Wischen (8 Richtungen), Hereingleiten, Schieben, Kreis auf/zu, Jalousie, Zoom, Drehen, Whip Pan, Glitch, Pixel, Unschärfe
- **Text-Vorlagen:** Bauchbinde, Info-Leiste, Titel-Box, Ecken-Badge, Laufschrift, Abspann – Hintergrund als Farbe, Verlauf oder eigenes Bild, Ein-/Ausblend-Animationen, eigene Vorlagen speichern
- **Audio-Modus (kleiner Sound-Editor):** große Wellenform mit Bereichsauswahl, Lautstärke-Hüllkurve, Schneiden/Stille/Fades/Normalisieren/Rückwärts, Solo, Pegelanzeige, Mikrofon-Aufnahme · Filter: Brummen entfernen, Rauschen entfernen (Profil oder automatisch), Klicks entfernen, De-Esser, Hoch-/Tief-/Bandpass, 3- und 10-Band-EQ, Kompressor, Limiter, Hall, Echo, Tonhöhe, Mono, Kanäle, Balance, Stille entfernen
- **Export:** Video als MP4 oder MOV (H.264 oder ProRes 422) in 4K, 2K, 1080p, 720p, 480p, 360p · 16:9, 9:16, 1:1 · Grafikkarten-Beschleunigung · nur Ton als WAV, MP3, FLAC, OGG, M4A · Einzelbild als PNG · Bereich: alles, Auswahl oder zwischen Markern
- Deutsch & Englisch, Tag- und Nachtmodus in den Logo-Farben, Tooltips nach 2 s, Hilfe (DE/EN), Info-Seite mit allen Lizenzen, automatische Sicherung

### Selbst bauen
```
npm install
npm start            # starten
npm run dist:mac     # bzw. dist:win / dist:linux
```
Die GitHub-Action `.github/workflows/build.yml` baut bei jedem Tag `v*` alle drei Versionen und legt sie als Release ab.

---

## 🇬🇧 English

### Download
Get the ready-to-run programs from **[Releases](https://github.com/IT-DUMMKOPFEN/SlaxxCUT/releases)** (macOS Apple Silicon DMG, Windows installer/portable EXE, Linux AppImage).

**macOS:** open the DMG and drag SlaxxCUT to “Applications”. The app isn't notarized by Apple, so run once in Terminal: `xattr -cr /Applications/SlaxxCUT.app`
**Linux:** `chmod +x SlaxxCUT-*.AppImage` and start it (some systems need `libfuse2`).

### Features
Three-tab media/effects/transitions panel, source and edit previews, toolbar, timeline with up to 10 tracks, snapping, middle-mouse/pinch zoom, fades on clips, 40+ motion/look/picture effects (incl. green screen, pixelate area, reverse, stabilize), keyframes, markers, 15 transitions with selectable direction, text templates (lower third, info bar, ticker, credits …) with color/gradient/own picture background, an audio mode that works as a small sound editor (waveform selection, volume envelope, hum/noise/click removal, EQ, compressor, reverb, recording …), export to MP4/MOV (H.264 or ProRes) from 360p to 4K in 16:9, 9:16 and 1:1 with hardware acceleration, audio export to WAV/MP3/FLAC/OGG/M4A and PNG stills, German/English UI, day/night mode, 2-second tooltips, built-in help and license page.

### Build
```
npm install && npm start
```

---

### Lizenz / License
SlaxxCUT is free software under the **GNU GPL v3.0 or later** (see `LICENSE`).
Bundled: FFmpeg via `ffmpeg-static` (GPL), Electron (MIT), fonts Inter, Montserrat, Roboto, Anton, Archivo Black, Bitter, Crimson Text, Comic Relief (SIL OFL 1.1, see `licenses/`).

*Geschrieben von IT-DUMMKOPFEN mit Hilfe einer KI. · Written by IT-DUMMKOPFEN with the help of an AI.*
