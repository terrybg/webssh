/**
 * 文件资源管理器：浮动窗 / 左侧多分栏停靠（从左到右）/ 任务栏会话
 */
(function (w) {
    var zCounter = 2000;
    var winSeq = 0;
    var DEFAULT_DOCK_W = 340;
    var MIN_DOCK_W = 220;
    var MIN_TERM_W = 320;
    var FOLDER_ICO =
        '<svg class="fw-folder-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
        '<path fill="#E8B84A" d="M1.5 3.5h4.2l1.2 1.3H14.5v8.2a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z"/>' +
        '<path fill="#F5D76E" d="M2 5.2h12v7.3a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V5.2z"/>' +
        '</svg>';

    function getActivePane() {
        return $('.shell-tab-pane.active.show.remote-pane').first();
    }

    function titleFromPath(path) {
        var name = '';
        var ip = '';
        try {
            if (typeof getQueryParam === 'function') {
                name = getQueryParam('sessionName') || '';
                ip = getQueryParam('ip') || '';
            }
        } catch (e) { /* ignore */ }
        var host;
        if (name && ip) {
            host = name + ' (' + ip + ')';
        } else if (typeof sessionDisplayLabel === 'function') {
            host = sessionDisplayLabel();
        } else {
            host = name || ip || '此电脑';
        }
        if (!path || path === '/') {
            return host;
        }
        var parts = String(path).split('/').filter(Boolean);
        var leaf = parts.length ? parts[parts.length - 1] : String(path);
        return host + ' · ' + leaf;
    }

    function ensureShell($pane) {
        if (!$pane || !$pane.length) {
            return $();
        }
        $pane.css('position', 'relative');
        $pane.addClass('files-hidden').removeClass('dock-minimized dock-right');
        if (!$pane.children('.folder-dock-strip').length) {
            $pane.find('.rightDiv').before(
                '<div class="folder-dock-strip"></div>' +
                '<div class="folder-dock-edge" title="拖动调整分栏宽度"></div>'
            );
        }
        if (!$pane.children('.folder-win-layer').length) {
            $pane.append(
                '<div class="folder-win-layer"></div>' +
                '<div class="folder-taskbar" style="display:none"></div>'
            );
        }
        return $pane.children('.folder-win-layer');
    }

    function dockStrip($pane) {
        ensureShell($pane);
        return $pane.children('.folder-dock-strip');
    }

    function dockEdge($pane) {
        return $pane.children('.folder-dock-edge');
    }

    function sftpUrlForPane($pane) {
        var q = $pane.data('workspaceQuery') || '';
        var sep = q.indexOf('?') >= 0 ? '&' : '?';
        var port = $pane.data('session-port') || w.currentSessionPort || 22;
        var tid = '';
        try {
            tid = w.localStorage.getItem('tagId' + port) || '';
        } catch (e) { /* ignore */ }
        var url = 'sftp.html' + q + sep + 'v=39&tagId=' + encodeURIComponent(tid) + '&folderWin=1';
        try {
            var cache = w.__websshShellPwdCache;
            if (cache && cache.path) {
                url += '&cwd=' + encodeURIComponent(cache.path);
            }
        } catch (e2) { /* ignore */ }
        return url;
    }

    function cascadeOffset(n) {
        return { left: 36 + (n % 6) * 28, top: 28 + (n % 6) * 24 };
    }

    function visibleDocked($pane) {
        return dockStrip($pane).children('.folder-win.docked').not('.minimized');
    }

    /** 按从左到右重建分栏：清空叠放，严格横向排列 */
    function rebuildDockLayout($pane) {
        var $strip = dockStrip($pane);
        var $edge = dockEdge($pane);
        // 收集所有 docked 窗（含最小化，最小化稍后隐藏）
        var $all = $pane.find('.folder-win.docked');
        // 统一移入 strip，去掉绝对定位残留
        $all.each(function () {
            var $win = $(this);
            var w0 = $win.data('dock-width') || DEFAULT_DOCK_W;
            $win.data('dock-width', w0);
            // 清掉浮动遗留的定位，只保留宽度
            this.style.cssText = 'width:' + w0 + 'px;';
            if (!$win.parent().is($strip)) {
                $strip.append($win);
            }
        });
        // 按当前 DOM 顺序重排：可见面板 + 分隔条
        $strip.children('.folder-dock-bar').remove();
        var $visible = $strip.children('.folder-win.docked').not('.minimized');
        $visible.each(function (i) {
            var $win = $(this);
            if (i > 0) {
                $win.before('<div class="folder-dock-bar" title="拖动调整分栏"></div>');
            }
        });
        // 最小化的仍留在 strip 末尾但不占位（CSS display:none）
        $strip.children('.folder-win.docked.minimized').appendTo($strip);

        var has = $visible.length > 0;
        $pane.toggleClass('has-dock-panels', has);
        // 不要用 jQuery .toggle()，否则会写成 display:block 破坏 flex 横排
        if (has) {
            $strip.css('display', 'flex');
            $edge.css('display', 'block');
        } else {
            $strip.css('display', 'none');
            $edge.css('display', 'none');
        }
        notifyTermResize($pane);
    }

    function notifyTermResize($pane) {
        try {
            var rightWin = $pane.find('.rightFrame')[0] && $pane.find('.rightFrame')[0].contentWindow;
            if (rightWin) {
                rightWin.dispatchEvent(new Event('resize'));
            }
        } catch (e) { /* ignore */ }
    }

    function syncDockButton($win) {
        var $btn = $win.find('.fw-dock');
        if ($win.hasClass('docked')) {
            $btn.attr('title', '取消停靠（浮动）').text('⧉');
            $win.find('.fw-max').hide();
        } else {
            $btn.attr('title', '停靠到左侧（从左到右排列）').text('▤');
            $win.find('.fw-max').show();
        }
    }

    function openFolderWindow($pane, opts) {
        opts = opts || {};
        // 桌面路径优先走 SessionWindows（无停靠）；停靠仍走 pane 内 FolderWindows
        if (w.SessionWindows && !opts.forcePane && !opts.dock) {
            var src = opts.src;
            if (!src) {
                if ($pane && $pane.length) {
                    src = sftpUrlForPane($pane);
                } else {
                    var $active = getActivePane();
                    if ($active.length) {
                        src = sftpUrlForPane($active);
                    }
                }
            }
            var port = opts.port;
            if (port == null && $pane && $pane.length) {
                port = $pane.data('session-port') || w.currentSessionPort || 22;
            }
            return w.SessionWindows.open({
                kind: 'sftp',
                title: opts.title,
                src: src,
                sessionId: opts.sessionId || ($pane && $pane.data('session-id')),
                port: port,
                width: opts.width,
                height: opts.height
            });
        }
        if (!$pane || !$pane.length) {
            $pane = getActivePane();
        }
        if (!$pane.length) {
            return null;
        }
        var $layer = ensureShell($pane);
        var id = 'fw' + (++winSeq);
        var off = cascadeOffset($layer.find('.folder-win').not('.docked').length);
        var title = opts.title || '文件资源管理器';
        var $win = $(
            '<div class="folder-win" data-win-id="' + id + '">' +
              '<div class="folder-win-title">' +
                FOLDER_ICO +
                '<span class="folder-win-title-text"></span>' +
                '<div class="folder-win-actions">' +
                  '<button type="button" class="fw-btn fw-dock" title="停靠到左侧（从左到右排列）">▤</button>' +
                  '<button type="button" class="fw-btn fw-min" title="最小化">' +
                    '<svg class="caption-ico caption-min" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8"/></svg></button>' +
                  '<button type="button" class="fw-btn fw-max" title="最大化">' +
                    '<svg class="caption-ico caption-max" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.2" y="1.2" width="7.6" height="7.6" rx="0.4"/></svg></button>' +
                  '<button type="button" class="fw-btn fw-close" title="关闭">' +
                    '<svg class="caption-ico caption-close" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8"/></svg></button>' +
                '</div>' +
              '</div>' +
              '<div class="folder-win-body">' +
                '<iframe class="folder-win-frame" src=""></iframe>' +
              '</div>' +
              '<div class="folder-win-resize"></div>' +
            '</div>'
        );
        $win.find('.folder-win-title-text').text(title);
        $win.data('title', title);
        $win.css({
            left: off.left + 'px',
            top: off.top + 'px',
            width: (opts.width || 720) + 'px',
            height: (opts.height || 480) + 'px',
            zIndex: ++zCounter
        });
        $layer.append($win);
        $win.find('.folder-win-frame').attr('src', opts.src || sftpUrlForPane($pane));
        bindWindowChrome($pane, $win);
        if (opts.dock) {
            dockFromWindow($pane, $win);
        } else {
            focusWindow($win);
            syncFilesButton($pane);
            updateTaskbar($pane);
        }
        return $win;
    }

    function focusWindow($win) {
        if (!$win || !$win.length) {
            return;
        }
        var $pane = $win.closest('.remote-pane');
        $pane.find('.folder-win').removeClass('focused');
        $win.addClass('focused');
        if (!$win.hasClass('docked')) {
            $win.css('z-index', ++zCounter);
        }
        if ($win.hasClass('minimized')) {
            restoreWindow($win);
            return;
        }
        updateTaskbar($pane);
    }

    function minimizeWindow($win) {
        var $pane = $win.closest('.remote-pane');
        $win.addClass('minimized').removeClass('focused maximized');
        if ($win.hasClass('docked')) {
            rebuildDockLayout($pane);
        }
        updateTaskbar($pane);
    }

    function restoreWindow($win) {
        var $pane = $win.closest('.remote-pane');
        $win.removeClass('minimized');
        if ($win.hasClass('docked')) {
            if (!$win.data('dock-width')) {
                $win.data('dock-width', DEFAULT_DOCK_W);
            }
            rebuildDockLayout($pane);
        }
        focusWindow($win);
        updateTaskbar($pane);
    }

    function maximizeWindow($win) {
        if ($win.hasClass('docked')) {
            return;
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

    function closeWindow($win) {
        var $pane = $win.closest('.remote-pane');
        var id = $win.data('win-id');
        var wasDocked = $win.hasClass('docked');
        $(document).off('.fw' + id).off('.fwr' + id);
        $win.remove();
        if (wasDocked) {
            rebuildDockLayout($pane);
        }
        syncFilesButton($pane);
        updateTaskbar($pane);
    }

    function dockFromWindow($pane, $win) {
        if (!$win || !$win.length) {
            return;
        }
        ensureShell($pane);
        $pane.removeClass('dock-right');
        var $strip = dockStrip($pane);
        var w0 = $win.data('dock-width') || DEFAULT_DOCK_W;
        w0 = Math.max(MIN_DOCK_W, Math.min(w0, 520));
        $win.removeClass('minimized maximized')
            .addClass('docked')
            .data('dock-width', w0);
        // 始终追加到最右侧（视觉上从左到右依次占用）
        $strip.append($win);
        syncDockButton($win);
        rebuildDockLayout($pane);
        focusWindow($win);
        syncFilesButton($pane);
        updateTaskbar($pane);
    }

    function undockToFloat($pane, $win) {
        if (!$win || !$win.length) {
            return;
        }
        var $layer = ensureShell($pane);
        var title = $win.data('title') || $win.find('.folder-win-title-text').text();
        var off = cascadeOffset($layer.find('.folder-win').not('.docked').length);
        $win.removeClass('docked minimized maximized');
        $win[0].style.cssText = '';
        $win.css({
            left: off.left + 'px',
            top: off.top + 'px',
            width: '720px',
            height: '480px',
            zIndex: ++zCounter
        });
        $layer.append($win);
        $win.data('title', title);
        syncDockButton($win);
        rebuildDockLayout($pane);
        focusWindow($win);
        syncFilesButton($pane);
        updateTaskbar($pane);
    }

    function bindWindowChrome($pane, $win) {
        var id = $win.data('win-id');
        $win.on('mousedown', function () {
            focusWindow($win);
        });
        $win.find('.fw-close').on('click', function (e) {
            e.stopPropagation();
            closeWindow($win);
        });
        $win.find('.fw-min').on('click', function (e) {
            e.stopPropagation();
            minimizeWindow($win);
        });
        $win.find('.fw-max').on('click', function (e) {
            e.stopPropagation();
            maximizeWindow($win);
        });
        $win.find('.fw-dock').on('click', function (e) {
            e.stopPropagation();
            if ($win.hasClass('docked')) {
                undockToFloat($pane, $win);
            } else {
                dockFromWindow($pane, $win);
            }
        });
        $win.find('.folder-win-title').on('dblclick', function (e) {
            if ($(e.target).closest('.fw-btn').length || $win.hasClass('docked')) {
                return;
            }
            maximizeWindow($win);
        });

        var dragging = false;
        var sx, sy, ol, ot;
        $win.find('.folder-win-title').on('mousedown', function (e) {
            if ($(e.target).closest('.fw-btn').length) {
                return;
            }
            if ($win.hasClass('docked')) {
                dragging = true;
                sx = e.clientX;
                sy = e.clientY;
                $win.data('dock-drag', true);
                $('body').addClass('folder-win-dragging');
                e.preventDefault();
                return;
            }
            if ($win.hasClass('maximized')) {
                return;
            }
            dragging = true;
            sx = e.clientX;
            sy = e.clientY;
            ol = parseInt($win.css('left'), 10) || 0;
            ot = parseInt($win.css('top'), 10) || 0;
            $win.data('dock-drag', false);
            $('body').addClass('folder-win-dragging');
            e.preventDefault();
        });
        $(document).on('mousemove.fw' + id, function (e) {
            if (!dragging) {
                return;
            }
            if ($win.data('dock-drag')) {
                var dy = e.clientY - sy;
                var dx = e.clientX - sx;
                var rect = $pane[0].getBoundingClientRect();
                var ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
                $pane.toggleClass('dock-drop-left', ratio < 0.22);
                if (Math.abs(dy) > 70 || Math.abs(dx) > 90) {
                    undockToFloat($pane, $win);
                    $win.data('dock-drag', false);
                    ol = parseInt($win.css('left'), 10) || 0;
                    ot = parseInt($win.css('top'), 10) || 0;
                    sx = e.clientX;
                    sy = e.clientY;
                }
                return;
            }
            $win.css({
                left: Math.max(0, ol + e.clientX - sx) + 'px',
                top: Math.max(0, ot + e.clientY - sy) + 'px'
            });
            var rect2 = $pane[0].getBoundingClientRect();
            var ratio2 = (e.clientX - rect2.left) / Math.max(1, rect2.width);
            $pane.toggleClass('dock-drop-left', ratio2 < 0.22);
        });
        $(document).on('mouseup.fw' + id, function () {
            if (!dragging) {
                return;
            }
            dragging = false;
            $('body').removeClass('folder-win-dragging');
            var snapLeft = $pane.hasClass('dock-drop-left');
            $pane.removeClass('dock-drop-left dock-drop-right');
            $win.removeData('dock-drag');
            if ($win.hasClass('docked')) {
                return;
            }
            if (snapLeft) {
                dockFromWindow($pane, $win);
            }
        });

        var resizing = false;
        var rsx, rsy, rw, rh;
        $win.find('.folder-win-resize').on('mousedown', function (e) {
            if ($win.hasClass('maximized') || $win.hasClass('docked')) {
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
        $(document).on('mousemove.fwr' + id, function (e) {
            if (!resizing) {
                return;
            }
            $win.css({
                width: Math.max(420, rw + e.clientX - rsx) + 'px',
                height: Math.max(280, rh + e.clientY - rsy) + 'px'
            });
        });
        $(document).on('mouseup.fwr' + id, function () {
            if (!resizing) {
                return;
            }
            resizing = false;
            $('body').removeClass('folder-win-dragging');
        });
    }

    function updateTaskbar($pane) {
        if (!$pane || !$pane.length) {
            return;
        }
        ensureShell($pane);
        var $bar = $pane.children('.folder-taskbar');
        var sessions = [];
        $pane.find('.folder-win').each(function () {
            var $win = $(this);
            sessions.push({
                id: $win.data('win-id'),
                kind: $win.hasClass('docked') ? 'dock' : 'float',
                title: $win.data('title') || $win.find('.folder-win-title-text').text() || '文件',
                active: !$win.hasClass('minimized') && $win.hasClass('focused'),
                minimized: $win.hasClass('minimized')
            });
        });
        if (!sessions.length) {
            $pane.removeClass('has-folder-sessions');
            $bar.hide().empty();
            return;
        }
        $pane.addClass('has-folder-sessions');
        var html = '';
        sessions.forEach(function (s) {
            var cls = 'folder-task-btn'
                + (s.active ? ' active' : '')
                + (s.minimized ? ' minimized' : '')
                + (s.kind === 'dock' ? ' docked' : '');
            html += '<button type="button" class="' + cls + '" data-sess-id="' + s.id
                + '" title="' + $('<div>').text(s.title).html() + '">'
                + FOLDER_ICO
                + '<span class="folder-task-label">' + $('<div>').text(s.title).html() + '</span>'
                + '</button>';
        });
        $bar.html(html).show();
        $bar.off('click').on('click', '.folder-task-btn', function () {
            var id = $(this).data('sess-id');
            var $win = $pane.find('.folder-win[data-win-id="' + id + '"]');
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
    }

    function syncFilesButton($pane) {
        var has = $pane.find('.folder-win').length > 0;
        try {
            var rightWin = $pane.find('.rightFrame')[0] && $pane.find('.rightFrame')[0].contentWindow;
            if (rightWin) {
                rightWin.postMessage({
                    type: 'webssh-files-visible',
                    visible: has
                }, '*');
            }
        } catch (e) { /* ignore */ }
    }

    function countWindows($pane) {
        return $pane.find('.folder-win').length;
    }

    function broadcastClipboard($pane, clipboard) {
        w.__websshFolderClipboard = clipboard;
        $pane.find('.folder-win-frame, .leftFrame').each(function () {
            try {
                if (this.contentWindow) {
                    this.contentWindow.postMessage({
                        type: 'webssh-folder-clipboard-sync',
                        clipboard: clipboard
                    }, '*');
                }
            } catch (e) { /* ignore */ }
        });
    }

    function setWindowTitle($frame, path) {
        var name = titleFromPath(path);
        var $win = $frame.closest('.folder-win');
        if ($win.length) {
            $win.find('.folder-win-title-text').text(name);
            $win.data('title', name);
            updateTaskbar($win.closest('.remote-pane'));
        }
    }

    function handleToggleFiles($pane, sourceWin) {
        openFolderWindow($pane);
        try {
            if (sourceWin) {
                sourceWin.postMessage({ type: 'webssh-files-visible', visible: true }, '*');
            }
        } catch (e) { /* ignore */ }
    }

    function dockFromFrame($pane, sourceWin) {
        var $srcFrame = $('iframe').filter(function () {
            return this.contentWindow === sourceWin;
        }).first();
        var $fw = $srcFrame.closest('.folder-win');
        if ($fw.length) {
            if ($fw.hasClass('docked')) {
                return;
            }
            dockFromWindow($pane, $fw);
            return;
        }
        openFolderWindow($pane, { dock: true });
    }

    function setDockPanelWidth($win, width) {
        width = Math.max(MIN_DOCK_W, Math.round(width));
        $win.data('dock-width', width);
        $win.css('width', width + 'px');
    }

    w.FolderWindows = {
        open: openFolderWindow,
        handleToggleFiles: handleToggleFiles,
        broadcastClipboard: broadcastClipboard,
        setWindowTitle: setWindowTitle,
        countWindows: countWindows,
        syncFilesButton: syncFilesButton,
        dockFromFrame: dockFromFrame,
        dockFromWindow: dockFromWindow,
        setDockPanelWidth: setDockPanelWidth,
        updateTaskbar: updateTaskbar,
        visibleDocked: visibleDocked,
        rebuildDockLayout: rebuildDockLayout,
        MIN_DOCK_W: MIN_DOCK_W,
        MIN_TERM_W: MIN_TERM_W,
        DEFAULT_DOCK_W: DEFAULT_DOCK_W
    };
})(window);
