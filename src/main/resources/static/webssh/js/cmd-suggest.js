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

    function hideSuggest() {
        visible = false;
        candidates = [];
        activeIndex = 0;
        var el = document.getElementById('cmdSuggest');
        if (el) {
            el.style.display = 'none';
        }
        var list = document.getElementById('cmdSuggestList');
        if (list) {
            list.innerHTML = '';
        }
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
        if (activeIndex >= candidates.length) {
            activeIndex = candidates.length - 1;
        }
        if (activeIndex < 0) {
            activeIndex = 0;
        }
        var html = '';
        for (var i = 0; i < candidates.length; i++) {
            var item = candidates[i];
            var tag = item.source === 'global' ? '通用' : '本机';
            var cls = i === activeIndex ? ' class="active"' : '';
            html += '<li' + cls + ' data-idx="' + i + '">'
                + '<span class="tag">[' + tag + ']</span>'
                + escapeHtml(item.name || item.value || '')
                + '<div class="cmd-val">' + escapeHtml(item.value || '') + '</div>'
                + '</li>';
        }
        list.innerHTML = html;
        el.style.display = 'block';
        visible = true;
    }

    function refreshCandidates() {
        if (!buffer) {
            hideSuggest();
            return;
        }
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
        if (visible && candidates.length && candidates[activeIndex]) {
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
        if (visible && candidates.length && candidates[activeIndex]) {
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
            send(raw);
            return;
        }
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
        if (data && data.charCodeAt(0) === 0x1b) {
            hideSuggest();
            send(data);
            return;
        }
        // Multi-line paste: buffer may contain \n; Enter segments trigger collect path
        if (data.indexOf('\r') !== -1 || data.indexOf('\n') !== -1) {
            var parts = data.split(/(\r\n|\r|\n)/);
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (!part) {
                    continue;
                }
                if (part === '\r' || part === '\n' || part === '\r\n') {
                    handleEnter(part === '\r\n' ? '\r' : part);
                } else {
                    appendPrintable(part);
                }
            }
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

    function init(options) {
        opts = options || {};
        buffer = '';
        hideSuggest();
        if (!opts.term) {
            return;
        }
        opts.term.onData(onData);
        bindListClicks();
    }

    return {
        init: init,
        replaceBufferWith: replaceBufferWith
    };
})();
