/**
 * 桌面会话浮动窗：SSH / SFTP + 左侧多分栏停靠 + 共享任务栏
 */
(function (w) {
    var zCounter = 3000;
    var winSeq = 0;
    var DEFAULT_DOCK_W = 420;
    var MIN_DOCK_W = 280;
    var DOCK_BAR_W = 4;
    var SNAP_EDGE = 24;
    var SNAP_UNSnap_THRESHOLD = 24;
    var DOCK_UNDOCK_THRESHOLD = 40;

    var FOLDER_ICO =
        '<svg class="fw-folder-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
        '<path fill="#E8B84A" d="M1.5 3.5h4.2l1.2 1.3H14.5v8.2a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z"/>' +
        '<path fill="#F5D76E" d="M2 5.2h12v7.3a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V5.2z"/>' +
        '</svg>';

    var TERM_ICO =
        '<svg class="sw-term-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
        '<rect x="1" y="2" width="14" height="12" rx="1.5" fill="#1e1e1e" stroke="#6c757d" stroke-width="1"/>' +
        '<path fill="#7dcea0" d="M3.2 5.2l2.4 2.3-2.4 2.3.7.7 3.1-3-3.1-3-.7.7z"/>' +
        '<path fill="#adb5bd" d="M7.5 10.2h5v1.2h-5z"/>' +
        '</svg>';

    function $layer() {
        return $('#desktopSessionLayer');
    }

    function $taskbar() {
        return $('#desktopTaskbar');
    }

    function $dockStrip() {
        return $('#desktopDockStrip');
    }

    function $allWindows() {
        return $layer().find('.session-win').add($dockStrip().find('.session-win'));
    }

    function cascadeOffset(n) {
        return { left: 36 + (n % 6) * 28, top: 28 + (n % 6) * 24 };
    }

    function iconForKind(kind) {
        return kind === 'sftp' ? FOLDER_ICO : TERM_ICO;
    }

    function defaultTitle(kind) {
        return kind === 'sftp' ? '文件资源管理器' : '终端';
    }

    function resolveSrc(opts) {
        if (opts.src) {
            return opts.src;
        }
        var kind = opts.kind || 'ssh';
        var q = opts.query || '';
        var port = opts.port;
        if (port == null && opts.session && opts.session.port != null) {
            port = opts.session.port;
        }
        if (port == null) {
            port = w.currentSessionPort || 22;
        }
        var tid = opts.tagId;
        if (tid == null || tid === '') {
            try {
                tid = w.localStorage.getItem('tagId' + port) || '';
            } catch (e) {
                tid = '';
            }
        }
        var sep = q.indexOf('?') >= 0 ? '&' : '?';
        if (kind === 'sftp') {
            var url = 'sftp.html' + q + sep + 'folderWin=1&v=37';
            if (tid) {
                url += '&tagId=' + encodeURIComponent(tid);
            }
            try {
                var cache = w.__websshShellPwdCache;
                if (cache && cache.path) {
                    url += '&cwd=' + encodeURIComponent(cache.path);
                }
            } catch (e2) { /* ignore */ }
            return url;
        }
        var sshUrl = 'ssh.html' + q;
        if (tid) {
            var ssep = sshUrl.indexOf('?') >= 0 ? '&' : '?';
            sshUrl += ssep + 'tagId=' + encodeURIComponent(tid);
        }
        return sshUrl;
    }

    function syncHostSessionsClass(has) {
        // Only #tabPanes.has-desktop-sessions is used by CSS (layer bottom inset for taskbar)
        $('#tabPanes').toggleClass('has-desktop-sessions', !!has);
    }

    function $snapPreview() {
        return $('#desktopSnapPreview');
    }

    function getSnapHitBounds() {
        var layer = $layer()[0];
        if (!layer) {
            return null;
        }
        var r = layer.getBoundingClientRect();
        return {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom
        };
    }

    function getSnapLayerRect() {
        var host = $layer()[0];
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

    function hitSnapZone(clientX, clientY, bounds) {
        if (!bounds) {
            return null;
        }
        var edge = SNAP_EDGE;
        var nearL = clientX <= bounds.left + edge;
        var nearR = clientX >= bounds.right - edge;
        var nearT = clientY <= bounds.top + edge;
        var nearB = clientY >= bounds.bottom - edge;
        if (nearL && nearT) {
            return 'top-left';
        }
        if (nearR && nearT) {
            return 'top-right';
        }
        if (nearL && nearB) {
            return 'bottom-left';
        }
        if (nearR && nearB) {
            return 'bottom-right';
        }
        if (nearL) {
            return 'left';
        }
        if (nearR) {
            return 'right';
        }
        if (nearT) {
            return 'top';
        }
        if (nearB) {
            return 'bottom';
        }
        return null;
    }

    function rectForSnapSlot(slot, layerRect) {
        if (!layerRect || !slot) {
            return null;
        }
        var w = layerRect.width;
        var h = layerRect.height;
        var hw = Math.floor(w / 2);
        var hh = Math.floor(h / 2);
        switch (slot) {
            case 'left':
                return { left: 0, top: 0, width: hw, height: h };
            case 'right':
                return { left: w - hw, top: 0, width: hw, height: h };
            case 'top':
                return { left: 0, top: 0, width: w, height: hh };
            case 'bottom':
                return { left: 0, top: h - hh, width: w, height: hh };
            case 'top-left':
                return { left: 0, top: 0, width: hw, height: hh };
            case 'top-right':
                return { left: w - hw, top: 0, width: hw, height: hh };
            case 'bottom-left':
                return { left: 0, top: h - hh, width: hw, height: hh };
            case 'bottom-right':
                return { left: w - hw, top: h - hh, width: hw, height: hh };
            default:
                return null;
        }
    }

    function hideSnapPreview() {
        var $pv = $snapPreview();
        if ($pv.length) {
            $pv.css('display', 'none');
        }
    }

    function showSnapPreview(slot) {
        var layerRect = getSnapLayerRect();
        var slotRect = rectForSnapSlot(slot, layerRect);
        var $pv = $snapPreview();
        var $tab = $('#tabPanes');
        if (!slotRect || !$pv.length || !$tab.length) {
            return;
        }
        var tabR = $tab[0].getBoundingClientRect();
        var layerR = $layer()[0].getBoundingClientRect();
        $pv.css({
            display: 'block',
            left: (layerR.left - tabR.left + slotRect.left) + 'px',
            top: (layerR.top - tabR.top + slotRect.top) + 'px',
            width: slotRect.width + 'px',
            height: slotRect.height + 'px'
        });
    }

    function clearSnap($win) {
        if (!$win || !$win.length) {
            return;
        }
        $win.removeClass('snapped snap-left snap-right snap-top-left snap-top-right snap-bottom-left snap-bottom-right');
        $win.removeData('snap-slot');
    }

    function notifyWinResize($win) {
        if (!$win || !$win.length) {
            return;
        }
        $win.find('.session-win-frame').each(function () {
            try {
                if (this.contentWindow) {
                    this.contentWindow.dispatchEvent(new Event('resize'));
                }
            } catch (e) { /* ignore */ }
        });
    }

    function snap($win, slot) {
        if (!$win || !$win.length || !slot) {
            return;
        }
        if ($win.hasClass('maximized')) {
            $win.removeClass('maximized');
        }
        var wasDocked = $win.hasClass('docked');
        if (wasDocked) {
            $win.removeClass('docked');
            $win[0].style.cssText = '';
            syncDockButton($win);
            $layer().append($win);
            if (!$dockStrip().find('.session-win.docked').length) {
                syncDockStripVisible();
            } else {
                relayoutDock();
            }
        }
        // Do not overwrite a valid float-rect with empty CSS after undock
        if (!$win.hasClass('snapped') && !wasDocked) {
            captureFloatRect($win);
        }
        clearSnap($win);
        var layerRect = getSnapLayerRect();
        var rect = rectForSnapSlot(slot, layerRect);
        if (!rect) {
            return;
        }
        $win.addClass('snapped snap-' + slot);
        $win.data('snap-slot', slot);
        $win.css({
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
            zIndex: ++zCounter
        });
        hideSnapPreview();
        focusWindow($win);
        notifyWinResize($win);
        if (w.SessionLayout && typeof w.SessionLayout.onAfterSnap === 'function') {
            w.SessionLayout.onAfterSnap($win, slot);
        }
        notifyLayoutSave();
    }

    function setDockPanelWidth($win, width) {
        width = Math.max(MIN_DOCK_W, Math.round(width));
        $win.data('dock-width', width);
        $win.css('width', width + 'px');
    }

    function syncDockButton($win) {
        var $btn = $win.find('.sw-dock');
        if ($win.hasClass('docked')) {
            $btn.attr('title', '取消停靠（浮动）').text('⧉');
            $win.find('.sw-max').hide();
        } else {
            $btn.attr('title', '停靠到左侧（从左到右排列）').text('▤');
            $win.find('.sw-max').show();
        }
    }

    function captureFloatRect($win) {
        if (!$win || !$win.length || $win.hasClass('docked') || $win.hasClass('maximized') || $win.hasClass('snapped')) {
            return;
        }
        $win.data('float-rect', {
            left: $win.css('left'),
            top: $win.css('top'),
            width: $win.css('width'),
            height: $win.css('height')
        });
    }

    function visibleDocked() {
        return $dockStrip().children('.session-win.docked').not('.minimized');
    }

    function dockStripTotalWidth() {
        var total = 0;
        visibleDocked().each(function () {
            var $w = $(this);
            total += $w.data('dock-width') || DEFAULT_DOCK_W;
        });
        total += $dockStrip().children('.desktop-dock-bar').length * DOCK_BAR_W;
        return total;
    }

    function syncSessionLayerInset() {
        var inset = dockStripTotalWidth();
        $layer().css('left', inset > 0 ? inset + 'px' : '');
    }

    function notifyDockedResize() {
        $dockStrip().find('.session-win-frame').each(function () {
            try {
                if (this.contentWindow) {
                    this.contentWindow.dispatchEvent(new Event('resize'));
                }
            } catch (e) { /* ignore */ }
        });
    }

    function syncDockStripVisible() {
        var $strip = $dockStrip();
        if (!$strip.length) {
            return;
        }
        var hasDocked = $strip.find('.session-win.docked').length > 0;
        $('#tabPanes').toggleClass('has-desktop-dock', hasDocked);
        $strip.attr('aria-hidden', hasDocked ? 'false' : 'true');
        if (!hasDocked) {
            $strip.css('display', 'none');
            $layer().css('left', '');
        } else {
            $strip.css('display', '');
        }
    }

    function relayoutDock() {
        var $strip = $dockStrip();
        if (!$strip.length) {
            return;
        }
        var $all = $allWindows().filter('.docked');
        $all.each(function () {
            var $win = $(this);
            var w0 = $win.data('dock-width') || DEFAULT_DOCK_W;
            $win.data('dock-width', w0);
            this.style.cssText = 'width:' + w0 + 'px;';
            if (!$win.parent().is($strip)) {
                $strip.append($win);
            }
        });
        $strip.children('.desktop-dock-bar').remove();
        var $visible = $strip.children('.session-win.docked').not('.minimized');
        $visible.each(function (i) {
            if (i > 0) {
                $(this).before('<div class="desktop-dock-bar" title="拖动调整分栏"></div>');
            }
        });
        $strip.children('.session-win.docked.minimized').appendTo($strip);
        syncDockStripVisible();
        syncSessionLayerInset();
        $all.each(function () {
            syncDockButton($(this));
        });
        notifyDockedResize();
    }

    function dock($win) {
        if (!$win || !$win.length || $win.hasClass('docked')) {
            return;
        }
        var $strip = $dockStrip();
        if (!$strip.length) {
            return;
        }
        clearSnap($win);
        captureFloatRect($win);
        $win.removeClass('maximized minimized');
        var w0 = $win.data('dock-width') || DEFAULT_DOCK_W;
        $win.data('dock-width', w0).addClass('docked');
        $strip.append($win);
        relayoutDock();
        focusWindow($win);
        updateTaskbar();
        notifyLayoutSave();
    }

    function undock($win) {
        if (!$win || !$win.length || !$win.hasClass('docked')) {
            return;
        }
        var kind = $win.data('kind') || $win.attr('data-kind') || 'ssh';
        $win.removeClass('docked maximized');
        $win[0].style.cssText = '';
        var r = $win.data('float-rect');
        if (r) {
            $win.css({
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                zIndex: ++zCounter
            });
        } else {
            var off = cascadeOffset($layer().find('.session-win').not('.docked').length);
            $win.css({
                left: off.left + 'px',
                top: off.top + 'px',
                width: (kind === 'sftp' ? 720 : 800) + 'px',
                height: (kind === 'sftp' ? 480 : 520) + 'px',
                zIndex: ++zCounter
            });
        }
        syncDockButton($win);
        $layer().append($win);
        if (!$dockStrip().find('.session-win.docked').length) {
            syncDockStripVisible();
        } else {
            relayoutDock();
        }
        focusWindow($win);
        updateTaskbar();
        notifyLayoutSave();
    }

    function dockFromFrame(iframeWindow) {
        var $srcFrame = $('iframe').filter(function () {
            return this.contentWindow === iframeWindow;
        }).first();
        var $win = $srcFrame.closest('.session-win');
        if (!$win.length || $win.hasClass('docked')) {
            return;
        }
        dock($win);
    }

    function open(opts) {
        opts = opts || {};
        var $host = $layer();
        if (!$host.length) {
            return null;
        }
        var kind = opts.kind === 'sftp' ? 'sftp' : 'ssh';
        var id = 'sw' + (++winSeq);
        var off = cascadeOffset($host.find('.session-win').length);
        var title = opts.title || defaultTitle(kind);
        var sessionId = opts.sessionId;
        if (sessionId == null && opts.session && opts.session.id != null) {
            sessionId = opts.session.id;
        }
        var port = opts.port;
        if (port == null && opts.session && opts.session.port != null) {
            port = opts.session.port;
        }

        var $win = $(
            '<div class="session-win folder-win" data-win-id="' + id + '" data-kind="' + kind + '">' +
              '<div class="session-win-title folder-win-title">' +
                iconForKind(kind) +
                '<span class="session-win-title-text folder-win-title-text"></span>' +
                '<div class="session-win-actions folder-win-actions">' +
                  '<button type="button" class="fw-btn sw-dock" title="停靠到左侧（从左到右排列）">▤</button>' +
                  '<button type="button" class="fw-btn sw-min fw-min" title="最小化">—</button>' +
                  '<button type="button" class="fw-btn sw-max fw-max" title="最大化">□</button>' +
                  '<button type="button" class="fw-btn sw-close fw-close" title="关闭">×</button>' +
                '</div>' +
              '</div>' +
              '<div class="session-win-body folder-win-body">' +
                '<iframe class="session-win-frame folder-win-frame" src=""></iframe>' +
              '</div>' +
              '<div class="session-win-resize folder-win-resize"></div>' +
            '</div>'
        );
        $win.find('.session-win-title-text').text(title);
        $win.data('title', title);
        $win.data('kind', kind);
        if (sessionId != null) {
            $win.data('session-id', sessionId);
            $win.attr('data-session-id', sessionId);
        }
        if (port != null) {
            $win.data('session-port', port);
        }
        $win.css({
            left: off.left + 'px',
            top: off.top + 'px',
            width: (opts.width || (kind === 'sftp' ? 720 : 800)) + 'px',
            height: (opts.height || (kind === 'sftp' ? 480 : 520)) + 'px',
            zIndex: ++zCounter
        });
        $host.append($win);
        $win.find('.session-win-frame').attr('src', resolveSrc(opts));
        bindWindowChrome($win);
        focusWindow($win);
        updateTaskbar();
        return $win;
    }

    function focusWindow($win) {
        if (!$win || !$win.length) {
            return;
        }
        $allWindows().removeClass('focused');
        $win.addClass('focused');
        $win.css('z-index', ++zCounter);
        if ($win.hasClass('minimized')) {
            restoreWindow($win);
            return;
        }
        updateTaskbar();
    }

    function minimizeWindow($win) {
        if (!$win || !$win.length) {
            return;
        }
        $win.addClass('minimized').removeClass('focused maximized');
        if ($win.hasClass('docked')) {
            relayoutDock();
        }
        updateTaskbar();
    }

    function restoreWindow($win) {
        if (!$win || !$win.length) {
            return;
        }
        $win.removeClass('minimized');
        if ($win.hasClass('docked')) {
            if (!$win.data('dock-width')) {
                $win.data('dock-width', DEFAULT_DOCK_W);
            }
            relayoutDock();
        }
        focusWindow($win);
    }

    function maximizeWindow($win) {
        if (!$win || !$win.length) {
            return;
        }
        if ($win.hasClass('docked')) {
            return;
        }
        if ($win.hasClass('snapped')) {
            clearSnap($win);
        }
        if ($win.hasClass('maximized')) {
            $win.removeClass('maximized');
            if ($win.data('restore-rect')) {
                var r = $win.data('restore-rect');
                $win.css({ left: r.left, top: r.top, width: r.width, height: r.height });
            }
        } else {
            $win.data('restore-rect', {
                left: $win.css('left'),
                top: $win.css('top'),
                width: $win.css('width'),
                height: $win.css('height')
            });
            $win.addClass('maximized').removeClass('minimized');
        }
        focusWindow($win);
    }

    function notifyLayoutSave(immediate) {
        if (immediate) {
            if (w.SessionLayout && typeof w.SessionLayout.saveNow === 'function') {
                w.SessionLayout.saveNow();
            } else if (w.SessionLayout && typeof w.SessionLayout.save === 'function') {
                w.SessionLayout.save();
            }
            return;
        }
        if (w.SessionLayout && typeof w.SessionLayout.save === 'function') {
            w.SessionLayout.save();
        }
    }

    function closeWindow($win) {
        if (!$win || !$win.length) {
            return;
        }
        var id = $win.data('win-id');
        var wasDocked = $win.hasClass('docked');
        $(document).off('.sw' + id).off('.swr' + id);
        // 仅移除 DOM；不 logout、不清 localStorage tagId
        $win.remove();
        if (wasDocked) {
            relayoutDock();
        } else {
            syncDockStripVisible();
        }
        updateTaskbar();
        // Flush immediately so a quick refresh cannot resurrect the closed window
        notifyLayoutSave(true);
    }

    function bindWindowChrome($win) {
        var id = $win.data('win-id');
        $win.on('mousedown', function () {
            focusWindow($win);
        });
        $win.find('.sw-dock').on('click', function (e) {
            e.stopPropagation();
            if ($win.hasClass('docked')) {
                undock($win);
            } else {
                dock($win);
            }
        });
        $win.find('.sw-close').on('click', function (e) {
            e.stopPropagation();
            closeWindow($win);
        });
        $win.find('.sw-min').on('click', function (e) {
            e.stopPropagation();
            minimizeWindow($win);
        });
        $win.find('.sw-max').on('click', function (e) {
            e.stopPropagation();
            if (w.SessionLayout && typeof w.SessionLayout.hidePicker === 'function') {
                w.SessionLayout.hidePicker();
            }
            maximizeWindow($win);
        });
        $win.find('.sw-max').on('mouseenter', function () {
            if ($win.hasClass('docked')) {
                return;
            }
            if (w.SessionLayout && typeof w.SessionLayout.onMaxEnter === 'function') {
                w.SessionLayout.onMaxEnter($(this), $win);
            } else if (w.SessionLayout && typeof w.SessionLayout.showPicker === 'function') {
                var $btn = $(this);
                setTimeout(function () {
                    if ($btn.is(':hover')) {
                        w.SessionLayout.showPicker($btn, $win);
                    }
                }, 300);
            }
        });
        $win.find('.sw-max').on('mouseleave', function () {
            if (w.SessionLayout && typeof w.SessionLayout.onMaxLeave === 'function') {
                w.SessionLayout.onMaxLeave();
            } else if (w.SessionLayout && typeof w.SessionLayout.hidePicker === 'function') {
                setTimeout(function () {
                    var $p = $('#desktopLayoutPicker');
                    if ($p.length && !$p.is(':hover')) {
                        w.SessionLayout.hidePicker();
                    }
                }, 180);
            }
        });
        $win.find('.session-win-title').on('dblclick', function (e) {
            if ($(e.target).closest('.fw-btn').length || $win.hasClass('docked')) {
                return;
            }
            maximizeWindow($win);
        });

        var dragging = false;
        var sx, sy, ol, ot;
        var dragWasSnapped = false;
        var dragUnsnapped = false;
        var dragFromDock = false;
        var dockUndocked = false;
        var lastClientX = 0;
        var lastClientY = 0;
        $win.find('.session-win-title').on('mousedown', function (e) {
            if ($(e.target).closest('.fw-btn').length) {
                return;
            }
            if ($win.hasClass('maximized')) {
                return;
            }
            dragging = true;
            dragWasSnapped = $win.hasClass('snapped');
            dragUnsnapped = false;
            dragFromDock = $win.hasClass('docked');
            dockUndocked = false;
            sx = e.clientX;
            sy = e.clientY;
            lastClientX = sx;
            lastClientY = sy;
            if (!dragFromDock) {
                ol = parseInt($win.css('left'), 10) || 0;
                ot = parseInt($win.css('top'), 10) || 0;
            }
            $('body').addClass('folder-win-dragging');
            e.preventDefault();
        });
        $(document).on('mousemove.sw' + id, function (e) {
            if (!dragging) {
                return;
            }
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            if (dragFromDock && !dockUndocked) {
                var ddx = e.clientX - sx;
                var ddy = e.clientY - sy;
                if (Math.sqrt(ddx * ddx + ddy * ddy) <= DOCK_UNDOCK_THRESHOLD) {
                    return;
                }
                dockUndocked = true;
                undock($win);
                var layerEl = $layer()[0];
                var layerRect = layerEl ? layerEl.getBoundingClientRect() : { left: 0, top: 0 };
                var ww = $win.outerWidth() || 420;
                var newLeft = Math.max(0, e.clientX - layerRect.left - Math.min(80, ww / 2));
                var newTop = Math.max(0, e.clientY - layerRect.top - 14);
                $win.css({
                    left: newLeft + 'px',
                    top: newTop + 'px'
                });
                ol = newLeft;
                ot = newTop;
                sx = e.clientX;
                sy = e.clientY;
            }
            if (dragWasSnapped && !dragUnsnapped) {
                var dx0 = e.clientX - sx;
                var dy0 = e.clientY - sy;
                if (Math.sqrt(dx0 * dx0 + dy0 * dy0) <= SNAP_UNSnap_THRESHOLD) {
                    return;
                }
                dragUnsnapped = true;
                clearSnap($win);
                var fr = $win.data('float-rect');
                if (fr) {
                    $win.css({
                        left: fr.left,
                        top: fr.top,
                        width: fr.width,
                        height: fr.height
                    });
                }
                ol = parseInt($win.css('left'), 10) || 0;
                ot = parseInt($win.css('top'), 10) || 0;
                sx = e.clientX;
                sy = e.clientY;
            }
            $win.css({
                left: Math.max(0, ol + e.clientX - sx) + 'px',
                top: Math.max(0, ot + e.clientY - sy) + 'px'
            });
            var zone = hitSnapZone(e.clientX, e.clientY, getSnapHitBounds());
            if (zone) {
                showSnapPreview(zone);
            } else {
                hideSnapPreview();
            }
        });
        $(document).on('mouseup.sw' + id, function () {
            if (!dragging) {
                return;
            }
            dragging = false;
            $('body').removeClass('folder-win-dragging');
            hideSnapPreview();
            // Drag started in dock but never crossed undock threshold — stay docked
            if (dragFromDock && !dockUndocked) {
                return;
            }
            if (!dragWasSnapped || dragUnsnapped || dockUndocked) {
                var zone = hitSnapZone(lastClientX, lastClientY, getSnapHitBounds());
                if (zone) {
                    snap($win, zone);
                    return;
                }
            }
            if (!$win.hasClass('snapped')) {
                captureFloatRect($win);
            }
            notifyLayoutSave();
        });

        var resizing = false;
        var rsx, rsy, rw, rh;
        $win.find('.session-win-resize').on('mousedown', function (e) {
            if ($win.hasClass('maximized') || $win.hasClass('docked') || $win.hasClass('snapped')) {
                return;
            }
            resizing = true;
            rsx = e.clientX;
            rsy = e.clientY;
            rw = $win.outerWidth();
            rh = $win.outerHeight();
            $('body').addClass('folder-win-dragging');
            e.preventDefault();
            e.stopPropagation();
        });
        $(document).on('mousemove.swr' + id, function (e) {
            if (!resizing) {
                return;
            }
            $win.css({
                width: Math.max(420, rw + e.clientX - rsx) + 'px',
                height: Math.max(280, rh + e.clientY - rsy) + 'px'
            });
        });
        $(document).on('mouseup.swr' + id, function () {
            if (!resizing) {
                return;
            }
            resizing = false;
            $('body').removeClass('folder-win-dragging');
            captureFloatRect($win);
            notifyLayoutSave();
        });
    }

    function hideTaskbarMenu() {
        var $menu = $('#desktopTaskbarMenu');
        if ($menu.length) {
            $menu.hide().empty().attr('aria-hidden', 'true').removeData('win-id');
        }
        $(document).off('.swTaskbarMenu');
    }

    function restoreFromTaskbarMenu($win) {
        if (!$win || !$win.length) {
            return;
        }
        if ($win.hasClass('minimized')) {
            restoreWindow($win);
            return;
        }
        if ($win.hasClass('maximized')) {
            maximizeWindow($win);
        }
    }

    function showTaskbarMenu(pageX, pageY, $win) {
        var $menu = $('#desktopTaskbarMenu');
        if (!$menu.length || !$win || !$win.length) {
            return;
        }
        hideTaskbarMenu();
        var minimized = $win.hasClass('minimized');
        var maximized = $win.hasClass('maximized');
        var docked = $win.hasClass('docked');
        var canRestore = minimized || maximized;
        var canMinimize = !minimized;
        var canMaximize = !minimized && !maximized && !docked;
        var html =
            '<a class="ctx-item' + (canRestore ? '' : ' disabled') + '" href="javascript:void(0)" data-action="restore">还原</a>' +
            '<a class="ctx-item' + (canMinimize ? '' : ' disabled') + '" href="javascript:void(0)" data-action="minimize">最小化</a>' +
            '<a class="ctx-item' + (canMaximize ? '' : ' disabled') + '" href="javascript:void(0)" data-action="maximize">最大化</a>' +
            '<div class="ctx-sep"></div>' +
            '<a class="ctx-item" href="javascript:void(0)" data-action="close">关闭</a>';
        $menu.html(html).data('win-id', $win.data('win-id'));
        $menu.css({ left: pageX + 'px', top: pageY + 'px' }).show().attr('aria-hidden', 'false');

        var mw = $menu.outerWidth() || 148;
        var mh = $menu.outerHeight() || 120;
        var left = pageX;
        var top = pageY;
        if (left + mw > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - mw - 8);
        }
        if (top + mh > window.innerHeight - 8) {
            top = Math.max(8, window.innerHeight - mh - 8);
        }
        $menu.css({ left: left + 'px', top: top + 'px' });

        $menu.off('click.swTaskbarMenu').on('click.swTaskbarMenu', '.ctx-item', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if ($(this).hasClass('disabled')) {
                return;
            }
            var action = $(this).data('action');
            var sid = $menu.data('win-id');
            var $target = $allWindows().filter('[data-win-id="' + sid + '"]');
            hideTaskbarMenu();
            if (!$target.length) {
                return;
            }
            if (action === 'restore') {
                restoreFromTaskbarMenu($target);
            } else if (action === 'minimize') {
                minimizeWindow($target);
            } else if (action === 'maximize') {
                maximizeWindow($target);
            } else if (action === 'close') {
                closeWindow($target);
            }
        });

        setTimeout(function () {
            $(document).on('mousedown.swTaskbarMenu', function (e) {
                if ($(e.target).closest('#desktopTaskbarMenu').length) {
                    return;
                }
                hideTaskbarMenu();
            });
            $(document).on('keydown.swTaskbarMenu', function (e) {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    hideTaskbarMenu();
                }
            });
            $(document).on('contextmenu.swTaskbarMenu', function (e) {
                if ($(e.target).closest('#desktopTaskbarMenu').length) {
                    return;
                }
                if ($(e.target).closest('#desktopTaskbar .session-task-btn').length) {
                    return;
                }
                hideTaskbarMenu();
            });
        }, 0);
    }

    function updateTaskbar() {
        var $bar = $taskbar();
        if (!$bar.length) {
            return;
        }
        var sessions = [];
        $allWindows().each(function () {
            var $win = $(this);
            var kind = $win.attr('data-kind') || $win.data('kind') || 'ssh';
            sessions.push({
                id: $win.data('win-id'),
                kind: kind,
                title: $win.data('title') || $win.find('.session-win-title-text').text() || defaultTitle(kind),
                active: !$win.hasClass('minimized') && $win.hasClass('focused'),
                minimized: $win.hasClass('minimized')
            });
        });
        if (!sessions.length) {
            hideTaskbarMenu();
            syncHostSessionsClass(false);
            $bar.hide().empty();
            return;
        }
        syncHostSessionsClass(true);
        var html = '';
        sessions.forEach(function (s) {
            var cls = 'folder-task-btn session-task-btn'
                + (s.active ? ' active' : '')
                + (s.minimized ? ' minimized' : '');
            html += '<button type="button" class="' + cls + '" data-sess-id="' + s.id
                + '" data-kind="' + s.kind + '" title="' + $('<div>').text(s.title).html() + '">'
                + iconForKind(s.kind)
                + '<span class="folder-task-label">' + $('<div>').text(s.title).html() + '</span>'
                + '</button>';
        });
        $bar.html(html).show();
        $bar.off('click contextmenu');
        $bar.on('click', '.folder-task-btn', function () {
            hideTaskbarMenu();
            var sid = $(this).data('sess-id');
            var $win = $allWindows().filter('[data-win-id="' + sid + '"]');
            if (!$win.length) {
                return;
            }
            if ($win.hasClass('minimized')) {
                restoreWindow($win);
            } else if ($win.hasClass('focused')) {
                minimizeWindow($win);
            } else {
                focusWindow($win);
            }
        });
        $bar.on('contextmenu', '.folder-task-btn', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var sid = $(this).data('sess-id');
            var $win = $allWindows().filter('[data-win-id="' + sid + '"]');
            if (!$win.length) {
                return;
            }
            showTaskbarMenu(e.pageX, e.pageY, $win);
        });
    }

    function setTitle($frame, title) {
        if (!$frame || !$frame.length) {
            return;
        }
        var name = title;
        if (name == null || name === '') {
            return;
        }
        var $win = $frame.closest('.session-win');
        if (!$win.length) {
            return;
        }
        $win.find('.session-win-title-text').text(name);
        $win.data('title', name);
        updateTaskbar();
        notifyLayoutSave();
    }

    function resolveSessionForRestore(openFns, sessionId) {
        var dfd = $.Deferred();
        if (!sessionId || !openFns || typeof openFns.resolveSession !== 'function') {
            dfd.resolve(null);
            return dfd.promise();
        }
        try {
            if (openFns.resolveSession.length <= 1) {
                var r = openFns.resolveSession(sessionId);
                if (r && typeof r.then === 'function') {
                    r.then(function (s) {
                        dfd.resolve(s || null);
                    }, function () {
                        dfd.resolve(null);
                    });
                    return dfd.promise();
                }
                dfd.resolve(r || null);
                return dfd.promise();
            }
            openFns.resolveSession(sessionId, function (session) {
                dfd.resolve(session || null);
            });
        } catch (e) {
            dfd.resolve(null);
        }
        return dfd.promise();
    }

    function findRestoredWindow(entry) {
        var sid = String(entry.sessionId || '');
        var kind = entry.kind === 'sftp' ? 'sftp' : 'ssh';
        var $match = $();
        $allWindows().each(function () {
            var $w = $(this);
            if (String($w.data('session-id') || $w.attr('data-session-id') || '') === sid
                && ($w.attr('data-kind') || $w.data('kind') || 'ssh') === kind) {
                $match = $w;
            }
        });
        return $match;
    }

    function applyRestoredEntry($win, entry) {
        if (!$win || !$win.length || !entry) {
            return;
        }
        if (entry.title) {
            $win.find('.session-win-title-text').text(entry.title);
            $win.data('title', entry.title);
        }
        if (entry.dockWidth != null) {
            $win.data('dock-width', Number(entry.dockWidth));
        }
        if (entry.mode === 'dock') {
            dock($win);
        } else if (entry.mode === 'snap' && entry.snapSlot) {
            snap($win, entry.snapSlot);
        } else if (entry.geometry) {
            var g = entry.geometry;
            $win.css({
                left: (g.left || 0) + 'px',
                top: (g.top || 0) + 'px',
                width: (g.width || 800) + 'px',
                height: (g.height || 520) + 'px',
                zIndex: entry.z || (++zCounter)
            });
            captureFloatRect($win);
        }
        if (entry.z != null && !isNaN(Number(entry.z))) {
            var z = Number(entry.z);
            $win.css('z-index', z);
            if (z >= zCounter) {
                zCounter = z;
            }
        }
        updateTaskbar();
    }

    function openForRestoreEntry(entry, openFns, session) {
        var opener = entry.kind === 'sftp' ? openFns.openSftp : openFns.openSsh;
        if (typeof opener !== 'function') {
            return $.Deferred().reject('missing opener').promise();
        }
        var ret = opener(session);
        if (ret && typeof ret.then === 'function') {
            return ret;
        }
        var dfd = $.Deferred();
        setTimeout(function () {
            dfd.resolve(findRestoredWindow(entry));
        }, 280);
        return dfd.promise();
    }

    /**
     * Restore saved layout entries sequentially via openers, then apply mode/geometry.
     * @param {Array} entries
     * @param {{ openSsh: Function, openSftp: Function, resolveSession: Function }} openFns
     */
    function restoreLayout(entries, openFns) {
        openFns = openFns || {};
        var list = entries || [];
        var chain = $.Deferred().resolve().promise();
        list.forEach(function (entry) {
            chain = chain.then(function () {
                if (!entry || !entry.sessionId) {
                    return;
                }
                return resolveSessionForRestore(openFns, entry.sessionId).then(function (session) {
                    if (!session) {
                        return;
                    }
                    return openForRestoreEntry(entry, openFns, session).then(function ($win) {
                        if (!$win || !$win.length) {
                            $win = findRestoredWindow(entry);
                        }
                        if ($win && $win.length) {
                            applyRestoredEntry($win, entry);
                        }
                    }, function () { /* skip failed open */ });
                });
            });
        });
        return chain;
    }

    w.SessionWindows = {
        open: open,
        focus: focusWindow,
        minimize: minimizeWindow,
        close: closeWindow,
        dock: dock,
        undock: undock,
        dockFromFrame: dockFromFrame,
        relayoutDock: relayoutDock,
        setDockPanelWidth: setDockPanelWidth,
        snap: snap,
        clearSnap: clearSnap,
        restoreLayout: restoreLayout,
        updateTaskbar: updateTaskbar,
        setTitle: setTitle,
        MIN_DOCK_W: MIN_DOCK_W
    };

    var splitDragging = false;
    var splitLeft = null;
    var splitRight = null;
    var splitStartX = 0;
    var splitLeftW0 = 0;
    var splitRightW0 = 0;

    function endSplitDrag() {
        if (!splitDragging) {
            return;
        }
        splitDragging = false;
        splitLeft = null;
        splitRight = null;
        $('body').removeClass('split-dragging');
        notifyDockedResize();
        notifyLayoutSave();
    }

    $(document).on('mousedown.swdocksplit', '#desktopDockStrip .desktop-dock-bar', function (e) {
        if (e.which !== 1 && e.button !== 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        splitLeft = $(this).prevAll('.session-win.docked').not('.minimized').first();
        splitRight = $(this).nextAll('.session-win.docked').not('.minimized').first();
        if (!splitLeft.length || !splitRight.length) {
            return;
        }
        splitStartX = e.clientX;
        splitLeftW0 = splitLeft.outerWidth();
        splitRightW0 = splitRight.outerWidth();
        splitDragging = true;
        $('body').addClass('split-dragging');
    });

    $(document).on('mousemove.swdocksplit', function (e) {
        if (!splitDragging || !splitLeft || !splitRight) {
            return;
        }
        e.preventDefault();
        var dx = e.clientX - splitStartX;
        var lw = splitLeftW0 + dx;
        var rw = splitRightW0 - dx;
        if (lw < MIN_DOCK_W) {
            rw -= (MIN_DOCK_W - lw);
            lw = MIN_DOCK_W;
        }
        if (rw < MIN_DOCK_W) {
            lw -= (MIN_DOCK_W - rw);
            rw = MIN_DOCK_W;
        }
        if (lw < MIN_DOCK_W || rw < MIN_DOCK_W) {
            return;
        }
        setDockPanelWidth(splitLeft, lw);
        setDockPanelWidth(splitRight, rw);
        syncSessionLayerInset();
    });

    $(document).on('mouseup.swdocksplit', endSplitDrag);
    $(window).on('blur.swdocksplit', endSplitDrag);
})(window);
