/**
 * Windows 风格增强：多选/导航/剪贴板/新建/属性/压缩/收藏等
 * 依赖 sftp.js 已暴露的全局函数与变量
 */
(function (w) {
    var FAV_KEY = 'websshSftpFavorites';
    var pathHistory = [];
    var historyIndex = -1;
    var historyLock = false;
    var clipboard = null; // { op:'copy'|'cut', paths:[], dir:'' }
    var undoStack = [];
    var lastAnchorPath = null;
    var boxSelect = null;

    function isFolderWindow() {
        return /(?:^|[?&])folderWin=1(?:&|$)/.test(window.location.search || '');
    }

    function readParentClipboard() {
        try {
            if (window.parent && window.parent !== window && window.parent.__websshFolderClipboard) {
                return window.parent.__websshFolderClipboard;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function syncClipboardFromParent() {
        var shared = readParentClipboard();
        if (shared) {
            clipboard = shared;
        }
    }

    function publishClipboard(clip) {
        clipboard = clip;
        if (!window.parent || window.parent === window) {
            return;
        }
        try {
            window.parent.postMessage({
                type: 'webssh-folder-clipboard-set',
                clipboard: clip
            }, '*');
        } catch (e) { /* ignore */ }
    }

    function curDir() {
        return ($('#currentPath').val() || '/');
    }

    function absOf(rel) {
        return joinPath(curDir(), rel);
    }

    function getSelectedRels() {
        var out = [];
        $('#fileView tr.selected, #fileView .icon-tile.selected, #fileView .content-row.selected').each(function () {
            var p = $(this).data('path');
            if (p && p !== '..') {
                out.push(String(p));
            }
        });
        return out;
    }

    function clearSelection() {
        $('#fileView tr, #fileView .icon-tile, #fileView .content-row').removeClass('selected cut-item');
    }

    function selectOnly(rel) {
        clearSelection();
        markSelected([rel]);
        lastAnchorPath = rel;
    }

    function markSelected(rels) {
        var set = {};
        (rels || []).forEach(function (r) { set[String(r)] = true; });
        $('#fileView tr, #fileView .icon-tile, #fileView .content-row').each(function () {
            var p = String($(this).data('path') || '');
            if (set[p]) {
                $(this).addClass('selected');
            }
        });
        if (clipboard && clipboard.op === 'cut') {
            applyCutVisual();
        }
    }

    function applyCutVisual() {
        $('#fileView tr, #fileView .icon-tile, #fileView .content-row').removeClass('cut-item');
        if (!clipboard || clipboard.op !== 'cut') {
            return;
        }
        var dir = normalizeDirPath(clipboard.dir || '');
        if (dir !== normalizeDirPath(curDir())) {
            return;
        }
        clipboard.paths.forEach(function (abs) {
            var base = abs.substring(abs.lastIndexOf('/') + 1);
            $('#fileView tr, #fileView .icon-tile, #fileView .content-row').filter(function () {
                return String($(this).data('path')) === base;
            }).addClass('cut-item');
        });
    }

    function visibleRels() {
        var list = [];
        $('#fileView tr[data-path], #fileView .icon-tile[data-path], #fileView .content-row[data-path]').each(function () {
            var p = $(this).data('path');
            if (p && p !== '..') {
                list.push(String(p));
            }
        });
        return list;
    }

    function rangeSelect(fromRel, toRel) {
        var list = visibleRels();
        var a = list.indexOf(fromRel);
        var b = list.indexOf(toRel);
        if (a < 0 || b < 0) {
            selectOnly(toRel);
            return;
        }
        if (a > b) {
            var t = a; a = b; b = t;
        }
        clearSelection();
        markSelected(list.slice(a, b + 1));
    }

    function pushHistory(path) {
        if (historyLock) {
            return;
        }
        path = normalizeDirPath(path);
        if (historyIndex >= 0 && normalizeDirPath(pathHistory[historyIndex] || '') === path) {
            return;
        }
        pathHistory = pathHistory.slice(0, historyIndex + 1);
        pathHistory.push(path);
        historyIndex = pathHistory.length - 1;
        syncNavButtons();
    }

    function syncNavButtons() {
        $('#btnNavBack').prop('disabled', historyIndex <= 0);
        $('#btnNavForward').prop('disabled', historyIndex < 0 || historyIndex >= pathHistory.length - 1);
        $('#btnNavUp').prop('disabled', normalizeDirPath(curDir()) === '/');
        renderBreadcrumbs();
        renderFavorites();
        renderTree();
    }

    function goHistory(delta) {
        var next = historyIndex + delta;
        if (next < 0 || next >= pathHistory.length) {
            return;
        }
        historyIndex = next;
        historyLock = true;
        navigateTo(pathHistory[historyIndex]);
        historyLock = false;
        syncNavButtons();
    }

    function goUp() {
        var p = normalizeDirPath(curDir());
        if (p === '/') {
            return;
        }
        var idx = p.lastIndexOf('/');
        var parent = idx <= 0 ? '/' : p.slice(0, idx);
        navigateTo(parent || '/');
    }

    function renderBreadcrumbs() {
        var p = normalizeDirPath(curDir());
        var $bc = $('#sftpBreadcrumbs');
        if (!$bc.length) {
            return;
        }
        var html = '<a href="javascript:void(0)" class="bc-root" data-path="/">此电脑</a>';
        if (p !== '/') {
            var parts = p.split('/').filter(Boolean);
            var acc = '';
            parts.forEach(function (part) {
                acc += '/' + part;
                html += '<span class="bc-sep">›</span>';
                html += '<a href="javascript:void(0)" data-path="' + escapeHtml(acc) + '">' + escapeHtml(part) + '</a>';
            });
        }
        $bc.html(html);
    }

    function isAddressEditing() {
        return $('#sftpAddress').hasClass('editing');
    }

    var addressEditBasePath = null;

    function enterAddressEdit() {
        var $addr = $('#sftpAddress');
        if (!$addr.length) {
            return;
        }
        addressEditBasePath = normalizeDirPath(curDir());
        $addr.addClass('editing');
        var $inp = $('#currentPath');
        $inp.val(addressEditBasePath);
        setTimeout(function () {
            $inp.trigger('focus');
            try {
                $inp[0].select();
            } catch (e) { /* ignore */ }
        }, 0);
    }

    function exitAddressEdit(commit) {
        var $addr = $('#sftpAddress');
        if (!$addr.length || !$addr.hasClass('editing')) {
            return;
        }
        var typed = ($('#currentPath').val() || '').trim() || '/';
        var base = addressEditBasePath != null
            ? normalizeDirPath(addressEditBasePath)
            : normalizeDirPath(curDir());
        $addr.removeClass('editing');
        addressEditBasePath = null;
        if (commit) {
            var next = normalizeDirPath(typed);
            if (next !== base) {
                navigateTo(next);
                return;
            }
            // same path: still reload so Enter feels responsive
            navigateTo(next);
            return;
        }
        $('#currentPath').val(base);
        renderBreadcrumbs();
    }

    function bindAddressBar() {
        $('#sftpAddressBody').on('mousedown', function (e) {
            if ($(e.target).closest('a').length) {
                return;
            }
            if (isAddressEditing()) {
                return;
            }
            e.preventDefault();
            enterAddressEdit();
        });
        $('#sftpBreadcrumbs').on('dblclick', function (e) {
            if ($(e.target).closest('a').length) {
                return;
            }
            e.preventDefault();
            enterAddressEdit();
        });
        $('#currentPath').on('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                exitAddressEdit(true);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                exitAddressEdit(false);
            }
        });
        $('#currentPath').on('blur', function () {
            setTimeout(function () {
                if (document.activeElement === $('#currentPath')[0]) {
                    return;
                }
                if (isAddressEditing()) {
                    exitAddressEdit(false);
                }
            }, 120);
        });
    }

    function loadFavorites() {
        try {
            return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') || [];
        } catch (e) {
            return [];
        }
    }

    function saveFavorites(list) {
        localStorage.setItem(FAV_KEY, JSON.stringify(list || []));
    }

    var treeExpanded = { '/': true };
    var treeChildren = {}; // path -> [{name, path}]
    var treeLoading = {};
    var lastTreeNavPath = null;

    function shortName(path) {
        path = normalizeDirPath(path);
        if (path === '/') {
            return '/';
        }
        return path.substring(path.lastIndexOf('/') + 1) || path;
    }

    function ensurePathExpanded(path) {
        path = normalizeDirPath(path);
        treeExpanded['/'] = true;
        if (path === '/') {
            return;
        }
        var parts = path.split('/').filter(Boolean);
        var acc = '';
        parts.forEach(function (part) {
            acc += '/' + part;
            var parent = acc.substring(0, acc.lastIndexOf('/')) || '/';
            // 展开祖先，保证能看到当前目录节点；当前节点本身也默认展开一次
            treeExpanded[parent] = true;
            treeExpanded[acc] = true;
        });
    }

    function loadTreeChildren(path, done) {
        path = normalizeDirPath(path);
        if (treeChildren[path]) {
            if (done) {
                done(treeChildren[path]);
            }
            return;
        }
        if (treeLoading[path]) {
            return;
        }
        treeLoading[path] = true;
        $.ajax({
            url: baseUrl + '/ls?path=' + encodeURIComponent(path) + '&tagId=' + encodeURIComponent(currentTagId()),
            method: 'GET'
        }).then(function (res) {
            treeLoading[path] = false;
            var list = [];
            if (res && res.status === 200) {
                (res.result || []).forEach(function (it) {
                    if (it && (it.dir === true || it.dir === 1 || it.dir === '1')) {
                        list.push({
                            name: it.name,
                            path: joinPath(path, it.name)
                        });
                    }
                });
                list.sort(function (a, b) {
                    return String(a.name).localeCompare(String(b.name), 'zh');
                });
            }
            treeChildren[path] = list;
            if (done) {
                done(list);
            } else {
                paintTreeDom();
            }
        }, function () {
            treeLoading[path] = false;
            treeChildren[path] = [];
            if (done) {
                done([]);
            } else {
                paintTreeDom();
            }
        });
    }

    function invalidateTree(path) {
        path = normalizeDirPath(path || '');
        Object.keys(treeChildren).forEach(function (k) {
            if (k === path || k.indexOf(path === '/' ? '/' : path + '/') === 0 || path.indexOf(k + '/') === 0) {
                delete treeChildren[k];
            }
        });
    }

    function paintTreeDom() {
        var $tree = $('#sftpTree');
        if (!$tree.length) {
            return;
        }
        var current = normalizeDirPath(curDir());

        function rowHtml(nodePath, depth) {
            var active = nodePath === current;
            var expanded = !!treeExpanded[nodePath];
            var kids = treeChildren[nodePath];
            var twisty;
            if (kids && kids.length === 0) {
                twisty = '<span class="tree-twisty empty"></span>';
            } else {
                twisty = '<span class="tree-twisty' + (expanded ? ' open' : '') + '" data-toggle="'
                    + escapeHtml(nodePath) + '">'
                    + (expanded ? '▼' : '▶') + '</span>';
            }
            var label = nodePath === '/' ? 'Linux (/)' : shortName(nodePath);
            return '<div class="tree-row' + (active ? ' active' : '') + '" data-path="'
                + escapeHtml(nodePath) + '" style="--depth:' + depth + '">'
                + twisty
                + '<i class="bi bi-folder-fill tree-folder"></i>'
                + '<span class="tree-label">' + escapeHtml(label) + '</span></div>';
        }

        function walk(nodePath, depth) {
            var expanded = !!treeExpanded[nodePath];
            var html = rowHtml(nodePath, depth);
            if (!expanded) {
                return html;
            }
            if (!treeChildren[nodePath]) {
                loadTreeChildren(nodePath);
                html += '<div class="tree-loading" style="--depth:' + (depth + 1) + '">加载中…</div>';
                return html;
            }
            treeChildren[nodePath].forEach(function (ch) {
                html += walk(ch.path, depth + 1);
            });
            return html;
        }

        $tree.html(
            '<div class="tree-group-label">此电脑</div>' + walk('/', 0)
        );
    }

    function renderTree() {
        var current = normalizeDirPath(curDir());
        // 仅在切换目录时自动展开路径；之后允许用户折叠当前目录
        if (lastTreeNavPath !== current) {
            ensurePathExpanded(current);
            lastTreeNavPath = current;
        }
        if (Array.isArray(currentItems) && !isSearchMode) {
            treeChildren[current] = currentItems.filter(function (it) {
                return isDirItem(it);
            }).map(function (it) {
                return { name: it.name, path: joinPath(current, it.name) };
            }).sort(function (a, b) {
                return String(a.name).localeCompare(String(b.name), 'zh');
            });
        }
        var parts = current === '/' ? [] : current.split('/').filter(Boolean);
        var acc = '';
        var chain = $.Deferred().resolve().promise();
        [{ path: '/' }].concat(parts.map(function (part) {
            acc += '/' + part;
            return { path: acc };
        })).forEach(function (node) {
            var p = node.path;
            if (!treeChildren[p] && treeExpanded[p]) {
                chain = chain.then(function () {
                    var dfd = $.Deferred();
                    loadTreeChildren(p, function () { dfd.resolve(); });
                    return dfd.promise();
                });
            }
        });
        chain.always(paintTreeDom);
        paintTreeDom();
    }

    function renderFavorites() {
        var $ul = $('#sftpFavList');
        if (!$ul.length) {
            return;
        }
        var list = loadFavorites();
        if (!list.length) {
            $ul.html('<li class="side-empty">右键空白处可收藏</li>');
            return;
        }
        $ul.html(list.map(function (p) {
            return '<li class="fav-item">'
                + '<i class="bi bi-star-fill fav-ico"></i>'
                + '<a href="javascript:void(0)" data-path="' + escapeHtml(p) + '" title="'
                + escapeHtml(p) + '">' + escapeHtml(shortName(p)) + '</a>'
                + '<button type="button" class="fav-del" data-path="' + escapeHtml(p) + '" title="取消收藏">×</button></li>';
        }).join(''));
    }

    function toggleFavorite(path) {
        path = normalizeDirPath(path || curDir());
        var list = loadFavorites();
        var i = list.indexOf(path);
        if (i >= 0) {
            list.splice(i, 1);
            showSftpToast('已取消收藏');
        } else {
            list.push(path);
            showSftpToast('已加入收藏');
        }
        saveFavorites(list);
        renderFavorites();
    }

    function clipboardCopy(cut) {
        var rels = getSelectedRels();
        if (!rels.length) {
            showSftpToast('未选中文件');
            return;
        }
        publishClipboard({
            op: cut ? 'cut' : 'copy',
            paths: rels.map(absOf),
            dir: curDir()
        });
        applyCutVisual();
        showSftpToast((cut ? '已剪切 ' : '已复制 ') + rels.length + ' 项');
    }

    function clipboardPaste() {
        syncClipboardFromParent();
        if (!clipboard || !clipboard.paths.length) {
            showSftpToast('剪贴板为空');
            return;
        }
        var dest = curDir();
        var action = clipboard.op === 'cut' ? 'move' : 'copy';
        var snap = clipboard;
        sftpApi(action, {
            sources: snap.paths.join('\n'),
            destDir: dest
        }).then(function (res) {
            if (!res || res.status !== 200) {
                alert((res && res.message) || '操作失败');
                return;
            }
            var names;
            if (res.result) {
                names = String(res.result).split('\n').filter(Boolean);
            } else {
                names = snap.paths.map(function (p) {
                    return p.substring(p.lastIndexOf('/') + 1);
                });
            }
            if (snap.op === 'cut') {
                publishClipboard(null);
            }
            showSftpToast(action === 'move' ? '已移动' : '已粘贴');
            reload({ selectNames: names });
        }, function (xhr) {
            alert((xhr.responseJSON && xhr.responseJSON.message) || '操作失败');
        });
    }

    function deleteSelectedMulti() {
        var rels = getSelectedRels();
        if (!rels.length) {
            return;
        }
        if (!window.confirm('确定删除选中的 ' + rels.length + ' 项？')) {
            return;
        }
        var i = 0;
        function next() {
            if (i >= rels.length) {
                reload();
                return;
            }
            var rel = rels[i++];
            sftpApi('rm', { path: absOf(rel) }).then(function (res) {
                if (!res || res.status !== 200) {
                    alert((res && res.message) || ('删除失败: ' + rel));
                }
                next();
            }, function () {
                alert('删除失败: ' + rel);
                next();
            });
        }
        next();
    }

    function newEmptyFile() {
        showPromptModal('新建文件', '新建文本文档.txt', function (val) {
            if (!val) {
                return;
            }
            sftpApi('touch', { path: curDir(), name: val }).then(function (res) {
                if (!res || res.status !== 200) {
                    alert((res && res.message) || '创建失败');
                    return;
                }
                reload({ selectNames: [val] });
            }, function (xhr) {
                alert((xhr.responseJSON && xhr.responseJSON.message) || '创建失败');
            });
        });
    }

    function pushRenameUndo(fromAbs, toAbs) {
        undoStack.push({ type: 'rename', from: toAbs, to: fromAbs });
        if (undoStack.length > 30) {
            undoStack.shift();
        }
    }

    function undoLast() {
        var op = undoStack.pop();
        if (!op) {
            showSftpToast('没有可撤消的操作');
            return;
        }
        if (op.type === 'rename') {
            var parent = op.from.substring(0, op.from.lastIndexOf('/')) || '/';
            var newName = op.to.substring(op.to.lastIndexOf('/') + 1);
            // undo: rename current(from) back to original name(to's basename) — stack stores {from:newAbs,to:oldAbs}
            // pushRenameUndo(oldAbs, newAbs) => undo: rename newAbs -> old basename
            var curAbs = op.from;
            var backName = op.to.substring(op.to.lastIndexOf('/') + 1);
            sftpApi('rename', { path: curAbs, newName: backName }).then(function (res) {
                if (!res || res.status !== 200) {
                    alert((res && res.message) || '撤消失败');
                    return;
                }
                showSftpToast('已撤消重命名');
                reload({ selectNames: [backName] });
            }, function (xhr) {
                alert((xhr.responseJSON && xhr.responseJSON.message) || '撤消失败');
            });
        }
    }

    function showProperties() {
        var rels = getSelectedRels();
        if (rels.length !== 1) {
            showSftpToast('请选中单个项目查看属性');
            return;
        }
        var item = findItemByPath(rels[0]);
        if (!item) {
            return;
        }
        var abs = absOf(rels[0]);
        var lines = [
            '名称: ' + item.name,
            '类型: ' + fileTypeLabel(item),
            '位置: ' + abs,
            '大小: ' + (isDirItem(item) ? '文件夹' : (formatSize(item.size, false) || '0 B')),
            '修改时间: ' + (item.modifyTime || '-'),
            '权限: ' + (item.permissions || '-') + (item.permissionText ? ' (' + item.permissionText + ')' : ''),
            '所有者: ' + (item.owner || '-'),
            '组: ' + (item.group || '-')
        ];
        $('#propsBody').text(lines.join('\n'));
        $('#propsModal').modal('show');
    }

    function compressSelected() {
        var rels = getSelectedRels();
        if (!rels.length) {
            showSftpToast('未选中文件');
            return;
        }
        var sources = rels.map(absOf).join('\n');
        var defaultName = (rels.length === 1 ? basenameOf(rels[0]) : 'archive') + '.zip';
        showPromptModal('压缩为', defaultName, function (name) {
            if (!name) {
                return;
            }
            sftpApi('compress', {
                sources: sources,
                destDir: curDir(),
                archiveName: name
            }).then(function (res) {
                if (!res || res.status !== 200) {
                    alert((res && res.message) || '压缩失败');
                    return;
                }
                var saved = res.result ? String(res.result) : name;
                var base = saved.substring(saved.lastIndexOf('/') + 1);
                showSftpToast('压缩完成');
                reload({ selectNames: [base] });
            }, function (xhr) {
                alert((xhr.responseJSON && xhr.responseJSON.message) || '压缩失败');
            });
        });
    }

    function editSelected() {
        var rels = getSelectedRels();
        if (rels.length !== 1) {
            showSftpToast('请选中一个文件编辑');
            return;
        }
        var item = findItemByPath(rels[0]);
        if (!item || isDirItem(item)) {
            showSftpToast('只能编辑文件');
            return;
        }
        if (!isTextFile(item)) {
            showSftpToast('当前仅支持文本类文件在线编辑');
            return;
        }
        if (Number(item.size || 0) > PREVIEW_MAX_BYTES) {
            alert('文件过大，无法在线编辑');
            return;
        }
        var abs = absOf(rels[0]);
        $.ajax({
            url: previewUrl(rels[0]),
            method: 'GET',
            dataType: 'text'
        }).then(function (text) {
            $('#editPath').val(abs);
            $('#editTitle').text('编辑 - ' + item.name);
            $('#editContent').val(text);
            $('#editModal').modal('show');
        }, function () {
            alert('读取文件失败');
        });
    }

    function saveEdited() {
        var path = $('#editPath').val();
        var content = $('#editContent').val() || '';
        sftpApi('writeText', { path: path, content: content }).then(function (res) {
            if (!res || res.status !== 200) {
                alert((res && res.message) || '保存失败');
                return;
            }
            $('#editModal').modal('hide');
            showSftpToast('已保存');
            reload({ selectNames: [basenameOf(path)] });
        }, function (xhr) {
            alert((xhr.responseJSON && xhr.responseJSON.message) || '保存失败');
        });
    }

    function openSelectedItem() {
        var rels = getSelectedRels();
        if (!rels.length) {
            return;
        }
        openSelected(rels[0]);
    }

    function showCtxAt(x, y, kind, isDir) {
        var name = kind === 'blank' ? null : (getSelectedRels()[0] || null);
        if (typeof showFileContextMenu === 'function') {
            // reuse if available via rebuilt menu below
        }
        contextFileName = name;
        contextMenuKind = kind;
        var multi = getSelectedRels().length > 1;
        var html = buildWinContextMenu(kind, isDir, multi);
        var $menu = $('#fileContextMenu');
        $menu.html(html).show();
        var mw = $menu.outerWidth() || 200;
        var mh = $menu.outerHeight() || 40;
        $menu.css({
            left: Math.max(0, Math.min(x, window.innerWidth - mw - 4)) + 'px',
            top: Math.max(0, Math.min(y, window.innerHeight - mh - 4)) + 'px'
        });
    }

    function buildWinContextMenu(kind, isDir, multi) {
        var dockItem = isFolderWindow()
            ? ('<div class="ctx-sep"></div>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="dock-side">停靠分栏</a>')
            : '';
        if (kind === 'blank') {
            return ''
                + '<a class="ctx-item" href="javascript:void(0)" data-action="refresh">刷新<span class="ctx-key">F5</span></a>'
                + '<div class="ctx-sep"></div>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="mkdir">新建文件夹<span class="ctx-key">Ctrl+Shift+N</span></a>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="newfile">新建文件</a>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="upload">上传</a>'
                + '<div class="ctx-sep"></div>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="paste">粘贴<span class="ctx-key">Ctrl+V</span></a>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="fav">收藏当前目录</a>'
                + dockItem;
        }
        var html = '';
        if (!multi) {
            html += '<a class="ctx-item" href="javascript:void(0)" data-action="open">打开<span class="ctx-key">Enter</span></a>';
            if (!isDir) {
                html += '<a class="ctx-item" href="javascript:void(0)" data-action="edit">编辑</a>';
                html += '<a class="ctx-item" href="javascript:void(0)" data-action="download">下载</a>';
            }
        }
        html += '<div class="ctx-sep"></div>'
            + '<a class="ctx-item" href="javascript:void(0)" data-action="cut">剪切<span class="ctx-key">Ctrl+X</span></a>'
            + '<a class="ctx-item" href="javascript:void(0)" data-action="copy">复制<span class="ctx-key">Ctrl+C</span></a>'
            + '<a class="ctx-item" href="javascript:void(0)" data-action="paste">粘贴<span class="ctx-key">Ctrl+V</span></a>'
            + '<div class="ctx-sep"></div>';
        if (!multi) {
            html += '<a class="ctx-item" href="javascript:void(0)" data-action="rename">重命名<span class="ctx-key">F2</span></a>';
        }
        html += '<a class="ctx-item" href="javascript:void(0)" data-action="delete">删除<span class="ctx-key">Del</span></a>'
            + '<div class="ctx-sep"></div>'
            + '<a class="ctx-item" href="javascript:void(0)" data-action="compress">压缩</a>';
        if (!multi) {
            html += '<a class="ctx-item" href="javascript:void(0)" data-action="chmod">修改权限</a>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="props">属性</a>'
                + '<a class="ctx-item" href="javascript:void(0)" data-action="copy-path">复制路径</a>';
        }
        html += dockItem;
        return html;
    }

    function requestDockSide() {
        if (!window.parent || window.parent === window) {
            return;
        }
        try {
            window.parent.postMessage({ type: 'webssh-folder-dock-side' }, '*');
        } catch (e) { /* ignore */ }
    }

    function onItemClick(e, $row) {
        var name = String($row.data('path') || '');
        if (!name || name === '..') {
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                clearSelection();
                $row.addClass('selected');
            }
            return;
        }
        if (e.shiftKey && lastAnchorPath) {
            rangeSelect(lastAnchorPath, name);
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            $row.toggleClass('selected');
            lastAnchorPath = name;
            return;
        }
        selectOnly(name);
    }

    function bindBoxSelect() {
        var $view = $('#fileView');
        $view.on('mousedown.winbox', function (e) {
            if (e.button !== 0) {
                return;
            }
            if ($(e.target).closest('tr, .icon-tile, thead, input, button, a').length) {
                return;
            }
            var off = $view.offset();
            boxSelect = {
                x0: e.pageX,
                y0: e.pageY,
                ox: off.left,
                oy: off.top,
                scrollTop: $view.scrollTop(),
                scrollLeft: $view.scrollLeft()
            };
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                clearSelection();
            }
            $('#marquee').remove();
            $('<div id="marquee"></div>').appendTo('body');
            e.preventDefault();
        });
        $(document).on('mousemove.winbox', function (e) {
            if (!boxSelect) {
                return;
            }
            var x1 = Math.min(boxSelect.x0, e.pageX);
            var y1 = Math.min(boxSelect.y0, e.pageY);
            var x2 = Math.max(boxSelect.x0, e.pageX);
            var y2 = Math.max(boxSelect.y0, e.pageY);
            $('#marquee').css({ left: x1 + 'px', top: y1 + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
            $('#fileView tr[data-path], #fileView .icon-tile[data-path], #fileView .content-row[data-path]').each(function () {
                var r = this.getBoundingClientRect();
                var rx1 = r.left + window.scrollX;
                var ry1 = r.top + window.scrollY;
                var rx2 = r.right + window.scrollX;
                var ry2 = r.bottom + window.scrollY;
                var hit = !(rx2 < x1 || rx1 > x2 || ry2 < y1 || ry1 > y2);
                var p = String($(this).data('path') || '');
                if (p === '..') {
                    return;
                }
                $(this).toggleClass('selected', hit);
            });
        });
        $(document).on('mouseup.winbox', function () {
            if (!boxSelect) {
                return;
            }
            boxSelect = null;
            $('#marquee').remove();
            var sel = getSelectedRels();
            if (sel.length) {
                lastAnchorPath = sel[0];
            }
        });
    }

    function bindInternalDrag() {
        var dragRels = null;
        var DND_MIME = 'application/x-webssh-sftp';
        var folderDropSel = '#fileView tr.folder, #fileView .icon-tile.folder, #fileView .content-row.folder, #fileView [data-dir="1"]';

        function buildDndPayload(rels) {
            return {
                v: 1,
                tagId: currentTagId(),
                paths: (rels || []).map(absOf),
                fromDir: normalizeDirPath(curDir())
            };
        }

        function parseDndPayload(dt) {
            if (!dt) {
                return null;
            }
            var raw = '';
            try {
                raw = dt.getData(DND_MIME) || '';
            } catch (e1) { /* ignore */ }
            if (!raw) {
                try {
                    raw = dt.getData('text/plain') || '';
                } catch (e2) { /* ignore */ }
            }
            if (!raw) {
                return null;
            }
            var t = String(raw).trim();
            if (t.charAt(0) === '{') {
                try {
                    var obj = JSON.parse(t);
                    if (obj && obj.v === 1 && obj.tagId && Array.isArray(obj.paths)) {
                        return obj;
                    }
                } catch (e3) { /* ignore */ }
            }
            // legacy: relative names
            var rels = t.split('\n').filter(Boolean);
            if (!rels.length) {
                return null;
            }
            return {
                v: 1,
                tagId: currentTagId(),
                paths: rels.map(absOf),
                legacy: true
            };
        }

        function wantCopyFromEvent(e) {
            // A: default copy; Shift = move (same server only)
            return !e.shiftKey;
        }

        function setDropEffect(e) {
            try {
                e.originalEvent.dataTransfer.dropEffect = wantCopyFromEvent(e) ? 'copy' : 'move';
            } catch (err) { /* ignore */ }
        }

        function transferAbsToDir(destDir, absPaths, copy) {
            if (!absPaths || !absPaths.length) {
                return;
            }
            var action = copy ? 'copy' : 'move';
            sftpApi(action, {
                sources: absPaths.join('\n'),
                destDir: destDir
            }).then(function (res) {
                if (!res || res.status !== 200) {
                    alert((res && res.message) || (copy ? '复制失败' : '移动失败'));
                    return;
                }
                showSftpToast(copy ? '已复制' : '已移动');
                var names = res.result ? String(res.result).split('\n').filter(Boolean) : null;
                if (normalizeDirPath(destDir) === normalizeDirPath(curDir())) {
                    reload({ selectNames: names });
                } else {
                    reload();
                }
            }, function (xhr) {
                alert((xhr.responseJSON && xhr.responseJSON.message) || (copy ? '复制失败' : '移动失败'));
            });
        }

        function crossCopyToDir(sourceTagId, absPaths, destDir) {
            showSftpToast('正在跨服务器复制…');
            return $.ajax({
                url: baseUrl + '/crossCopy',
                method: 'POST',
                data: {
                    sourceTagId: sourceTagId,
                    destTagId: currentTagId(),
                    sources: absPaths.join('\n'),
                    destDir: destDir
                }
            }).then(function (res) {
                if (!res || res.status !== 200) {
                    alert((res && res.message) || '跨服务器复制失败');
                    return;
                }
                showSftpToast('已复制到本机目录');
                var names = res.result ? String(res.result).split('\n').filter(Boolean) : null;
                if (normalizeDirPath(destDir) === normalizeDirPath(curDir())) {
                    reload({ selectNames: names });
                } else {
                    reload();
                }
            }, function (xhr) {
                alert((xhr.responseJSON && xhr.responseJSON.message) || '跨服务器复制失败');
            });
        }

        function handleInternalDrop(e, destDir) {
            if (!destDir) {
                return;
            }
            var dt = e.originalEvent && e.originalEvent.dataTransfer;
            var localFiles = dt && dt.files;
            if (localFiles && localFiles.length) {
                uploadFilesToPath(localFiles, destDir);
                return;
            }
            var payload = parseDndPayload(dt);
            if (!payload || !payload.paths || !payload.paths.length) {
                // same-window fallback via dragRels
                if (dragRels && dragRels.length) {
                    payload = buildDndPayload(dragRels);
                } else {
                    return;
                }
            }
            var destAbs = normalizeDirPath(destDir);
            var blocked = payload.paths.some(function (p) {
                return normalizeDirPath(p) === destAbs;
            });
            if (blocked) {
                return;
            }
            var sameServer = String(payload.tagId) === String(currentTagId());
            var copy = wantCopyFromEvent(e);
            if (!sameServer) {
                if (!copy) {
                    showSftpToast('跨服务器仅支持复制');
                }
                crossCopyToDir(payload.tagId, payload.paths, destDir);
                dragRels = null;
                return;
            }
            transferAbsToDir(destDir, payload.paths, copy);
            dragRels = null;
        }

        $(document).on('dragstart.windrag', '#fileView tr, #fileView .icon-tile, #fileView .content-row', function (e) {
            var $row = $(this);
            var name = String($row.data('path') || '');
            if (!name || name === '..') {
                e.preventDefault();
                return;
            }
            if (!$row.hasClass('selected')) {
                selectOnly(name);
            }
            dragRels = getSelectedRels();
            try {
                var dt = e.originalEvent.dataTransfer;
                var payload = JSON.stringify(buildDndPayload(dragRels));
                dt.setData(DND_MIME, payload);
                dt.setData('text/plain', payload);
                dt.setData('application/x-webssh-items', dragRels.join('\n'));
                dt.effectAllowed = 'copyMove';
            } catch (err) { /* ignore */ }
            $row.addClass('dragging');
        });
        $(document).on('dragend.windrag', '#fileView tr, #fileView .icon-tile, #fileView .content-row', function () {
            $(this).removeClass('dragging');
            $('#fileView .drop-hover, #sftpTree .drop-hover').removeClass('drop-hover');
        });

        function resolveDropDir($el) {
            var destRel = String($el.data('path') || '');
            if (!destRel) {
                return null;
            }
            if (destRel === '..') {
                var p = normalizeDirPath(curDir());
                var idx = p.lastIndexOf('/');
                return idx <= 0 ? '/' : p.slice(0, idx);
            }
            if (String($el.data('dir')) === '1' || $el.hasClass('folder')) {
                return joinPath(curDir(), destRel);
            }
            return null;
        }

        // 绑定在 fileView 上优先处理，避免被外层上传 drop 抢走
        var $view = $('#fileView');
        $view.off('.windragfolder');
        $view.on('dragover.windragfolder', folderDropSel.replace(/#fileView /g, ''), function (e) {
            e.preventDefault();
            e.stopPropagation();
            setDropEffect(e);
            $view.find('.drop-hover').removeClass('drop-hover');
            $(this).addClass('drop-hover');
        });
        $view.on('dragleave.windragfolder', folderDropSel.replace(/#fileView /g, ''), function () {
            $(this).removeClass('drop-hover');
        });
        $view.on('drop.windragfolder', folderDropSel.replace(/#fileView /g, ''), function (e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).removeClass('drop-hover');
            handleInternalDrop(e, resolveDropDir($(this)));
        });
        // 空白处：放到当前目录（跨窗互拖）
        $view.on('dragover.windragfolder', function (e) {
            if ($(e.target).closest(folderDropSel.replace(/#fileView /g, '')).length) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            setDropEffect(e);
        });
        $view.on('drop.windragfolder', function (e) {
            if ($(e.target).closest(folderDropSel.replace(/#fileView /g, '')).length) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            handleInternalDrop(e, curDir());
        });

        $(document).on('dragover.windrag', folderDropSel, function (e) {
            e.preventDefault();
            e.stopPropagation();
            setDropEffect(e);
            $(folderDropSel).removeClass('drop-hover');
            $(this).addClass('drop-hover');
        });
        $(document).on('dragleave.windrag', folderDropSel, function () {
            $(this).removeClass('drop-hover');
        });
        $(document).on('drop.windrag', folderDropSel, function (e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).removeClass('drop-hover');
            handleInternalDrop(e, resolveDropDir($(this)));
        });

        // 左侧目录树也可拖入
        $(document).on('dragover.windrag', '#sftpTree .tree-row', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setDropEffect(e);
            $('#sftpTree .tree-row').removeClass('drop-hover');
            $(this).addClass('drop-hover');
        });
        $(document).on('dragleave.windrag', '#sftpTree .tree-row', function () {
            $(this).removeClass('drop-hover');
        });
        $(document).on('drop.windrag', '#sftpTree .tree-row', function (e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).removeClass('drop-hover');
            var destDir = String($(this).data('path') || '');
            handleInternalDrop(e, destDir || null);
        });
    }

    function transferToDir(destDir, rels, copy) {
        var sources = rels.map(absOf);
        var action = copy ? 'copy' : 'move';
        sftpApi(action, { sources: sources.join('\n'), destDir: destDir }).then(function (res) {
            if (!res || res.status !== 200) {
                alert((res && res.message) || (copy ? '复制失败' : '移动失败'));
                return;
            }
            showSftpToast(copy ? '已复制' : '已移动');
            var names = res.result ? String(res.result).split('\n').filter(Boolean) : null;
            if (normalizeDirPath(destDir) === normalizeDirPath(curDir())) {
                reload({ selectNames: names || rels });
            } else {
                reload();
            }
        }, function (xhr) {
            alert((xhr.responseJSON && xhr.responseJSON.message) || (copy ? '复制失败' : '移动失败'));
        });
    }

    function doMoveToDir(destDir, rels) {
        transferToDir(destDir, rels, false);
    }

    function moveSelection(delta) {
        var list = visibleRels();
        if (!list.length) {
            return;
        }
        var cur = getSelectedRels();
        var idx = cur.length ? list.indexOf(cur[cur.length - 1]) : -1;
        var next = Math.max(0, Math.min(list.length - 1, idx + delta));
        selectOnly(list[next]);
        var el = $('#fileView [data-path]').filter(function () {
            return String($(this).data('path')) === list[next];
        })[0];
        if (el && el.scrollIntoView) {
            el.scrollIntoView({ block: 'nearest' });
        }
    }

    // —— hook into existing flows ——
    var _navigateTo = w.navigateTo;
    w.navigateTo = function (path) {
        pushHistory(path);
        return _navigateTo.apply(this, arguments);
    };

    var _paintFileView = w.paintFileView;
    w.paintFileView = function () {
        var r = _paintFileView.apply(this, arguments);
        $('#fileView tr[data-path], #fileView .icon-tile[data-path], #fileView .content-row[data-path]')
            .attr('draggable', 'true');
        applyCutVisual();
        syncNavButtons();
        return r;
    };

    var _endInlineRename = w.endInlineRename;
    w.endInlineRename = function (commit) {
        var path = renamingPath;
        var $input = $('#fileView .rename-input');
        var oldBase = path ? basenameOf(path) : null;
        var val = $input.length ? ($input.val() || '').trim() : null;
        _endInlineRename.apply(this, arguments);
        if (commit && path && val && oldBase && val !== oldBase) {
            pushRenameUndo(absOf(path), joinPath(curDir(), val));
        }
    };

    var _renderFileList = w.renderFileList;
    w.renderFileList = function (path) {
        if (isAddressEditing()) {
            $('#sftpAddress').removeClass('editing');
        }
        var ret = _renderFileList.apply(this, arguments);
        renderBreadcrumbs();
        return ret;
    };

    var _buildContextMenuHtml = w.buildContextMenuHtml;
    w.buildContextMenuHtml = function (kind, isDir) {
        return buildWinContextMenu(kind, isDir, getSelectedRels().length > 1);
    };

    var _deleteSelected = w.deleteSelected;
    w.deleteSelected = function () {
        if (getSelectedRels().length > 1) {
            deleteSelectedMulti();
            return;
        }
        return _deleteSelected.apply(this, arguments);
    };

    var _reload = w.reload;
    w.reload = function () {
        invalidateTree(curDir());
        return _reload.apply(this, arguments);
    };

    $(function () {
        syncNavButtons();
        bindBoxSelect();
        bindInternalDrag();
        bindAddressBar();

        $('#btnNavBack').on('click', function () { goHistory(-1); });
        $('#btnNavForward').on('click', function () { goHistory(1); });
        $('#btnNavUp').on('click', function () { goUp(); });
        $('#btnFav').on('click', function () { toggleFavorite(curDir()); });
        $('#sftpBreadcrumbs').on('click', 'a', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (isAddressEditing()) {
                exitAddressEdit(false);
            }
            navigateTo($(this).data('path'));
        });
        $('#sftpFavList').on('click', 'a', function (e) {
            e.preventDefault();
            navigateTo($(this).data('path'));
        });
        $('#sftpFavList').on('click', '.fav-del', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite($(this).data('path'));
        });
        $('#sftpTree').off('click.tree').on('click.tree', '.tree-twisty', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if ($(this).hasClass('empty') || !$(this).data('toggle')) {
                return;
            }
            var p = normalizeDirPath(String($(this).data('toggle') || ''));
            if (!p) {
                return;
            }
            if (treeExpanded[p]) {
                delete treeExpanded[p];
                paintTreeDom();
                return;
            }
            treeExpanded[p] = true;
            if (!treeChildren[p]) {
                paintTreeDom();
                loadTreeChildren(p, paintTreeDom);
            } else {
                paintTreeDom();
            }
        });
        $('#sftpTree').on('click.tree', '.tree-row', function (e) {
            if ($(e.target).closest('.tree-twisty').length) {
                return;
            }
            var p = $(this).data('path');
            if (p) {
                navigateTo(p);
            }
        });
        $('#sftpTree').on('dblclick.tree', '.tree-row', function () {
            var p = normalizeDirPath(String($(this).data('path') || ''));
            if (!p) {
                return;
            }
            if (treeExpanded[p]) {
                delete treeExpanded[p];
            } else {
                treeExpanded[p] = true;
            }
            if (treeExpanded[p] && !treeChildren[p]) {
                loadTreeChildren(p, paintTreeDom);
            } else {
                paintTreeDom();
            }
        });
        $('#editSave').on('click', saveEdited);

        // override item click for multi-select (after sftp.js bindings: use capture via another handler)
        $(document).off('click.winselect').on('click.winselect', '#fileView tr, #fileView .icon-tile, #fileView .content-row', function (e) {
            if ($(e.target).closest('.rename-input, .name-text').length && $(this).hasClass('selected')
                && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                return;
            }
            e.stopImmediatePropagation();
            onItemClick(e, $(this));
        });

        $(document).on('click.winctx', '#fileContextMenu .ctx-item', function (e) {
            var action = $(this).data('action');
            if (action === 'cut') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                clipboardCopy(true);
            } else if (action === 'copy') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                clipboardCopy(false);
            } else if (action === 'paste') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                clipboardPaste();
            } else if (action === 'newfile') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                newEmptyFile();
            } else if (action === 'props') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                showProperties();
            } else if (action === 'compress') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                compressSelected();
            } else if (action === 'edit') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                editSelected();
            } else if (action === 'fav') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                toggleFavorite(curDir());
            } else if (action === 'dock-side') {
                e.preventDefault();
                e.stopImmediatePropagation();
                hideFileContextMenu();
                requestDockSide();
            }
        });

        window.addEventListener('message', function (e) {
            var data = e.data;
            if (!data || typeof data !== 'object') {
                return;
            }
            if (data.type === 'webssh-folder-clipboard-sync') {
                clipboard = data.clipboard || null;
                applyCutVisual();
            }
        });
        syncClipboardFromParent();

        $(document).on('keydown.winkeys', function (e) {
            var tag = (e.target && e.target.tagName) || '';
            var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                || (e.target && e.target.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
                if (!typing || e.target.id === 'currentPath') {
                    e.preventDefault();
                    enterAddressEdit();
                    return;
                }
            }
            if (typing) {
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                openSelectedItem();
                return;
            }
            if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
                e.preventDefault();
                goUp();
                return;
            }
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                goHistory(-1);
                return;
            }
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                goHistory(1);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                clearSelection();
                markSelected(visibleRels());
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                clipboardCopy(false);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'x' || e.key === 'X')) {
                e.preventDefault();
                clipboardCopy(true);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault();
                clipboardPaste();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                undoLast();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
                e.preventDefault();
                mkdirHere();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveSelection(1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveSelection(-1);
                return;
            }
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                var $sel = $('#fileView .selected').first();
                var rect = ($sel[0] || document.getElementById('fileView')).getBoundingClientRect();
                var isDir = $sel.length && (String($sel.data('dir')) === '1' || $sel.hasClass('folder'));
                showCtxAt(rect.left + 20 + window.scrollX, rect.top + 20 + window.scrollY,
                    $sel.length ? 'item' : 'blank', isDir);
            }
        });

        // initial history
        pushHistory(curDir());
    });

    w.SftpWin = {
        getSelectedRels: getSelectedRels,
        syncNavButtons: syncNavButtons,
        pushRenameUndo: pushRenameUndo
    };
})(window);
