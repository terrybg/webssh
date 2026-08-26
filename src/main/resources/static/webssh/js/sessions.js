/**
 * Session list / desktop launcher wiring; open remotes as tabs or (later) windows.
 */
(function ($) {
  'use strict';

  var sessionsCache = {};
  var contextSessionId = null;

  function sessionsArray() {
    var out = [];
    Object.keys(sessionsCache).forEach(function (id) {
      out.push(sessionsCache[id]);
    });
    return out;
  }

  function renderDesktop() {
    if (window.Desktop && typeof window.Desktop.render === 'function') {
      window.Desktop.render(sessionsArray());
    }
  }

  function loadSessions() {
    $.get(baseUrl + '/sessions')
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '加载失败');
          return;
        }
        var items = (res.result && res.result.items) || [];
        sessionsCache = {};
        items.forEach(function (item) {
          sessionsCache[item.id] = item;
        });
        window.sessionsCache = sessionsCache;
        renderDesktop();
        if (window.SessionLayout && typeof SessionLayout.restore === 'function') {
          SessionLayout.restore({
            openSsh: openSshWindow,
            openSftp: openFileWindow,
            openMonitor: openMonitorWindow,
            resolveSession: function (id) {
              return sessionsCache[id] || null;
            }
          });
        }
      })
      .fail(function () {
        alert('加载会话失败');
      });
  }

  function resetSessionForm() {
    $('#sessionForm')[0].reset();
    $('#sessionId').val('');
    $('#sessionPort').val(22);
    $('#sessionForm').removeClass('was-validated');
  }

  function openAddModal() {
    resetSessionForm();
    $('#sessionModalTitle').text('添加会话');
    $('#sessionModal').modal('show');
  }

  function openEditModal(session) {
    resetSessionForm();
    $('#sessionModalTitle').text('修改会话');
    $('#sessionId').val(session.id || '');
    $('#sessionName').val(session.name || '');
    $('#sessionIp').val(session.ip || '');
    $('#sessionPort').val(session.port != null ? session.port : 22);
    $('#sessionUserName').val(session.userName || '');
    $('#sessionPassword').val(session.password || '');
    $('#sessionModal').modal('show');
  }

  function collectFormPayload() {
    return {
      name: $.trim($('#sessionName').val()),
      ip: $.trim($('#sessionIp').val()),
      port: parseInt($('#sessionPort').val(), 10),
      userName: $.trim($('#sessionUserName').val()),
      password: $('#sessionPassword').val()
    };
  }

  function saveSession() {
    var form = $('#sessionForm')[0];
    if (!form.checkValidity()) {
      $(form).addClass('was-validated');
      return;
    }

    var id = $('#sessionId').val();
    var payload = collectFormPayload();
    if (!payload.port || isNaN(payload.port)) {
      alert('端口必须是数字');
      return;
    }

    var $btn = $('#sessionSubmitBtn');
    $btn.prop('disabled', true);

    var req = id
      ? $.ajax({
          url: baseUrl + '/sessions/' + encodeURIComponent(id),
          type: 'PUT',
          contentType: 'application/json',
          dataType: 'json',
          data: JSON.stringify(payload)
        })
      : $.ajax({
          url: baseUrl + '/sessions',
          type: 'POST',
          contentType: 'application/json',
          dataType: 'json',
          data: JSON.stringify(payload)
        });

    req
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '保存失败');
          return;
        }
        // 改账号/密码后清掉旧登录缓存，下次打开强制用新凭据 loginSsh
        if (id) {
          clearStoredTag({ id: id, port: payload.port });
          var prev = sessionsCache[id];
          if (prev && prev.port != null && prev.port !== payload.port) {
            clearStoredTag({ id: id, port: prev.port });
          }
        }
        $('#sessionModal').modal('hide');
        loadSessions();
      })
      .fail(function () {
        alert('保存失败');
      })
      .always(function () {
        $btn.prop('disabled', false);
      });
  }

  function deleteSession(id) {
    if (!confirm('确定删除该会话？')) {
      return;
    }
    $.ajax({
      url: baseUrl + '/sessions/' + encodeURIComponent(id),
      type: 'DELETE',
      dataType: 'json'
    })
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '删除失败');
          return;
        }
        var prev = sessionsCache[id];
        if (prev) {
          clearStoredTag(prev);
        } else {
          clearStoredTag({ id: id });
        }
        loadSessions();
      })
      .fail(function () {
        alert('删除失败');
      });
  }

  /** 复制会话 Tab：再开一个同配置远程连接，不新建会话数据 */
  function copySessionTab(session) {
    if (!session || typeof window.ensureRemoteTab !== 'function') {
      return;
    }
    $('#loadingIndicator').show();
    $.post(baseUrl + '/loginSsh', {
      ip: session.ip,
      userName: session.userName,
      password: session.password,
      port: session.port
    })
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '登录失败');
          return;
        }
        writeStoredLogin(session, res.result, sessionOwnerKey(session));
        window.currentSessionId = session.id;
        window.currentSessionPort = session.port;
        var route = window.ensureRemoteTab(session, { forceNew: true });
        if (typeof window.loadSsh === 'function') {
          window.loadSsh(workspaceIframeQuery(session), route);
        }
      })
      .fail(function () {
        alert('登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
  }

  function hideContextMenu() {
    $('#sessionContextMenu').hide();
    contextSessionId = null;
  }

  function showContextMenu(pageX, pageY, sessionId) {
    contextSessionId = sessionId;
    var $menu = $('#sessionContextMenu');
    $menu.css({ left: pageX + 'px', top: pageY + 'px' }).show();
  }

  function openGlobalCommands() {
    if (typeof window.openCommandManager !== 'function') {
      alert('命令管理未加载');
      return;
    }
    window.openCommandManager({ scope: 'global', title: '通用命令' });
  }

  function openSessionCommands(session) {
    if (!session || !session.id) {
      return;
    }
    if (typeof window.openCommandManager !== 'function') {
      alert('命令管理未加载');
      return;
    }
    var name = session.name || session.id;
    window.openCommandManager({
      scope: 'session',
      sessionId: session.id,
      title: name + ' 常用命令'
    });
  }

  function workspaceIframeQuery(session) {
    var sid = (session && session.id) || window.currentSessionId || '';
    var p = session && session.port != null
      ? session.port
      : (window.currentSessionPort != null ? window.currentSessionPort : 22);
    var q = '?sessionId=' + encodeURIComponent(sid) + '&port=' + encodeURIComponent(p);
    if (session) {
      if (session.name) {
        q += '&sessionName=' + encodeURIComponent(session.name);
      }
      if (session.ip) {
        q += '&ip=' + encodeURIComponent(session.ip);
      }
    }
    return q;
  }

  function showSessionList() {
    if (typeof window.changeMenu === 'function') {
      window.changeMenu('.shell', 'list');
    }
  }

  /**
   * localStorage 键：优先按会话 id，避免同端口不同主机/账号互相复用旧登录。
   * 兼容旧版仅按 port 存储的键。
   */
  function tagStorageSuffix(session) {
    if (session && session.id != null && String(session.id) !== '') {
      return 's:' + String(session.id);
    }
    var port = session && session.port != null ? session.port : 22;
    return 'p:' + port;
  }

  /** 账号/密码/主机任一变化都必须重新登录，不能只认 session.id */
  function sessionOwnerKey(session) {
    if (!session) {
      return '';
    }
    return [
      session.id || '',
      session.ip || '',
      session.userName || '',
      session.password || '',
      session.port != null ? session.port : 22
    ].join('|');
  }

  function lsGet(key) {
    try {
      var v = window.localStorage.getItem(key);
      return v === 'null' ? '' : (v || '');
    } catch (e) {
      return '';
    }
  }

  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value || '');
    } catch (e) { /* ignore */ }
  }

  function lsDel(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  function readStoredTagId(session) {
    var suffix = tagStorageSuffix(session);
    var existing = lsGet('tagId' + suffix);
    if (existing) {
      return existing;
    }
    // 兼容旧键：tagId + port
    if (session && session.port != null) {
      return lsGet('tagId' + session.port);
    }
    return '';
  }

  function readTagOwner(session) {
    var suffix = tagStorageSuffix(session);
    var owner = lsGet('tagOwner' + suffix);
    if (owner) {
      return owner;
    }
    if (session && session.port != null) {
      return lsGet('tagOwner' + session.port);
    }
    return '';
  }

  function writeStoredLogin(session, tagId, ownerKey) {
    var suffix = tagStorageSuffix(session);
    lsSet('tagId' + suffix, tagId);
    lsSet('tagOwner' + suffix, ownerKey);
    // 同步旧键，兼容尚未改完的读取路径
    if (session && session.port != null) {
      lsSet('tagId' + session.port, tagId);
      lsSet('tagOwner' + session.port, ownerKey);
    }
  }

  function clearStoredTag(sessionOrPort) {
    if (sessionOrPort != null && typeof sessionOrPort === 'object') {
      var suffix = tagStorageSuffix(sessionOrPort);
      lsDel('tagId' + suffix);
      lsDel('tagOwner' + suffix);
      if (sessionOrPort.port != null) {
        lsDel('tagId' + sessionOrPort.port);
        lsDel('tagOwner' + sessionOrPort.port);
      }
      return;
    }
    // 旧调用：clearStoredTag(port)
    lsDel('tagId' + sessionOrPort);
    lsDel('tagOwner' + sessionOrPort);
  }

  function loginSshForSession(session, port, ownerKey) {
    return $.post(baseUrl + '/loginSsh', {
      ip: session.ip,
      userName: session.userName,
      password: session.password,
      port: port
    }).then(function (res) {
      if (!res || res.status !== 200) {
        return $.Deferred().reject((res && res.message) || '登录失败').promise();
      }
      writeStoredLogin(session, res.result, ownerKey);
      window.currentSessionId = session.id;
      window.currentSessionPort = port;
      return res.result;
    }, function () {
      return $.Deferred().reject('登录失败').promise();
    });
  }

  /** Probe whether server still has this tagId (in-memory map is cleared on restart). */
  function probeTagAlive(tag) {
    return $.ajax({
      url: baseUrl + '/checkLogin',
      method: 'GET',
      data: { tagId: tag }
    }).then(function (res) {
      return !!(res && res.status === 200);
    }, function () {
      return false;
    });
  }

  /**
   * Ensure SSH login tagId for session.
   * 仅当 tag 仍有效且 ownerKey（含账号密码）一致时才复用；改密后必须重新 loginSsh。
   */
  function ensureLoggedIn(session) {
    if (!session) {
      return $.Deferred().reject('无效会话').promise();
    }
    var port = session.port != null ? session.port : 22;
    var ownerKey = sessionOwnerKey(session);
    var existing = readStoredTagId(session);
    var owner = readTagOwner(session);
    if (existing && owner && owner === ownerKey) {
      return probeTagAlive(existing).then(function (alive) {
        if (alive) {
          window.currentSessionId = session.id;
          window.currentSessionPort = port;
          writeStoredLogin(session, existing, ownerKey);
          return existing;
        }
        clearStoredTag(session);
        return loginSshForSession(session, port, ownerKey);
      });
    }
    clearStoredTag(session);
    return loginSshForSession(session, port, ownerKey);
  }

  /** 供窗口/侧栏按会话取最新 tagId */
  function getWebsshStoredTagId(session) {
    return readStoredTagId(session);
  }

  /** Alias used by brief / callers expecting ensureSshSession */
  function ensureSshSession(session) {
    return ensureLoggedIn(session);
  }

  function openSshWindow(session, openOpts) {
    var dfd = $.Deferred();
    openOpts = openOpts || {};
    if (!session) {
      return dfd.reject('无效会话').promise();
    }
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      alert('会话窗口未加载');
      return dfd.reject('会话窗口未加载').promise();
    }
    $('#loadingIndicator').show();
    ensureLoggedIn(session)
      .done(function (tagId) {
        var q = workspaceIframeQuery(session);
        if (openOpts.cwd) {
          q += (q.indexOf('?') >= 0 ? '&' : '?') + 'cwd=' + encodeURIComponent(openOpts.cwd);
        }
        var $win = SessionWindows.open({
          kind: 'ssh',
          sessionId: session.id,
          port: session.port,
          title: session.name || session.ip || '终端',
          query: q,
          tagId: tagId,
          cwd: openOpts.cwd || null
        });
        dfd.resolve($win);
      })
      .fail(function (msg) {
        alert(msg || '登录失败');
        dfd.reject(msg || '登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
    return dfd.promise();
  }

  function openMonitorWindow(session) {
    var dfd = $.Deferred();
    if (!session) {
      return dfd.reject('无效会话').promise();
    }
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      alert('会话窗口未加载');
      return dfd.reject('会话窗口未加载').promise();
    }
    $('#loadingIndicator').show();
    ensureLoggedIn(session)
      .done(function (tagId) {
        var q = workspaceIframeQuery(session);
        var $win = SessionWindows.open({
          kind: 'monitor',
          sessionId: session.id,
          port: session.port,
          title: (session.name || session.ip || '服务器') + ' — 任务管理器',
          query: q,
          tagId: tagId,
          width: 920,
          height: 600
        });
        dfd.resolve($win);
      })
      .fail(function (msg) {
        alert(msg || '登录失败');
        dfd.reject(msg || '登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
    return dfd.promise();
  }

  function openHelpWindow() {
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      window.open('help.html', '_blank');
      return null;
    }
    var $existing = $('#desktopSessionLayer .session-win[data-kind="help"], #desktopDockStrip .session-win[data-kind="help"]');
    if ($existing.length) {
      if ($existing.hasClass('minimized') && typeof SessionWindows.minimize === 'function') {
        // focus restores minimized
      }
      SessionWindows.focus($existing.first());
      return $existing.first();
    }
    return SessionWindows.open({
      kind: 'help',
      sessionId: '__help__',
      title: '帮助',
      src: 'help.html?v=2',
      width: 860,
      height: 580
    });
  }

  function openFileWindow(session, openOpts) {
    var dfd = $.Deferred();
    openOpts = openOpts || {};
    if (!session) {
      return dfd.reject('无效会话').promise();
    }
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      alert('会话窗口未加载');
      return dfd.reject('会话窗口未加载').promise();
    }
    $('#loadingIndicator').show();
    ensureLoggedIn(session)
      .done(function (tagId) {
        var q = workspaceIframeQuery(session);
        if (openOpts.cwd) {
          q += (q.indexOf('?') >= 0 ? '&' : '?') + 'cwd=' + encodeURIComponent(openOpts.cwd);
        }
        var $win = SessionWindows.open({
          kind: 'sftp',
          sessionId: session.id,
          port: session.port,
          title: (session.name && session.ip)
            ? (session.name + ' (' + session.ip + ')')
            : (session.name || session.ip || '文件'),
          query: q,
          tagId: tagId,
          cwd: openOpts.cwd || null
        });
        dfd.resolve($win);
      })
      .fail(function (msg) {
        alert(msg || '登录失败');
        dfd.reject(msg || '登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
    return dfd.promise();
  }

  function openMonitorWindow(session) {
    var dfd = $.Deferred();
    if (!session) {
      return dfd.reject('无效会话').promise();
    }
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      alert('会话窗口未加载');
      return dfd.reject('会话窗口未加载').promise();
    }
    $('#loadingIndicator').show();
    ensureLoggedIn(session)
      .done(function (tagId) {
        var $win = SessionWindows.open({
          kind: 'monitor',
          sessionId: session.id,
          port: session.port,
          title: (session.name || session.ip || '服务器') + ' — 任务管理器',
          query: workspaceIframeQuery(session),
          tagId: tagId,
          width: 920,
          height: 600
        });
        dfd.resolve($win);
      })
      .fail(function (msg) {
        alert(msg || '登录失败');
        dfd.reject(msg || '登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
    return dfd.promise();
  }

  function connectSession(session) {
    openSshWindow(session);
  }

  function connectRemote(session) {
    openSshWindow(session);
  }

  function wireDesktopCallbacks() {
    if (!window.Desktop) {
      return;
    }
    var D = window.Desktop;
    D.onAddServer = openAddModal;
    D.onGlobalCommands = openGlobalCommands;
    D.onHelp = openHelpWindow;
    D.onEdit = function (session) {
      if (session && session.id && sessionsCache[session.id]) {
        openEditModal(sessionsCache[session.id]);
      } else if (session && session.id) {
        resolveSession(session.id, openEditModal);
      }
    };
    D.onDelete = function (id) {
      if (id) {
        deleteSession(id);
      }
    };
    D.onSessionCommands = function (session) {
      if (session && session.id && sessionsCache[session.id]) {
        openSessionCommands(sessionsCache[session.id]);
      } else if (session && session.id) {
        resolveSession(session.id, openSessionCommands);
      }
    };
    D.onOpenRemote = function (session) {
      if (session && session.id && sessionsCache[session.id]) {
        openSshWindow(sessionsCache[session.id]);
      } else if (session && session.id) {
        resolveSession(session.id, openSshWindow);
      } else if (session) {
        openSshWindow(session);
      }
    };
    D.onOpenFiles = function (session) {
      if (session && session.id && sessionsCache[session.id]) {
        openFileWindow(sessionsCache[session.id]);
      } else if (session && session.id) {
        resolveSession(session.id, openFileWindow);
      } else if (session) {
        openFileWindow(session);
      }
    };
    D.onOpenMonitor = function (session) {
      if (session && session.id && sessionsCache[session.id]) {
        openMonitorWindow(sessionsCache[session.id]);
      } else if (session && session.id) {
        resolveSession(session.id, openMonitorWindow);
      } else if (session) {
        openMonitorWindow(session);
      }
    };
    if (typeof D.bind === 'function') {
      D.bind();
    }
  }

  $(function () {
    wireDesktopCallbacks();
    loadSessions();
    showSessionList();

    $('#sessionSubmitBtn').on('click', saveSession);

    $('#sessionForm').on('keydown', 'input', function (event) {
      if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        saveSession();
      }
    });

    // Tabs 右键：远程会话 Tab 可复制会话（会话列表 Tab 除外）
    $('.remote-tabs').on('contextmenu', '.shell-menu', function (e) {
      var $link = $(this);
      if ($link.hasClass('list-tab') || $link.attr('route') === 'list') {
        return;
      }
      e.preventDefault();
      var id = $link.attr('data-session-id');
      if (!id) {
        return;
      }
      showContextMenu(e.pageX, e.pageY, id);
    });

    $('#sessionContextMenu').on('click', '[data-action="copy"]', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var sid = contextSessionId;
      hideContextMenu();
      resolveSession(sid, function (session) {
        copySessionTab(session);
      });
    });

    $(document).on('click', hideContextMenu);
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        hideContextMenu();
      }
    });
  });

  function resolveSession(id, callback) {
    if (!id) {
      return;
    }
    if (sessionsCache[id]) {
      callback(sessionsCache[id]);
      return;
    }
    $.get(baseUrl + '/sessions')
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '加载会话失败');
          return;
        }
        var items = (res.result && res.result.items) || [];
        var found = null;
        items.forEach(function (item) {
          sessionsCache[item.id] = item;
          if (item.id === id) {
            found = item;
          }
        });
        window.sessionsCache = sessionsCache;
        if (!found) {
          alert('未找到该会话配置');
          return;
        }
        callback(found);
      })
      .fail(function () {
        alert('加载会话失败');
      });
  }

  window.sessionsCache = sessionsCache;
  window.loadSessions = loadSessions;
  window.openAddModal = openAddModal;
  window.openEditModal = openEditModal;
  window.deleteSession = deleteSession;
  window.openGlobalCommands = openGlobalCommands;
  window.openSessionCommands = openSessionCommands;
  window.connectSession = connectSession;
  window.connectRemote = connectRemote;
  window.openSshWindow = openSshWindow;
  window.openFileWindow = openFileWindow;
  window.openMonitorWindow = openMonitorWindow;
  window.openHelpWindow = openHelpWindow;
  window.ensureLoggedIn = ensureLoggedIn;
  window.ensureSshSession = ensureSshSession;
  window.getWebsshStoredTagId = getWebsshStoredTagId;
  window.resolveSession = resolveSession;
  window.showSessionList = showSessionList;
  window.workspaceIframeQuery = workspaceIframeQuery;
  window.copySessionTab = copySessionTab;
})(jQuery);
