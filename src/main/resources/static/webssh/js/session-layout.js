/**
 * Win11 风格布局选择器 + Snap Assist
 */
(function (w) {
    var TEMPLATES = {
        'two-left-right': {
            label: '左右',
            cells: ['left', 'right'],
            glyph: 'cols-2'
        },
        'quad': {
            label: '四格',
            cells: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            glyph: 'quad'
        },
        'three-left-stack': {
            label: '左一右二',
            cells: ['left', 'top-right', 'bottom-right'],
            glyph: 'left-stack'
        }
    };

    var SLOT_TO_TEMPLATE = {
        left: 'two-left-right',
        right: 'two-left-right',
        'top-left': 'quad',
        'top-right': 'quad',
        'bottom-left': 'quad',
        'bottom-right': 'quad'
    };

    var pickerTimer = null;
    var pickerWin = null;
    var pickerAnchor = null;
    var overPicker = false;
    var overMaxBtn = false;

    var assistActive = false;
    var assistTemplateId = null;
    var assistEmptySlots = [];
    var suppressAssist = false;
    var pendingTemplateId = null;

    var STORAGE_KEY = 'webssh.sessionLayout.v1';
    var currentTemplate = null;
    var saveTimer = null;
    var restoring = false;
    var restoreStarted = false;

    function $picker() {
        return $('#desktopLayoutPicker');
    }

    function $assist() {
        return $('#desktopSnapAssist');
    }

    function $allWindows() {
        return $('#desktopSessionLayer .session-win, #desktopDockStrip .session-win');
    }

    function getLayerRect() {
        var host = document.getElementById('desktopSessionLayer');
        if (!host) {
            return null;
        }
        return {
            left: 0,
            top: 0,
            width: host.clientWidth,
            height: host.clientHeight
        };
    }

    function rectForSnapSlot(slot, layerRect) {
        if (!layerRect || !slot) {
            return null;
        }
        var w0 = layerRect.width;
        var h0 = layerRect.height;
        var hw = Math.floor(w0 / 2);
        var hh = Math.floor(h0 / 2);
        switch (slot) {
            case 'left':
                return { left: 0, top: 0, width: hw, height: h0 };
            case 'right':
                return { left: w0 - hw, top: 0, width: hw, height: h0 };
            case 'top-left':
                return { left: 0, top: 0, width: hw, height: hh };
            case 'top-right':
                return { left: w0 - hw, top: 0, width: hw, height: hh };
            case 'bottom-left':
                return { left: 0, top: h0 - hh, width: hw, height: hh };
            case 'bottom-right':
                return { left: w0 - hw, top: h0 - hh, width: hw, height: hh };
            default:
                return null;
        }
    }

    function escapeHtml(s) {
        return $('<div>').text(s == null ? '' : String(s)).html();
    }

    function buildPickerHtml() {
        var html = '<div class="desktop-layout-picker-inner">';
        Object.keys(TEMPLATES).forEach(function (id) {
            var tpl = TEMPLATES[id];
            html += '<div class="desktop-layout-tpl" data-template="' + id + '" title="' + escapeHtml(tpl.label) + '">';
            html += '<div class="layout-tpl-label">' + escapeHtml(tpl.label) + '</div>';
            html += '<div class="layout-tpl-cells layout-tpl-cells-' + escapeHtml(tpl.glyph) + '">';
            tpl.cells.forEach(function (slot, idx) {
                html += '<button type="button" class="layout-cell" data-template="' + id
                    + '" data-cell-index="' + idx + '" data-slot="' + slot + '" title="'
                    + escapeHtml(tpl.label + ' · ' + slot) + '"></button>';
            });
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    function hidePicker() {
        if (pickerTimer) {
            clearTimeout(pickerTimer);
            pickerTimer = null;
        }
        var $p = $picker();
        if ($p.length) {
            $p.css('display', 'none').empty();
        }
        pickerWin = null;
        pickerAnchor = null;
        overPicker = false;
    }

    function positionPicker($anchorBtn) {
        var $p = $picker();
        var $tab = $('#tabPanes');
        if (!$p.length || !$anchorBtn || !$anchorBtn.length || !$tab.length) {
            return;
        }
        var btn = $anchorBtn[0].getBoundingClientRect();
        var tab = $tab[0].getBoundingClientRect();
        var left = btn.left - tab.left + btn.width / 2 - 140;
        var top = btn.bottom - tab.top + 6;
        left = Math.max(8, Math.min(left, tab.width - 290));
        $p.css({
            display: 'block',
            left: left + 'px',
            top: top + 'px'
        });
    }

    function showPicker($anchorBtn, $win) {
        if (!$anchorBtn || !$anchorBtn.length || !$win || !$win.length) {
            return;
        }
        if ($win.hasClass('docked')) {
            return;
        }
        var $p = $picker();
        if (!$p.length) {
            return;
        }
        pickerWin = $win;
        pickerAnchor = $anchorBtn;
        $p.html(buildPickerHtml());
        positionPicker($anchorBtn);
        $p.off('mouseenter.layout mouseleave.layout click.layout');
        $p.on('mouseenter.layout', function () {
            overPicker = true;
        });
        $p.on('mouseleave.layout', function () {
            overPicker = false;
            scheduleHidePicker();
        });
        $p.on('click.layout', '.layout-cell', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var $cell = $(this);
            var templateId = $cell.attr('data-template');
            var cellIndex = parseInt($cell.attr('data-cell-index'), 10) || 0;
            var $target = pickerWin;
            hidePicker();
            if ($target && $target.length) {
                applyTemplate($target, templateId, cellIndex);
            }
        });
    }

    function scheduleHidePicker() {
        if (pickerTimer) {
            clearTimeout(pickerTimer);
        }
        pickerTimer = setTimeout(function () {
            if (!overPicker && !overMaxBtn) {
                hidePicker();
            }
        }, 180);
    }

    function occupiedSlotsForTemplate(templateId) {
        var tpl = TEMPLATES[templateId];
        var occupied = [];
        if (!tpl) {
            return occupied;
        }
        var cellSet = {};
        tpl.cells.forEach(function (c) {
            cellSet[c] = true;
        });
        $allWindows().each(function () {
            var $win = $(this);
            if ($win.hasClass('minimized') || !$win.hasClass('snapped')) {
                return;
            }
            var slot = $win.data('snap-slot');
            if (slot && cellSet[slot] && occupied.indexOf(slot) < 0) {
                occupied.push(slot);
            }
        });
        return occupied;
    }

    function emptySlotsForTemplate(templateId, occupiedSlots) {
        var tpl = TEMPLATES[templateId];
        if (!tpl) {
            return [];
        }
        var occ = occupiedSlots || [];
        return tpl.cells.filter(function (c) {
            return occ.indexOf(c) < 0;
        });
    }

    function candidateWindows(excludeSlots) {
        var exclude = excludeSlots || {};
        var list = [];
        $allWindows().each(function () {
            var $win = $(this);
            if ($win.hasClass('minimized')) {
                return;
            }
            var slot = $win.data('snap-slot');
            if ($win.hasClass('snapped') && slot && exclude[slot]) {
                return;
            }
            list.push($win);
        });
        return list;
    }

    function cancelAssist() {
        assistActive = false;
        assistTemplateId = null;
        assistEmptySlots = [];
        var $a = $assist();
        if ($a.length) {
            $a.css('display', 'none').empty().off('click.assist');
        }
        $(document).off('keydown.snapAssist');
        $(document).off('mousedown.snapAssist');
    }

    function positionAssistOverlay(slot) {
        var $a = $assist();
        var $tab = $('#tabPanes');
        var layer = document.getElementById('desktopSessionLayer');
        var layerRect = getLayerRect();
        var slotRect = rectForSnapSlot(slot, layerRect);
        if (!$a.length || !$tab.length || !layer || !slotRect) {
            return;
        }
        var tabR = $tab[0].getBoundingClientRect();
        var layerR = layer.getBoundingClientRect();
        $a.css({
            display: 'block',
            left: (layerR.left - tabR.left + slotRect.left) + 'px',
            top: (layerR.top - tabR.top + slotRect.top) + 'px',
            width: slotRect.width + 'px',
            height: slotRect.height + 'px'
        });
    }

    function renderAssist() {
        if (!assistActive || !assistEmptySlots.length) {
            cancelAssist();
            return;
        }
        var occupied = occupiedSlotsForTemplate(assistTemplateId);
        var occMap = {};
        occupied.forEach(function (s) {
            occMap[s] = true;
        });
        var candidates = candidateWindows(occMap).filter(function ($win) {
            // Prefer non-snapped into this template; allow floated windows
            if ($win.hasClass('snapped')) {
                var slot = $win.data('snap-slot');
                return !occMap[slot];
            }
            return true;
        });
        if (!candidates.length) {
            cancelAssist();
            return;
        }
        var slot = assistEmptySlots[0];
        positionAssistOverlay(slot);
        var html = '<div class="desktop-snap-assist-inner"><div class="desktop-snap-assist-title">选择窗口</div><div class="desktop-snap-assist-list">';
        candidates.forEach(function ($win, idx) {
            var title = $win.data('title') || $win.find('.session-win-title-text').text() || '窗口';
            var kind = $win.attr('data-kind') || $win.data('kind') || 'ssh';
            var wid = $win.data('win-id') || '';
            html += '<button type="button" class="desktop-snap-assist-item" data-cand-idx="' + idx
                + '" data-win-id="' + escapeHtml(wid) + '">'
                + '<span class="assist-kind">' + (kind === 'sftp' ? '文件' : '终端') + '</span>'
                + '<span class="assist-title">' + escapeHtml(title) + '</span></button>';
        });
        html += '</div></div>';
        var $a = $assist();
        $a.html(html);
        $a.off('click.assist').on('click.assist', '.desktop-snap-assist-item', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt($(this).attr('data-cand-idx'), 10);
            var $cand = candidates[idx];
            if (!$cand || !$cand.length || !assistEmptySlots.length) {
                return;
            }
            var fillSlot = assistEmptySlots[0];
            suppressAssist = true;
            if (w.SessionWindows && typeof w.SessionWindows.snap === 'function') {
                w.SessionWindows.snap($cand, fillSlot);
            }
            suppressAssist = false;
            assistEmptySlots = emptySlotsForTemplate(assistTemplateId, occupiedSlotsForTemplate(assistTemplateId));
            if (assistEmptySlots.length && candidateWindows(occupiedSlotsForTemplate(assistTemplateId).reduce(function (m, s) {
                m[s] = true;
                return m;
            }, {})).length) {
                renderAssist();
            } else {
                cancelAssist();
            }
        });
        $(document).off('keydown.snapAssist').on('keydown.snapAssist', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                cancelAssist();
            }
        });
        $(document).off('mousedown.snapAssist').on('mousedown.snapAssist', function (e) {
            if (!assistActive) {
                return;
            }
            var $t = $(e.target);
            if ($t.closest('#desktopSnapAssist').length || $t.closest('.session-win-title').length) {
                return;
            }
            // blank click cancels
            if (!$t.closest('.desktop-snap-assist-item').length && !$t.closest('#desktopSnapAssist').length) {
                cancelAssist();
            }
        });
    }

    /**
     * @param {string[]} occupiedSlots slots already filled in the template
     * @param {string} templateId
     */
    function startAssist(occupiedSlots, templateId) {
        var tpl = TEMPLATES[templateId];
        if (!tpl) {
            cancelAssist();
            return;
        }
        var empty = emptySlotsForTemplate(templateId, occupiedSlots || []);
        if (!empty.length) {
            cancelAssist();
            return;
        }
        var occMap = {};
        (occupiedSlots || []).forEach(function (s) {
            occMap[s] = true;
        });
        if (!candidateWindows(occMap).length) {
            cancelAssist();
            return;
        }
        assistActive = true;
        assistTemplateId = templateId;
        assistEmptySlots = empty;
        renderAssist();
    }

    function applyTemplate($win, templateId, cellIndex) {
        var tpl = TEMPLATES[templateId];
        if (!tpl || !$win || !$win.length) {
            return;
        }
        var idx = cellIndex == null ? 0 : cellIndex;
        if (idx < 0 || idx >= tpl.cells.length) {
            return;
        }
        var slot = tpl.cells[idx];
        currentTemplate = templateId;
        pendingTemplateId = templateId;
        if (w.SessionWindows && typeof w.SessionWindows.snap === 'function') {
            w.SessionWindows.snap($win, slot);
        }
        // onAfterSnap handles Assist via pendingTemplateId
    }

    function parsePx(v) {
        if (v == null || v === '') {
            return 0;
        }
        if (typeof v === 'number') {
            return v;
        }
        var n = parseFloat(String(v).replace('px', ''));
        return isNaN(n) ? 0 : n;
    }

    function windowMode($w) {
        if ($w.hasClass('docked')) {
            return 'dock';
        }
        if ($w.hasClass('snapped')) {
            return 'snap';
        }
        return 'float';
    }

    /**
     * Serialize one .session-win — layout only (never passwords).
     */
    function serializeWindow($w) {
        var kind = $w.attr('data-kind') || $w.data('kind') || 'ssh';
        var mode = windowMode($w);
        var z = parseInt($w.css('z-index'), 10);
        if (isNaN(z)) {
            z = 0;
        }
        var geom = {
            left: parsePx($w.css('left')),
            top: parsePx($w.css('top')),
            width: parsePx($w.css('width')) || $w.outerWidth() || 0,
            height: parsePx($w.css('height')) || $w.outerHeight() || 0
        };
        var dockWidth = $w.data('dock-width');
        if (dockWidth != null) {
            dockWidth = Number(dockWidth);
            if (isNaN(dockWidth)) {
                dockWidth = null;
            }
        } else {
            dockWidth = null;
        }
        var snapSlot = $w.data('snap-slot') || null;
        return {
            sessionId: String($w.data('session-id') || $w.attr('data-session-id') || ''),
            kind: kind === 'sftp' ? 'sftp' : 'ssh',
            mode: mode,
            title: String($w.data('title') || $w.find('.session-win-title-text').text() || ''),
            geometry: geom,
            dockWidth: mode === 'dock' ? (dockWidth != null ? dockWidth : geom.width || null) : dockWidth,
            snapSlot: mode === 'snap' ? snapSlot : null,
            z: z
        };
    }

    /** Immediate persist; cancels any pending debounced save. */
    function saveNow() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        if (restoring) {
            return;
        }
        try {
            var windows = [];
            $allWindows().each(function () {
                windows.push(serializeWindow($(this)));
            });
            w.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 1,
                windows: windows,
                layoutTemplate: currentTemplate || null
            }));
        } catch (e) { /* quota / private mode */ }
    }

    /** Debounced (~200ms) persist of current desktop session layout. */
    function save() {
        if (restoring) {
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(function () {
            saveTimer = null;
            saveNow();
        }, 200);
    }

    function load() {
        try {
            var raw = w.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return null;
            }
            var data = JSON.parse(raw);
            if (!data || data.version !== 1 || !Array.isArray(data.windows)) {
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    /**
     * Restore saved layout once per page load.
     * @param {{ openSsh: Function, openSftp: Function, resolveSession: Function }} opts
     */
    function restore(opts) {
        if (restoreStarted) {
            return $.Deferred().resolve().promise();
        }
        restoreStarted = true;
        opts = opts || {};
        var data = load();
        if (!data || !data.windows || !data.windows.length) {
            return $.Deferred().resolve().promise();
        }
        if (data.layoutTemplate) {
            currentTemplate = data.layoutTemplate;
        }
        restoring = true;
        suppressAssist = true;
        var finish = function () {
            restoring = false;
            suppressAssist = false;
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            saveNow();
        };
        if (w.SessionWindows && typeof w.SessionWindows.restoreLayout === 'function') {
            return $.when(w.SessionWindows.restoreLayout(data.windows, opts)).always(finish);
        }
        finish();
        return $.Deferred().resolve().promise();
    }

    function onAfterSnap($win, slot) {
        if (restoring || suppressAssist) {
            return;
        }
        var templateId = pendingTemplateId || SLOT_TO_TEMPLATE[slot] || null;
        pendingTemplateId = null;
        if (!templateId || !TEMPLATES[templateId]) {
            return;
        }
        // three-left-stack: only when applying that template (pending), not from bare edge snap
        if (!TEMPLATES[templateId].cells || TEMPLATES[templateId].cells.indexOf(slot) < 0) {
            return;
        }
        var occupied = occupiedSlotsForTemplate(templateId);
        if (occupied.indexOf(slot) < 0) {
            occupied.push(slot);
        }
        startAssist(occupied, templateId);
    }

    // Expose hover helpers for SessionWindows chrome binding
    function onMaxEnter($btn, $win) {
        overMaxBtn = true;
        if (pickerTimer) {
            clearTimeout(pickerTimer);
            pickerTimer = null;
        }
        pickerTimer = setTimeout(function () {
            if (overMaxBtn) {
                showPicker($btn, $win);
            }
        }, 300);
    }

    function onMaxLeave() {
        overMaxBtn = false;
        scheduleHidePicker();
    }

    w.SessionLayout = {
        showPicker: showPicker,
        hidePicker: hidePicker,
        applyTemplate: applyTemplate,
        startAssist: startAssist,
        cancelAssist: cancelAssist,
        onAfterSnap: onAfterSnap,
        onMaxEnter: onMaxEnter,
        onMaxLeave: onMaxLeave,
        save: save,
        saveNow: saveNow,
        load: load,
        restore: restore,
        STORAGE_KEY: STORAGE_KEY,
        TEMPLATES: TEMPLATES
    };

    $(w).on('beforeunload.sessionLayout', function () {
        saveNow();
    });
})(window);
