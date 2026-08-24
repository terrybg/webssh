/**
 * Desktop icon grid + context menus for session launcher.
 */
(function (w, $) {
  'use strict';

  var bound = false;
  var activeSessionId = null;
  var selectedIconId = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function iconGlyph(kind) {
    if (kind === 'plus') {
      return '<svg class="desktop-icon-svg" viewBox="0 0 48 48" aria-hidden="true">' +
        '<rect x="4" y="4" width="40" height="40" rx="10" fill="#1e6b4f"/>' +
        '<path d="M24 14v20M14 24h20" stroke="#e8fff4" stroke-width="3.5" stroke-linecap="round"/>' +
        '</svg>';
    }
    if (kind === 'cmds') {
      return '<svg class="desktop-icon-svg" viewBox="0 0 48 48" aria-hidden="true">' +
        '<rect x="4" y="4" width="40" height="40" rx="10" fill="#3d4a5c"/>' +
        '<path d="M14 18l8 6-8 6M24 30h10" stroke="#dce6f2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '</svg>';
    }
    if (kind === 'help') {
      return '<svg class="desktop-icon-svg" viewBox="0 0 48 48" aria-hidden="true">' +
        '<rect x="4" y="4" width="40" height="40" rx="10" fill="#6b5b95"/>' +
        '<circle cx="24" cy="24" r="12" fill="none" stroke="#f3eefc" stroke-width="3"/>' +
        '<path d="M20.5 19.5c0-2.2 1.7-3.5 3.6-3.5 1.9 0 3.4 1.2 3.4 3.1 0 1.4-.7 2.2-1.9 2.9-1.1.7-1.6 1.2-1.6 2.3v.7" stroke="#f3eefc" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
        '<circle cx="24" cy="31.5" r="1.6" fill="#f3eefc"/>' +
        '</svg>';
    }
    return '<svg class="desktop-icon-svg" viewBox="0 0 48 48" aria-hidden="true">' +
      '<rect x="6" y="10" width="36" height="28" rx="4" fill="#2f5f8a"/>' +
      '<rect x="10" y="14" width="12" height="8" rx="1" fill="#8ec5ef"/>' +
      '<circle cx="34" cy="18" r="3" fill="#cfe8ff"/>' +
      '<rect x="10" y="28" width="28" height="3" rx="1.5" fill="#6a9bc4"/>' +
      '</svg>';
  }

  function iconHtml(opts) {
    var id = escapeHtml(opts.id);
    var type = escapeHtml(opts.type || 'server');
    var label = escapeHtml(opts.label || '');
    var sessionId = opts.sessionId != null ? escapeHtml(opts.sessionId) : '';
    var sidAttr = sessionId ? ' data-session-id="' + sessionId + '"' : '';
    return (
      '<button type="button" class="desktop-icon" data-icon-id="' + id + '"' +
        ' data-icon-type="' + type + '"' + sidAttr + '>' +
        '<span class="desktop-icon-face">' + iconGlyph(opts.icon) + '</span>' +
        '<span class="desktop-icon-label">' + label + '</span>' +
      '</button>'
    );
  }

  function hideMenus() {
    $('#desktopMenu').hide().empty();
    activeSessionId = null;
  }

  function clearSelection() {
    selectedIconId = null;
    $('#desktopIconGrid .desktop-icon').removeClass('selected');
  }

  function selectIcon($btn) {
    clearSelection();
    if (!$btn || !$btn.length) {
      return;
    }
    selectedIconId = $btn.attr('data-icon-id');
    $btn.addClass('selected');
  }

  function positionMenu(pageX, pageY) {
    var $menu = $('#desktopMenu');
    $menu.css({ left: 0, top: 0, visibility: 'hidden' }).show();
    var mw = $menu.outerWidth() || 140;
    var mh = $menu.outerHeight() || 80;
    var vw = $(window).width();
    var vh = $(window).height();
    var left = pageX;
    var top = pageY;
    if (left + mw > vw - 8) {
      left = Math.max(8, vw - mw - 8);
    }
    if (top + mh > vh - 8) {
      top = Math.max(8, vh - mh - 8);
    }
    $menu.css({ left: left + 'px', top: top + 'px', visibility: 'visible' });
  }

  function showMenu(items, pageX, pageY, sessionId) {
    var $menu = $('#desktopMenu').empty();
    items.forEach(function (item) {
      $menu.append(
        '<a class="desktop-menu-item" href="javascript:void(0)" data-action="' +
          escapeHtml(item.action) + '">' + escapeHtml(item.label) + '</a>'
      );
    });
    activeSessionId = sessionId;
    positionMenu(pageX, pageY);
  }

  function invoke(name, arg) {
    var fn = Desktop[name];
    if (typeof fn === 'function') {
      fn(arg);
      return;
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Desktop] callback not set:', name);
    }
  }

  function getSession(sessionId) {
    if (!sessionId) {
      return null;
    }
    if (w.sessionsCache && w.sessionsCache[sessionId]) {
      return w.sessionsCache[sessionId];
    }
    return null;
  }

  function render(sessions) {
    var $grid = $('#desktopIconGrid');
    if (!$grid.length) {
      return;
    }
    $grid.empty();
    $grid.append(iconHtml({ id: '__add__', type: 'system', label: '添加服务器', icon: 'plus' }));
    $grid.append(iconHtml({ id: '__global_cmd__', type: 'system', label: '通用命令', icon: 'cmds' }));
    $grid.append(iconHtml({ id: '__help__', type: 'system', label: '帮助', icon: 'help' }));
    (sessions || []).forEach(function (s) {
      if (!s || s.id == null) {
        return;
      }
      $grid.append(iconHtml({
        id: s.id,
        type: 'server',
        label: s.name || s.ip || String(s.id),
        icon: 'server',
        sessionId: s.id
      }));
    });
    if (selectedIconId) {
      var $sel = $grid.find('.desktop-icon').filter(function () {
        return $(this).attr('data-icon-id') === selectedIconId;
      });
      if ($sel.length) {
        $sel.addClass('selected');
      } else {
        selectedIconId = null;
      }
    }
  }

  function bind() {
    if (bound) {
      return;
    }
    bound = true;

    var $root = $('#desktopRoot');
    var $grid = $('#desktopIconGrid');

    $grid.on('click', '.desktop-icon', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var $btn = $(this);
      var type = $btn.attr('data-icon-type');
      var iconId = $btn.attr('data-icon-id');
      selectIcon($btn);

      if (type === 'system') {
        hideMenus();
        if (iconId === '__add__') {
          invoke('onAddServer');
        } else if (iconId === '__global_cmd__') {
          invoke('onGlobalCommands');
        } else if (iconId === '__help__') {
          invoke('onHelp');
        }
        return;
      }

      var sid = $btn.attr('data-session-id') || iconId;
      showMenu(
        [
          { action: 'remote', label: '远程' },
          { action: 'files', label: '文件' },
          { action: 'monitor', label: '服务器监控' }
        ],
        e.pageX,
        e.pageY,
        sid
      );
    });

    $grid.on('contextmenu', '.desktop-icon', function (e) {
      var $btn = $(this);
      if ($btn.attr('data-icon-type') !== 'server') {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      selectIcon($btn);
      var sid = $btn.attr('data-session-id') || $btn.attr('data-icon-id');
      showMenu(
        [
          { action: 'edit', label: '修改' },
          { action: 'delete', label: '删除' },
          { action: 'commands', label: '常用命令' }
        ],
        e.pageX,
        e.pageY,
        sid
      );
    });

    $root.on('click', function (e) {
      if ($(e.target).closest('.desktop-icon, #desktopMenu').length) {
        return;
      }
      hideMenus();
      clearSelection();
    });

    $root.on('contextmenu', function (e) {
      if ($(e.target).closest('.desktop-icon').length) {
        return;
      }
      e.preventDefault();
      hideMenus();
    });

    $('#desktopMenu').on('click', '.desktop-menu-item', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var action = $(this).attr('data-action');
      var sid = activeSessionId;
      var session = getSession(sid);
      hideMenus();

      if (action === 'remote') {
        invoke('onOpenRemote', session || { id: sid });
      } else if (action === 'files') {
        invoke('onOpenFiles', session || { id: sid });
      } else if (action === 'monitor') {
        invoke('onOpenMonitor', session || { id: sid });
      } else if (action === 'edit') {
        invoke('onEdit', session || { id: sid });
      } else if (action === 'delete') {
        invoke('onDelete', sid);
      } else if (action === 'commands') {
        invoke('onSessionCommands', session || { id: sid });
      }
    });

    $(document).on('click.desktopMenu', function (e) {
      if ($(e.target).closest('#desktopMenu, .desktop-icon').length) {
        return;
      }
      hideMenus();
      clearSelection();
    });

    $(document).on('keydown.desktopMenu', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        hideMenus();
        clearSelection();
      }
    });
  }

  var Desktop = {
    render: render,
    bind: bind,
    hideMenus: hideMenus,
    onOpenRemote: null,
    onOpenFiles: null,
    onOpenMonitor: null,
    onEdit: null,
    onDelete: null,
    onSessionCommands: null,
    onAddServer: null,
    onGlobalCommands: null,
    onHelp: null
  };

  w.Desktop = Desktop;
})(window, jQuery);
