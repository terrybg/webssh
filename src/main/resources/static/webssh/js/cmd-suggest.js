/**
 * IDEA-like command suggest + enter collect for WebSSH terminal.
 * Public: CmdSuggest.init({ term, client, getTagId, getSessionId, baseUrl, loadCommandData, getCommandData })
 */
var CmdSuggest = (function () {
    var MAX_CANDIDATES = 12;
    var opts = null;
    var buffer = '';
    var candidates = [];
    var activeIndex = 0;
    var visible = false;
    var suppressing = false;
    var composing = false; // IME 组合输入中，避免干扰中文输入
    // 仅在用户按过 ↑↓ 后，Tab/回车才作用于提示（避免抢 shell 补全与执行）
    var navigated = false;

    function send(command) {
        if (!opts || !opts.client) {
            return;
        }
        opts.client.send({
            operate: 'command',
            tagId: typeof opts.getTagId === 'function' ? opts.getTagId() : opts.getTagId,
            command: command
        });
    }

    function getData() {
        if (typeof opts.getCommandData === 'function') {
            return opts.getCommandData() || { global: [], session: [] };
        }
        return { global: [], session: [] };
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** 本机命令前的用户小图标（通用命令留空占位对齐）。 */
    var SESSION_USER_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true">'
        + '<path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm4-3a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/>'
        + '<path d="M14 14s-1-4-6-4-6 4-6 4 1 1 6 1 6-1 6-1zm-1.1-.7C11.9 11.9 10.3 11 8 11s-3.9.9-4.9 2.3c.7.3 2.1.7 4.9.7s4.2-.4 4.9-.7z"/>'
        + '</svg>';

    /** 在文本中高亮与 buffer 匹配的连续片段（忽略大小写，首处匹配）。 */
    function highlightMatch(text, query) {
        text = text == null ? '' : String(text);
        query = query == null ? '' : String(query);
        if (!text) {
            return '';
        }
        if (!query) {
            return escapeHtml(text);
        }
        var lower = text.toLowerCase();
        var q = query.toLowerCase();
        var idx = lower.indexOf(q);
        if (idx === -1) {
            return escapeHtml(text);
        }
        return escapeHtml(text.slice(0, idx))
            + '<mark class="cmd-match">' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>'
            + escapeHtml(text.slice(idx + q.length));
    }

    function hideSuggest() {
        visible = false;
        candidates = [];
        activeIndex = 0;
        navigated = false;
        var el = document.getElementById('cmdSuggest');
        if (el) {
            el.style.display = 'none';
        }
        var list = document.getElementById('cmdSuggestList');
        if (list) {
            list.innerHTML = '';
        }
    }

    /** Resolve terminal cursor screen position (viewport coords). */
    function getCursorViewportPos() {
        var term = opts && opts.term;
        if (!term || !term.element) {
            return null;
        }
        var cellW = 9;
        var cellH = 17;
        var cursorX = 0;
        var cursorY = 0;
        try {
            var core = term._core;
            var buf = term.buffer;
            if (buf && buf.active) {
                cursorX = buf.active.cursorX;
                cursorY = buf.active.cursorY;
            } else if (buf && typeof buf.cursorX === 'number') {
                cursorX = buf.cursorX;
                cursorY = buf.cursorY;
            } else if (core && core.buffer) {
                cursorX = core.buffer.x;
                cursorY = core.buffer.y;
            }
            var dims = core && core._renderService && core._renderService.dimensions;
            if (dims) {
                if (dims.actualCellWidth) {
                    cellW = dims.actualCellWidth;
                }
                if (dims.actualCellHeight) {
                    cellH = dims.actualCellHeight;
                }
            } else if (core && core.renderer && core.renderer.dimensions) {
                var d2 = core.renderer.dimensions;
                cellW = d2.actualCellWidth || cellW;
                cellH = d2.actualCellHeight || cellH;
            }
        } catch (e) {
            /* fall through */
        }
        // Prefer DOM cursor element when present (more accurate with padding/scroll)
        try {
            var cursorEl = term.element.querySelector('.xterm-cursor-layer .xterm-cursor')
                || term.element.querySelector('.xterm-cursor');
            if (cursorEl) {
                var cr = cursorEl.getBoundingClientRect();
                if (cr.width || cr.height || cr.left || cr.top) {
                    return {
                        left: cr.left,
                        top: cr.top,
                        bottom: cr.bottom || (cr.top + cellH),
                        cellH: cellH,
                        cellW: cellW
                    };
                }
            }
        } catch (e2) { /* ignore */ }

        var termRect = term.element.getBoundingClientRect();
        var topPad = 0;
        var leftPad = 0;
        try {
            var screenEl = term.element.querySelector('.xterm-screen') || term.element.querySelector('.xterm-rows');
            if (screenEl) {
                var sr = screenEl.getBoundingClientRect();
                leftPad = sr.left - termRect.left;
                topPad = sr.top - termRect.top;
            }
        } catch (e3) { /* ignore */ }
        var left = termRect.left + leftPad + cursorX * cellW;
        var top = termRect.top + topPad + cursorY * cellH;
        return {
            left: left,
            top: top,
            bottom: top + cellH,
            cellH: cellH,
            cellW: cellW
        };
    }

    /** Keep ↑↓ 高亮项落在 .cmd-suggest 可视区内（触发内部滚动条）。 */
    function scrollActiveIntoView() {
        if (!navigated) {
            return;
        }
        var el = document.getElementById('cmdSuggest');
        var list = document.getElementById('cmdSuggestList');
        if (!el || !list) {
            return;
        }
        var active = list.querySelector('li.active');
        if (!active) {
            return;
        }
        if (typeof active.scrollIntoView === 'function') {
            try {
                active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                return;
            } catch (e) {
                try {
                    active.scrollIntoView(false);
                    return;
                } catch (e2) { /* fall through */ }
            }
        }
        var top = active.offsetTop;
        var bottom = top + active.offsetHeight;
        var viewTop = el.scrollTop;
        var viewBottom = viewTop + el.clientHeight;
        if (top < viewTop) {
            el.scrollTop = top;
        } else if (bottom > viewBottom) {
            el.scrollTop = bottom - el.clientHeight;
        }
    }

    /** Place popup below cursor, or above if near bottom of viewport. */
    function positionSuggestNearCursor() {
        var el = document.getElementById('cmdSuggest');
        if (!el || el.style.display === 'none') {
            return;
        }
        var pos = getCursorViewportPos();
        var margin = 8;
        var gap = 4;
        var maxH = 240;
        var rect = el.getBoundingClientRect();
        var popupH = rect.height || Math.min(maxH, el.scrollHeight || 120);
        var popupW = rect.width || Math.min(640, window.innerWidth * 0.8);

        var left;
        var top;
        if (!pos) {
            left = margin;
            top = window.innerHeight - popupH - 40;
        } else {
            left = pos.left;
            var spaceBelow = window.innerHeight - pos.bottom - margin;
            var spaceAbove = pos.top - margin;
            var placeAbove = spaceBelow < popupH + gap && spaceAbove > spaceBelow;
            if (placeAbove) {
                top = pos.top - popupH - gap;
            } else {
                top = pos.bottom + gap;
            }
        }

        if (left + popupW > window.innerWidth - margin) {
            left = window.innerWidth - popupW - margin;
        }
        if (left < margin) {
            left = margin;
        }
        if (top < margin) {
            top = margin;
        }
        if (top + popupH > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - popupH - margin);
        }

        el.style.left = Math.round(left) + 'px';
        el.style.top = Math.round(top) + 'px';
        el.style.bottom = 'auto';
    }

    function resetBuffer() {
        buffer = '';
        hideSuggest();
    }

    function matchQuery(item, q) {
        var name = (item.name || '').toLowerCase();
        var value = (item.value || '').toLowerCase();
        if (!q) {
            return false;
        }
        return name.indexOf(q) !== -1 || value.indexOf(q) !== -1
            || name.indexOf(q) === 0 || value.indexOf(q) === 0;
    }

    function buildCandidates() {
        var q = (buffer || '').toLowerCase();
        if (!q) {
            return [];
        }
        var data = getData();
        var rows = [];
        (data.global || []).forEach(function (i) {
            rows.push({
                name: i.name,
                value: i.value,
                source: 'global'
            });
        });
        (data.session || []).forEach(function (i) {
            rows.push({
                name: i.name,
                value: i.value,
                source: 'session'
            });
        });
        var out = [];
        for (var i = 0; i < rows.length; i++) {
            if (matchQuery(rows[i], q)) {
                out.push(rows[i]);
                if (out.length >= MAX_CANDIDATES) {
                    break;
                }
            }
        }
        return out;
    }

    function renderSuggest() {
        var el = document.getElementById('cmdSuggest');
        var list = document.getElementById('cmdSuggestList');
        if (!el || !list) {
            return;
        }
        candidates = buildCandidates();
        if (!candidates.length) {
            hideSuggest();
            return;
        }
        if (!navigated) {
            activeIndex = 0;
        } else if (activeIndex >= candidates.length) {
            activeIndex = candidates.length - 1;
        }
        if (activeIndex < 0) {
            activeIndex = 0;
        }
        var q = buffer || '';
        var html = '';
        for (var i = 0; i < candidates.length; i++) {
            var item = candidates[i];
            // 未按 ↑↓ 前不高亮，避免暗示 Tab/回车会选中该项
            var cls = (navigated && i === activeIndex) ? ' class="active"' : '';
            var valueText = item.value || '';
            var nameText = item.name || '';
            var isSession = item.source === 'session';
            var iconHtml = isSession ? SESSION_USER_ICON : '';
            var nameHtml = '';
            if (nameText && nameText !== valueText) {
                nameHtml = '<div class="cmd-name">' + highlightMatch(nameText, q) + '</div>';
            }
            html += '<li' + cls + ' data-idx="' + i + '">'
                + '<div class="cmd-row">'
                + '<span class="cmd-src" title="' + (isSession ? '本机' : '') + '">' + iconHtml + '</span>'
                + '<div class="cmd-body">'
                + '<div class="cmd-val">' + highlightMatch(valueText, q) + '</div>'
                + nameHtml
                + '</div></div></li>';
        }
        list.innerHTML = html;
        el.style.display = 'block';
        visible = true;
        // Measure after paint so height/position accurate；再滚到高亮项
        function afterPaint() {
            positionSuggestNearCursor();
            scrollActiveIntoView();
        }
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(afterPaint);
        } else {
            setTimeout(afterPaint, 0);
        }
    }

    function refreshCandidates() {
        if (!buffer) {
            hideSuggest();
            return;
        }
        // 输入变化后需重新 ↑↓ 才会让 Tab/回车作用于提示
        navigated = false;
        renderSuggest();
    }

    function replaceBufferWith(cmd) {
        cmd = cmd == null ? '' : String(cmd);
        suppressing = true;
        var len = buffer.length;
        var bs = '';
        for (var i = 0; i < len; i++) {
            bs += '\x7f';
        }
        if (bs) {
            send(bs);
        }
        if (cmd) {
            send(cmd);
        }
        buffer = cmd;
        suppressing = false;
        refreshCandidates();
    }

    function collectText(text) {
        var sid = typeof opts.getSessionId === 'function' ? opts.getSessionId() : null;
        if (!sid || text == null || String(text).trim() === '') {
            return;
        }
        $.ajax({
            url: opts.baseUrl + '/commands/collect',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ sessionId: sid, text: String(text) })
        }).always(function () {
            if (typeof opts.loadCommandData === 'function') {
                opts.loadCommandData();
            }
        });
    }

    function handleEnter(raw) {
        if (visible && navigated && candidates.length && candidates[activeIndex]) {
            var selected = candidates[activeIndex].value || '';
            replaceBufferWith(selected);
            send(raw);
            var executed = selected;
            resetBuffer();
            collectText(executed);
            return;
        }
        var toCollect = buffer;
        send(raw);
        resetBuffer();
        collectText(toCollect);
    }

    function handleBackspace(raw) {
        if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
        }
        send(raw);
        refreshCandidates();
    }

    function handleTab(raw) {
        if (visible && navigated && candidates.length && candidates[activeIndex]) {
            replaceBufferWith(candidates[activeIndex].value || '');
            return;
        }
        send(raw);
    }

    function handleEsc() {
        if (visible) {
            hideSuggest();
            return;
        }
        send('\x1b');
    }

    function handleArrow(delta, raw) {
        if (!visible || !candidates.length) {
            // Shell history / cursor nav — drop stale buffer so Enter won't collect it
            resetBuffer();
            send(raw);
            return;
        }
        navigated = true;
        activeIndex = (activeIndex + delta + candidates.length) % candidates.length;
        renderSuggest();
    }

    function appendPrintable(chunk) {
        buffer += chunk;
        send(chunk);
        refreshCandidates();
    }

    function onData(data) {
        if (suppressing || !opts) {
            return;
        }
        // 中文等 IME 组合过程中：原样下发，不更新提示缓冲，避免乱码/打断选词
        if (composing) {
            send(data);
            return;
        }
        if (data === '\r' || data === '\n') {
            handleEnter(data);
            return;
        }
        if (data === '\x7f' || data === '\b') {
            handleBackspace(data);
            return;
        }
        if (data === '\t') {
            handleTab(data);
            return;
        }
        if (data === '\x1b') {
            handleEsc();
            return;
        }
        if (data === '\x1b[A' || data === '\x1bOA') {
            handleArrow(-1, data);
            return;
        }
        if (data === '\x1b[B' || data === '\x1bOB') {
            handleArrow(1, data);
            return;
        }
        if (data === '\x03' || data === '\x15') {
            resetBuffer();
            send(data);
            return;
        }
        // CSI / other ESC sequences (arrows when not handled, home/end/delete, etc.):
        // reset buffer so history navigation cannot leave stale text for Enter collect
        if (data && (data.indexOf('\x1b[') === 0 || data.charCodeAt(0) === 0x1b)) {
            resetBuffer();
            send(data);
            return;
        }
        // Multi-line paste: one send + one collect (backend truncates by collectLines)
        if (data.indexOf('\r') !== -1 || data.indexOf('\n') !== -1) {
            var toCollect = buffer ? (buffer + data) : data;
            send(data);
            resetBuffer();
            collectText(toCollect);
            return;
        }
        appendPrintable(data);
    }

    function bindListClicks() {
        $(document).on('mousedown', '#cmdSuggestList li', function (e) {
            e.preventDefault();
            var idx = parseInt($(this).attr('data-idx'), 10);
            if (isNaN(idx) || !candidates[idx]) {
                return;
            }
            activeIndex = idx;
            replaceBufferWith(candidates[idx].value || '');
        });
    }

    function bindImeEvents() {
        if (!opts || !opts.term || !opts.term.element) {
            return;
        }
        var ta = opts.term.textarea
            || opts.term.element.querySelector('.xterm-helper-textarea');
        if (!ta || ta._cmdSuggestImeBound) {
            return;
        }
        ta._cmdSuggestImeBound = true;
        ta.addEventListener('compositionstart', function () {
            composing = true;
            hideSuggest();
        });
        ta.addEventListener('compositionend', function () {
            composing = false;
        });
    }

    function init(options) {
        opts = options || {};
        buffer = '';
        composing = false;
        navigated = false;
        hideSuggest();
        if (!opts.term) {
            return;
        }
        opts.term.onData(onData);
        bindListClicks();
        bindImeEvents();
    }

    return {
        init: init,
        replaceBufferWith: replaceBufferWith
    };
})();
