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
try {
    fitAddon.fit();
} catch (e) {
    console.warn('fitAddon.fit failed', e);
}
// term.write('Hello Remote Shell...');
//reloadTerm();
window.onresize = function(){
    try {
        fitAddon.fit();
    } catch (e) {
        console.warn('fitAddon.fit failed', e);
    }
    // 获取浏览器窗口的宽度和高度
    // reloadTerm();
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
    // 委托绑定，避免元素未就绪或缓存旧页导致无效
    $(document).on('input keyup', '#shortcutSearch', renderShortcuts);
    $(document).on('change', '#shortcutFilter', renderShortcuts);
    $(document).on('click', '#shortcut .shortcut-item', function () {
        var key = $(this).attr('data-key');
        if (key != null && term) {
            term.paste(key);
        }
    });
    // 展开快捷键面板时再拉一次，保证拿到最新命令
    $('#collapseExample').on('shown.bs.collapse', function () {
        loadShortcuts();
    });
})
function reload(){
    openTerminal();
}
function openTerminal() {
    // 已连接先关掉
    if (client._connection) {
        client.close();
        term.reset();
    }
    const options = { operate: 'connect', tagId: tagId };
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
function logout(){
    window.localStorage.setItem("tagId" + port, null);
    parent.location.reload();
}

/** 打开浮动文件窗口（可多开）；按钮高亮表示已有窗口或侧栏停靠 */
function toggleFilesModule() {
    if (!window.parent || window.parent === window) {
        return;
    }
    window.parent.postMessage({ type: 'webssh-toggle-files' }, '*');
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

function setFilesButtonVisible(visible) {
    var $btn = $('#btnToggleFiles');
    if (!$btn.length) {
        return;
    }
    if (visible) {
        $btn.addClass('active btn-primary').removeClass('btn-secondary');
        $btn.attr('title', '再开一个文件窗口');
    } else {
        $btn.removeClass('active btn-primary').addClass('btn-secondary');
        $btn.attr('title', '打开文件窗口');
    }
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
// 切换主题
// let theme = 'dark';
function setTheme(theme){
    localStorage.setItem('xtermTheme', theme);
    term.setOption('theme', getColor(theme))
    openTerminal();
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