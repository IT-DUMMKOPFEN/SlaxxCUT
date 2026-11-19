/* SlaxxCUT – application bootstrap: toolbar, shortcuts, project files, autosave. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn, toast } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S, edit = SC.edit;
  const t = (k) => SC.t(k);
  const isMac = window.api.platform === 'darwin';

  const app = {
    async init() {
      S.settings = await window.api.getSettings();
      this.applyTheme(S.settings.theme);
      SC.i18n.setLang(S.settings.lang || 'de');
      SC.ui.setTooltipDelay(S.settings.tooltipDelay != null ? S.settings.tooltipDelay : 2000);
      SC.program.quality = S.settings.previewQuality || 'half';
      S.snap = S.settings.snap !== false;
      SC.ui.initTooltips();
      this.buildTopbar();
      this.buildTabs();
      SC.media.build();
      SC.effectsPanel.build();
      SC.inspector.build();
      SC.source.build();
      SC.programMonitor.build();
      this.buildToolbar();
      SC.timeline.build();
      this.initSplitter();
      this.initKeys();
      SC.i18n.applyDom(document);
      store.initHistory();
      S.selectedTrack = S.project.tracks[0].id;
      S.project.name = t('app.untitled');
      S.project.tracks.forEach((tr, i) => { tr.name = t('track') + ' ' + (i + 1); });
      store.initHistory();
      store.on('dirty', () => this.updateTitle());
      store.on('project', () => this.updateTitle());
      store.on('selection', () => this.updateTools());
      this.updateTitle();
      // close handling
      window.api.onRequestClose(() => this.requestClose());
      window.api.onOpenProject((f) => this.openProject(f));
      if (window.api.onMenuCmd) window.api.onMenuCmd((name) => this.menuCmd(name));
      // prevent dropping files onto the window from navigating
      window.addEventListener('dragover', (e) => e.preventDefault());
      window.addEventListener('drop', (e) => e.preventDefault());
      // autosave
      setInterval(() => this.autosave(), 60000);
      const pending = await window.api.pendingOpen();
      if (pending) await this.openProject(pending);
      else await this.checkRestore();
    },

    /* ---------------- settings / theme / language ---------------- */
    saveSettings(patch) { Object.assign(S.settings, patch); window.api.setSettings(S.settings); },
    applyTheme(th) {
      document.documentElement.dataset.theme = th === 'light' ? 'light' : 'dark';
      if (this.themeBtn) this.themeBtn.innerHTML = SC.icon(th === 'light' ? 'moon' : 'sun');
      if (SC.timeline.ruler) SC.timeline.drawRuler();
    },
    setTheme(th) { S.settings.theme = th; this.applyTheme(th); this.saveSettings({ theme: th }); },
    setLang(l) {
      SC.i18n.setLang(l);
      this.saveSettings({ lang: l });
      if (this.langBtn) this.langBtn.querySelector('span').textContent = l.toUpperCase();
      SC.media.render(); SC.timeline.render(); SC.inspector.refresh(); SC.programMonitor.sync();
      this.updateTitle();
    },

    /* ---------------- top bar ---------------- */
    buildTopbar() {
      const r = $('#topbarRight');
      this.langBtn = el('button', { class: 'ibtn lang-btn', 'data-tip': 'tip.lang', type: 'button' });
      this.langBtn.innerHTML = SC.icon('globe') + '<span>' + (SC.i18n.lang || 'de').toUpperCase() + '</span>';
      this.langBtn.addEventListener('click', () => this.setLang(SC.i18n.lang === 'de' ? 'en' : 'de'));
      this.themeBtn = iconBtn(S.settings.theme === 'light' ? 'moon' : 'sun', 'tip.theme', () => this.setTheme(S.settings.theme === 'light' ? 'dark' : 'light'));
      r.append(this.langBtn, this.themeBtn,
        iconBtn('settings', 'tip.settings', () => SC.dialogs.settingsDialog()),
        iconBtn('help', 'tip.help', () => SC.help.open()),
        iconBtn('info', 'tip.info', () => SC.dialogs.infoDialog()));
    },
    buildTabs() {
      const tabs = $('#leftTabs');
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('.tab');
        if (!b) return;
        this.showTab(b.dataset.tab);
      });
    },
    showTab(name) {
      $('#leftTabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
      document.querySelectorAll('.tab-page').forEach(x => x.classList.toggle('active', x.dataset.page === name));
      SC.inspector.close();
    },
    updateTitle() {
      const name = S.project.name || t('app.untitled');
      $('#projName').textContent = name;
      $('#dirtyDot').classList.toggle('on', !!S.dirty);
      document.title = (S.dirty ? '• ' : '') + name + ' – SlaxxCUT';
      this.updateTools();
    },

    /* ---------------- toolbar ---------------- */
    buildToolbar() {
      const tb = $('#toolbar');
      const b = (icon, tip, cmd) => { const x = iconBtn(icon, tip, () => this.cmd(cmd)); x.dataset.cmd = cmd; return x; };
      this.toolSel = b('select', 'tool.select', 'tool-select');
      this.toolBlade = b('blade', 'tool.blade', 'tool-blade');
      this.snapBtn = b('magnet', 'tool.snap', 'snap');
      this.undoBtn = b('undo', 'tool.undo', 'undo');
      this.redoBtn = b('redo', 'tool.redo', 'redo');
      this.zoomSlider = el('input', { type: 'range', class: 'zoom-slider', min: 0, max: 1000, value: 500, 'data-tip': 'tool.zoomSlider' });
      this.zoomSlider.addEventListener('input', () => SC.timeline.setZoom(this.sliderToZoom(+this.zoomSlider.value)));
      store.on('zoom', () => { this.zoomSlider.value = this.zoomToSlider(S.zoom); });
      const big = (icon, key, tip, cmd, primary) => {
        const x = el('button', { class: 'btn' + (primary ? ' primary' : ''), 'data-tip': tip, type: 'button' });
        x.innerHTML = SC.icon(icon) + '<span data-i18n="' + key + '"></span>';
        x.addEventListener('click', () => this.cmd(cmd));
        return x;
      };
      tb.append(
        this.toolSel, this.toolBlade, el('div', { class: 'sep' }),
        b('split', 'tool.split', 'split'), b('trash', 'tool.delete', 'delete'), b('ripple', 'tool.ripple', 'ripple'), el('div', { class: 'sep' }),
        this.undoBtn, this.redoBtn, el('div', { class: 'sep' }),
        b('copy', 'tool.copy', 'copy'), b('paste', 'tool.paste', 'paste'), b('duplicate', 'tool.duplicate', 'duplicate'), el('div', { class: 'sep' }),
        b('detach', 'tool.detach', 'detach'), b('props', 'tool.props', 'props'), el('div', { class: 'sep' }),
        this.snapBtn, el('div', { class: 'sep' }),
        b('zoomOut', 'tool.zoomOut', 'zoom-out'), this.zoomSlider, b('zoomIn', 'tool.zoomIn', 'zoom-in'), b('zoomFit', 'tool.zoomFit', 'zoom-fit'), el('div', { class: 'sep' }),
        b('plus', 'tool.addTrack', 'add-track'), b('minus', 'tool.removeTrack', 'remove-track'),
        el('div', { class: 'spacer' }),
        big('newFile', 'btn.new', 'tool.new', 'new'),
        big('open', 'btn.open', 'tool.open', 'open'),
        big('save', 'btn.save', 'tool.save', 'save'),
        big('export', 'btn.export', 'tool.export', 'export', true)
      );
      this.zoomSlider.value = this.zoomToSlider(S.zoom);
      this.updateTools();
    },
    sliderToZoom(v) { return 2 * Math.pow(600, v / 1000); },
    zoomToSlider(z) { return Math.round(Math.log(z / 2) / Math.log(600) * 1000); },
    updateTools() {
      if (!this.toolSel) return;
      this.toolSel.classList.toggle('active', S.tool === 'select');
      this.toolBlade.classList.toggle('active', S.tool === 'blade');
      this.snapBtn.classList.toggle('active', !!S.snap);
      this.undoBtn.disabled = !store.canUndo();
      this.redoBtn.disabled = !store.canRedo();
      if (SC.timeline.scroll) SC.timeline.scroll.classList.toggle('blade', S.tool === 'blade');
      if (SC.timeline.bladeLine && S.tool !== 'blade') SC.timeline.bladeLine.style.display = 'none';
    },

    /* ---------------- commands ---------------- */
    cmd(name) {
      const sel = new Set(S.selection);
      switch (name) {
        case 'tool-select': S.tool = 'select'; break;
        case 'tool-blade': S.tool = S.tool === 'blade' ? 'select' : 'blade'; break;
        case 'snap': S.snap = !S.snap; this.saveSettings({ snap: S.snap }); break;
        case 'undo': store.undo(); break;
        case 'redo': store.redo(); break;
        case 'split': {
          let list = store.selectedClips().filter(c => S.playhead > c.start && S.playhead < core.clipEnd(c));
          if (!list.length) list = S.project.clips.filter(c => c.trackId === S.selectedTrack && S.playhead > c.start && S.playhead < core.clipEnd(c));
          if (!list.length) break;
          store.change('split', () => { for (const c of list) edit.split(c, S.playhead); });
          break;
        }
        case 'delete': if (sel.size) { store.change('delete', () => edit.remove(sel)); store.select([]); } else toast(t('toast.noSel')); break;
        case 'ripple': if (sel.size) { store.change('ripple', () => edit.rippleDelete(sel)); store.select([]); } else toast(t('toast.noSel')); break;
        case 'copy': if (sel.size) { edit.copy(sel); toast(t('toast.copied')); } break;
        case 'paste': { let ids = []; store.change('paste', () => { ids = edit.paste(S.playhead); }); store.select(ids); break; }
        case 'duplicate': if (sel.size) { let ids = []; store.change('dup', () => { ids = edit.duplicate(sel); }); store.select(ids); } break;
        case 'detach': {
          const list = store.selectedClips().filter(c => c.kind === 'video');
          if (!list.length) { toast(t('toast.noSel')); break; }
          let ok = false;
          store.change('detach', () => { for (const c of list) if (edit.detachAudio(c)) ok = true; });
          if (ok) toast(t('toast.detached'), 'ok');
          break;
        }
        case 'props': SC.inspector.toggle(); break;
        case 'zoom-in': SC.timeline.setZoom(S.zoom * 1.4); break;
        case 'zoom-out': SC.timeline.setZoom(S.zoom / 1.4); break;
        case 'zoom-fit': SC.timeline.zoomFit(); break;
        case 'add-track': SC.timeline.addTrack(); break;
        case 'remove-track': SC.timeline.removeTrack(); break;
        case 'new': this.newProject(); break;
        case 'open': this.openProject(); break;
        case 'save': this.saveProject(false); break;
        case 'save-as': this.saveProject(true); break;
        case 'export': SC.dialogs.exportDialog(); break;
        case 'select-all': store.select(S.project.clips.map(c => c.id)); break;
      }
      this.updateTools();
    },

    menuCmd(name) {
      const ae = document.activeElement;
      if (ae && /INPUT|TEXTAREA/.test(ae.tagName)) { document.execCommand(name); return; }
      if (document.querySelector('.modal-back')) return;
      switch (name) {
        case 'undo': case 'redo': this.cmd(name); break;
        case 'copy': this.cmd('copy'); break;
        case 'cut': this.cmd('copy'); this.cmd('delete'); break;
        case 'paste': this.cmd('paste'); break;
        case 'selectAll': this.cmd('select-all'); break;
      }
    },

    /* ---------------- keyboard ---------------- */
    initKeys() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.key !== 'Escape') return;
        if (document.querySelector('.modal-back')) return;
        const mod = isMac ? e.metaKey : e.ctrlKey;
        const k = e.key;
        const fps = S.project.settings.fps || 30;
        const src = SC.activeMonitor === 'source' && SC.source.media;
        let handled = true;
        if (mod && isMac && ['z', 'y', 'x', 'c', 'v', 'a'].includes(k.toLowerCase())) return; // handled by the macOS Edit menu
        if (mod) {
          switch (k.toLowerCase()) {
            case 'z': if (e.shiftKey) this.cmd('redo'); else this.cmd('undo'); break;
            case 'y': this.cmd('redo'); break;
            case 's': this.cmd(e.shiftKey ? 'save-as' : 'save'); break;
            case 'o': this.cmd('open'); break;
            case 'n': this.cmd('new'); break;
            case 'e': this.cmd('export'); break;
            case 'c': this.cmd('copy'); break;
            case 'v': this.cmd('paste'); break;
            case 'd': this.cmd('duplicate'); break;
            case 'a': this.cmd('select-all'); break;
            case '=': case '+': this.cmd('zoom-in'); break;
            case '-': this.cmd('zoom-out'); break;
            default: handled = false;
          }
        } else {
          switch (k) {
            case ' ': if (src) SC.source.toggle(); else { SC.source.pause(); SC.program.toggle(); } break;
            case 'k': case 'K': if (src) SC.source.pause(); else SC.program.pause(); break;
            case 'l': case 'L': if (src) SC.source.play(); else SC.program.play(); break;
            case 'j': case 'J': if (src) SC.source.seek(SC.source.cur() - 1); else SC.program.seek(S.playhead - 1); break;
            case 'ArrowLeft': if (src) SC.source.step(e.shiftKey ? -fps : -1); else { SC.program.pause(); SC.program.seek(S.playhead - (e.shiftKey ? 1 : 1 / fps)); } break;
            case 'ArrowRight': if (src) SC.source.step(e.shiftKey ? fps : 1); else { SC.program.pause(); SC.program.seek(S.playhead + (e.shiftKey ? 1 : 1 / fps)); } break;
            case 'Home': if (src) SC.source.seek(0); else SC.program.seek(0); break;
            case 'End': if (src) SC.source.seek(SC.source.duration()); else SC.program.seek(core.projectDuration(S.project)); break;
            case 'i': case 'I': SC.source.mark('in'); break;
            case 'o': case 'O': SC.source.mark('out'); break;
            case 'v': case 'V': this.cmd('tool-select'); break;
            case 'c': case 'C': this.cmd('tool-blade'); break;
            case 's': case 'S': this.cmd('split'); break;
            case 'n': case 'N': this.cmd('snap'); break;
            case 'Delete': case 'Backspace': this.cmd(e.shiftKey ? 'ripple' : 'delete'); break;
            case '+': case '=': this.cmd('zoom-in'); break;
            case '-': case '_': this.cmd('zoom-out'); break;
            case 'z': case 'Z': if (e.shiftKey) this.cmd('zoom-fit'); else handled = false; break;
            case 'F1': SC.help.open(); break;
            case 'Escape': SC.ui.closeContext(); if (S.tool === 'blade') this.cmd('tool-select'); else if (SC.inspector.isOpen()) SC.inspector.close(); else store.select([]); break;
            default: handled = false;
          }
        }
        if (handled) { e.preventDefault(); e.stopPropagation(); }
      });
    },

    /* ---------------- splitter ---------------- */
    initSplitter() {
      const sp = $('#hsplit'), tl = $('#timeline');
      if (S.settings.timelineHeight) tl.style.height = S.settings.timelineHeight + 'px';
      sp.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const y0 = e.clientY, h0 = tl.getBoundingClientRect().height;
        const mv = (ev) => {
          const h = Math.max(150, Math.min(window.innerHeight - 330, h0 - (ev.clientY - y0)));
          tl.style.height = h + 'px';
        };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); this.saveSettings({ timelineHeight: tl.getBoundingClientRect().height }); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
    },

    /* ---------------- project files ---------------- */
    serialize() {
      const p = JSON.parse(JSON.stringify(S.project));
      p.app = 'SlaxxCUT'; p.version = 1; p.savedAt = new Date().toISOString();
      return JSON.stringify(p, null, 1);
    },
    async confirmDiscard() {
      if (!S.dirty || !S.project.clips.length && !S.project.media.length) return true;
      const r = await SC.ui.ask(t('dlg.unsaved'), [t('dlg.save'), t('dlg.discard'), t('dlg.cancel')]);
      if (r === 0) return await this.saveProject(false);
      return r === 1;
    },
    async newProject() {
      if (!(await this.confirmDiscard())) return;
      SC.program.pause(); SC.program.releaseAll();
      const p = core.newProject();
      p.name = t('app.untitled');
      p.tracks.forEach((tr, i) => { tr.name = t('track') + ' ' + (i + 1); });
      S.runtime = {};
      store.setProject(p, null);
      window.api.autosaveClear();
    },
    async openProject(file) {
      if (!(await this.confirmDiscard())) return;
      if (!file) file = await window.api.openFile({ title: t('tool.open'), filters: [{ name: 'SlaxxCUT', extensions: ['slaxxcut'] }] });
      if (!file) return;
      try {
        const p = JSON.parse(await window.api.readFile(file));
        this.loadProjectObject(p, file);
      } catch (e) { toast(String(e.message || e), 'error'); }
    },
    loadProjectObject(p, file) {
      if (!p || !Array.isArray(p.tracks) || !Array.isArray(p.clips)) throw new Error('Invalid project file');
      p.media = p.media || [];
      p.settings = Object.assign({ aspect: '16:9', fps: 30 }, p.settings || {});
      if (!p.tracks.length) p.tracks.push(core.newTrack(0));
      p.tracks = p.tracks.slice(0, core.MAX_TRACKS);
      if (file) p.name = SC.ui.basename(file).replace(/\.slaxxcut$/i, '');
      SC.program.pause(); SC.program.releaseAll();
      S.runtime = {};
      store.setProject(p, file || null);
      SC.media.restoreRuntime();
      SC.timeline.zoomFit();
    },
    async saveProject(as) {
      let file = S.projectPath;
      if (as || !file) {
        const def = (S.project.name && S.project.name !== t('app.untitled') ? S.project.name : 'SlaxxCUT-Projekt') + '.slaxxcut';
        file = await window.api.saveFile({ title: t('tool.save'), defaultPath: def, filters: [{ name: 'SlaxxCUT', extensions: ['slaxxcut'] }] });
        if (!file) return false;
        if (!/\.slaxxcut$/i.test(file)) file += '.slaxxcut';
      }
      S.project.name = SC.ui.basename(file).replace(/\.slaxxcut$/i, '');
      try {
        await window.api.writeFile(file, this.serialize());
        S.projectPath = file; S.dirty = false;
        store.emit('dirty');
        window.api.autosaveClear();
        toast(t('toast.saved'), 'ok');
        return true;
      } catch (e) { toast(String(e.message || e), 'error'); return false; }
    },
    autosave() {
      if (!S.settings.autosave || !S.dirty || (!S.project.clips.length && !S.project.media.length)) return;
      const data = JSON.stringify({ path: S.projectPath, time: Date.now(), project: JSON.parse(this.serialize()) });
      window.api.autosaveWrite(data);
    },
    async checkRestore() {
      const raw = await window.api.autosaveRead();
      if (!raw) return;
      let o; try { o = JSON.parse(raw); } catch (e) { window.api.autosaveClear(); return; }
      if (!o || !o.project || (!o.project.clips.length && !o.project.media.length)) { window.api.autosaveClear(); return; }
      const r = await SC.ui.ask(t('dlg.restore') + '\n' + new Date(o.time).toLocaleString(), [t('dlg.restoreYes'), t('dlg.restoreNo')]);
      if (r === 0) {
        this.loadProjectObject(o.project, null);
        S.projectPath = o.path || null;
        if (o.path) S.project.name = SC.ui.basename(o.path).replace(/\.slaxxcut$/i, '');
        S.dirty = true; store.emit('dirty');
      } else window.api.autosaveClear();
    },
    async requestClose() {
      if (S.dirty && (S.project.clips.length || S.project.media.length)) {
        const r = await SC.ui.ask(t('dlg.unsaved'), [t('dlg.save'), t('dlg.discard'), t('dlg.cancel')]);
        if (r === 2 || r === -1) return;
        if (r === 0 && !(await this.saveProject(false))) return;
      }
      await window.api.autosaveClear();
      window.api.closeNow();
    }
  };

  SC.app = app;
  window.addEventListener('DOMContentLoaded', () => {
    app.init().catch(e => { console.error(e); toast('Startup error: ' + e.message, 'error'); });
  });
})();
