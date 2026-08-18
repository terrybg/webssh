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
        window.localStorage.setItem('tagId' + session.port, res.result);
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
    return '?sessionId=' + encodeURIComponent(sid) + '&port=' + encodeURIComponent(p);
  }

  function showSessionList() {
    if (typeof window.changeMenu === 'function') {
      window.changeMenu('.shell', 'list');
    }
  }

  /**
   * Ensure SSH login tagId for session.port.
   * Reuses localStorage tagId when still present (window close does not clear it).
   */
  function ensureLoggedIn(session) {
    if (!session) {
      return $.Deferred().reject('无效会话').promise();
    }
    var port = session.port != null ? session.port : 22;
    var existing = '';
    try {
      existing = window.localStorage.getItem('tagId' + port) || '';
    } catch (e) {
      existing = '';
    }
    if (existing) {
      window.currentSessionId = session.id;
      window.currentSessionPort = port;
      return $.Deferred().resolve(existing).promise();
    }
    return $.post(baseUrl + '/loginSsh', {
      ip: session.ip,
      userName: session.userName,
      password: session.password,
      port: port
    }).then(function (res) {
      if (!res || res.status !== 200) {
        return $.Deferred().reject((res && res.message) || '登录失败').promise();
      }
      window.localStorage.setItem('tagId' + port, res.result);
      window.currentSessionId = session.id;
      window.currentSessionPort = port;
      return res.result;
    }, function () {
      return $.Deferred().reject('登录失败').promise();
    });
  }

  /** Alias used by brief / callers expecting ensureSshSession */
  function ensureSshSession(session) {
    return ensureLoggedIn(session);
  }

  function openSshWindow(session) {
    if (!session) {
      return;
    }
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      alert('会话窗口未加载');
      return;
    }
    $('#loadingIndicator').show();
    ensureLoggedIn(session)
      .done(function (tagId) {
        var q = workspaceIframeQuery(session);
        SessionWindows.open({
          kind: 'ssh',
          sessionId: session.id,
          port: session.port,
          title: session.name || session.ip || '终端',
          query: q,
          tagId: tagId
        });
      })
      .fail(function (msg) {
        alert(msg || '登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
  }

  function openFileWindow(session) {
    if (!session) {
      return;
    }
    if (!window.SessionWindows || typeof window.SessionWindows.open !== 'function') {
      alert('会话窗口未加载');
      return;
    }
    $('#loadingIndicator').show();
    ensureLoggedIn(session)
      .done(function (tagId) {
        var q = workspaceIframeQuery(session);
        SessionWindows.open({
          kind: 'sftp',
          sessionId: session.id,
          port: session.port,
          title: (session.name || session.ip || '文件') + ' 文件',
          query: q,
          tagId: tagId
        });
      })
      .fail(function (msg) {
        alert(msg || '登录失败');
      })
      .always(function () {
        $('#loadingIndicator').hide();
      });
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
  window.ensureLoggedIn = ensureLoggedIn;
  window.ensureSshSession = ensureSshSession;
  window.showSessionList = showSessionList;
  window.workspaceIframeQuery = workspaceIframeQuery;
  window.copySessionTab = copySessionTab;
})(jQuery);
