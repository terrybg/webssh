/**
 * Desktop operation sessions (Windows-style background tasks panel).
 * Persists to localStorage; scan + file jobs reconnect after page refresh.
 */
(function (w, $) {
    'use strict';

    var STORAGE_KEY = 'webssh.operations.v1';
    var MAX_ITEMS = 32;
    var DONE_TTL_MS = 3600000;
    var ops = {};
    var panelOpen = false;
    var pollTimer = null;

    var KIND_LABEL = {
        scan: '磁盘扫描',
        upload: '上传',
        delete: '删除',
        extract: '解压',
        compress: '压缩',
        copy: '复制'
    };

    function now() {
        return Date.now();
    }

    function uid(prefix) {
        return (prefix || 'op') + '-' + now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function loadStore() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return {};
            }
            var arr = JSON.parse(raw);
            if (!Array.isArray(arr)) {
                return {};
            }
            var map = {};
            arr.forEach(function (o) {
                if (o && o.id) {
                    map[o.id] = o;
                }
            });
            return map;
        } catch (e) {
            return {};
        }
    }

    function sortByStartTime(a, b) {
        var ta = (a && (a.startedAt || a.updatedAt)) || 0;
        var tb = (b && (b.startedAt || b.updatedAt)) || 0;
        if (tb !== ta) {
            return tb - ta; // newest first, stable while progress updates
        }
        return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
    }

    function saveStore() {
        var list = Object.keys(ops).map(function (k) { return ops[k]; });
        list.sort(sortByStartTime);
        list = list.slice(0, MAX_ITEMS);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) { /* ignore */ }
    }

    function prune() {
        var t = now();
        Object.keys(ops).forEach(function (id) {
            var o = ops[id];
            if (!o) {
                return;
            }
            if (o.state === 'done' || o.state === 'error' || o.state === 'interrupted') {
                if (t - (o.finishedAt || o.updatedAt || 0) > DONE_TTL_MS) {
                    delete ops[id];
                }
            }
        });
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function kindLabel(kind) {
        return KIND_LABEL[kind] || kind || '任务';
    }

    function stateText(o) {
        if (o.state === 'running') {
            return o.indeterminate ? '进行中…' : (Math.round(o.progress || 0) + '%');
        }
        if (o.state === 'paused') {
            return '已暂停';
        }
        if (o.state === 'done') {
            return '已完成';
        }
        if (o.state === 'error') {
            return '失败';
        }
        if (o.state === 'interrupted') {
            return '已中断';
        }
        return '';
    }

    function isActive(o) {
        return o && (o.state === 'running' || o.state === 'paused');
    }

    function isFinished(o) {
        return o && (o.state === 'done' || o.state === 'error' || o.state === 'interrupted');
    }

    function canPause(o) {
        return isActive(o) && (o.kind === 'scan' || !!o.jobId);
    }

    function activeCount() {
        var n = 0;
        Object.keys(ops).forEach(function (id) {
            if (isActive(ops[id])) {
                n += 1;
            }
        });
        return n;
    }

    function finishedCount() {
        var n = 0;
        Object.keys(ops).forEach(function (id) {
            if (isFinished(ops[id])) {
                n += 1;
            }
        });
        return n;
    }

    function badgeCount() {
        var n = activeCount();
        if (n > 0) {
            return n;
        }
        var total = 0;
        Object.keys(ops).forEach(function () { total += 1; });
        return total > 0 ? total : 0;
    }

    function renderList() {
        var $list = $('#desktopOperationsList');
        if (!$list.length) {
            return;
        }
        var ids = Object.keys(ops);
        ids.sort(function (a, b) {
            return sortByStartTime(ops[a], ops[b]);
        });
        var $clear = $('#desktopOperationsClear');
        if ($clear.length) {
            $clear.toggle(finishedCount() > 0);
        }
        if (!ids.length) {
            $list.html('<div class="desktop-ops-empty">暂无后台任务</div>');
            return;
        }
        var html = '';
        ids.forEach(function (id) {
            var o = ops[id];
            if (!o) {
                return;
            }
            var pct = o.indeterminate ? 0 : Math.max(0, Math.min(100, Number(o.progress) || 0));
            var barCls = o.state === 'error' || o.state === 'interrupted' ? 'error'
                : (o.state === 'done' ? 'done' : (o.state === 'paused' ? 'paused' : ''));
            var barInner = o.indeterminate && o.state === 'running'
                ? '<div class="desktop-ops-bar-indeterminate"></div>'
                : ('<div class="desktop-ops-bar-fill" style="width:' + (o.state === 'paused' ? Math.max(pct, 8) : pct) + '%"></div>');
            var actions = '<span class="desktop-ops-actions">';
            if (o.state === 'running' && canPause(o)) {
                actions += '<button type="button" class="desktop-ops-btn desktop-ops-pause" data-op-id="'
                    + esc(id) + '" title="暂停">暂停</button>';
            }
            if (o.state === 'paused' && canPause(o)) {
                actions += '<button type="button" class="desktop-ops-btn desktop-ops-resume" data-op-id="'
                    + esc(id) + '" title="继续">继续</button>';
            }
            if (isActive(o)) {
                actions += '<button type="button" class="desktop-ops-btn desktop-ops-cancel" data-op-id="'
                    + esc(id) + '" title="取消">取消</button>';
            }
            if (isFinished(o)) {
                actions += '<button type="button" class="desktop-ops-btn desktop-ops-remove" data-op-id="'
                    + esc(id) + '" title="删除">删除</button>';
            }
            actions += '</span>';
            var host = o.sessionName ? esc(o.sessionName) : (o.tagId ? esc(o.tagId) : '');
            var cwdHint = o.cwd ? esc(o.cwd) : '';
            html += '<div class="desktop-ops-item state-' + esc(o.state) + '" data-op-id="' + esc(id) + '" title="点击打开对应文件夹">'
                + '<div class="desktop-ops-item-head">'
                + '<span class="desktop-ops-kind">' + esc(kindLabel(o.kind)) + '</span>'
                + '<span class="desktop-ops-state">' + esc(stateText(o)) + '</span>'
                + actions
                + '</div>'
                + '<div class="desktop-ops-title">' + esc(o.title || '') + '</div>'
                + (o.detail ? '<div class="desktop-ops-detail">' + esc(o.detail) + '</div>' : '')
                + (cwdHint ? '<div class="desktop-ops-host">' + cwdHint + '</div>' : '')
                + (host && !cwdHint ? '<div class="desktop-ops-host">' + host + '</div>' : '')
                + '<div class="desktop-ops-bar ' + barCls + '">' + barInner + '</div>'
                + '</div>';
        });
        $list.html(html);
    }

    function syncFab() {
        var n = activeCount();
        var shown = badgeCount();
        var $fab = $('#desktopOperationsFab');
        var $badge = $('#desktopOperationsBadge');
        if (!$fab.length) {
            return;
        }
        $fab.removeAttr('hidden');
        if ($badge.length) {
            if (shown > 0) {
                $badge.text(String(shown > 99 ? '99+' : shown)).show();
            } else {
                $badge.hide();
            }
            $badge.toggleClass('is-active', n > 0);
        }
    }

    function openPanel() {
        panelOpen = true;
        $('#desktopOperationsPanel').addClass('show').attr('aria-hidden', 'false');
        $('#desktopOperationsFab').removeAttr('hidden');
        renderList();
    }

    function closePanel() {
        panelOpen = false;
        $('#desktopOperationsPanel').removeClass('show').attr('aria-hidden', 'true');
        syncFab();
    }

    function upsert(data, action) {
        if (!data || !data.id) {
            return;
        }
        var prev = ops[data.id] || {};
        var o = Object.assign({}, prev, data);
        o.updatedAt = data.ts || now();
        if (!o.startedAt) {
            o.startedAt = prev.startedAt || o.updatedAt;
        }
        if (action === 'start') {
            o.startedAt = prev.startedAt || o.startedAt || o.updatedAt;
            o.state = 'running';
        }
        if (action === 'update' && data.state) {
            o.state = data.state;
        }
        if (action === 'finish') {
            if (data.state === 'interrupted') {
                o.state = 'interrupted';
            } else {
                o.state = data.ok === false ? 'error' : 'done';
            }
            o.finishedAt = o.updatedAt;
            if (data.progress != null) {
                o.progress = data.progress;
            } else if (o.state === 'done') {
                o.progress = 100;
                o.indeterminate = false;
            }
        }
        if (action === 'remove') {
            delete ops[data.id];
            saveStore();
            renderList();
            syncFab();
            schedulePoll();
            return;
        }
        ops[o.id] = o;
        prune();
        saveStore();
        renderList();
        syncFab();
        schedulePoll();
        if (o.state === 'running' && !panelOpen && activeCount() === 1) {
            openPanel();
        }
    }

    function markInterrupted() {
        Object.keys(ops).forEach(function (id) {
            var o = ops[id];
            if (!o || o.state !== 'running') {
                return;
            }
            // Reconnectable jobs (scan / server file ops) stay running and will be polled
            if (o.reconnectable || o.jobId || o.kind === 'scan' || o.state === 'paused') {
                return;
            }
            o.state = 'interrupted';
            o.detail = '页面刷新后无法继续（本地上传需重新选择文件）';
            o.finishedAt = now();
            o.updatedAt = now();
        });
        saveStore();
    }

    function apiBase() {
        return (typeof w.baseUrl === 'string' && w.baseUrl)
            || ((typeof baseUrl === 'string' && baseUrl) || '/webssh/api');
    }

    function pollJob(op) {
        if (!op || !op.jobId) {
            return;
        }
        $.ajax({
            url: apiBase() + '/op/status',
            data: { id: op.jobId },
            method: 'GET',
            timeout: 12000,
            success: function (res) {
                if (!res || res.status !== 200 || !res.result) {
                    if (op.state === 'running') {
                        upsert({
                            id: op.id,
                            state: 'interrupted',
                            detail: '任务已丢失，请重新操作',
                            finishedAt: now()
                        }, 'finish');
                    }
                    return;
                }
                var snap = res.result;
                var patch = {
                    id: op.id,
                    detail: snap.detail || op.detail,
                    progress: snap.progress,
                    indeterminate: !!snap.indeterminate,
                    cwd: snap.cwd || op.cwd,
                    jobId: snap.id || op.jobId,
                    reconnectable: true,
                    cancelable: snap.state === 'running'
                };
                if (snap.state === 'running') {
                    patch.state = 'running';
                    upsert(patch, 'update');
                } else if (snap.state === 'paused') {
                    patch.state = 'paused';
                    upsert(patch, 'update');
                } else if (snap.state === 'done') {
                    upsert(Object.assign(patch, { ok: true, progress: 100 }), 'finish');
                } else {
                    upsert(Object.assign(patch, { ok: false, detail: snap.detail || '失败' }), 'finish');
                }
            }
        });
    }

    function schedulePoll() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
        var need = false;
        Object.keys(ops).forEach(function (id) {
            var o = ops[id];
            if (o && (o.state === 'running' || o.state === 'paused') && o.jobId) {
                need = true;
            }
        });
        if (!need) {
            return;
        }
        pollTimer = setTimeout(function () {
            Object.keys(ops).forEach(function (id) {
                var o = ops[id];
                if (o && (o.state === 'running' || o.state === 'paused') && o.jobId) {
                    pollJob(o);
                }
            });
            schedulePoll();
        }, 800);
    }

    function postToFrames(payload) {
        var frames = document.querySelectorAll('#desktopSessionLayer iframe, #desktopDockStrip iframe');
        for (var i = 0; i < frames.length; i++) {
            try {
                frames[i].contentWindow.postMessage(payload, '*');
            } catch (e) { /* ignore */ }
        }
    }

    function pauseOperation(id) {
        var o = ops[id];
        if (!o || o.state !== 'running' || !canPause(o)) {
            return;
        }
        if (o.kind === 'scan') {
            $.post(apiBase() + '/du/pause', { tagId: o.tagId });
            postToFrames({ type: 'webssh-operation-pause', id: id, kind: 'scan', tagId: o.tagId });
        } else if (o.jobId) {
            $.post(apiBase() + '/op/pause', { id: o.jobId });
        }
        upsert({ id: id, state: 'paused', detail: o.detail || '已暂停' }, 'update');
    }

    function resumeOperation(id) {
        var o = ops[id];
        if (!o || o.state !== 'paused' || !canPause(o)) {
            return;
        }
        if (o.kind === 'scan') {
            $.post(apiBase() + '/du/resume', { tagId: o.tagId });
            postToFrames({ type: 'webssh-operation-resume', id: id, kind: 'scan', tagId: o.tagId });
        } else if (o.jobId) {
            $.post(apiBase() + '/op/resume', { id: o.jobId });
        }
        upsert({ id: id, state: 'running' }, 'update');
    }

    function removeOperation(id) {
        var o = ops[id];
        if (!o || !isFinished(o)) {
            return;
        }
        upsert({ id: id }, 'remove');
    }

    function clearFinished() {
        Object.keys(ops).forEach(function (id) {
            if (isFinished(ops[id])) {
                delete ops[id];
            }
        });
        saveStore();
        renderList();
        syncFab();
    }

    function cancelOperation(id) {
        var o = ops[id];
        if (!o || !isActive(o)) {
            return;
        }
        if (o.jobId) {
            $.post(apiBase() + '/op/cancel', { id: o.jobId });
        }
        postToFrames({
            type: 'webssh-operation-cancel',
            id: id,
            kind: o.kind,
            tagId: o.tagId,
            jobId: o.jobId
        });
        upsert({
            id: id,
            ok: false,
            state: 'error',
            detail: o.kind === 'scan' ? '已停止扫描' : '已取消'
        }, 'finish');
    }

    function findOpenSftpFrame(tagId) {
        var frames = document.querySelectorAll('#desktopSessionLayer iframe, #desktopDockStrip iframe');
        for (var i = 0; i < frames.length; i++) {
            var fr = frames[i];
            try {
                var $win = $(fr).closest('.session-win');
                if ($win.data('kind') !== 'sftp') {
                    continue;
                }
                if (tagId && String($win.data('tag-id') || '') === String(tagId)) {
                    return { frame: fr, $win: $win };
                }
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    function focusOperation(op) {
        if (!op) {
            return;
        }
        var cwd = op.cwd || '';
        var tagId = op.tagId || '';
        var sessionId = op.sessionId;
        var hit = findOpenSftpFrame(tagId);
        if (hit) {
            if (w.SessionWindows && typeof w.SessionWindows.focus === 'function') {
                w.SessionWindows.focus(hit.$win);
            }
            try {
                hit.frame.contentWindow.postMessage({
                    type: 'webssh-operation-focus',
                    kind: op.kind,
                    tagId: tagId,
                    cwd: cwd,
                    opId: op.id,
                    jobId: op.jobId,
                    restoreScan: op.kind === 'scan'
                }, '*');
            } catch (e) { /* ignore */ }
            return;
        }
        function openWithSession(session) {
            if (!session || typeof w.openFileWindow !== 'function') {
                return;
            }
            w.openFileWindow(session, { cwd: cwd || undefined }).done(function ($win) {
                var tries = 0;
                var timer = setInterval(function () {
                    tries += 1;
                    var fr = $win && $win.find('iframe')[0];
                    if (fr && fr.contentWindow) {
                        try {
                            fr.contentWindow.postMessage({
                                type: 'webssh-operation-focus',
                                kind: op.kind,
                                tagId: tagId,
                                cwd: cwd,
                                opId: op.id,
                                jobId: op.jobId,
                                restoreScan: op.kind === 'scan'
                            }, '*');
                            clearInterval(timer);
                        } catch (e2) { /* wait */ }
                    }
                    if (tries > 40) {
                        clearInterval(timer);
                    }
                }, 250);
            });
        }
        if (sessionId != null && typeof w.resolveSession === 'function') {
            w.resolveSession(sessionId, openWithSession);
            return;
        }
        // fallback: match by stored tagId in sessionsCache
        try {
            var cache = w.sessionsCache || {};
            var ids = Object.keys(cache);
            for (var i = 0; i < ids.length; i++) {
                var s = cache[ids[i]];
                if (!s) {
                    continue;
                }
                var tid = typeof w.getWebsshStoredTagId === 'function' ? w.getWebsshStoredTagId(s) : '';
                if (tid && String(tid) === String(tagId)) {
                    openWithSession(s);
                    return;
                }
            }
        } catch (e3) { /* ignore */ }
    }

    function onMessage(data) {
        if (!data || data.type !== 'webssh-operation') {
            return;
        }
        upsert(data, data.action);
    }

    function init() {
        ops = loadStore();
        markInterrupted();
        prune();
        saveStore();
        renderList();
        syncFab();
        schedulePoll();

        $('#desktopOperationsToggle').on('click', function () {
            if ($('#desktopOperationsPanel').hasClass('show')) {
                closePanel();
            } else {
                openPanel();
            }
        });
        $('#desktopOperationsClose').on('click', closePanel);
        $('#desktopOperationsClear').on('click', function (e) {
            e.stopPropagation();
            clearFinished();
        });
        $('#desktopOperationsList').on('click', '.desktop-ops-pause', function (e) {
            e.stopPropagation();
            pauseOperation($(this).attr('data-op-id'));
        });
        $('#desktopOperationsList').on('click', '.desktop-ops-resume', function (e) {
            e.stopPropagation();
            resumeOperation($(this).attr('data-op-id'));
        });
        $('#desktopOperationsList').on('click', '.desktop-ops-cancel', function (e) {
            e.stopPropagation();
            cancelOperation($(this).attr('data-op-id'));
        });
        $('#desktopOperationsList').on('click', '.desktop-ops-remove', function (e) {
            e.stopPropagation();
            removeOperation($(this).attr('data-op-id'));
        });
        $('#desktopOperationsList').on('click', '.desktop-ops-item', function () {
            focusOperation(ops[$(this).attr('data-op-id')]);
        });

        w.addEventListener('message', function (e) {
            if (e.data && e.data.type === 'webssh-operation') {
                onMessage(e.data);
            }
        });
    }

    w.OperationHub = {
        init: init,
        open: openPanel,
        close: closePanel,
        upsert: upsert,
        focus: focusOperation,
        scanId: function (tagId) {
            return 'scan-' + String(tagId || '');
        },
        makeId: uid
    };

    $(init);
}(window, jQuery));
