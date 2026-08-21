/**
 * SFTP：详细信息/大图标；排序；分层搜索；悬浮详情；Ctrl+滚轮在详情↔图标间缩放
 * 下载仅右键；双击/空格仅预览
 */
var SFTP_VIEW_KEY = 'websshSftpViewMode';
var SFTP_ICON_SCALE_KEY = 'websshSftpIconScale';
var SFTP_SORT_KEY = 'websshSftpSort';
var THUMB_MAX_BYTES = 5 * 1024 * 1024;
var VIDEO_THUMB_MAX_BYTES = 80 * 1024 * 1024;
var PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
var EXCEL_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
var VIDEO_PREVIEW_MAX_BYTES = 512 * 1024 * 1024;
var SEARCH_DEPTH_MAX = 5;
var currentItems = [];
var searchItems = [];
var isSearchMode = false;
var searchToken = 0;
var searchTimer = null;
var sortKey = 'name';
var sortAsc = true;
var viewMode = localStorage.getItem(SFTP_VIEW_KEY) || 'details';
var ICON_SCALE_MIN = 0.7;
var ICON_SCALE_MAX = 2.2;
var ICON_SCALE_STEP = 0.1;
var iconScale = (function () {
    var n = parseFloat(localStorage.getItem(SFTP_ICON_SCALE_KEY));
    if (!isFinite(n) || n < ICON_SCALE_MIN || n > ICON_SCALE_MAX) {
        return 1;
    }
    return Math.round(n * 100) / 100;
})();
(function loadSort() {
    try {
        var s = JSON.parse(localStorage.getItem(SFTP_SORT_KEY) || '{}');
        if (s && s.key) {
            sortKey = s.key;
            sortAsc = s.asc !== false;
        }
    } catch (e) { /* ignore */ }
})();
var IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i;
var VIDEO_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)$/i;
var EXCEL_EXT = /\.(xlsx|xlsm|xls)$/i;
var TEXT_EXT = /\.(txt|log|md|json|xml|csv|ya?ml|conf|ini|properties|sh|bash|py|js|ts|css|html?|sql|java|go|c|h|cpp|hpp|rs|toml|env|gitignore|dockerfile)$/i;
var THUMB_CONCURRENCY = 3;
var VIDEO_THUMB_CONCURRENCY = 2;
var thumbQueue = [];
var thumbActive = 0;
var videoThumbQueue = [];
var videoThumbActive = 0;
var activeVideoThumbs = [];
var tipTimer = null;

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSize(bytes, isDir) {
    if (isDir) {
        return '';
    }
    var n = Number(bytes) || 0;
    if (n < 1024) {
        return n + ' B';
    }
    if (n < 1024 * 1024) {
        return (n / 1024).toFixed(1) + ' KB';
    }
    if (n < 1024 * 1024 * 1024) {
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function fileTypeLabel(item) {
    if (item.dir) {
        return '文件夹';
    }
    var name = item.name || '';
    var i = name.lastIndexOf('.');
    if (i > 0 && i < name.length - 1) {
        return name.slice(i + 1).toUpperCase() + ' 文件';
    }
    return '文件';
}

function fileExtOf(name) {
    name = String(name || '');
    if (!name) {
        return '';
    }
    if (name.charAt(0) === '.' && name.indexOf('.', 1) < 0) {
        return name.slice(1).toLowerCase();
    }
    var i = name.lastIndexOf('.');
    if (i <= 0 || i >= name.length - 1) {
        return '';
    }
    return name.slice(i + 1).toLowerCase();
}

function extBadgeClass(ext) {
    if (!ext) {
        return '';
    }
    if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i.test(ext)) {
        return 'ext-archive';
    }
    if (/^(py|js|ts|java|go|c|h|cpp|hpp|rs|sh|bash|sql|css|html|htm|json|xml|yml|yaml|toml|ini|conf|properties|env)$/i.test(ext)) {
        return 'ext-code';
    }
    if (/^(txt|log|md|csv|gitignore|dockerfile)$/i.test(ext)) {
        return 'ext-text';
    }
    if (/^(xlsx|xlsm|xls)$/i.test(ext)) {
        return 'ext-office';
    }
    if (/^(png|jpe?g|gif|webp|bmp|ico|svg|mp4|webm|ogg|ogv|m4v|mov)$/i.test(ext)) {
        return 'ext-media';
    }
    return '';
}

function extBadgeHtml(name) {
    var ext = fileExtOf(name);
    if (!ext) {
        return '';
    }
    var shown = ext.length > 6 ? ext.slice(0, 6) : ext;
    var cls = extBadgeClass(ext);
    return '<span class="ext-badge' + (cls ? ' ' + cls : '') + '" title=".' + escapeHtml(ext) + '">'
        + escapeHtml(shown) + '</span>';
}

function isImageFile(item) {
    return item && !item.dir && IMAGE_EXT.test(item.name || '');
}

function isVideoFile(item) {
    return item && !item.dir && VIDEO_EXT.test(item.name || '');
}

function isTextFile(item) {
    return item && !item.dir && TEXT_EXT.test(item.name || '');
}

function isExcelFile(item) {
    return item && !item.dir && EXCEL_EXT.test(item.name || '');
}

function isPreviewable(item) {
    return isImageFile(item) || isTextFile(item) || isVideoFile(item) || isExcelFile(item);
}

function previewKind(item) {
    if (isVideoFile(item)) {
        return 'video';
    }
    if (isImageFile(item)) {
        return 'image';
    }
    if (isExcelFile(item)) {
        return 'excel';
    }
    return 'text';
}

function previewSizeLimit(item) {
    if (isVideoFile(item)) {
        return VIDEO_PREVIEW_MAX_BYTES;
    }
    if (isExcelFile(item)) {
        return EXCEL_PREVIEW_MAX_BYTES;
    }
    return PREVIEW_MAX_BYTES;
}

function previewTooLargeMessage(item) {
    if (isVideoFile(item)) {
        return '视频过大，无法预览（上限约 512MB），请下载查看';
    }
    if (isExcelFile(item)) {
        return 'Excel 过大，无法预览（上限约 5MB），请下载查看';
    }
    return '文件过大，无法预览（上限约 8MB），请下载查看';
}

function joinPath(base, name) {
    if (!base || base === '/') {
        return '/' + name;
    }
    if (base.slice(-1) === '/') {
        return base + name;
    }
    return base + '/' + name;
}

function itemRelPath(item) {
    return item && (item.relPath || item.name);
}

function itemAbsPath(item) {
    return joinPath($('#currentPath').val(), itemRelPath(item));
}

function downloadUrl(relOrName) {
    var path = joinPath($('#currentPath').val(), relOrName);
    return baseUrl + '/download?path=' + encodeURIComponent(path) + '&tagId=' + encodeURIComponent(currentTagId());
}

function previewUrl(relOrName) {
    var path = joinPath($('#currentPath').val(), relOrName);
    return baseUrl + '/preview?path=' + encodeURIComponent(path) + '&tagId=' + encodeURIComponent(currentTagId());
}

function findItemByPath(relPath) {
    var list = getDisplayItems();
    for (var i = 0; i < list.length; i++) {
        if (itemRelPath(list[i]) === relPath) {
            return list[i];
        }
    }
    for (var j = 0; j < currentItems.length; j++) {
        if (currentItems[j].name === relPath) {
            return currentItems[j];
        }
    }
    return null;
}

function saveSort() {
    localStorage.setItem(SFTP_SORT_KEY, JSON.stringify({ key: sortKey, asc: sortAsc }));
}

function isDirItem(item) {
    if (!item) {
        return false;
    }
    return item.dir === true || item.dir === 1 || item.dir === '1';
}

function sortedItems(items) {
    return items.slice().sort(function (a, b) {
        // 按大小：文件夹沉底，只对文件比大小（避免空大小文件夹夹在中间）
        if (sortKey === 'size') {
            var ad = isDirItem(a);
            var bd = isDirItem(b);
            if (ad !== bd) {
                return ad ? 1 : -1;
            }
            if (ad && bd) {
                var nameCmp = String(a.name || '').localeCompare(String(b.name || ''), 'zh');
                return sortAsc ? nameCmp : -nameCmp;
            }
            var sizeCmp = (Number(a.size) || 0) - (Number(b.size) || 0);
            return sortAsc ? sizeCmp : -sizeCmp;
        }

        var cmp = 0;
        if (sortKey === 'mtime') {
            cmp = String(a.modifyTime || '').localeCompare(String(b.modifyTime || ''));
        } else if (sortKey === 'type') {
            cmp = fileTypeLabel(a).localeCompare(fileTypeLabel(b), 'zh');
        } else {
            cmp = String(a.name || '').localeCompare(String(b.name || ''), 'zh');
        }
        if (cmp !== 0) {
            return sortAsc ? cmp : -cmp;
        }
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
    });
}

function getDisplayItems() {
    return sortedItems(isSearchMode ? searchItems : currentItems);
}

function resetThumbQueue() {
    thumbQueue = [];
    thumbActive = 0;
    videoThumbQueue = [];
    videoThumbActive = 0;
    activeVideoThumbs.forEach(function (video) {
        try {
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
            video.removeAttribute('src');
            video.load();
        } catch (e) { /* ignore */ }
    });
    activeVideoThumbs = [];
}

function showThumbFallback(img) {
    if (!img) {
        return;
    }
    img.style.display = 'none';
    var n = img.nextElementSibling;
    if (n && n.classList && n.classList.contains('bi')) {
        n.style.display = 'inline-block';
    }
}

function enqueueThumb(img) {
    if (!img || !img.getAttribute('data-src')) {
        return;
    }
    thumbQueue.push(img);
    pumpThumbs();
}

function pumpThumbs() {
    while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length) {
        var img = thumbQueue.shift();
        if (!img || !img.isConnected) {
            continue;
        }
        var src = img.getAttribute('data-src');
        if (!src) {
            continue;
        }
        thumbActive += 1;
        var finish = function () {
            thumbActive = Math.max(0, thumbActive - 1);
            pumpThumbs();
        };
        img.onload = finish;
        img.onerror = function () {
            showThumbFallback(img);
            finish();
        };
        img.removeAttribute('data-src');
        img.src = src;
    }
}

function enqueueVideoThumb(img) {
    if (!img || !img.getAttribute('data-video-src')) {
        return;
    }
    videoThumbQueue.push(img);
    pumpVideoThumbs();
}

function pumpVideoThumbs() {
    while (videoThumbActive < VIDEO_THUMB_CONCURRENCY && videoThumbQueue.length) {
        var img = videoThumbQueue.shift();
        if (!img || !img.isConnected) {
            continue;
        }
        var src = img.getAttribute('data-video-src');
        if (!src) {
            continue;
        }
        videoThumbActive += 1;
        img.removeAttribute('data-video-src');

        var done = false;
        var video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        activeVideoThumbs.push(video);

        var finish = function () {
            if (done) {
                return;
            }
            done = true;
            var idx = activeVideoThumbs.indexOf(video);
            if (idx >= 0) {
                activeVideoThumbs.splice(idx, 1);
            }
            try {
                video.onloadeddata = null;
                video.onseeked = null;
                video.onerror = null;
                video.removeAttribute('src');
                video.load();
            } catch (e) { /* ignore */ }
            videoThumbActive = Math.max(0, videoThumbActive - 1);
            pumpVideoThumbs();
        };

        var fail = function () {
            showThumbFallback(img);
            finish();
        };

        var captureFrame = function () {
            if (done || !img.isConnected) {
                finish();
                return;
            }
            try {
                var w = video.videoWidth;
                var h = video.videoHeight;
                if (!w || !h) {
                    fail();
                    return;
                }
                var maxSide = 160;
                var scale = Math.min(1, maxSide / Math.max(w, h));
                var cw = Math.max(1, Math.round(w * scale));
                var ch = Math.max(1, Math.round(h * scale));
                var canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                canvas.getContext('2d').drawImage(video, 0, 0, cw, ch);
                img.onload = finish;
                img.onerror = fail;
                img.src = canvas.toDataURL('image/jpeg', 0.72);
            } catch (e) {
                fail();
            }
        };

        video.onerror = fail;
        video.onloadeddata = function () {
            var t = 0.05;
            if (isFinite(video.duration) && video.duration > 0) {
                t = Math.min(0.1, Math.max(0.01, video.duration * 0.01));
            }
            var seekTimer = setTimeout(function () {
                if (!done) {
                    captureFrame();
                }
            }, 1200);
            video.onseeked = function () {
                clearTimeout(seekTimer);
                captureFrame();
            };
            try {
                video.currentTime = t;
            } catch (e) {
                clearTimeout(seekTimer);
                captureFrame();
            }
        };
        video.src = src;
    }
}

function getSelectedName() {
    var $sel = $('#fileView .selected').first();
    if (!$sel.length) {
        return null;
    }
    var name = $sel.data('path');
    if (!name || name === '..') {
        return null;
    }
    return String(name);
}

function syncViewMenu() {
    $('.view-opt').removeClass('active');
    $('.view-opt[data-view="' + viewMode + '"]').addClass('active');
    var $view = $('#fileView');
    $view.removeClass('view-details view-icons view-tiles view-icons-xl view-content');
    if (viewMode === 'details') {
        $view.addClass('view-details');
    } else if (viewMode === 'content') {
        $view.addClass('view-content');
    } else if (viewMode === 'tiles') {
        $view.addClass('view-icons view-tiles');
    } else if (viewMode === 'icons-xl') {
        $view.addClass('view-icons view-icons-xl');
    } else {
        $view.addClass('view-icons');
    }
    applyIconScale();
}

function applyIconScale() {
    $('#fileView').css('--icon-scale', String(iconScale));
}

function setIconScale(next) {
    var n = Math.min(ICON_SCALE_MAX, Math.max(ICON_SCALE_MIN, next));
    iconScale = Math.round(n * 100) / 100;
    localStorage.setItem(SFTP_ICON_SCALE_KEY, String(iconScale));
    applyIconScale();
}

function setViewMode(mode, opts) {
    var allowed = { details: 1, icons: 1, tiles: 1, content: 1, 'icons-xl': 1 };
    if (!allowed[mode]) {
        mode = 'details';
    }
    var keepScale = opts && opts.keepScale;
    viewMode = mode;
    localStorage.setItem(SFTP_VIEW_KEY, viewMode);
    if ((mode === 'icons' || mode === 'tiles') && !keepScale && iconScale < ICON_SCALE_MIN) {
        setIconScale(ICON_SCALE_MIN);
    }
    if (mode === 'icons-xl' && !keepScale) {
        setIconScale(Math.max(iconScale, 1.8));
    }
    syncViewMenu();
    paintFileView();
}

function sortIndicator(key) {
    if (sortKey !== key) {
        return '';
    }
    return '<span class="sort-ind">' + (sortAsc ? '▲' : '▼') + '</span>';
}

function paintFileView() {
    var path = $('#currentPath').val() || '/';
    var $view = $('#fileView');
    $view.empty();
    hideFileHoverTip();

    if (viewMode === 'details') {
        paintDetailsView($view, path);
    } else if (viewMode === 'content') {
        paintContentView($view, path);
    } else {
        // icons / tiles / icons-xl
        paintIconsView($view, path);
        $view.removeClass('view-tiles view-icons-xl');
        if (viewMode === 'tiles') {
            $view.addClass('view-tiles');
        } else if (viewMode === 'icons-xl') {
            $view.addClass('view-icons-xl');
            if (iconScale < 1.6) {
                setIconScale(1.8);
            }
        }
    }
}

function paintContentView($view, path) {
    var items = getDisplayItems();
    var html = '';
    if (!isSearchMode && path !== '/') {
        html += '<div class="content-row folder" data-path=".." data-dir="1">'
            + '<div class="content-icon"><i class="bi bi-folder-fill"></i></div>'
            + '<div class="content-main"><div class="name-text">..</div></div></div>';
    }
    items.forEach(function (item) {
        var rel = itemRelPath(item);
        html += '<div class="content-row' + (item.dir ? ' folder' : '') + '" data-path="'
            + escapeHtml(rel) + '" data-dir="' + (item.dir ? '1' : '0') + '" draggable="true">'
            + '<div class="content-icon"><i class="bi '
            + (item.dir ? 'bi-folder-fill' : 'bi-file-earmark-fill') + '"></i></div>'
            + '<div class="content-main">'
            + '<div class="name-text">' + escapeHtml(item.name) + '</div>'
            + '<div class="content-sub">' + escapeHtml(fileTypeLabel(item))
            + ' · ' + escapeHtml(item.modifyTime || '')
            + (item.dir ? '' : (' · ' + escapeHtml(formatSize(item.size, false) || '0 B')))
            + (item.permissions ? (' · ' + escapeHtml(item.permissions)) : '')
            + '</div></div></div>';
    });
    if (!items.length) {
        html += '<div class="p-3 text-muted">' + (isSearchMode ? '无匹配结果' : '空目录') + '</div>';
    }
    $view.html(html);
}

function paintDetailsView($view, path) {
    var items = getDisplayItems();
    var html = '<table><thead><tr>'
        + '<th class="col-name" data-sort="name">名称' + sortIndicator('name') + '</th>'
        + '<th class="col-mtime" data-sort="mtime">修改日期' + sortIndicator('mtime') + '</th>'
        + '<th class="col-size" data-sort="size">大小' + sortIndicator('size') + '</th>'
        + '<th class="col-type" data-sort="type">类型' + sortIndicator('type') + '</th>'
        + '<th class="col-perm" data-sort="perm">权限</th>'
        + '<th class="col-owner">所有者</th>'
        + '</tr></thead><tbody>';

    if (!isSearchMode && path !== '/') {
        html += '<tr class="folder" data-path=".." data-dir="1" draggable="false">'
            + '<td class="name-cell"><i class="bi bi-folder-fill"></i><span class="name-text">..</span></td>'
            + '<td></td><td></td><td>文件夹</td><td></td><td></td></tr>';
    }

    if (!items.length) {
        html += '<tr><td colspan="6" class="text-muted p-3">'
            + (isSearchMode ? '无匹配结果' : '空目录') + '</td></tr>';
    }

    items.forEach(function (item) {
        var rel = itemRelPath(item);
        var icon = item.dir
            ? 'bi-folder-fill'
            : (isImageFile(item)
                ? 'bi-file-earmark-image'
                : (isVideoFile(item) ? 'bi-film' : 'bi-file-earmark-fill'));
        var cls = item.dir ? 'folder' : '';
        var hint = (item.relDir)
            ? '<div class="rel-hint">' + escapeHtml(item.relDir) + '/</div>'
            : '';
        var perm = item.permissions
            ? (escapeHtml(item.permissions) + (item.permissionText ? ' ' + escapeHtml(item.permissionText) : ''))
            : '';
        html += '<tr class="' + cls + '" data-path="' + escapeHtml(rel) + '" data-dir="'
            + (item.dir ? '1' : '0') + '" draggable="true">'
            + '<td class="name-cell">'
            + '<i class="bi ' + icon + '"></i><span class="name-text">' + escapeHtml(item.name)
            + '</span>' + hint + '</td>'
            + '<td>' + escapeHtml(item.modifyTime || '') + '</td>'
            + '<td>' + escapeHtml(formatSize(item.size, item.dir)) + '</td>'
            + '<td>' + escapeHtml(fileTypeLabel(item)) + '</td>'
            + '<td class="col-perm">' + perm + '</td>'
            + '<td>' + escapeHtml(item.owner || '') + '</td>'
            + '</tr>';
    });

    html += '</tbody></table>';
    $view.html(html);
}

function paintIconsView($view, path) {
    var items = getDisplayItems();
    var html = '';
    if (!isSearchMode && path !== '/') {
        html += '<div class="icon-tile folder" data-path=".." data-dir="1">'
            + '<div class="thumb"><i class="bi bi-folder-fill"></i></div>'
            + '<div class="label">..</div></div>';
    }
    if (!items.length) {
        html += '<div class="p-3 text-muted">' + (isSearchMode ? '无匹配结果' : '空目录') + '</div>';
    }
    items.forEach(function (item) {
        var rel = itemRelPath(item);
        var cls = 'icon-tile' + (item.dir ? ' folder' : '');
        var thumb;
        if (item.dir) {
            thumb = '<i class="bi bi-folder-fill"></i>';
        } else if (isImageFile(item) && Number(item.size || 0) <= THUMB_MAX_BYTES) {
            thumb = '<img class="thumb-img" alt="" data-src="' + escapeHtml(previewUrl(rel)) + '"'
                + ' src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">'
                + '<i class="bi bi-file-earmark-image" style="display:none"></i>';
        } else if (isImageFile(item)) {
            thumb = '<i class="bi bi-file-earmark-image"></i>';
        } else if (isVideoFile(item) && Number(item.size || 0) <= VIDEO_THUMB_MAX_BYTES) {
            thumb = '<img class="thumb-img thumb-video" alt="" data-video-src="'
                + escapeHtml(previewUrl(rel)) + '"'
                + ' src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">'
                + '<i class="bi bi-film" style="display:none"></i>';
        } else if (isVideoFile(item)) {
            thumb = '<i class="bi bi-film"></i>';
        } else {
            thumb = '<i class="bi bi-file-earmark-fill"></i>';
        }
        if (!item.dir) {
            thumb += extBadgeHtml(item.name);
        }
        html += '<div class="' + cls + '" data-path="' + escapeHtml(rel) + '" data-dir="'
            + (item.dir ? '1' : '0') + '">'
            + '<div class="thumb">' + thumb + '</div>'
            + '<div class="label name-text">' + escapeHtml(item.name) + '</div>'
            + '</div>';
    });
    resetThumbQueue();
    $view.html(html);
    applyIconScale();
    $view.find('img.thumb-img[data-src]').each(function () {
        enqueueThumb(this);
    });
    $view.find('img.thumb-video[data-video-src]').each(function () {
        enqueueVideoThumb(this);
    });
}

function navigateTo(path) {
    clearSearchUi(false);
    renderFileList(path);
}

function clearSearchUi(repaint) {
    searchToken += 1;
    isSearchMode = false;
    searchItems = [];
    $('#fileSearch').val('');
    if (repaint) {
        paintFileView();
    }
}

function openEntry(relPath, isDir) {
    if (!isDir) {
        return;
    }
    var currentPath = $('#currentPath').val() || '/';
    if (relPath === '..') {
            currentPath = currentPath.split('/').slice(0, -1).join('/');
            if (currentPath === '') {
            currentPath = '/';
        }
        navigateTo(currentPath);
        return;
    }
    navigateTo(joinPath(currentPath, relPath));
}

function openPreview(relPath) {
    var item = findItemByPath(relPath);
    if (!item || item.dir) {
        return;
    }
    if (!isPreviewable(item)) {
        return;
    }
    if (Number(item.size || 0) > previewSizeLimit(item)) {
        alert(previewTooLargeMessage(item));
        return;
    }
    var url = previewUrl(relPath);
    var kind = previewKind(item);
    var payload = {
        type: 'webssh-file-preview',
        name: item.name,
        kind: kind,
        url: url
    };
    // 桌面父页用 SheetJS / 媒体元素渲染；不要 window.open 预览地址：
    // Office MIME 即使 Content-Disposition=inline，Chrome 也会直接「下载」
    var parentWin = null;
    try {
        if (window.parent && window.parent !== window) {
            parentWin = window.parent;
        } else if (window.top && window.top !== window) {
            parentWin = window.top;
        }
    } catch (err) {
        parentWin = null;
    }
    if (parentWin) {
        parentWin.postMessage(payload, '*');
        return;
    }
    if (kind === 'excel' || kind === 'video') {
        alert('请从桌面打开「文件」窗口后再预览（当前页无法嵌入预览层）');
        return;
    }
    window.open(url, '_blank');
}

function togglePreview(relPath) {
    var item = findItemByPath(relPath);
    if (!item || item.dir || !isPreviewable(item)) {
        return;
    }
    if (Number(item.size || 0) > previewSizeLimit(item)) {
        alert(previewTooLargeMessage(item));
        return;
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'webssh-file-preview-toggle',
            name: item.name,
            kind: previewKind(item),
            url: previewUrl(relPath)
        }, '*');
        return;
    }
    openPreview(relPath);
}

function lsPromise(path) {
    return $.ajax({
        url: baseUrl + '/ls?path=' + encodeURIComponent(path) + '&tagId=' + encodeURIComponent(currentTagId()),
        method: 'GET',
        contentType: 'application/json;charset=UTF-8'
    }).then(function (response) {
        if (response && response.status === 200) {
            return response.result || [];
        }
        return [];
    }, function () {
        return [];
    });
}

function searchDeep(rootPath, query, maxDepth) {
    var q = String(query).toLowerCase();
    var results = [];
    var queue = [{ path: rootPath, depth: 1, rel: '' }];

    function step() {
        if (!queue.length) {
            return $.Deferred().resolve(results).promise();
        }
        var job = queue.shift();
        return lsPromise(job.path).then(function (list) {
            list.forEach(function (item) {
                var rel = job.rel ? (job.rel + '/' + item.name) : item.name;
                if (String(item.name || '').toLowerCase().indexOf(q) >= 0) {
                    results.push({
                        name: item.name,
                        dir: item.dir,
                        size: item.size,
                        modifyTime: item.modifyTime,
                        createTime: item.createTime,
                        relPath: rel,
                        relDir: job.rel
                    });
                }
                if (item.dir && job.depth < maxDepth) {
                    queue.push({
                        path: joinPath(job.path, item.name),
                        depth: job.depth + 1,
                        rel: rel
                    });
                }
            });
            return step();
        }, function () {
            return step();
        });
    }

    return step();
}

function runSearch() {
    var q = ($('#fileSearch').val() || '').trim();
    var depth = parseInt($('#searchDepth').val(), 10) || 1;
    depth = Math.max(1, Math.min(SEARCH_DEPTH_MAX, depth));

    if (!q) {
        isSearchMode = false;
        searchItems = [];
        paintFileView();
        return;
    }

    isSearchMode = true;
    var token = ++searchToken;

    if (depth <= 1) {
        searchItems = currentItems.filter(function (item) {
            return String(item.name || '').toLowerCase().indexOf(q.toLowerCase()) >= 0;
        }).map(function (item) {
            return {
                name: item.name,
                dir: item.dir,
                size: item.size,
                modifyTime: item.modifyTime,
                createTime: item.createTime,
                relPath: item.name,
                relDir: ''
            };
        });
        paintFileView();
        return;
    }

    $('#fileView').html('<div class="p-3 text-muted">搜索中（' + depth + ' 层）…</div>');
    searchDeep($('#currentPath').val() || '/', q, depth).then(function (list) {
        if (token !== searchToken) {
            return;
        }
        searchItems = list;
        paintFileView();
    }, function () {
        if (token !== searchToken) {
            return;
        }
        $('#fileView').html('<div class="p-3 text-danger">搜索失败</div>');
    });
}

function scheduleSearch() {
    if (searchTimer) {
        clearTimeout(searchTimer);
    }
    searchTimer = setTimeout(runSearch, 280);
}

function hideFileHoverTip() {
    if (tipTimer) {
        clearTimeout(tipTimer);
        tipTimer = null;
    }
    $('#fileHoverTip').hide().attr('aria-hidden', 'true');
}

function showFileHoverTip(pageX, pageY, item) {
    if (!item || itemRelPath(item) === '..') {
        return;
    }
    var lines = [];
    lines.push('<div class="tip-name">' + escapeHtml(item.name) + '</div>');
    lines.push('<div class="tip-row">类型: ' + escapeHtml(fileTypeLabel(item)) + '</div>');
    if (item.modifyTime) {
        lines.push('<div class="tip-row">修改日期: ' + escapeHtml(item.modifyTime) + '</div>');
    }
    if (!item.dir) {
        lines.push('<div class="tip-row">大小: ' + escapeHtml(formatSize(item.size, false) || '0 B') + '</div>');
    }
    if (item.permissions) {
        lines.push('<div class="tip-row">权限: ' + escapeHtml(item.permissions)
            + (item.permissionText ? (' (' + escapeHtml(item.permissionText) + ')') : '') + '</div>');
    }
    if (item.relDir) {
        lines.push('<div class="tip-row">位置: ' + escapeHtml(item.relDir) + '/</div>');
    }
    var $tip = $('#fileHoverTip');
    $tip.html(lines.join('')).show().attr('aria-hidden', 'false');
    var tw = $tip.outerWidth() || 220;
    var th = $tip.outerHeight() || 80;
    var x = Math.min(pageX + 14, window.innerWidth - tw - 8);
    var y = Math.min(pageY + 14, window.innerHeight - th - 8);
    $tip.css({ left: Math.max(4, x) + 'px', top: Math.max(4, y) + 'px' });
}

function handleCtrlWheel(e) {
    if (!e.ctrlKey) {
        return;
    }
    e.preventDefault();
    if (viewMode === 'details') {
        if (e.deltaY < 0) {
            iconScale = ICON_SCALE_MIN;
            localStorage.setItem(SFTP_ICON_SCALE_KEY, String(iconScale));
            setViewMode('icons', { keepScale: true });
        }
        return;
    }
    if (e.deltaY < 0) {
        setIconScale(iconScale + ICON_SCALE_STEP);
        return;
    }
    if (iconScale <= ICON_SCALE_MIN + 0.001) {
        setViewMode('details');
        } else {
        setIconScale(iconScale - ICON_SCALE_STEP);
    }
}

$(function () {
    syncViewMenu();
    // 首屏：URL cwd 优先；否则先 /，再异步切到 shell cwd（避免无权限的 /root）
    syncToShellCwd($('#currentPath').val() || '/');

    bindDropUpload($('.sftp-root'), function () {
        return $('#currentPath').val() || '/';
    });

    window.addEventListener('message', function (e) {
        var data = e.data;
        if (!data || typeof data !== 'object') {
            return;
        }
        if (data.type === 'webssh-files-visible' && data.visible) {
            // 已打开过则只拉 cwd，不重复强制刷 fallback（减少抖动）
            syncToShellCwd($('#currentPath').val() || '/', { immediate: false });
        }
        if (data.type === 'webssh-sync-cwd' && data.path) {
            clearSearchUi(false);
            renderFileList(String(data.path), function () {
                if (data.selectNames && data.selectNames.length) {
                    selectFilesByNames(data.selectNames);
                }
            });
        }
    });

    var contextFileName = null;
    var contextMenuKind = null;

    function hideFileContextMenu() {
        contextFileName = null;
        contextMenuKind = null;
        $('#fileContextMenu').hide().empty();
    }

    function showFileContextMenu(pageX, pageY, name, kind, isDir) {
        contextFileName = name;
        contextMenuKind = kind || 'item';
        var $menu = $('#fileContextMenu');
        $menu.html(buildContextMenuHtml(contextMenuKind, !!isDir)).show();
        var mw = $menu.outerWidth() || 180;
        var mh = $menu.outerHeight() || 40;
        var x = Math.min(pageX, window.innerWidth - mw - 4);
        var y = Math.min(pageY, window.innerHeight - mh - 4);
        $menu.css({ left: Math.max(0, x) + 'px', top: Math.max(0, y) + 'px' });
    }

    bindChmodUi();

    $(document).on('click', '.view-opt', function (e) {
        e.preventDefault();
        setViewMode($(this).data('view'));
    });

    $(document).on('click', '#fileView thead th[data-sort]', function () {
        var key = $(this).data('sort');
        if (!key) {
            return;
        }
        if (sortKey === key) {
            sortAsc = !sortAsc;
            } else {
            sortKey = key;
            sortAsc = true;
        }
        saveSort();
        paintFileView();
    });

    $(document).on('input', '#fileSearch', scheduleSearch);
    $(document).on('change', '#searchDepth', function () {
        if (($('#fileSearch').val() || '').trim()) {
            runSearch();
        }
    });

    $(document).on('click', '#fileView .name-text', function (e) {
        var $row = $(this).closest('tr, .icon-tile');
        var name = $row.data('path');
        if (!name || name === '..') {
            return;
        }
        if (!$row.hasClass('selected')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        scheduleInlineRename(String(name));
    });

    $(document).on('dblclick', '#fileView tr, #fileView .icon-tile, #fileView .content-row', function (e) {
        cancelScheduledRename();
        var name = $(this).data('path');
        if (!name) {
            return;
        }
        e.preventDefault();
        var isDir = String($(this).data('dir')) === '1' || $(this).hasClass('folder');
        if (isDir) {
            openEntry(name, true);
            return;
        }
        var item = findItemByPath(name);
        if (item && isPreviewable(item)) {
            openPreview(name);
        }
    });

    $(document).on('mouseenter', '#fileView .icon-tile', function (e) {
        var $tile = $(this);
        var name = $tile.data('path');
        if (!name || name === '..') {
            return;
        }
        var item = findItemByPath(String(name));
        if (!item) {
            return;
        }
        hideFileHoverTip();
        var pageX = e.pageX;
        var pageY = e.pageY;
        tipTimer = setTimeout(function () {
            showFileHoverTip(pageX, pageY, item);
        }, 420);
    });
    $(document).on('mousemove', '#fileView .icon-tile', function (e) {
        var $tip = $('#fileHoverTip');
        if (!$tip.is(':visible')) {
            return;
        }
        var tw = $tip.outerWidth() || 220;
        var th = $tip.outerHeight() || 80;
        var x = Math.min(e.pageX + 14, window.innerWidth - tw - 8);
        var y = Math.min(e.pageY + 14, window.innerHeight - th - 8);
        $tip.css({ left: Math.max(4, x) + 'px', top: Math.max(4, y) + 'px' });
    });
    $(document).on('mouseleave', '#fileView .icon-tile', hideFileHoverTip);
    $(document).on('scroll', '#fileView', hideFileHoverTip);

    var fileViewEl = document.getElementById('fileView');
    if (fileViewEl) {
        fileViewEl.addEventListener('wheel', handleCtrlWheel, { passive: false });
    }

    $(document).on('contextmenu', '#fileView tr, #fileView .icon-tile, #fileView .content-row', function (e) {
        var name = $(this).data('path');
        if (!name || name === '..') {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        $('#fileView tr, #fileView .icon-tile').removeClass('selected');
        $(this).addClass('selected');
        var isDir = String($(this).data('dir')) === '1' || $(this).hasClass('folder');
        showFileContextMenu(e.pageX, e.pageY, String(name), 'item', isDir);
    });

    $(document).on('contextmenu', '#fileView', function (e) {
        if ($(e.target).closest('tr, .icon-tile, thead').length) {
            return;
        }
        e.preventDefault();
        showFileContextMenu(e.pageX, e.pageY, null, 'blank', false);
    });

    $(document).on('click', '#fileContextMenu .ctx-item', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var action = $(this).data('action');
        var name = contextFileName;
        var kind = contextMenuKind;
        hideFileContextMenu();
        if (action === 'refresh') {
            reload();
            return;
        }
        if (action === 'mkdir') {
            mkdirHere();
            return;
        }
        if (action === 'upload') {
            triggerFile();
            return;
        }
        if (!name && kind !== 'blank') {
            return;
        }
        if (action === 'open') {
            openSelected(name);
        } else if (action === 'download') {
            downloadFile(name);
        } else if (action === 'rename') {
            renameSelected(name);
        } else if (action === 'delete') {
            deleteSelected(name);
        } else if (action === 'chmod') {
            openChmodDialog(name);
        } else if (action === 'copy-path') {
            copyPathSelected(name);
        }
    });

    $(document).on('click', hideFileContextMenu);
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape') {
            hideFileContextMenu();
            hideFileHoverTip();
        }
    });
    $(window).on('blur resize', function () {
        hideFileContextMenu();
        hideFileHoverTip();
    });

    $(document).on('keydown', function (e) {
        var tag = (e.target && e.target.tagName) || '';
        var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
            || (e.target && e.target.isContentEditable);
        if (!typing) {
            if (e.key === 'F5') {
                e.preventDefault();
                reload();
                return;
            }
            if (e.key === 'F2') {
                e.preventDefault();
                renameSelected();
                return;
            }
            if (e.key === 'Delete') {
                e.preventDefault();
                deleteSelected();
                return;
            }
        }
        if (e.key !== ' ' && e.code !== 'Space' && e.key !== 'Escape') {
            return;
        }
        if (typing) {
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'webssh-file-preview-close' }, '*');
            }
            return;
        }
        var name = getSelectedName();
        if (!name) {
            if (window.parent && window.parent !== window) {
                e.preventDefault();
                window.parent.postMessage({ type: 'webssh-file-preview-close' }, '*');
            }
            return;
        }
        var item = findItemByPath(name);
        if (!item || !isPreviewable(item)) {
            return;
        }
        e.preventDefault();
        togglePreview(name);
    });
});

function reload(opts) {
    opts = opts || {};
    var q = ($('#fileSearch').val() || '').trim();
    var selectNames = opts.selectNames || null;
    renderFileList($('#currentPath').val(), function () {
        if (q) {
            runSearch();
        }
        if (selectNames && selectNames.length) {
            selectFilesByNames(selectNames);
        }
    });
}

function selectFilesByNames(names) {
    var list = Array.isArray(names) ? names : [names];
    $('#fileView tr, #fileView .icon-tile, #fileView .content-row').removeClass('selected');
    var $last = null;
    list.forEach(function (n) {
        if (!n) {
            return;
        }
        var target = String(n);
        var $hit = $('#fileView tr, #fileView .icon-tile, #fileView .content-row').filter(function () {
            return String($(this).data('path')) === target;
        });
        $hit.addClass('selected');
        if ($hit.length) {
            $last = $hit.last();
        }
    });
    if ($last && $last.length && $last[0].scrollIntoView) {
        try {
            $last[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (e) { /* ignore */ }
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        reload();
    }
}

function notifyFolderWindowPath(path) {
    if (!window.parent || window.parent === window) {
        return;
    }
    try {
        window.parent.postMessage({ type: 'webssh-folder-path', path: path || '/' }, '*');
    } catch (e) { /* ignore */ }
    // 按会话记住最近目录，避免换服务器时串用上一台的路径
    try {
        var sid = (typeof sessionId !== 'undefined' && sessionId)
            || (typeof getQueryParam === 'function' ? getQueryParam('sessionId') : null);
        if (sid && path) {
            var map = {};
            try {
                map = JSON.parse(localStorage.getItem('websshSftpLastCwd.v1') || '{}') || {};
            } catch (eMap) {
                map = {};
            }
            map[String(sid)] = String(path);
            localStorage.setItem('websshSftpLastCwd.v1', JSON.stringify(map));
        }
    } catch (e2) { /* ignore */ }
}

var sessionExpiredReloginTried = false;

function recoverExpiredSessionThen(path, afterLoad) {
    if (sessionExpiredReloginTried) {
        $('#fileView').html('<div class="p-3 text-danger">未登录或会话已过期，请关闭窗口后重新打开文件</div>');
        return;
    }
    sessionExpiredReloginTried = true;
    $('#fileView').html('<div class="p-3 text-muted">会话已过期，正在重新连接…</div>');

    var parentWin = null;
    try {
        if (window.parent && window.parent !== window) {
            parentWin = window.parent;
        }
    } catch (e0) {
        parentWin = null;
    }
    if (!parentWin || typeof parentWin.ensureLoggedIn !== 'function') {
        $('#fileView').html('<div class="p-3 text-danger">未登录或会话已过期，请重新连接</div>');
        return;
    }

    var sid = null;
    try {
        sid = getQueryParam('sessionId') || sessionId || parentWin.currentSessionId;
    } catch (e1) {
        sid = parentWin.currentSessionId;
    }
    var cache = parentWin.sessionsCache || {};

    function onSession(session) {
        if (!session) {
            $('#fileView').html('<div class="p-3 text-danger">未登录或会话已过期，请重新连接</div>');
            return;
        }
        parentWin.ensureLoggedIn(session)
            .done(function (newTagId) {
                if (typeof applyTagId === 'function') {
                    applyTagId(newTagId);
                }
                sessionExpiredReloginTried = false;
                renderFileList(path, afterLoad);
            })
            .fail(function (msg) {
                $('#fileView').html('<div class="p-3 text-danger">' + escapeHtml(msg || '重新登录失败') + '</div>');
            });
    }

    if (sid && cache[sid]) {
        onSession(cache[sid]);
    } else if (sid && typeof parentWin.resolveSession === 'function') {
        parentWin.resolveSession(sid, onSession);
    } else {
        $('#fileView').html('<div class="p-3 text-danger">未登录或会话已过期，请关闭窗口后重新打开文件</div>');
    }
}

function renderFileList(path, afterLoad) {
    $('#currentPath').val(path);
    notifyFolderWindowPath(path);
    $('#fileView').html('<div class="p-3 text-muted">加载中…</div>');
    $.ajax({
        url: baseUrl + '/ls?path=' + encodeURIComponent(path) + '&tagId=' + encodeURIComponent(currentTagId()),
        method: 'GET',
        contentType: 'application/json;charset=UTF-8',
        success: function (response) {
            if (!response || response.status !== 200) {
                var msg = (response && response.message) ? response.message : '加载失败';
                if (typeof isSessionExpiredMessage === 'function' && isSessionExpiredMessage(msg)) {
                    recoverExpiredSessionThen(path, afterLoad);
                    return;
                }
                $('#fileView').html('<div class="p-3 text-danger">' + escapeHtml(msg) + '</div>');
                return;
            }
            sessionExpiredReloginTried = false;
            var list = response.result || [];
            currentItems = list;
            if (!isSearchMode) {
                paintFileView();
            }
            if (typeof afterLoad === 'function') {
                afterLoad();
            } else if (isSearchMode) {
                runSearch();
            }
        },
        error: function (xhr, status, error) {
            console.error(error);
            var detail = (xhr && xhr.responseJSON && xhr.responseJSON.message)
                ? xhr.responseJSON.message
                : '加载失败（请刷新或重新连接会话）';
            if (typeof isSessionExpiredMessage === 'function' && isSessionExpiredMessage(detail)) {
                recoverExpiredSessionThen(path, afterLoad);
                return;
            }
            $('#fileView').html('<div class="p-3 text-danger">' + escapeHtml(detail) + '</div>');
        }
    });
}

function triggerFile() {
    $('input[type=file]').trigger('click');
}

function resolveSftpSessionId() {
    try {
        if (typeof sessionId !== 'undefined' && sessionId) {
            return String(sessionId);
        }
    } catch (e0) { /* ignore */ }
    try {
        if (typeof getQueryParam === 'function') {
            var q = getQueryParam('sessionId');
            if (q) {
                return String(q);
            }
        }
    } catch (e1) { /* ignore */ }
    return '';
}

function fetchShellPwd() {
    var sid = resolveSftpSessionId();
    // 父页短缓存：按 sessionId 隔离，避免多服务器串路径
    try {
        if (window.parent && window.parent !== window) {
            var cacheMap = window.parent.__websshShellPwdCacheBySession;
            if (!cacheMap || typeof cacheMap !== 'object') {
                cacheMap = {};
                window.parent.__websshShellPwdCacheBySession = cacheMap;
            }
            // 兼容旧全局缓存：仅当当前无 sessionId 时才用
            if (sid && cacheMap[sid] && cacheMap[sid].path
                && (Date.now() - (cacheMap[sid].at || 0) < 8000)) {
                return $.Deferred().resolve(cacheMap[sid].path).promise();
            }
            var inflightMap = window.parent.__websshShellPwdInflightBySession;
            if (!inflightMap || typeof inflightMap !== 'object') {
                inflightMap = {};
                window.parent.__websshShellPwdInflightBySession = inflightMap;
            }
            if (sid && inflightMap[sid]) {
                return inflightMap[sid];
            }
        }
    } catch (e0) { /* ignore */ }

    var req = $.ajax({
        url: baseUrl + '/pwd?tagId=' + encodeURIComponent(currentTagId()),
        method: 'GET'
    }).then(function (res) {
        if (res && res.status === 200 && res.result) {
            var path = String(res.result).trim();
            try {
                if (window.parent && window.parent !== window && sid) {
                    if (!window.parent.__websshShellPwdCacheBySession) {
                        window.parent.__websshShellPwdCacheBySession = {};
                    }
                    window.parent.__websshShellPwdCacheBySession[sid] = { path: path, at: Date.now() };
                }
            } catch (e1) { /* ignore */ }
            return path;
        }
        return null;
    }, function () {
        return null;
    }).always(function () {
        try {
            if (window.parent && window.parent !== window && sid
                && window.parent.__websshShellPwdInflightBySession) {
                window.parent.__websshShellPwdInflightBySession[sid] = null;
            }
        } catch (e2) { /* ignore */ }
    });

    try {
        if (window.parent && window.parent !== window && sid) {
            if (!window.parent.__websshShellPwdInflightBySession) {
                window.parent.__websshShellPwdInflightBySession = {};
            }
            window.parent.__websshShellPwdInflightBySession[sid] = req;
        }
    } catch (e3) { /* ignore */ }
    return req;
}

function syncToShellCwd(fallback, opts) {
    opts = opts || {};
    var fb = fallback || $('#currentPath').val() || '/';
    var preset = null;
    // URL 预置目录（打开文件窗 / 布局还原时由父页注入）优先，且不再被 shell pwd 覆盖
    try {
        var sp = new URLSearchParams(window.location.search || '');
        preset = sp.get('cwd');
        if (preset) {
            fb = preset;
        }
    } catch (e) { /* ignore */ }
    // 先立刻列出 fallback，避免等 /pwd 时空白卡顿
    if (opts.immediate !== false) {
        clearSearchUi(false);
        renderFileList(fb);
    }
    if (preset || opts.skipPwd) {
        return;
    }
    fetchShellPwd().then(function (pwd) {
        if (!pwd) {
            return;
        }
        var cur = ($('#currentPath').val() || '').replace(/\/+$/, '') || '/';
        var next = pwd.replace(/\/+$/, '') || '/';
        if (cur === next) {
            return;
        }
        clearSearchUi(false);
        renderFileList(pwd);
    });
}

function formatByteSize(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n < 0) {
        n = 0;
    }
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i += 1;
    }
    var digits = i === 0 ? 0 : (n >= 100 ? 0 : 1);
    return n.toFixed(digits) + ' ' + units[i];
}

function setProgressBar($bar, pct, label) {
    if (!$bar || !$bar.length) {
        return;
    }
    var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    var text = label != null ? String(label) : (p + '%');
    $bar.css('width', p + '%').attr('aria-valuenow', p).text(text);
}

function uploadOneFile(file, path, fileName, onProgress) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);
    if (fileName) {
        formData.append('fileName', fileName);
    }
    var fileSize = (file && file.size) ? file.size : 0;
    var dfd = $.Deferred();
    var xhr = new XMLHttpRequest();
    var responseOffset = 0;
    var finalResult = null;
    var finalError = null;

    function emitProgress(phase, loaded, total) {
        if (typeof onProgress === 'function') {
            onProgress(phase, loaded, total > 0 ? total : fileSize);
        }
    }

    function consumeNdjson() {
        var text = xhr.responseText || '';
        if (text.length <= responseOffset) {
            return;
        }
        var chunk = text.slice(responseOffset);
        var lastNl = chunk.lastIndexOf('\n');
        if (lastNl < 0) {
            return;
        }
        var complete = chunk.slice(0, lastNl + 1);
        responseOffset += complete.length;
        var lines = complete.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) {
                continue;
            }
            var ev = null;
            try {
                ev = JSON.parse(line);
            } catch (err) {
                continue;
            }
            if (!ev || !ev.phase) {
                continue;
            }
            if (ev.phase === 'remote') {
                emitProgress('remote', ev.loaded || 0, ev.total != null ? ev.total : fileSize);
            } else if (ev.phase === 'done') {
                finalResult = {
                    status: ev.status != null ? ev.status : 200,
                    message: ev.message || '操作成功！',
                    result: ev.result != null ? ev.result : fileName
                };
            } else if (ev.phase === 'error') {
                finalError = {
                    status: ev.status != null ? ev.status : 500,
                    message: ev.message || '上传失败'
                };
            }
        }
    }

    xhr.open('POST', baseUrl + '/upload?tagId=' + encodeURIComponent(currentTagId()));
    xhr.responseType = 'text';
    if (xhr.upload) {
        xhr.upload.onprogress = function (e) {
            var loaded = e && e.loaded != null ? e.loaded : 0;
            if (fileSize > 0) {
                loaded = Math.min(loaded, fileSize);
                emitProgress('local', loaded, fileSize);
            } else if (e && e.lengthComputable && e.total > 0) {
                emitProgress('local', Math.min(loaded, e.total), e.total);
            } else {
                emitProgress('local', loaded, 0);
            }
        };
        xhr.upload.onload = function () {
            // HTTP body finished → waiting / starting remote write
            emitProgress('remote', 0, fileSize);
        };
    }
    xhr.onprogress = function () {
        consumeNdjson();
    };
    xhr.onload = function () {
        consumeNdjson();
        if (finalError) {
            dfd.reject(finalError);
            return;
        }
        if (finalResult) {
            if (fileSize > 0) {
                emitProgress('remote', fileSize, fileSize);
            }
            dfd.resolve(finalResult);
            return;
        }
        // Fallback: old JSON body (compat)
        var raw = xhr.responseText || '';
        try {
            var data = raw ? JSON.parse(raw.trim().split('\n').pop()) : null;
            if (data && data.phase === 'done') {
                dfd.resolve({
                    status: 200,
                    message: data.message,
                    result: data.result
                });
                return;
            }
            if (data && data.status === 200) {
                dfd.resolve(data);
                return;
            }
            if (data && data.phase === 'error') {
                dfd.reject(data);
                return;
            }
        } catch (err) { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) {
            dfd.resolve({ status: 200, result: fileName, message: '操作成功！' });
        } else {
            dfd.reject({ status: xhr.status, message: '上传失败' });
        }
    };
    xhr.onerror = function () {
        dfd.reject({ status: 0, message: '网络错误' });
    };
    xhr.onabort = function () {
        dfd.reject({ status: 0, message: '已取消' });
    };
    emitProgress('local', 0, fileSize);
    xhr.send(formData);
    return dfd.promise();
}

function normalizeDirPath(p) {
    var s = String(p || '/').replace(/\\/g, '/');
    if (!s) {
        return '/';
    }
    if (s.length > 1 && s.slice(-1) === '/') {
        s = s.slice(0, -1);
    }
    return s || '/';
}

function listNamesInDir(dirPath) {
    var cur = normalizeDirPath($('#currentPath').val());
    var target = normalizeDirPath(dirPath);
    if (cur === target && Array.isArray(currentItems) && !isSearchMode) {
        return $.Deferred().resolve(currentItems.map(function (it) {
            return it.name;
        })).promise();
    }
    return $.ajax({
        url: baseUrl + '/ls?path=' + encodeURIComponent(dirPath) + '&tagId=' + encodeURIComponent(currentTagId()),
        method: 'GET'
    }).then(function (res) {
        if (!res || res.status !== 200) {
            return [];
        }
        return (res.result || []).map(function (it) {
            return it.name;
        });
    }, function () {
        return [];
    });
}

function suggestUniqueName(fileName, existingNames) {
    var set = {};
    (existingNames || []).forEach(function (n) {
        set[String(n)] = true;
    });
    if (!set[fileName]) {
        return fileName;
    }
    var dot = fileName.lastIndexOf('.');
    var hasExt = dot > 0 && dot < fileName.length - 1;
    var base = hasExt ? fileName.slice(0, dot) : fileName;
    var ext = hasExt ? fileName.slice(dot) : '';
    base = base.replace(/ \(\d+\)$/, '');
    var i = 1;
    var next;
    do {
        next = base + ' (' + i + ')' + ext;
        i += 1;
    } while (set[next]);
    return next;
}

function pauseUploadModal() {
    var dfd = $.Deferred();
    var $load = $('#load');
    if (!$load.hasClass('show') && !$load.is(':visible')) {
        $('.modal-backdrop').remove();
        $('body').removeClass('modal-open').css('padding-right', '');
        dfd.resolve();
        return dfd.promise();
    }
    $load.one('hidden.bs.modal', function () {
        $('.modal-backdrop').remove();
        $('body').removeClass('modal-open').css('padding-right', '');
        dfd.resolve();
    });
    $load.modal('hide');
    // 兜底：动画异常时也不卡死
    setTimeout(function () {
        if (dfd.state() === 'pending') {
            $('.modal-backdrop').remove();
            $('body').removeClass('modal-open').css('padding-right', '');
            dfd.resolve();
        }
    }, 400);
    return dfd.promise();
}

function resumeUploadModal() {
    $('#load').modal({ keyboard: false, backdrop: 'static' });
    $('#load').modal('show');
}

function askUploadConflict(fileName, suggestedName) {
    var dfd = $.Deferred();
    $('#conflictMsg').text('已存在「' + fileName + '」，请选择处理方式：');
    $('#conflictRenameInput').val(suggestedName || fileName);
    $('#conflictOverlay').addClass('show').attr('aria-hidden', 'false');
    setTimeout(function () {
        var el = document.getElementById('conflictRenameInput');
        if (el) {
            el.focus();
            el.select();
        }
    }, 30);

    function done(action, name) {
        $('#conflictRename,#conflictReplace,#conflictSkip').off('.conflict');
        $('#conflictRenameInput').off('.conflict');
        $('#conflictOverlay').removeClass('show').attr('aria-hidden', 'true');
        dfd.resolve({ action: action, name: name });
    }

    $('#conflictRename').off('.conflict').on('click.conflict', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var n = ($('#conflictRenameInput').val() || '').trim();
        if (!n || n.indexOf('/') >= 0 || n.indexOf('\\') >= 0 || n === '.' || n === '..') {
            alert('名称不合法');
            return;
        }
        done('rename', n);
    });
    $('#conflictReplace').off('.conflict').on('click.conflict', function (e) {
        e.preventDefault();
        e.stopPropagation();
        done('replace', fileName);
    });
    $('#conflictSkip').off('.conflict').on('click.conflict', function (e) {
        e.preventDefault();
        e.stopPropagation();
        done('skip', null);
    });
    $('#conflictRenameInput').off('.conflict').on('keydown.conflict', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            $('#conflictRename').trigger('click');
        }
    });
    // 防止底层 modal 抢焦点
    $('#conflictOverlay').off('.conflict').on('mousedown.conflict', function (e) {
        e.stopPropagation();
    });
    return dfd.promise();
}

function uploadFilesToPath(fileList, path, opts) {
    opts = opts || {};
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
        return f && f.name;
    });
    if (!files.length) {
        return;
    }
    if (!path) {
        alert('上传目录无效');
        return;
    }
    var batchTotal = 0;
    files.forEach(function (f) {
        batchTotal += (f.size || 0);
    });
    var batchDone = 0;

    function updateUi(fileIndex, fileName, phase, fileLoaded, fileTotal) {
        var n = files.length;
        var ft = fileTotal > 0 ? fileTotal : 0;
        var fl = fileLoaded > 0 ? fileLoaded : 0;
        if (ft > 0) {
            fl = Math.min(fl, ft);
        }
        var filePct = ft > 0 ? (fl / ft) * 100 : 0;
        var overallLoaded = batchDone + fl;
        var overallPct = batchTotal > 0 ? (overallLoaded / batchTotal) * 100 : 0;
        var phaseLabel = phase === 'remote' ? '写入远程' : '传到本机';
        $('#uploadMessage').text(
            phaseLabel + ' ' + fileName + '（' + fileIndex + ' / ' + n + '）'
        );
        if (ft > 0) {
            $('#uploadSizeCurrent').text(
                '当前(' + phaseLabel + ') ' + formatByteSize(fl) + ' / ' + formatByteSize(ft)
            );
        } else {
            $('#uploadSizeCurrent').text(
                '当前(' + phaseLabel + ') 已传 ' + formatByteSize(fl) + '（大小未知）'
            );
        }
        $('#uploadSizeTotal').text(
            '合计 ' + formatByteSize(overallLoaded) + ' / ' + formatByteSize(batchTotal)
            + '（' + n + ' 个文件）'
        );
        setProgressBar($('#progressBar'), filePct);
        setProgressBar($('#progressBarTotal'), overallPct);
        var $bar = $('#progressBar');
        if (phase === 'remote') {
            $bar.addClass('bg-info');
        } else {
            $bar.removeClass('bg-info');
        }
    }

    $('#load').modal({ keyboard: false });
    $('#load').modal('show');
    $('#uploadMessage').text('准备上传…');
    $('#uploadSizeCurrent').text('当前 —');
    $('#uploadSizeTotal').text('合计 0 B / ' + formatByteSize(batchTotal) + '（' + files.length + ' 个文件）');
    setProgressBar($('#progressBar'), 0);
    setProgressBar($('#progressBarTotal'), 0);

    var i = 0;
    var uploadedNames = [];
    var nameSet = null;

    function finish(ok) {
        var hasUpload = uploadedNames.length > 0;
        if (!hasUpload) {
            $('#uploadMessage').text('已放弃上传');
            setTimeout(function () {
                $('#load').modal('hide');
                $('.modal-backdrop').remove();
                $('body').removeClass('modal-open').css('padding-right', '');
            }, 450);
            if (typeof opts.done === 'function') {
                opts.done(false, uploadedNames);
            }
            return;
        }
        $('#uploadMessage').text(ok ? '上传完成！' : ($('#uploadMessage').text() || '已结束'));
        if (ok) {
            setProgressBar($('#progressBar'), 100);
            setProgressBar($('#progressBarTotal'), 100);
            $('#uploadSizeCurrent').text('当前 ' + formatByteSize(0) + ' / ' + formatByteSize(0));
            $('#uploadSizeTotal').text(
                '合计 ' + formatByteSize(batchTotal) + ' / ' + formatByteSize(batchTotal)
                + '（' + files.length + ' 个文件）'
            );
        }
        setTimeout(function () {
            $('#load').modal('hide');
        }, ok ? 600 : 1200);
        if (opts.reload !== false) {
            var sameDir = normalizeDirPath(path) === normalizeDirPath($('#currentPath').val());
            if (sameDir) {
                reload({ selectNames: uploadedNames });
            } else {
                clearSearchUi(false);
                renderFileList(path, function () {
                    selectFilesByNames(uploadedNames);
                });
            }
        }
        if (typeof opts.done === 'function') {
            opts.done(ok, uploadedNames);
        }
    }

    function ensureNames() {
        if (nameSet) {
            return $.Deferred().resolve(nameSet).promise();
        }
        return listNamesInDir(path).then(function (names) {
            nameSet = {};
            (names || []).forEach(function (n) {
                nameSet[String(n)] = true;
            });
            return nameSet;
        });
    }

    function next() {
        if (i >= files.length) {
            finish(uploadedNames.length > 0);
            return;
        }
        var file = files[i];
        i += 1;
        updateUi(i, file.name, 'local', 0, file.size || 0);

        ensureNames().then(function (set) {
            var finalName = file.name;
            var chain = $.Deferred().resolve(true).promise();
            if (set[finalName]) {
                var suggested = suggestUniqueName(finalName, Object.keys(set));
                chain = pauseUploadModal().then(function () {
                    return askUploadConflict(finalName, suggested);
                }).then(function (choice) {
                    if (!choice || choice.action === 'skip') {
                        // 后面若还有文件才恢复进度框；全部放弃则直接结束，避免再闪「上传完成」
                        if (i < files.length) {
                            resumeUploadModal();
                        }
                        batchTotal = Math.max(0, batchTotal - (file.size || 0));
                        updateUi(i, file.name, 'local', 0, file.size || 0);
                        return false;
                    }
                    resumeUploadModal();
                    if (choice.action === 'rename') {
                        if (set[choice.name] && choice.name !== finalName) {
                            alert('名称「' + choice.name + '」仍冲突，请换一个');
                            i -= 1;
                            return false;
                        }
                        finalName = choice.name;
                    }
                    return true;
                });
            }
            return chain.then(function (shouldUpload) {
                if (!shouldUpload) {
                    next();
                    return;
                }
                updateUi(i, finalName, 'local', 0, file.size || 0);
                return uploadOneFile(file, path, finalName, function (phase, loaded, total) {
                    updateUi(i, finalName, phase || 'local', loaded, total || file.size || 0);
                }).then(function (res) {
                    if (res && res.status !== 200) {
                        $('#uploadMessage').text('失败：' + (res.message || finalName));
                        finish(false);
                        return;
                    }
                    var saved = (res && res.result) ? String(res.result) : finalName;
                    uploadedNames.push(saved);
                    set[saved] = true;
                    batchDone += (file.size || 0);
                    updateUi(i, finalName, 'remote', file.size || 0, file.size || 0);
                    next();
                }, function (err) {
                    $('#uploadMessage').text('上传失败：' + ((err && err.message) || finalName));
                    finish(false);
                });
            });
        });
    }
    next();
}

function uploadFile() {
    var input = $('input[type=file]')[0];
    if (!input || !input.files || !input.files.length) {
        return;
    }
    uploadFilesToPath(input.files, $('#currentPath').val());
    input.value = '';
}

function bindDropUpload($el, getPath) {
    if (!$el || !$el.length) {
        return;
    }
    function isFolderDropTarget(target) {
        return $(target).closest(
            'tr.folder, .icon-tile.folder, .content-row.folder, [data-dir="1"], .tree-row'
        ).length > 0;
    }
    function isInternalDrag(dt) {
        if (!dt || !dt.types) {
            return false;
        }
        var types = dt.types;
        for (var i = 0; i < types.length; i++) {
            if (types[i] === 'application/x-webssh-items') {
                return true;
            }
        }
        // 无 Files、仅有 text/plain 时视为内部拖拽
        var hasFiles = false;
        for (var j = 0; j < types.length; j++) {
            if (types[j] === 'Files') {
                hasFiles = true;
                break;
            }
        }
        return !hasFiles;
    }
    $el.on('dragenter dragover', function (e) {
        var dt = e.originalEvent && e.originalEvent.dataTransfer;
        if (!dt) {
            return;
        }
        // 文件夹 / 内部拖拽：不拦截，交给文件项处理
        if (isFolderDropTarget(e.target) || isInternalDrag(dt)) {
            $el.removeClass('sftp-drop-target');
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        $el.addClass('sftp-drop-target');
    });
    $el.on('dragleave', function (e) {
        if (e.target !== this && $.contains(this, e.target)) {
            return;
        }
        $el.removeClass('sftp-drop-target');
    });
    $el.on('drop', function (e) {
        var dt = e.originalEvent && e.originalEvent.dataTransfer;
        // 关键：不要 stopPropagation，否则 document 上的文件夹 drop 收不到
        if (isFolderDropTarget(e.target) || isInternalDrag(dt)) {
            $el.removeClass('sftp-drop-target');
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        $el.removeClass('sftp-drop-target');
        var files = dt && dt.files;
        if (!files || !files.length) {
            return;
        }
        var path = typeof getPath === 'function' ? getPath() : getPath;
        uploadFilesToPath(files, path);
    });
}

function downloadFile(name) {
    window.open(downloadUrl(name));
}

function sftpApi(action, data) {
    return $.ajax({
        url: baseUrl + '/' + action + '?tagId=' + encodeURIComponent(currentTagId()),
        method: 'POST',
        data: data || {}
    });
}

function basenameOf(relPath) {
    var s = String(relPath || '');
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
}

function showPromptModal(title, initial, onOk) {
    $('#promptTitle').text(title);
    $('#promptInput').val(initial || '');
    $('#promptModal').modal('show');
    setTimeout(function () {
        $('#promptInput').trigger('focus').select();
    }, 200);
    $('#promptOk').off('click.prompt').on('click.prompt', function () {
        var val = ($('#promptInput').val() || '').trim();
        $('#promptModal').modal('hide');
        if (typeof onOk === 'function') {
            onOk(val);
        }
    });
    $('#promptInput').off('keydown.prompt').on('keydown.prompt', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('#promptOk').click();
        }
    });
}

function deleteSelected(relPath) {
    var name = relPath || getSelectedName();
    if (!name) {
        return;
    }
    var item = findItemByPath(name);
    var label = basenameOf(name);
    var tip = item && isDirItem(item)
        ? ('确定删除文件夹「' + label + '」及其全部内容？')
        : ('确定删除「' + label + '」？');
    if (!window.confirm(tip)) {
        return;
    }
    sftpApi('rm', { path: joinPath($('#currentPath').val(), name) }).then(function (res) {
        if (!res || res.status !== 200) {
            alert((res && res.message) || '删除失败');
            return;
        }
        reload();
    }, function (xhr) {
        alert((xhr.responseJSON && xhr.responseJSON.message) || '删除失败');
    });
}

function renameSelected(relPath) {
    var name = relPath || getSelectedName();
    if (!name || name === '..') {
        return;
    }
    cancelScheduledRename();
    beginInlineRename(name);
}

var renameTimer = null;
var renamingPath = null;

function cancelScheduledRename() {
    if (renameTimer) {
        clearTimeout(renameTimer);
        renameTimer = null;
    }
}

function scheduleInlineRename(relPath) {
    cancelScheduledRename();
    renameTimer = setTimeout(function () {
        renameTimer = null;
        beginInlineRename(relPath);
    }, 450);
}

function endInlineRename(commit) {
    var $input = $('#fileView .rename-input');
    if (!$input.length) {
        renamingPath = null;
        return;
    }
    var path = renamingPath;
    var oldBase = basenameOf(path);
    var val = ($input.val() || '').replace(/[\r\n]+/g, '').trim();
    var $row = $input.closest('tr, .icon-tile, .content-row');
    renamingPath = null;
    $input.replaceWith(function () {
        if ($row.is('tr')) {
            return $('<span class="name-text"></span>').text(oldBase);
        }
        if ($row.hasClass('content-row')) {
            return $('<div class="name-text"></div>').text(oldBase);
        }
        return $('<div class="label name-text"></div>').text(oldBase);
    });
    if (!commit || !path || !val || val === oldBase) {
        return;
    }
    if (val.indexOf('/') >= 0 || val.indexOf('\\') >= 0 || val === '.' || val === '..') {
        alert('名称不合法');
        return;
    }
    sftpApi('rename', {
        path: joinPath($('#currentPath').val(), path),
        newName: val
    }).then(function (res) {
        if (!res || res.status !== 200) {
            alert((res && res.message) || '重命名失败');
        reload();
            return;
        }
        reload();
    }, function (xhr) {
        alert((xhr.responseJSON && xhr.responseJSON.message) || '重命名失败');
        reload();
    });
}

function beginInlineRename(relPath) {
    if (!relPath || relPath === '..') {
        return;
    }
    endInlineRename(false);
    var $row = $('#fileView tr, #fileView .icon-tile, #fileView .content-row').filter(function () {
        return String($(this).data('path')) === relPath;
    }).first();
    if (!$row.length) {
        return;
    }
    $('#fileView tr, #fileView .icon-tile, #fileView .content-row').removeClass('selected');
    $row.addClass('selected');
    var $text = $row.find('.name-text').first();
    if (!$text.length) {
        return;
    }
    var oldBase = basenameOf(relPath);
    renamingPath = relPath;
    var $input = $('<textarea class="rename-input" rows="2"></textarea>').val(oldBase);
    $text.replaceWith($input);
    // 按内容自适应高度
    function fitRenameBox() {
        var el = $input[0];
        if (!el) {
            return;
        }
        el.style.height = 'auto';
        el.style.height = Math.max(el.scrollHeight, 22) + 'px';
    }
    fitRenameBox();
    $input.trigger('focus');
    try {
        var el = $input[0];
        var dot = oldBase.lastIndexOf('.');
        var end = (dot > 0 && $row.data('dir') !== 1 && String($row.data('dir')) !== '1')
            ? dot
            : oldBase.length;
        el.setSelectionRange(0, end);
    } catch (err) { /* ignore */ }

    $input.on('input', fitRenameBox);
    $input.on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            endInlineRename(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endInlineRename(false);
        }
    });
    $input.on('blur', function () {
        setTimeout(function () {
            if (renamingPath === relPath) {
                endInlineRename(true);
            }
        }, 0);
    });
    $input.on('click mousedown dblclick', function (e) {
        e.stopPropagation();
    });
}


function mkdirHere() {
    showPromptModal('新建文件夹', '新建文件夹', function (val) {
        if (!val) {
            return;
        }
        sftpApi('mkdir', {
            path: $('#currentPath').val() || '/',
            name: val
        }).then(function (res) {
            if (!res || res.status !== 200) {
                alert((res && res.message) || '创建失败');
                return;
            }
            reload();
        }, function (xhr) {
            alert((xhr.responseJSON && xhr.responseJSON.message) || '创建失败');
        });
    });
}

function showSftpToast(msg) {
    var $t = $('#sftpToast');
    if (!$t.length) {
        $t = $('<div id="sftpToast" role="status" aria-live="polite"></div>').appendTo('body');
    }
    $t.text(msg).addClass('show');
    clearTimeout(showSftpToast._timer);
    showSftpToast._timer = setTimeout(function () {
        $t.removeClass('show');
    }, 1800);
}

function copyPathSelected(relPath) {
    var name = relPath || getSelectedName();
    if (!name) {
        return;
    }
    var full = joinPath($('#currentPath').val(), name);
    function ok() {
        showSftpToast('已复制路径');
    }
    function fallback() {
        window.prompt('复制路径', full);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(ok, fallback);
        return;
    }
    try {
        var $ta = $('<textarea>').css({
            position: 'fixed', left: '-9999px', top: '0'
        }).val(full).appendTo('body');
        $ta[0].select();
        var done = document.execCommand('copy');
        $ta.remove();
        if (done) {
            ok();
            return;
        }
    } catch (e) { /* ignore */ }
    fallback();
}

function openSelected(relPath) {
    var name = relPath || getSelectedName();
    if (!name) {
        return;
    }
    var item = findItemByPath(name);
    if (item && isDirItem(item)) {
        openEntry(name, true);
        return;
    }
    if (item && isPreviewable(item)) {
        openPreview(name);
        return;
    }
    // 扩展名像 Excel 时绝不走下载（避免旧逻辑/查找异常把预览变成另存为）
    if (item && !isDirItem(item) && EXCEL_EXT.test(String(item.name || name))) {
        openPreview(name);
        return;
    }
    if (item && !isDirItem(item)) {
        downloadFile(name);
    }
}

function octalFromChecks() {
    var mode = 0;
    $('#chmodGrid input[type=checkbox]').each(function () {
        if (this.checked) {
            mode |= parseInt(String($(this).data('bit')), 8);
        }
    });
    var s = (mode & 511).toString(8);
    while (s.length < 3) {
        s = '0' + s;
    }
    return s;
}

function applyOctalToChecks(octal) {
    var mode = parseInt(String(octal || '0'), 8);
    if (isNaN(mode)) {
        return;
    }
    mode &= 511;
    $('#chmodGrid input[type=checkbox]').each(function () {
        var bit = parseInt(String($(this).data('bit')), 8);
        this.checked = (mode & bit) === bit;
    });
}

var chmodTargetPath = null;

function openChmodDialog(relPath) {
    var name = relPath || getSelectedName();
    if (!name) {
        return;
    }
    var item = findItemByPath(name);
    chmodTargetPath = joinPath($('#currentPath').val(), name);
    $('#chmodTarget').text(chmodTargetPath);
    var oct = (item && item.permissions) ? String(item.permissions) : '644';
    if (oct.length === 4) {
        oct = oct.slice(-3);
    }
    $('#chmodOctal').val(oct);
    applyOctalToChecks(oct);
    $('#chmodModal').modal('show');
}

function bindChmodUi() {
    var syncing = false;
    $('#chmodGrid').on('change', 'input[type=checkbox]', function () {
        if (syncing) {
            return;
        }
        syncing = true;
        $('#chmodOctal').val(octalFromChecks());
        syncing = false;
    });
    $('#chmodOctal').on('input', function () {
        if (syncing) {
            return;
        }
        var v = ($(this).val() || '').replace(/[^0-7]/g, '').slice(0, 4);
        $(this).val(v);
        if (v.length >= 3) {
            syncing = true;
            applyOctalToChecks(v.length === 4 ? v.slice(-3) : v);
            syncing = false;
        }
    });
    $('#chmodOk').on('click', function () {
        var mode = ($('#chmodOctal').val() || '').trim();
        if (!/^[0-7]{3,4}$/.test(mode)) {
            alert('权限格式应为 3~4 位八进制，如 755');
            return;
        }
        if (!chmodTargetPath) {
            return;
        }
        sftpApi('chmod', { path: chmodTargetPath, mode: mode }).then(function (res) {
            if (!res || res.status !== 200) {
                alert((res && res.message) || '修改权限失败');
                return;
            }
            $('#chmodModal').modal('hide');
            reload();
        }, function (xhr) {
            alert((xhr.responseJSON && xhr.responseJSON.message) || '修改权限失败');
        });
    });
}

function buildContextMenuHtml(kind, isDir) {
    if (kind === 'blank') {
        return ''
            + '<a class="ctx-item" href="javascript:void(0)" data-action="refresh">刷新<span class="ctx-key">F5</span></a>'
            + '<div class="ctx-sep"></div>'
            + '<a class="ctx-item" href="javascript:void(0)" data-action="mkdir">新建文件夹</a>'
            + '<a class="ctx-item" href="javascript:void(0)" data-action="upload">上传</a>';
    }
    var html = '<a class="ctx-item" href="javascript:void(0)" data-action="open">打开</a>';
    if (!isDir) {
        html += '<a class="ctx-item" href="javascript:void(0)" data-action="download">下载</a>';
    }
    html += '<div class="ctx-sep"></div>'
        + '<a class="ctx-item" href="javascript:void(0)" data-action="rename">重命名<span class="ctx-key">F2</span></a>'
        + '<a class="ctx-item" href="javascript:void(0)" data-action="delete">删除<span class="ctx-key">Del</span></a>'
        + '<div class="ctx-sep"></div>'
        + '<a class="ctx-item" href="javascript:void(0)" data-action="chmod">修改权限</a>'
        + '<a class="ctx-item" href="javascript:void(0)" data-action="copy-path">复制路径</a>';
    return html;
}
