let client = new WSSHClient();
let xtermTheme = localStorage.getItem('xtermTheme') || 'dark';
let term = new Terminal({
    // 计算屏幕高度动态rows
    // rows: 30,
    // cols: 40,
    // rows: parseInt(window.innerHeight / 25),//parseInt(window.innerHeight / 24),
    // 光标闪烁
    cursorBlink: true,
    // 光标样式  null | 'block' | 'underline' | 'bar'
    cursorStyle: "block",
    //回滚
    scrollback: 1200,
    //制表宽度
    tabStopWidth: 8,
    screenKeys: true,
    allowProposedApi: true,
    theme: getColor(xtermTheme)
});
// 修改terminal的高度为body的高度
/*document.getElementById('terminal').style.height = window.innerHeight + 'px';
var term = new Terminal({cursorBlink: true});
term.open(document.getElementById('terminal'));*/
// xterm fullscreen config

var fitAddon=new window.FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));

function fitTerminal() {
    try {
        fitAddon.fit();
    } catch (e) {
        console.warn('fitAddon.fit failed', e);
    }
    sendTerminalResize();
}

var _lastSentCols = 0;
var _lastSentRows = 0;
var _resizeSendTimer = null;

function sendTerminalResize() {
    if (!term || !client) {
        return;
    }
    var cols = term.cols;
    var rows = term.rows;
    if (!cols || !rows) {
        return;
    }
    if (cols === _lastSentCols && rows === _lastSentRows) {
        return;
    }
    // 尚未连上时只记尺寸，等 onConnect 用 connect 带过去
    if (!client._connection) {
        return;
    }
    _lastSentCols = cols;
    _lastSentRows = rows;
    try {
        client.send({
            operate: 'resize',
            tagId: tagId,
            cols: cols,
            rows: rows
        });
    } catch (e) {
        console.warn('send resize failed', e);
    }
}

function scheduleTerminalResize() {
    if (_resizeSendTimer) {
        clearTimeout(_resizeSendTimer);
    }
    _resizeSendTimer = setTimeout(function () {
        fitTerminal();
    }, 40);
}

try {
    fitTerminal();
} catch (e) {
    console.warn('fitAddon.fit failed', e);
}
// term.write('Hello Remote Shell...');
//reloadTerm();
window.onresize = function(){
    scheduleTerminalResize();
    // 获取浏览器窗口的宽度和高度
    // reloadTerm();
};

// 窗口拖拽改尺寸时 iframe 内也要重算行列，避免终端看起来「没拉满」
if (typeof ResizeObserver !== 'undefined') {
    try {
        var termHost = document.getElementById('terminal');
        if (termHost) {
            var ro = new ResizeObserver(function () {
                scheduleTerminalResize();
            });
            ro.observe(termHost);
        }
    } catch (eRo) { /* ignore */ }
}
function reloadTerm(){
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    // 计算终端的列数和行数
    const cellWidth = 9; // 假设每个字符的宽度为 10 像素
    const cellHeight = 17; // 假设每个字符的高度为 20 像素
    const cols = Math.floor(screenWidth / cellWidth);
    const rows = Math.floor(screenHeight / cellHeight);
    term.resize(cols, rows);
}
let shortcutData = { global: [], session: [] };

function escapeShortcutHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveSessionId() {
    try {
        var fromQuery = typeof getQueryParam === 'function' ? getQueryParam('sessionId') : null;
        if (fromQuery) {
            return fromQuery;
        }
    } catch (e) { /* ignore */ }
    try {
        if (window.parent && window.parent !== window && window.parent.currentSessionId) {
            return window.parent.currentSessionId;
        }
    } catch (e2) { /* ignore */ }
    return typeof sessionId !== 'undefined' && sessionId ? sessionId : null;
}

function loadShortcuts() {
    var sid = resolveSessionId();
    const url = sid
        ? `${baseUrl}/commands/for-session/${encodeURIComponent(sid)}`
        : `${baseUrl}/commands?scope=global`;
    $.get(url)
        .done(function (res) {
            if (!res || res.status !== 200) {
                $('#shortcut').html('<li class="list-group-item bg-dark text-warning">快捷键加载失败</li>');
                return;
            }
            if (sid) {
                const result = res.result || {};
                shortcutData = {
                    global: Array.isArray(result.global) ? result.global : [],
                    session: Array.isArray(result.session) ? result.session : []
                };
            } else {
                const list = Array.isArray(res.result) ? res.result : [];
                shortcutData = { global: list, session: [] };
            }
            renderShortcuts();
        })
        .fail(function () {
            $('#shortcut').html('<li class="list-group-item bg-dark text-warning">快捷键接口请求失败</li>');
        });
}

function renderShortcuts() {
    const q = (($('#shortcutSearch').val() || '') + '').toLowerCase();
    const filter = $('#shortcutFilter').val() || 'all';
    let rows = [];
    if (filter !== 'session') {
        rows = rows.concat((shortcutData.global || []).map(function (i) {
            return { id: i.id, name: i.name, value: i.value, source: 'global' };
        }));
    }
    if (filter !== 'global') {
        rows = rows.concat((shortcutData.session || []).map(function (i) {
            return { id: i.id, name: i.name, value: i.value, source: 'session' };
        }));
    }
    rows = rows.filter(function (i) {
        if (!q) {
            return true;
        }
        var name = (i.name || '').toLowerCase();
        var value = (i.value || '').toLowerCase();
        return name.indexOf(q) !== -1 || value.indexOf(q) !== -1;
    });
    var $list = $('#shortcut');
    $list.empty();
    if (!rows.length) {
        $list.append('<li class="list-group-item bg-dark text-muted">无匹配命令</li>');
        return;
    }
    rows.forEach(function (item) {
        var tag = item.source === 'global' ? '通用' : '本机';
        var $li = $('<li class="list-group-item bg-dark shortcut-item"></li>');
        $li.attr('data-key', item.value || '');
        $li.html('[' + tag + '] ' + escapeShortcutHtml(item.name) + '<br>' + escapeShortcutHtml(item.value));
        $list.append($li);
    });
}

if (typeof CmdSuggest !== 'undefined') {
    CmdSuggest.init({
        term: term,
        client: client,
        getTagId: function () { return tagId; },
        getSessionId: resolveSessionId,
        baseUrl: baseUrl,
        loadCommandData: loadShortcuts,
        getCommandData: function () { return shortcutData; }
    });
} else {
    // Fallback: keep keyboard → SSH path when cmd-suggest.js is missing
    term.onData(function (data) {
        client.send({
            operate: 'command',
            tagId: tagId,
            command: data
        });
    });
}

$(function (){
    openTerminal();
    loadShortcuts();
    // v1: files open from desktop icon menu, not SSH toolbar
    $('#btnToggleFiles').hide().attr('aria-hidden', 'true');
    // 委托绑定，避免元素未就绪或缓存旧页导致无效
    $(document).on('input keyup', '#shortcutSearch', renderShortcuts);
    $(document).on('change', '#shortcutFilter', renderShortcuts);
    $(document).on('click', '#shortcut .shortcut-item', function () {
        var key = $(this).attr('data-key');
        if (key != null && term) {
            term.paste(key);
        }
    });

    var findMatches = [];
    var findIndex = -1;
    var findQuery = '';

    function isFindBarOpen() {
        return $('#sshFindBar').is(':visible');
    }

    function getTermBuffer() {
        try {
            if (!term || !term.buffer) {
                return null;
            }
            if (term.buffer.active && typeof term.buffer.active.getLine === 'function') {
                return term.buffer.active;
            }
            if (typeof term.buffer.getLine === 'function') {
                return term.buffer;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function scanFindMatches(query) {
        var buf = getTermBuffer();
        var hits = [];
        if (!buf || !query) {
            return hits;
        }
        var needle = query.toLowerCase();
        var len = buf.length || 0;
        for (var y = 0; y < len; y++) {
            var line = buf.getLine(y);
            if (!line || typeof line.translateToString !== 'function') {
                continue;
            }
            var text = line.translateToString(true);
            var hay = text.toLowerCase();
            var from = 0;
            while (from < hay.length) {
                var at = hay.indexOf(needle, from);
                if (at < 0) {
                    break;
                }
                hits.push({ y: y, x: at, len: query.length, text: text.substr(at, query.length) });
                from = at + Math.max(1, needle.length);
            }
        }
        return hits;
    }

    function updateFindStatus() {
        var $st = $('#sshFindStatus');
        var $bar = $('#sshFindBar');
        if (!findQuery) {
            $st.text('');
            $bar.removeClass('no-hit');
            return;
        }
        if (!findMatches.length) {
            $st.text('无匹配');
            $bar.addClass('no-hit');
            return;
        }
        $bar.removeClass('no-hit');
        $st.text((findIndex + 1) + ' / ' + findMatches.length);
    }

    function applyFindTheme(on) {
        $('body').toggleClass('ssh-finding', !!on);
        $('#sshFindHits').remove();
        if (!term || typeof term.setOption !== 'function') {
            return;
        }
        try {
            var base = getColor(xtermTheme) || {};
            if (on) {
                term.setOption('theme', $.extend({}, base, {
                    selection: '#FFD400',
                    selectionBackground: '#FFD400',
                    selectionInactiveBackground: '#FFD400'
                }));
            } else {
                term.setOption('theme', base);
            }
        } catch (e) { /* ignore */ }
    }

    function highlightFindMatch(m) {
        if (!m || !term) {
            return;
        }
        try {
            if (typeof term.scrollToLine === 'function') {
                term.scrollToLine(Math.max(0, m.y - 2));
            }
            var len = Math.max(1, m.len);
            if (typeof term.select === 'function') {
                term.select(m.x, m.y, len);
                var selected = '';
                try {
                    selected = term.getSelection ? (term.getSelection() || '') : '';
                } catch (e0) { /* ignore */ }
                if (!selected) {
                    var buf = getTermBuffer();
                    var top = buf && (buf.viewportY != null) ? buf.viewportY : (buf && buf.baseY != null ? buf.baseY : 0);
                    term.select(m.x, Math.max(0, m.y - top), len);
                }
            }
            if (typeof term.refresh === 'function') {
                term.refresh(0, term.rows - 1);
            }
        } catch (e) { /* ignore */ }
    }

    function jumpFind(delta) {
        if (!findMatches.length) {
            if (term && term.clearSelection) {
                term.clearSelection();
            }
            updateFindStatus();
            return;
        }
        findIndex = (findIndex + delta + findMatches.length) % findMatches.length;
        highlightFindMatch(findMatches[findIndex]);
        updateFindStatus();
    }

    function runFind(resetIndex) {
        var q = $.trim($('#sshFindInput').val() || '');
        findQuery = q;
        findMatches = scanFindMatches(q);
        if (resetIndex || findIndex < 0 || findIndex >= findMatches.length) {
            findIndex = findMatches.length ? 0 : -1;
        }
        if (findMatches.length) {
            highlightFindMatch(findMatches[findIndex]);
        } else if (term && term.clearSelection) {
            term.clearSelection();
        }
        updateFindStatus();
    }

    function openSessionFind() {
        applyFindTheme(true);
        $('#sshFindBar').css('display', 'flex');
        var el = document.getElementById('sshFindInput');
        if (el) {
            el.focus();
            el.select();
        }
        if ($.trim($('#sshFindInput').val() || '')) {
            runFind(false);
        }
    }

    function closeSessionFind() {
        $('#sshFindBar').hide().removeClass('no-hit');
        findMatches = [];
        findIndex = -1;
        applyFindTheme(false);
        if (term && term.clearSelection) {
            term.clearSelection();
        }
        if (term && term.focus) {
            term.focus();
        }
    }

    function isFindHotkey(e) {
        return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
            && (e.key === 'f' || e.key === 'F' || e.keyCode === 70);
    }

    function isFindNextHotkey(e) {
        return !e.ctrlKey && !e.metaKey && !e.altKey
            && (e.key === 'F3' || e.keyCode === 114);
    }

    // Xshell 风格：Ctrl+F 在会话输出中查找关键字
    $(document).on('keydown.sessionFind', function (e) {
        if (isFindHotkey(e)) {
            if (e.target && e.target.id === 'sshFindInput') {
                e.preventDefault();
                $('#sshFindInput').select();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            openSessionFind();
            return;
        }
        if (isFindNextHotkey(e) && isFindBarOpen()) {
            e.preventDefault();
            jumpFind(e.shiftKey ? -1 : 1);
            return;
        }
        if ((e.key === 'Escape' || e.keyCode === 27) && isFindBarOpen()
            && (!e.target || e.target.id === 'sshFindInput')) {
            e.preventDefault();
            closeSessionFind();
        }
    });
    if (term && typeof term.attachCustomKeyEventHandler === 'function') {
        term.attachCustomKeyEventHandler(function (ev) {
            if (ev.type !== 'keydown') {
                return true;
            }
            if (isFindHotkey(ev)) {
                openSessionFind();
                return false;
            }
            if (isFindNextHotkey(ev) && isFindBarOpen()) {
                jumpFind(ev.shiftKey ? -1 : 1);
                return false;
            }
            if ((ev.key === 'Escape' || ev.keyCode === 27) && isFindBarOpen()) {
                closeSessionFind();
                return false;
            }
            return true;
        });
    }
    $('#sshFindInput').on('input', function () {
        runFind(true);
    });
    $('#sshFindInput').on('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            jumpFind(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            closeSessionFind();
        }
    });
    $('#sshFindPrev').on('click', function () { jumpFind(-1); });
    $('#sshFindNext').on('click', function () { jumpFind(1); });
    $('#sshFindClose').on('click', closeSessionFind);
    // 展开快捷键面板时再拉一次，保证拿到最新命令；收起/展开后都要重算终端尺寸
    $('#collapseExample').on('shown.bs.collapse', function () {
        loadShortcuts();
        setTimeout(fitTerminal, 50);
    });
    $('#collapseExample').on('hidden.bs.collapse', function () {
        setTimeout(fitTerminal, 50);
    });
    // 首屏布局稳定后再 fit 一次（顶栏占高后）
    setTimeout(fitTerminal, 80);
});
function reload(){
    openTerminal();
}
function openTerminal() {
    // 已连接先关掉
    if (client._connection) {
        client.close();
        term.reset();
    }
    try {
        fitAddon.fit();
    } catch (eFit) { /* ignore */ }
    const options = {
        operate: 'connect',
        tagId: tagId,
        cols: term.cols || 120,
        rows: term.rows || 40
    };
    _lastSentCols = options.cols;
    _lastSentRows = options.rows;
    // 执行连接操作
    client.connect({
        onError: function (error) {
            // 连接失败回调
            term.write('Error: ' + error + '\r\n');
        },
        onConnect: function () {
            // 连接成功回调
            client.send(options);
            // 同步编码到后端（与顶部「切换编码」一致，默认 UTF-8）
            var enc = ($('.linux-encode').first().text() || 'UTF-8').trim();
            client.send({ operate: 'encoded', tagId: tagId, command: enc });
            // 布局可能在连接后才稳定，再补一次尺寸
            setTimeout(function () {
                try {
                    fitAddon.fit();
                } catch (e2) { /* ignore */ }
                _lastSentCols = 0;
                _lastSentRows = 0;
                sendTerminalResize();
            }, 120);
            term.write('\r\n');
            term.write('\x1b[32m  ______\r\n');
            // term.write(' /\\__  _\\\r\n');
            // term.write(' \\/_/\\ \\/    __   _ __   _ __   __  __    \r\n');
            // term.write('    \\ \\ \\  /\'__`\\/\\`\'__\\/\\`\'__\\/\\ \\/\\ \\   \r\n');
            // term.write('     \\ \\ \\/\\  __/\\ \\ \\/ \\ \\ \\/ \\ \\ \\_\\ \\  \r\n');
            // term.write('      \\ \\_\\ \\____\\\\ \\_\\  \\ \\_\\  \\/`____ \\ \r\n');
            // term.write('       \\/_/\\/____/ \\/_/   \\/_/   `/___/> \\\r\n');
            // term.write('                                    /\\___/\r\n');
            // term.write('                                    \\/__/\r\n');
            term.write(' __      __          __       ____    ____    __  __     \r\n');
            term.write('/\\ \\  __/\\ \\        /\\ \\     /\\  _`\\ /\\  _`\\ /\\ \\/\\ \\    \r\n');
            term.write('\\ \\ \\/\\ \\ \\ \\     __\\ \\ \\____\\ \\,\\L\\_\\ \\,L\\_\\ \\ \\_\\ \\   \r\n');
            term.write(' \\ \\ \\ \\ \\ \\ \\  /\'__`\\ \\ \'__`\\/_\\__ \\\\/_\\__ \\\\ \\  _  \\  \r\n');
            term.write('  \\ \\ \\_/ \\_\\ \\/\\  __/\\ \\ \\L\\ \\ /\\ \\L\\ \\ /\\ \\L\\ \\ \\ \\ \\ \\ \r\n');
            term.write('   \\ `\\___x___/\\ \\____\\\\ \\_,__/ \\ `\\____\\ `\\____\\ \\_\\ \\_\\\r\n');
            term.write('    \'\\/__//__/  \\/____/ \\/___/   \\/_____/\\/_____/\\/_/\\/_/\r\n');
            term.write('\x1b[0m\r\n');
            term.write('\t\t\x1b[31mWelcome 远程调试 终端\x1b[0m\r\n');
            scheduleInitialCd();

        },
        onClose: function () {
            // 连接关闭回调
            term.write("connection closed\r\n");
        },
        onData: function (data) {
            // 收到数据时回调
            term.write(data);
        }
    });
}
// 获取参数
function getQueryString(name) {
    var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
    var r = window.parent.location.search.substr(1).match(reg);
    if (r != null) {
        return unescape(r[2]);
    }
    return null;
}
// 设置编码
function setEncode(encode){
    $('.linux-encode').text(encode);
    client.send({"operate": "encoded", "tagId": tagId, "command": encode});
}
/** 打开浮动文件窗口（可多开）；按钮高亮表示已有窗口或侧栏停靠 */
function toggleFilesModule() {
    openFilesAtShellCwd();
}

function openFilesAtShellCwd() {
    if (!window.parent || window.parent === window) {
        return;
    }
    function send(path) {
        window.parent.postMessage({
            type: 'webssh-open-files',
            path: path || '/',
            sessionId: resolveSessionId()
        }, '*');
    }
    fetchShellPwdForUpload()
        .done(function (pwd) {
            send(pwd || '/');
        })
        .fail(function () {
            send('/');
        });
}

function scheduleInitialCd() {
    var startCwd = null;
    try {
        if (typeof getQueryParam === 'function') {
            startCwd = getQueryParam('cwd');
        }
        if (!startCwd && typeof getUrlParameter === 'function') {
            startCwd = getUrlParameter('cwd');
        }
    } catch (e0) { /* ignore */ }
    if (!startCwd || startCwd === '/') {
        return;
    }
    var path = String(startCwd);
    setTimeout(function () {
        try {
            if (!client || !tagId) {
                return;
            }
            var quoted = path.replace(/'/g, "'\"'\"'");
            client.send({
                operate: 'command',
                tagId: tagId,
                command: "cd '" + quoted + "'\n"
            });
        } catch (e1) {
            console.warn('initial cd failed', e1);
        }
    }, 500);
}

function currentTagIdForUpload() {
    return typeof tagId !== 'undefined' && tagId ? tagId : '';
}

function fetchShellPwdForUpload() {
    return $.ajax({
        url: baseUrl + '/pwd?tagId=' + encodeURIComponent(currentTagIdForUpload()),
        method: 'GET'
    }).then(function (res) {
        if (res && res.status === 200 && res.result) {
            return String(res.result).trim();
        }
        return null;
    }, function () {
        return null;
    });
}

function showDropToast(msg) {
    var $t = $('#sshDropToast');
    if (!$t.length) {
        $t = $('<div id="sshDropToast"></div>').appendTo('body');
    }
    $t.text(msg).addClass('show');
    clearTimeout(showDropToast._timer);
    showDropToast._timer = setTimeout(function () {
        $t.removeClass('show');
    }, 2200);
}

function uploadFilesToShellCwd(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
        return f && f.name;
    });
    if (!files.length) {
        return;
    }
    showDropToast('解析会话目录…');
    fetchShellPwdForUpload().then(function (pwd) {
        if (!pwd) {
            showDropToast('无法获取当前目录');
            return;
        }
        $.ajax({
            url: baseUrl + '/ls?path=' + encodeURIComponent(pwd) + '&tagId=' + encodeURIComponent(currentTagIdForUpload()),
            method: 'GET'
        }).then(function (res) {
            var nameSet = {};
            ((res && res.result) || []).forEach(function (it) {
                if (it && it.name) {
                    nameSet[it.name] = true;
                }
            });
            var i = 0;
            var uploadedNames = [];

            function suggestName(fileName) {
                if (!nameSet[fileName]) {
                    return fileName;
                }
                var dot = fileName.lastIndexOf('.');
                var hasExt = dot > 0 && dot < fileName.length - 1;
                var base = hasExt ? fileName.slice(0, dot) : fileName;
                var ext = hasExt ? fileName.slice(dot) : '';
                base = base.replace(/ \(\d+\)$/, '');
                var n = 1;
                var next;
                do {
                    next = base + ' (' + n + ')' + ext;
                    n += 1;
                } while (nameSet[next]);
                return next;
            }

            function askConflict(fileName) {
                var dfd = $.Deferred();
                var suggested = suggestName(fileName);
                $('#sshConflictMsg').text('已存在「' + fileName + '」，请选择处理方式：');
                $('#sshConflictRename').val(suggested);
                $('#sshConflictModal').addClass('show').css('display', 'flex');
                setTimeout(function () {
                    $('#sshConflictRename').trigger('focus').select();
                }, 50);
                function done(action, name) {
                    $('#sshConflictBtnRename,#sshConflictBtnReplace,#sshConflictBtnSkip').off('.cf');
                    $('#sshConflictRename').off('.cf');
                    $('#sshConflictModal').removeClass('show').hide();
                    dfd.resolve({ action: action, name: name });
                }
                $('#sshConflictBtnRename').off('.cf').on('click.cf', function () {
                    var n = ($('#sshConflictRename').val() || '').trim();
                    if (!n || n.indexOf('/') >= 0 || n.indexOf('\\') >= 0) {
                        showDropToast('名称不合法');
                        return;
                    }
                    done('rename', n);
                });
                $('#sshConflictBtnReplace').off('.cf').on('click.cf', function () {
                    done('replace', fileName);
                });
                $('#sshConflictBtnSkip').off('.cf').on('click.cf', function () {
                    done('skip', null);
                });
                $('#sshConflictRename').off('.cf').on('keydown.cf', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        $('#sshConflictBtnRename').click();
                    }
                });
                return dfd.promise();
            }

            function finish() {
                showDropToast(uploadedNames.length ? ('已上传到 ' + pwd) : '已取消上传');
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'webssh-refresh-sftp',
                            path: pwd,
                            selectNames: uploadedNames
                        }, '*');
                    }
                } catch (e) { /* ignore */ }
            }

            function next() {
                if (i >= files.length) {
                    finish();
                    return;
                }
                var file = files[i];
                i += 1;
                var finalName = file.name;
                var chain = $.Deferred().resolve(true).promise();
                if (nameSet[finalName]) {
                    chain = askConflict(finalName).then(function (choice) {
                        if (!choice || choice.action === 'skip') {
                            return false;
                        }
                        if (choice.action === 'rename') {
                            if (nameSet[choice.name] && choice.name !== finalName) {
                                showDropToast('名称仍冲突');
                                i -= 1;
                                return false;
                            }
                            finalName = choice.name;
                        }
                        return true;
                    });
                }
                chain.then(function (shouldUpload) {
                    if (!shouldUpload) {
                        next();
                        return;
                    }
                    showDropToast('上传 ' + i + '/' + files.length + '：' + finalName);
                    var formData = new FormData();
                    formData.append('file', file);
                    formData.append('path', pwd);
                    formData.append('fileName', finalName);
                    $.ajax({
                        url: baseUrl + '/upload?tagId=' + encodeURIComponent(currentTagIdForUpload()),
                        method: 'POST',
                        data: formData,
                        processData: false,
                        contentType: false
                    }).then(function (res) {
                        if (res && res.status !== 200) {
                            showDropToast('失败：' + (res.message || finalName));
                            return;
                        }
                        var saved = (res && res.result) ? String(res.result) : finalName;
                        uploadedNames.push(saved);
                        nameSet[saved] = true;
                        next();
                    }, function () {
                        showDropToast('上传失败：' + finalName);
                    });
                });
            }
            next();
        }, function () {
            showDropToast('无法读取目标目录');
        });
    });
}

(function bindTerminalDropUpload() {
    var $zone = $(document.body);
    $zone.on('dragenter dragover', function (e) {
        var dt = e.originalEvent && e.originalEvent.dataTransfer;
        if (!dt || !dt.types || (dt.types.indexOf && dt.types.indexOf('Files') < 0
            && [].indexOf.call(dt.types, 'Files') < 0
            && [].indexOf.call(dt.types, 'application/x-moz-file') < 0)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        $zone.addClass('ssh-drop-target');
    });
    $zone.on('dragleave', function (e) {
        if (e.target !== document.body && !$(e.target).is('body')) {
            return;
        }
        $zone.removeClass('ssh-drop-target');
    });
    $zone.on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $zone.removeClass('ssh-drop-target');
        var dt = e.originalEvent && e.originalEvent.dataTransfer;
        var files = dt && dt.files;
        if (!files || !files.length) {
            return;
        }
        uploadFilesToShellCwd(files);
    });
})();

function setFilesButtonVisible(/* visible */) {
    var $btn = $('#btnOpenFiles');
    if (!$btn.length) {
        $btn = $('#btnToggleFiles');
    }
    if (!$btn.length) {
        return;
    }
    $btn.show().attr('aria-hidden', 'false');
}

window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.type !== 'webssh-files-visible') {
        return;
    }
    setFilesButtonVisible(!!data.visible);
});

// 向父页同步初始状态（默认隐藏）
try {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'webssh-query-files' }, '*');
    }
} catch (e) { /* ignore */ }
// 切换主题（仅改前端配色，不断开 SSH）
function setTheme(theme){
    localStorage.setItem('xtermTheme', theme);
    try {
        if (term && typeof term.setOption === 'function') {
            term.setOption('theme', getColor(theme));
        } else if (term && term.options) {
            term.options.theme = getColor(theme);
            if (typeof term.refresh === 'function') {
                term.refresh(0, term.rows - 1);
            }
        }
    } catch (e) {
        console.warn('setTheme failed', e);
    }
}

function getColor(theme){
    if (theme === 'blue') {
        // 更改终端主题
        return {background: '#012b58'}
    } else if (theme === 'dark') {
        return {background: '#000'}
    } else if (theme === 'white') {
        return {
            foreground: '#333333',  // 深灰色字体
            background: '#FFFFFF',  // 白色背景
            cursor: '#007BFF',      // 蓝色光标
            selection: '#CCCCCC',   // 浅灰色选中背景
        };
    } else if (theme === 'green') {
        return {
            background: '#006400',  // 白色背景
        };
    }
}