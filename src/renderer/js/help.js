/* SlaxxCUT – help (DE/EN). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, modal } = SC.ui;
  const mod = navigator.platform && /Mac/i.test(navigator.platform) ? '⌘' : 'Strg';
  const modEn = mod === '⌘' ? '⌘' : 'Ctrl';

  const HELP = {
    de: [
      ['start', 'Erste Schritte', `
        <h3>Willkommen bei SlaxxCUT</h3>
        <p>So entsteht dein erstes Video in 5 Schritten:</p>
        <ol>
          <li><b>Importieren:</b> Links im Reiter <b>Medien</b> auf <b>Importieren</b> klicken – oder Dateien einfach aus dem Explorer/Finder in die Liste ziehen.</li>
          <li><b>Ansehen:</b> Ein Medium anklicken – es erscheint in der <b>Quellvorschau</b> (Mitte). Mit <kbd>I</kbd> und <kbd>O</kbd> kannst du den gewünschten Ausschnitt markieren.</li>
          <li><b>In die Timeline:</b> Das Medium (oder das Quellbild) in die Timeline unten ziehen. Doppelklick hängt es ans Ende an.</li>
          <li><b>Schneiden &amp; verschönern:</b> Clips verschieben, kürzen, schneiden, Effekte und Übergänge darauf ziehen. Rechts in der <b>Schnitt-Vorschau</b> siehst du das Ergebnis.</li>
          <li><b>Exportieren:</b> Unten rechts auf <b>Export</b> klicken, Größe und Qualität wählen – fertig ist die MP4.</li>
        </ol>
        <p>Über jedem Knopf erscheint nach kurzer Zeit (Standard: 1 Sekunde) ein Hinweis, was er macht. Die Zeit kannst du in den <b>Einstellungen</b> ändern.</p>`],
      ['ui', 'Die Oberfläche', `
        <h3>Aufbau</h3>
        <table>
          <tr><td><b>Links</b></td><td>Drei Reiter: <b>Medien</b> (deine Dateien), <b>Effekte</b> und <b>Übergänge</b>. Bei Doppelklick auf einen Clip öffnen sich hier dessen <b>Eigenschaften</b>.</td></tr>
          <tr><td><b>Mitte</b></td><td><b>Quellvorschau</b> – zeigt das Original (Video, Ton oder Bild) mit Abspieltasten und In/Out-Punkten.</td></tr>
          <tr><td><b>Rechts</b></td><td><b>Schnitt-Vorschau</b> – zeigt das fertige Video an der Abspielposition, inkl. Effekten und Übergängen. Oben wählst du das Format (16:9, 9:16, 1:1) und die Vorschauqualität.</td></tr>
          <tr><td><b>Werkzeugleiste</b></td><td>Alle wichtigen Schnitt-Werkzeuge, Timeline-Zoom, Magnet (Einrasten) – rechts <b>Neu</b>, <b>Laden</b>, <b>Speichern</b> und <b>Export</b>.</td></tr>
          <tr><td><b>Timeline</b></td><td>Bis zu 10 Spuren. Hier legst du Videos, Bilder, Musik und Texte an.</td></tr>
        </table>
        <p>Die Trennlinie zwischen Vorschauen und Timeline kannst du mit der Maus verschieben.</p>
        <p>Oben rechts: Sprache (DE/EN), Tag-/Nachtmodus, Einstellungen, Hilfe und Info.</p>`],
      ['media', 'Medien importieren', `
        <h3>Unterstützte Formate</h3>
        <table>
          <tr><td><b>Video</b></td><td>MP4, MOV, MKV, AVI, WebM, WMV, FLV, MPG, MTS/M2TS, TS, 3GP …</td></tr>
          <tr><td><b>Audio</b></td><td>MP3, WAV, FLAC, AAC, M4A, OGG, OPUS, WMA, AIFF …</td></tr>
          <tr><td><b>Bilder</b></td><td>JPG, PNG, WebP, BMP, GIF, TIFF, HEIC</td></tr>
        </table>
        <p>Formate, die die Vorschau nicht direkt abspielen kann (z.&nbsp;B. AVI oder HEVC), wandelt SlaxxCUT automatisch in eine kleine <b>Vorschau-Datei (Proxy)</b> um. Das siehst du am Fortschrittsbalken. Der Export verwendet immer die Original-Datei in voller Qualität.</p>
        <p><b>Rechtsklick</b> auf ein Medium: ans Ende anhängen, im Ordner zeigen, neu verknüpfen (falls die Datei verschoben wurde) oder entfernen.</p>`],
      ['source', 'Quellvorschau', `
        <h3>Ausschnitte wählen</h3>
        <p>Klicke links auf ein Medium. In der Mitte kannst du es abspielen und mit <kbd>I</kbd> (In-Punkt) und <kbd>O</kbd> (Out-Punkt) einen Ausschnitt markieren.</p>
        <p><b>Einfügen</b> legt den Ausschnitt an der Abspielposition in die ausgewählte Spur, <b>Anhängen</b> setzt ihn ans Ende. Du kannst das Quellbild auch direkt in die Timeline ziehen.</p>`],
      ['timeline', 'Timeline & Spuren', `
        <h3>Spuren</h3>
        <p>Alle Spuren liegen untereinander und können Videos, Bilder, Musik und Texte enthalten. <b>Obere Spuren liegen im Bild über den unteren</b> (z.&nbsp;B. Text oben, Video darunter).</p>
        <p>Mit <b>+</b> und <b>−</b> (links oben in der Timeline oder in der Werkzeugleiste) fügst du Spuren hinzu oder entfernst sie – maximal 10. Pro Spur: Ton stumm, Bild ausblenden, sperren. Doppelklick auf den Spurnamen benennt sie um.</p>
        <h4>Zoomen</h4>
        <ul>
          <li><b>Mittlere Maustaste</b> gedrückt halten und die Maus <b>hoch/runter</b> bewegen</li>
          <li><kbd>${mod}</kbd> + Mausrad – oder auf dem Mac-Trackpad mit zwei Fingern zusammen-/auseinanderziehen</li>
          <li>Zoom-Regler und Lupen in der Werkzeugleiste, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Umschalt</kbd>+<kbd>Z</kbd> zeigt alles</li>
        </ul>
        <h4>Magnet (Einrasten)</h4>
        <p>Ist der Magnet in der Werkzeugleiste aktiv (<kbd>N</kbd>), schnappen Clips an andere Clips, die Abspielposition und den Anfang. Eine gelbe Linie zeigt den Einrastpunkt.</p>`],
      ['edit', 'Schneiden & Trimmen', `
        <h3>Clips bearbeiten</h3>
        <ul>
          <li><b>Lautstärke-Hüllkurve, Rauschprofil &amp; Aufnahme:</b> siehe „Audio-Modus“.</li>
          <li><b>Verschieben:</b> Clip ziehen – auch auf eine andere Spur. Liegt dort schon etwas, wird es überschrieben.</li>
          <li><b>Kürzen (Trimmen):</b> linken oder rechten Rand des Clips ziehen.</li>
          <li><b>Schneiden:</b> <kbd>S</kbd> schneidet die ausgewählten Clips an der Abspielposition. Mit dem <b>Klingen-Werkzeug</b> (<kbd>C</kbd>) schneidest du per Klick genau an der Mausposition.</li>
          <li><b>Löschen:</b> <kbd>Entf</kbd>. Mit <kbd>Umschalt</kbd>+<kbd>Entf</kbd> wird die Lücke geschlossen.</li>
          <li><b>Mehrere Clips:</b> mit <kbd>Umschalt</kbd>/<kbd>${mod}</kbd> anklicken oder mit der Maus einen Rahmen ziehen.</li>
          <li><b>Rückgängig:</b> <kbd>${mod}</kbd>+<kbd>Z</kbd>, wiederholen: <kbd>${mod}</kbd>+<kbd>Y</kbd>.</li>
        </ul>`],
      ['fade', 'Ein- und Ausblenden', `
        <h3>Clips weich ein- und ausblenden</h3>
        <p>Fahre mit der Maus über einen Clip: Oben links und oben rechts erscheinen kleine weiße Punkte. <b>Ziehe sie nach innen</b>, um den Clip am Anfang ein- bzw. am Ende auszublenden. Das funktioniert für Video, Bild, Text <b>und</b> Ton. Die genaue Dauer kannst du auch in den Eigenschaften einstellen.</p>`],
      ['fx', 'Effekte', `
        <h3>Effekte anwenden</h3>
        <p>Ziehe einen Effekt aus dem Reiter <b>Effekte</b> auf einen Clip (oder Clip auswählen und Effekt anklicken). Oben im Reiter kannst du Effekte <b>suchen</b>. Die Einstellungen öffnen sich links in den Eigenschaften; mehrere Effekte wirken in der angezeigten Reihenfolge.</p>
        <table>
          <tr><td><b>Bewegung</b></td><td>Zoom In/Out, Pan &amp; Scan, Kamerawackeln, Parallax, Wackel-Zoom im Takt, Sanftes Drehen, Zeitlupe, Zeitraffer, Rückwärts, Standbild, Verwackeln reduzieren</td></tr>
          <tr><td><b>Farbe &amp; Look</b></td><td>Schwarz-Weiß, Sepia, Vintage, Film Look, Color Grading (+ LUT), Duotone, HDR, Negativ, Farbton, Comic/Poster, VHS, Leuchten, Vignette</td></tr>
          <tr><td><b>Bild</b></td><td>Weichzeichner, Schärfen, Spiegeln, Drehen 90°/180°, Zuschneiden, Verpixeln (auch nur ein Bereich), Greenscreen, Bild-im-Bild</td></tr>
          <tr><td><b>Ton</b></td><td>Filter, Equalizer, Brummen/Rauschen/Klicks entfernen, De-Esser, Kompressor, Limiter, Hall, Echo, Tonhöhe, Kanäle, Normalisieren, Stille entfernen – siehe „Audio-Modus“</td></tr>
        </table>
        <h4>Greenscreen</h4><p>Lege das Greenscreen-Video auf eine <b>obere</b> Spur und den neuen Hintergrund auf eine Spur darunter. Gib dem Greenscreen-Clip den Effekt <b>Greenscreen</b>; mit „Toleranz“ und „Weiche Kante“ stellst du den Übergang ein.</p>
        <h4>Verpixeln eines Bereichs</h4><p>Beim Effekt <b>Verpixeln</b> „Nur Bereich“ anhaken und Position/Größe einstellen. Mit Keyframes kannst du das Objekt sogar verfolgen.</p>
        <p><b>Rückwärts</b> und <b>Verwackeln reduzieren</b> werden einmal berechnet (Fortschrittsbalken). Die berechnete Datei landet in <code>Dokumente/SlaxxCUT/Berechnet</code>.</p>`],
      ['trans', 'Übergänge', `
        <h3>Übergänge</h3>
        <p>Ziehe einen Übergang auf den <b>Schnitt zwischen zwei Clips</b> (ein blauer Balken zeigt die Stelle) – oder auf den Anfang/das Ende eines einzelnen Clips. Ein kleines Symbol am Clip zeigt den Übergang: Klick öffnet die Einstellungen, Rechtsklick entfernt ihn.</p>
        <p>In den Eigenschaften wählst du die <b>Richtung</b> (z. B. Wischen nach links/rechts/oben/unten/diagonal, Kreis öffnen/schließen, Drehen im/gegen den Uhrzeigersinn) und die <b>Dauer</b>.</p>
        <p>Verfügbar: Ein-/Ausblenden (Schwarz), Blitz (Weiß), Überblendung, Wischen, Hereingleiten, Schieben, Kreis, Jalousie, Zoom (hinein/heraus), Drehen, Whip Pan, Glitch, Pixel, Unschärfe, Raute, Uhr, Tor, Schachbrett, Punkte, Kacheln, Welle, Kamm und Fallen. Übergänge wirken auf Bild <b>und</b> Ton.</p>`],
      ['text', 'Text & Vorlagen', `
        <h3>Text und Vorlagen</h3>
        <p>Im Reiter Effekte unter <b>Texteffekte</b> findest du fertige Vorlagen: <b>Freier Text, Bauchbinde, Info-Leiste, Titel-Box, Ecken-Badge, Laufschrift</b> und <b>Abspann</b>. Einfach in eine Spur über dem Video ziehen.</p>
        <p>In den Eigenschaften stellst du Text, zweite Zeile, Schrift, Größe, Farben, Ausrichtung, Schatten und Kontur ein. Beim <b>Hintergrund</b> wählst du <b>Farbe</b>, <b>Verlauf</b> oder ein <b>eigenes Bild</b> (z. B. ein PNG mit deinem Design), dazu Deckkraft, runde Ecken, Innenabstand und einen Akzentstreifen.</p>
        <p><b>Animation</b>: Einblenden, von links/rechts/unten hereingleiten oder aufpoppen – getrennt für Anfang und Ende.</p>
        <p>Mit <b>„Als Vorlage speichern“</b> wird dein Design zur eigenen Vorlage (mit Stern im Reiter Effekte, Rechtsklick löscht sie).</p>
        <p>Beim <b>Abspann</b> wird jede Zeile, die mit <code>#</code> beginnt, zur Überschrift. Die Laufschrift-Geschwindigkeit stellst du unter „Tempo“ ein. Text kannst du direkt in der Schnitt-Vorschau mit der Maus verschieben.</p>`],
      ['audio', 'Audio-Modus', `
        <h3>Audio-Modus – SlaxxCUT als Sound-Editor</h3>
        <p>Oben rechts zwischen <b>Video</b> und <b>Audio</b> umschalten (oder <kbd>Tab</kbd>). Im Audio-Modus zeigt SlaxxCUT statt der Vorschauen einen großen <b>Audio-Editor</b>, die Spuren werden höher und der Reiter Effekte zeigt nur Ton-Effekte.</p>
        <h4>Bearbeiten</h4>
        <ul>
          <li>Clip in der Timeline auswählen – die Wellenform erscheint groß.</li>
          <li>Mit der Maus über die Wellenform ziehen = <b>Bereich markieren</b>.</li>
          <li>Werkzeuge für die Auswahl: abspielen (auch in Schleife), ausschneiden, kopieren, löschen, stumm, ein-/ausblenden, lauter/leiser, normalisieren, rückwärts, beliebigen Ton-Effekt anwenden.</li>
          <li><b>Gelbe Linie = Lautstärke-Hüllkurve</b>: auf die Linie klicken setzt einen Punkt, Punkte ziehen, Rechtsklick löscht.</li>
          <li><b>Solo</b>: nur diesen Clip hören. <b>Pegelanzeige</b> oben rechts.</li>
        </ul>
        <h4>Rauschen entfernen</h4>
        <p>Markiere ein Stück, in dem <b>nur Rauschen</b> zu hören ist, und klicke <b>Rauschprofil</b>. Danach den Effekt „Rauschen entfernen“ mit Modus „Rauschprofil“ verwenden. Oder einfach Modus „Automatisch“.</p>
        <h4>Brummen, Filter &amp; Co.</h4>
        <p>Brummen entfernen (50/60 Hz), Hochpass/Tiefpass/Bandpass, Equalizer mit 3 oder 10 Bändern, Kompressor, Limiter, Hall, Echo, Tonhöhe, Mono, Kanäle tauschen, Balance, De-Esser, Klicks entfernen, Stille entfernen, Normalisieren und Lautstärke angleichen. Die meisten hörst du sofort; Rauschen/Klicks/De-Esser/Tonhöhe werden kurz berechnet.</p>
        <h4>Aufnahme</h4>
        <p>Mikrofon wählen, roten Knopf drücken – die Aufnahme landet an der Abspielposition in der ausgewählten Spur. Mit „mitspielen“ läuft die Timeline dabei, ideal für Kommentare. Aufnahmen werden in <code>Dokumente/SlaxxCUT/Aufnahmen</code> gespeichert.</p>`],
      ['export', 'Export', `
        <h3>Exportieren</h3>
        <p>Klicke auf <b>Export</b> (<kbd>${mod}</kbd>+<kbd>E</kbd>). Oben wählst du:</p>
        <ul>
          <li><b>Video</b>: MP4 oder MOV (H.264 klein, oder ProRes 422 für Profi-Schnitt), 16:9 / 9:16 / 1:1, 4K bis 360p, Qualität, Bilder/Sekunde, Encoder (Grafikkarte)</li>
          <li><b>Nur Ton</b>: WAV (16/24 Bit), MP3 (128–320 kbit/s), FLAC, OGG oder M4A, 44,1 oder 48 kHz</li>
          <li><b>Einzelbild</b>: PNG in voller Qualität an der Abspielposition (auch über das Bild-Symbol in der Schnitt-Vorschau)</li>
        </ul>
        <p><b>Bereich</b>: alles, nur die ausgewählten Clips oder vom ersten bis zum letzten Marker. Optional wird die Lautheit für YouTube &amp; Co. normalisiert.</p>`],
      ['keys', 'Tastenkürzel', `
        <h3>Tastenkürzel</h3>
        <table>
          <tr><td><kbd>Leertaste</kbd></td><td>Abspielen / Pause</td></tr>
          <tr><td><kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd></td><td>Rückwärts springen / Pause / Abspielen</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Ein Bild zurück / vor (mit <kbd>Umschalt</kbd>: 1 Sekunde)</td></tr>
          <tr><td><kbd>Pos1</kbd> <kbd>Ende</kbd></td><td>Anfang / Ende</td></tr>
          <tr><td><kbd>I</kbd> <kbd>O</kbd></td><td>In-/Out-Punkt in der Quellvorschau</td></tr>
          <tr><td><kbd>V</kbd> / <kbd>C</kbd></td><td>Auswahl-Werkzeug / Klinge</td></tr>
          <tr><td><kbd>S</kbd></td><td>An der Abspielposition schneiden</td></tr>
          <tr><td><kbd>N</kbd></td><td>Magnet an/aus</td></tr>
          <tr><td><kbd>Entf</kbd> / <kbd>Umschalt</kbd>+<kbd>Entf</kbd></td><td>Löschen / Löschen und Lücke schließen</td></tr>
          <tr><td><kbd>${mod}</kbd>+<kbd>Z</kbd> / <kbd>${mod}</kbd>+<kbd>Y</kbd></td><td>Rückgängig / Wiederholen</td></tr>
          <tr><td><kbd>${mod}</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd></td><td>Kopieren / Einfügen / Duplizieren</td></tr>
          <tr><td><kbd>${mod}</kbd>+<kbd>A</kbd></td><td>Alle Clips auswählen</td></tr>
          <tr><td><kbd>+</kbd> / <kbd>−</kbd> / <kbd>Umschalt</kbd>+<kbd>Z</kbd></td><td>Timeline zoomen / alles zeigen</td></tr>
          <tr><td><kbd>${mod}</kbd>+<kbd>N</kbd> / <kbd>O</kbd> / <kbd>S</kbd> / <kbd>E</kbd></td><td>Neu / Laden / Speichern / Export</td></tr>
          <tr><td><kbd>M</kbd> / <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd></td><td>Marker setzen / zum Marker springen</td></tr>
          <tr><td><kbd>Tab</kbd></td><td>Video- / Audio-Modus</td></tr>
          <tr><td><kbd>F1</kbd></td><td>Hilfe</td></tr>
        </table>`],
      ['project', 'Projekte & Sicherung', `
        <h3>Projekte</h3>
        <p>Ein Projekt wird als <code>.slaxxcut</code>-Datei gespeichert. Sie enthält die Timeline und die <b>Pfade</b> zu deinen Mediendateien (nicht die Dateien selbst). Verschiebe deine Videos daher nicht – oder verknüpfe sie danach per Rechtsklick neu.</p>
        <p>SlaxxCUT sichert dein Projekt jede Minute automatisch. Nach einem Absturz wird dir beim nächsten Start die Wiederherstellung angeboten.</p>`],
      ['keyframes', 'Keyframes', `
        <h3>Keyframes – Animation über die Zeit</h3>
        <p>Größe, Position X/Y, Drehung, Deckkraft und Lautstärke lassen sich animieren:</p>
        <ol>
          <li>Abspielposition auf den Startpunkt setzen, Wert einstellen, auf <b>◆</b> klicken.</li>
          <li>Abspielposition weiter setzen und den Wert ändern – ein neuer Keyframe entsteht automatisch.</li>
        </ol>
        <p>◀ ▶ springen zum vorherigen/nächsten Keyframe; ◆ an einem Keyframe entfernt ihn; Rechtsklick auf ◆ löscht alle. Keyframes erscheinen als gelbe Rauten am Clip.</p>`],
      ['markers', 'Marker', `
        <h3>Marker</h3>
        <p><kbd>M</kbd> oder der Marker-Knopf setzt einen Marker an der Abspielposition. Marker erscheinen im Zeitlineal; Klick springt hin, Doppelklick benennt/färbt, Rechtsklick löscht. <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> springt zum vorherigen/nächsten Marker. Clips rasten an Markern ein, und beim Export kannst du „Erster bis letzter Marker“ als Bereich wählen.</p>`],
      ['faq', 'Probleme & Tipps', `
        <h3>Häufige Fragen</h3>
        <h4>macOS: „SlaxxCUT ist beschädigt“ oder „kann nicht geöffnet werden“</h4>
        <p>Die App ist nicht von Apple notarisiert. Öffne das Terminal und gib ein:<br><code>xattr -cr /Applications/SlaxxCUT.app</code><br>Danach startet die App normal.</p>
        <h4>Linux: AppImage startet nicht</h4>
        <p>Datei ausführbar machen: <code>chmod +x SlaxxCUT-*.AppImage</code>. Auf manchen Systemen wird zusätzlich <code>libfuse2</code> benötigt.</p>
        <h4>Die Vorschau ruckelt</h4>
        <p>Stelle oben in der Schnitt-Vorschau die Qualität auf „Halb“ oder „Viertel“. Der Export ist davon nicht betroffen.</p>
        <h4>Der Export dauert lange</h4>
        <p>Wähle beim Encoder „Automatisch“ – dann rechnet die Grafikkarte mit. Viele Effekte gleichzeitig und 4K brauchen mehr Zeit.</p>`]
    ],
    en: [
      ['start', 'Getting started', `
        <h3>Welcome to SlaxxCUT</h3>
        <p>Your first video in 5 steps:</p>
        <ol>
          <li><b>Import:</b> In the <b>Media</b> tab on the left click <b>Import</b> – or simply drag files from Explorer/Finder into the list.</li>
          <li><b>Preview:</b> Click a media item – it appears in the <b>source preview</b> (middle). Use <kbd>I</kbd> and <kbd>O</kbd> to mark the part you want.</li>
          <li><b>Into the timeline:</b> Drag the media item (or the source picture) into the timeline below. Double-click appends it at the end.</li>
          <li><b>Cut &amp; polish:</b> Move, trim and split clips, drag effects and transitions onto them. The <b>edit preview</b> on the right shows the result.</li>
          <li><b>Export:</b> Click <b>Export</b> at the bottom right, choose size and quality – done, there's your MP4.</li>
        </ol>
        <p>Hover over any button and a hint appears after a short time (default: 1 second). You can change the delay in the <b>settings</b>.</p>`],
      ['ui', 'The interface', `
        <h3>Layout</h3>
        <table>
          <tr><td><b>Left</b></td><td>Three tabs: <b>Media</b> (your files), <b>Effects</b> and <b>Transitions</b>. Double-clicking a clip opens its <b>properties</b> here.</td></tr>
          <tr><td><b>Middle</b></td><td><b>Source preview</b> – shows the original (video, audio or picture) with playback buttons and in/out points.</td></tr>
          <tr><td><b>Right</b></td><td><b>Edit preview</b> – shows the finished video at the playhead including effects and transitions. At the top you choose the format (16:9, 9:16, 1:1) and preview quality.</td></tr>
          <tr><td><b>Toolbar</b></td><td>All important editing tools, timeline zoom, magnet (snapping) – on the right <b>New</b>, <b>Load</b>, <b>Save</b> and <b>Export</b>.</td></tr>
          <tr><td><b>Timeline</b></td><td>Up to 10 tracks. This is where you place videos, pictures, music and texts.</td></tr>
        </table>
        <p>You can drag the divider between the previews and the timeline.</p>
        <p>Top right: language (DE/EN), day/night mode, settings, help and info.</p>`],
      ['media', 'Importing media', `
        <h3>Supported formats</h3>
        <table>
          <tr><td><b>Video</b></td><td>MP4, MOV, MKV, AVI, WebM, WMV, FLV, MPG, MTS/M2TS, TS, 3GP …</td></tr>
          <tr><td><b>Audio</b></td><td>MP3, WAV, FLAC, AAC, M4A, OGG, OPUS, WMA, AIFF …</td></tr>
          <tr><td><b>Pictures</b></td><td>JPG, PNG, WebP, BMP, GIF, TIFF, HEIC</td></tr>
        </table>
        <p>Formats the preview can't play directly (e.g. AVI or HEVC) are automatically converted into a small <b>preview file (proxy)</b> – you see a progress bar. The export always uses the original file in full quality.</p>
        <p><b>Right-click</b> a media item: append to the timeline, show in folder, relink (if the file was moved) or remove.</p>`],
      ['source', 'Source preview', `
        <h3>Choosing a section</h3>
        <p>Click a media item on the left. In the middle you can play it and mark a section with <kbd>I</kbd> (in point) and <kbd>O</kbd> (out point).</p>
        <p><b>Insert</b> places the section at the playhead on the selected track, <b>Append</b> puts it at the end. You can also drag the source picture straight into the timeline.</p>`],
      ['timeline', 'Timeline & tracks', `
        <h3>Tracks</h3>
        <p>All tracks are stacked and can hold videos, pictures, music and texts. <b>Upper tracks are drawn above lower ones</b> (e.g. text on top, video below).</p>
        <p>Use <b>+</b> and <b>−</b> (top left of the timeline or in the toolbar) to add or remove tracks – up to 10. Per track: mute audio, hide picture, lock. Double-click the track name to rename it.</p>
        <h4>Zooming</h4>
        <ul>
          <li>Hold the <b>middle mouse button</b> and move the mouse <b>up/down</b></li>
          <li><kbd>${modEn}</kbd> + mouse wheel – or pinch with two fingers on a Mac trackpad</li>
          <li>Zoom slider and magnifiers in the toolbar, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Shift</kbd>+<kbd>Z</kbd> shows everything</li>
        </ul>
        <h4>Magnet (snapping)</h4>
        <p>When the magnet in the toolbar is on (<kbd>N</kbd>), clips snap to other clips, the playhead and the start. A yellow line shows the snap point.</p>`],
      ['edit', 'Cutting & trimming', `
        <h3>Editing clips</h3>
        <ul>
          <li><b>Move:</b> drag a clip – also onto another track. Anything already there gets overwritten.</li>
          <li><b>Trim:</b> drag the left or right edge of a clip.</li>
          <li><b>Split:</b> <kbd>S</kbd> splits the selected clips at the playhead. With the <b>blade tool</b> (<kbd>C</kbd>) you cut exactly where you click.</li>
          <li><b>Delete:</b> <kbd>Del</kbd>. <kbd>Shift</kbd>+<kbd>Del</kbd> also closes the gap.</li>
          <li><b>Several clips:</b> click with <kbd>Shift</kbd>/<kbd>${modEn}</kbd> or drag a selection frame.</li>
          <li><b>Undo:</b> <kbd>${modEn}</kbd>+<kbd>Z</kbd>, redo: <kbd>${modEn}</kbd>+<kbd>Y</kbd>.</li>
        </ul>`],
      ['fade', 'Fading in and out', `
        <h3>Fading clips in and out</h3>
        <p>Hover over a clip: small white dots appear at the top left and top right. <b>Drag them inwards</b> to fade the clip in at the start or out at the end. This works for video, pictures, text <b>and</b> audio. You can also set the exact duration in the properties.</p>`],
      ['fx', 'Effects', `
        <h3>Applying effects</h3>
        <p>Drag an effect from the <b>Effects</b> tab onto a clip (or select a clip and click the effect). You can <b>search</b> at the top of the tab. Settings open on the left in the properties; several effects work in the order shown.</p>
        <table>
          <tr><td><b>Motion</b></td><td>Zoom in/out, Pan &amp; Scan, camera shake, parallax, beat zoom, slow spin, slow motion, timelapse, reverse, freeze frame, reduce shake</td></tr>
          <tr><td><b>Color &amp; look</b></td><td>Black &amp; white, sepia, vintage, film look, color grading (+ LUT), duotone, HDR, negative, hue, comic/poster, VHS, glow, vignette</td></tr>
          <tr><td><b>Picture</b></td><td>Blur, sharpen, mirror, rotate 90°/180°, crop, pixelate (also just an area), green screen, picture in picture</td></tr>
          <tr><td><b>Audio</b></td><td>Filters, equalizer, remove hum/noise/clicks, de-esser, compressor, limiter, reverb, echo, pitch, channels, normalize, remove silence – see “Audio mode”</td></tr>
        </table>
        <h4>Green screen</h4><p>Put the green screen video on an <b>upper</b> track and the new background on a track below. Give the green screen clip the <b>Green screen</b> effect; use “Tolerance” and “Soft edge” to tune it.</p>
        <h4>Pixelating an area</h4><p>In the <b>Pixelate</b> effect tick “Area only” and set position/size. With keyframes you can even follow the object.</p>
        <p><b>Reverse</b> and <b>Reduce shake</b> are rendered once (progress bar). The rendered file is stored in <code>Documents/SlaxxCUT/Berechnet</code>.</p>`],
      ['trans', 'Transitions', `
        <h3>Transitions</h3>
        <p>Drag a transition onto the <b>cut between two clips</b> (a blue bar shows the spot) – or onto the start/end of a single clip. A small icon on the clip shows the transition: click opens its settings, right-click removes it.</p>
        <p>In the properties you choose the <b>direction</b> (e.g. wipe left/right/up/down/diagonal, circle open/close, spin clockwise/counter-clockwise) and the <b>duration</b>.</p>
        <p>Available: fade (black), flash (white), crossfade, wipe, slide in, push, circle, blinds, zoom (in/out), spin, whip pan, glitch, pixels, blur, diamond, clock, barn door, checkerboard, dots, tiles, wave, comb and drop. Transitions affect picture <b>and</b> sound.</p>`],
      ['text', 'Text & templates', `
        <h3>Text and templates</h3>
        <p>In the Effects tab under <b>Text effects</b> you find ready-made templates: <b>free text, lower third, info bar, title box, corner badge, news ticker</b> and <b>credits</b>. Just drag one onto a track above the video.</p>
        <p>In the properties you set text, second line, font, size, colors, alignment, shadow and outline. For the <b>background</b> choose a <b>color</b>, a <b>gradient</b> or your <b>own picture</b> (e.g. a PNG with your design), plus opacity, rounded corners, padding and an accent stripe.</p>
        <p><b>Animation</b>: fade, slide in from left/right/below or pop – separately for start and end.</p>
        <p><b>“Save as template”</b> turns your design into your own template (with a star in the Effects tab, right-click deletes it).</p>
        <p>In <b>credits</b> every line starting with <code>#</code> becomes a heading. Set the ticker speed under “Speed”. You can drag text directly in the edit preview.</p>`],
      ['audio', 'Audio mode', `
        <h3>Audio mode – SlaxxCUT as a sound editor</h3>
        <p>Switch between <b>Video</b> and <b>Audio</b> at the top right (or <kbd>Tab</kbd>). In audio mode SlaxxCUT shows a big <b>audio editor</b> instead of the previews, tracks become taller and the Effects tab only lists audio effects.</p>
        <h4>Editing</h4>
        <ul>
          <li>Select a clip in the timeline – its waveform appears large.</li>
          <li>Drag across the waveform = <b>select a range</b>.</li>
          <li>Tools for the selection: play (also looped), cut, copy, delete, silence, fade in/out, louder/quieter, normalize, reverse, apply any audio effect.</li>
          <li><b>Yellow line = volume envelope</b>: click the line to add a point, drag points, right-click deletes.</li>
          <li><b>Solo</b>: hear only this clip. <b>Level meter</b> at the top right.</li>
        </ul>
        <h4>Removing noise</h4>
        <p>Select a part where you hear <b>only noise</b> and click <b>Noise profile</b>. Then use the “Remove noise” effect in “Noise profile” mode. Or simply use “Automatic” mode.</p>
        <h4>Hum, filters &amp; more</h4>
        <p>Remove hum (50/60 Hz), high-/low-/band-pass, 3- or 10-band equalizer, compressor, limiter, reverb, echo, pitch, mono, swap channels, balance, de-esser, remove clicks, remove silence, normalize and match volume. Most are heard instantly; noise/clicks/de-esser/pitch are rendered briefly.</p>
        <h4>Recording</h4>
        <p>Choose a microphone and press the red button – the recording is placed at the playhead on the selected track. With “play along” the timeline runs while you record, ideal for voice-overs. Recordings are saved in <code>Documents/SlaxxCUT/Aufnahmen</code>.</p>`],
      ['export', 'Export', `
        <h3>Exporting</h3>
        <p>Click <b>Export</b> (<kbd>${modEn}</kbd>+<kbd>E</kbd>). At the top choose:</p>
        <ul>
          <li><b>Video</b>: MP4 or MOV (H.264 small, or ProRes 422 for pro editing), 16:9 / 9:16 / 1:1, 4K to 360p, quality, frames/second, encoder (graphics card)</li>
          <li><b>Audio only</b>: WAV (16/24 bit), MP3 (128–320 kbit/s), FLAC, OGG or M4A, 44.1 or 48 kHz</li>
          <li><b>Still frame</b>: full-quality PNG at the playhead (also via the picture icon in the edit preview)</li>
        </ul>
        <p><b>Range</b>: everything, only the selected clips or from the first to the last marker. Optionally the loudness is normalized for YouTube &amp; co.</p>`],
      ['keys', 'Keyboard shortcuts', `
        <h3>Keyboard shortcuts</h3>
        <table>
          <tr><td><kbd>Space</kbd></td><td>Play / pause</td></tr>
          <tr><td><kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd></td><td>Jump back / pause / play</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>One frame back / forward (with <kbd>Shift</kbd>: 1 second)</td></tr>
          <tr><td><kbd>Home</kbd> <kbd>End</kbd></td><td>Start / end</td></tr>
          <tr><td><kbd>I</kbd> <kbd>O</kbd></td><td>In/out point in the source preview</td></tr>
          <tr><td><kbd>V</kbd> / <kbd>C</kbd></td><td>Selection tool / blade</td></tr>
          <tr><td><kbd>S</kbd></td><td>Split at the playhead</td></tr>
          <tr><td><kbd>N</kbd></td><td>Magnet on/off</td></tr>
          <tr><td><kbd>Del</kbd> / <kbd>Shift</kbd>+<kbd>Del</kbd></td><td>Delete / delete and close gap</td></tr>
          <tr><td><kbd>${modEn}</kbd>+<kbd>Z</kbd> / <kbd>${modEn}</kbd>+<kbd>Y</kbd></td><td>Undo / redo</td></tr>
          <tr><td><kbd>${modEn}</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd></td><td>Copy / paste / duplicate</td></tr>
          <tr><td><kbd>${modEn}</kbd>+<kbd>A</kbd></td><td>Select all clips</td></tr>
          <tr><td><kbd>+</kbd> / <kbd>−</kbd> / <kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Zoom timeline / show all</td></tr>
          <tr><td><kbd>${modEn}</kbd>+<kbd>N</kbd> / <kbd>O</kbd> / <kbd>S</kbd> / <kbd>E</kbd></td><td>New / load / save / export</td></tr>
          <tr><td><kbd>M</kbd> / <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd></td><td>Set marker / jump to marker</td></tr>
          <tr><td><kbd>Tab</kbd></td><td>Video / audio mode</td></tr>
          <tr><td><kbd>F1</kbd></td><td>Help</td></tr>
        </table>`],
      ['project', 'Projects & backup', `
        <h3>Projects</h3>
        <p>A project is saved as a <code>.slaxxcut</code> file. It contains the timeline and the <b>paths</b> to your media files (not the files themselves). So don't move your videos – or relink them afterwards via right-click.</p>
        <p>SlaxxCUT automatically backs up your project every minute. After a crash you'll be offered to restore it on the next start.</p>`],
      ['keyframes', 'Keyframes', `
        <h3>Keyframes – animation over time</h3>
        <p>Size, position X/Y, rotation, opacity and volume can be animated:</p>
        <ol>
          <li>Set the playhead to the start, adjust the value, click <b>◆</b>.</li>
          <li>Move the playhead and change the value – a new keyframe is created automatically.</li>
        </ol>
        <p>◀ ▶ jump to the previous/next keyframe; ◆ on a keyframe removes it; right-click on ◆ deletes all. Keyframes appear as yellow diamonds on the clip.</p>`],
      ['markers', 'Markers', `
        <h3>Markers</h3>
        <p><kbd>M</kbd> or the marker button sets a marker at the playhead. Markers appear in the time ruler; click jumps there, double-click renames/colors, right-click deletes. <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> jumps to the previous/next marker. Clips snap to markers, and when exporting you can choose “first to last marker” as range.</p>`],
      ['faq', 'Problems & tips', `
        <h3>Frequently asked questions</h3>
        <h4>macOS: “SlaxxCUT is damaged” or “can't be opened”</h4>
        <p>The app is not notarized by Apple. Open Terminal and type:<br><code>xattr -cr /Applications/SlaxxCUT.app</code><br>Then the app starts normally.</p>
        <h4>Linux: the AppImage doesn't start</h4>
        <p>Make the file executable: <code>chmod +x SlaxxCUT-*.AppImage</code>. Some systems also need <code>libfuse2</code>.</p>
        <h4>The preview stutters</h4>
        <p>Set the quality at the top of the edit preview to “Half” or “Quarter”. The export is not affected.</p>
        <h4>Exporting takes long</h4>
        <p>Choose “Automatic” as the encoder – then the graphics card helps. Many effects at once and 4K need more time.</p>`]
    ]
  };

  function open(section) {
    const lang = SC.i18n.lang === 'de' ? 'de' : 'en';
    const pages = HELP[lang];
    const wrap = el('div', { class: 'help-wrap' });
    const nav = el('div', { class: 'help-nav' });
    const content = el('div', { class: 'help-content' });
    const show = (key) => {
      const pg = pages.find(p => p[0] === key) || pages[0];
      content.innerHTML = pg[2];
      content.scrollTop = 0;
      nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.k === pg[0]));
    };
    for (const [k, title] of pages) {
      const a = el('a', { text: title, dataset: { k } });
      a.addEventListener('click', () => show(k));
      nav.append(a);
    }
    wrap.append(nav, content);
    const m = modal({ title: SC.t('help.title'), body: wrap, cls: 'wide' });
    m.button(SC.t('help.close'), 'primary', () => m.close());
    show(section || 'start');
  }

  SC.help = { open };
})();
