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
        <p>Über jedem Knopf erscheint nach kurzer Zeit (Standard: 2 Sekunden) ein Hinweis, was er macht. Die Zeit kannst du in den <b>Einstellungen</b> ändern.</p>`],
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
        <p>Ziehe einen Effekt aus dem Reiter <b>Effekte</b> auf einen Clip in der Timeline (oder Clip auswählen und den Effekt anklicken). Die Einstellungen öffnen sich links in den Eigenschaften. Mehrere Effekte werden in der angezeigten Reihenfolge angewendet.</p>
        <table>
          <tr><td><b>Bewegung</b></td><td>Zoom In/Out, Pan &amp; Scan, Kamerawackeln, Parallax, Zeitlupe, Zeitraffer</td></tr>
          <tr><td><b>Farbe</b></td><td>Schwarz-Weiß, Sepia, Vintage, Film Look, Color Grading (inkl. LUT-Datei .cube), Duotone, HDR-Look</td></tr>
          <tr><td><b>Ton</b></td><td>Ton trennen, Lauter, Leiser, Lautstärke angleichen, Einheitliche Lautstärke</td></tr>
          <tr><td><b>Text</b></td><td>Text einblenden – in eine Spur ziehen</td></tr>
        </table>
        <p><b>Parallax-Tipp:</b> Lege den Hintergrund auf eine untere Spur und ein freigestelltes Bild (PNG mit Transparenz) auf eine Spur darüber. Gib beiden den Parallax-Effekt mit unterschiedlicher Tiefe – der Vordergrund mit mehr Tiefe bewegt sich schneller.</p>`],
      ['trans', 'Übergänge', `
        <h3>Übergänge</h3>
        <p>Ziehe einen Übergang auf den <b>Schnitt zwischen zwei Clips</b> (ein blauer Balken zeigt die Stelle) – oder auf den Anfang bzw. das Ende eines einzelnen Clips. Ein kleines Symbol am Clip zeigt den Übergang. Klick darauf öffnet die Einstellungen (Dauer), Rechtsklick entfernt ihn.</p>
        <p>Verfügbar: Ein-/Ausblenden (über Schwarz), Überblendung, Wischen, Zoom, Drehen, Glitch und Whip Pan. Übergänge wirken auf Bild <b>und</b> Ton.</p>`],
      ['text', 'Text', `
        <h3>Text einblenden</h3>
        <p>Ziehe <b>Text einblenden</b> (Reiter Effekte) in eine Spur – am besten über dem Video. In den Eigenschaften gibst du den Text ein und wählst Schrift, Größe, Farbe, Fett/Kursiv, Ausrichtung, Schatten (Richtung, Weichheit, Farbe), Kontur und eine Hintergrund-Box.</p>
        <p>Die Position wählst du über das 9-Punkte-Raster – oder du <b>ziehst den Text direkt in der Schnitt-Vorschau</b> mit der Maus an die gewünschte Stelle.</p>`],
      ['audio', 'Ton', `
        <h3>Ton bearbeiten</h3>
        <ul>
          <li><b>Ton trennen:</b> legt den Ton eines Videos als eigenen Audio-Clip auf eine freie Spur – so kannst du ihn unabhängig schneiden.</li>
          <li><b>Lauter / Leiser:</b> ±3 dB pro Klick. Genaue Werte in den Eigenschaften.</li>
          <li><b>Lautstärke angleichen:</b> misst die Lautheit der ausgewählten Clips (oder aller) und gleicht sie an (−16 LUFS).</li>
          <li><b>Einheitliche Lautstärke:</b> gleicht leise und laute Stellen innerhalb eines Clips aus.</li>
          <li>Beim Export kannst du die Gesamt-Lautheit für YouTube &amp; Co. normalisieren (−14 LUFS).</li>
        </ul>`],
      ['export', 'Export', `
        <h3>Video exportieren</h3>
        <p>Klicke auf <b>Export</b> (<kbd>${mod}</kbd>+<kbd>E</kbd>). Wähle:</p>
        <ul>
          <li><b>Format:</b> 16:9 (YouTube), 9:16 (TikTok/Shorts/Reels) oder 1:1</li>
          <li><b>Größe:</b> 4K, 2K, 1080p, 720p, 480p, 360p</li>
          <li><b>Qualität:</b> Niedrig bis Maximal (beeinflusst die Dateigröße)</li>
          <li><b>Encoder:</b> „Automatisch“ nutzt die Grafikkarte (schnell), falls verfügbar. „Software x264“ liefert die beste Qualität.</li>
        </ul>
        <p>Das Ergebnis ist immer eine MP4-Datei (H.264 + AAC), die überall abspielbar ist.</p>`],
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
          <tr><td><kbd>F1</kbd></td><td>Hilfe</td></tr>
        </table>`],
      ['project', 'Projekte & Sicherung', `
        <h3>Projekte</h3>
        <p>Ein Projekt wird als <code>.slaxxcut</code>-Datei gespeichert. Sie enthält die Timeline und die <b>Pfade</b> zu deinen Mediendateien (nicht die Dateien selbst). Verschiebe deine Videos daher nicht – oder verknüpfe sie danach per Rechtsklick neu.</p>
        <p>SlaxxCUT sichert dein Projekt jede Minute automatisch. Nach einem Absturz wird dir beim nächsten Start die Wiederherstellung angeboten.</p>`],
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
        <p>Hover over any button and a hint appears after a short time (default: 2 seconds). You can change the delay in the <b>settings</b>.</p>`],
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
        <p>Drag an effect from the <b>Effects</b> tab onto a clip in the timeline (or select a clip and click the effect). Its settings open on the left in the properties. Several effects are applied in the order shown.</p>
        <table>
          <tr><td><b>Motion</b></td><td>Zoom in/out, Pan &amp; Scan, camera shake, parallax, slow motion, timelapse</td></tr>
          <tr><td><b>Color</b></td><td>Black &amp; white, sepia, vintage, film look, color grading (incl. .cube LUT file), duotone, HDR look</td></tr>
          <tr><td><b>Audio</b></td><td>Detach audio, louder, quieter, match volume, even loudness</td></tr>
          <tr><td><b>Text</b></td><td>Text overlay – drag it into a track</td></tr>
        </table>
        <p><b>Parallax tip:</b> put the background on a lower track and a cut-out picture (PNG with transparency) on a track above. Give both the parallax effect with different depths – the foreground with more depth moves faster.</p>`],
      ['trans', 'Transitions', `
        <h3>Transitions</h3>
        <p>Drag a transition onto the <b>cut between two clips</b> (a blue bar shows the spot) – or onto the start or end of a single clip. A small icon on the clip shows the transition. Click it to open its settings (duration), right-click to remove it.</p>
        <p>Available: fade in/out (through black), crossfade, wipe, zoom, spin, glitch and whip pan. Transitions affect picture <b>and</b> sound.</p>`],
      ['text', 'Text', `
        <h3>Text overlay</h3>
        <p>Drag <b>Text overlay</b> (Effects tab) into a track – ideally above the video. In the properties you type the text and choose font, size, color, bold/italic, alignment, shadow (direction, softness, color), outline and a background box.</p>
        <p>Choose the position with the 9-dot grid – or <b>drag the text directly in the edit preview</b> with the mouse.</p>`],
      ['audio', 'Audio', `
        <h3>Editing audio</h3>
        <ul>
          <li><b>Detach audio:</b> puts the sound of a video on a free track as its own audio clip – so you can cut it independently.</li>
          <li><b>Louder / quieter:</b> ±3 dB per click. Exact values in the properties.</li>
          <li><b>Match volume:</b> measures the loudness of the selected clips (or all) and matches them (−16 LUFS).</li>
          <li><b>Even loudness:</b> evens out quiet and loud parts within a clip.</li>
          <li>When exporting you can normalize the overall loudness for YouTube &amp; co. (−14 LUFS).</li>
        </ul>`],
      ['export', 'Export', `
        <h3>Exporting a video</h3>
        <p>Click <b>Export</b> (<kbd>${modEn}</kbd>+<kbd>E</kbd>) and choose:</p>
        <ul>
          <li><b>Format:</b> 16:9 (YouTube), 9:16 (TikTok/Shorts/Reels) or 1:1</li>
          <li><b>Size:</b> 4K, 2K, 1080p, 720p, 480p, 360p</li>
          <li><b>Quality:</b> low to maximum (affects the file size)</li>
          <li><b>Encoder:</b> “Automatic” uses the graphics card (fast) if available. “Software x264” gives the best quality.</li>
        </ul>
        <p>The result is always an MP4 file (H.264 + AAC) that plays everywhere.</p>`],
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
          <tr><td><kbd>F1</kbd></td><td>Help</td></tr>
        </table>`],
      ['project', 'Projects & backup', `
        <h3>Projects</h3>
        <p>A project is saved as a <code>.slaxxcut</code> file. It contains the timeline and the <b>paths</b> to your media files (not the files themselves). So don't move your videos – or relink them afterwards via right-click.</p>
        <p>SlaxxCUT automatically backs up your project every minute. After a crash you'll be offered to restore it on the next start.</p>`],
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
