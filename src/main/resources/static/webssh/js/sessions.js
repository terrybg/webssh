/**
 * Session list inside the first tab; open remotes as additional tabs.
 */
(function ($) {
  'use strict';

  var sessionsCache = {};
  var contextSessionId = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadSessions() {
    $.get(baseUrl + '/sessions')
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '加载失败');
          return;
        }
        var items = (res.result && res.result.items) || [];
        renderSessionTable(items);
      })
      .fail(function () {
        alert('加载会话失败');
      });
  }

  function renderSessionTable(items) {
    sessionsCache = {};
    var $tbody = $('#sessionTableBody');
    $tbody.empty();

    if (!items.length) {
      $('#sessionEmptyState').show();
      $('#sessionTable').hide();
      return;
    }

    $('#sessionEmptyState').hide();
    $('#sessionTable').show();

    items.forEach(function (item) {
      sessionsCache[item.id] = item;
      var name = escapeHtml(item.name);
      var ip = escapeHtml(item.ip);
      var port = escapeHtml(item.port);
      var id = escapeHtml(item.id);
      $tbody.append(
        '<tr data-id="' + id + '">' +
          '<td>' + name + '</td>' +
          '<td>' + ip + '</td>' +
          '<td>' + port + '</td>' +
          '<td class="session-actions">' +
            '<button type="button" class="btn btn-sm btn-outline-light btn-edit-session">修改</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-danger btn-delete-session">删除</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-info btn-session-commands">常用命令</button> ' +
            '<button type="button" class="btn btn-sm btn-primary btn-remote-session">远程</button>' +
          '</td>' +
        '</tr>'
      );
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

  function paneHasLiveSsh(route) {
    var src = $('.shell-tab-pane[route="' + route + '"] .rightFrame').attr('src') || '';
    return src.indexOf('ssh.html') !== -1;
  }

  function showSessionList() {
    if (typeof window.changeMenu === 'function') {
      window.changeMenu('.shell', 'list');
    }
  }

  function connectSession(session) {
    if (!session || typeof window.ensureRemoteTab !== 'function') {
      return;
    }

    window.openSessionTabs = window.openSessionTabs || {};
    var existingRoute = window.openSessionTabs[session.id];
    if (existingRoute && $('.shell-menu[route="' + existingRoute + '"]').length) {
      window.currentSessionId = session.id;
      window.currentSessionPort = session.port;
      window.changeMenu('.shell', existingRoute);
      if (!paneHasLiveSsh(existingRoute)) {
        if (typeof window.loadSsh === 'function') {
          window.loadSsh(workspaceIframeQuery(session), existingRoute);
        }
      }
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
        var route = window.ensureRemoteTab(session);
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

  function connectRemote(session) {
    connectSession(session);
  }

  $(function () {
    loadSessions();
    showSessionList();

    $('#btnAddSession').on('click', openAddModal);
    $('#btnGlobalCommands').on('click', openGlobalCommands);
    $('#sessionSubmitBtn').on('click', saveSession);

    $('#sessionForm').on('keydown', 'input', function (event) {
      if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        saveSession();
      }
    });

    $('#sessionTableBody').on('click', '.btn-edit-session', function () {
      var id = $(this).closest('tr').attr('data-id');
      var session = sessionsCache[id];
      if (session) {
        openEditModal(session);
      }
    });

    $('#sessionTableBody').on('click', '.btn-delete-session', function () {
      var id = $(this).closest('tr').attr('data-id');
      if (id) {
        deleteSession(id);
      }
    });

    $('#sessionTableBody').on('click', '.btn-session-commands', function () {
      var id = $(this).closest('tr').attr('data-id');
      openSessionCommands(sessionsCache[id]);
    });

    $('#sessionTableBody').on('click', '.btn-remote-session', function () {
      var id = $(this).closest('tr').attr('data-id');
      connectRemote(sessionsCache[id]);
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

  window.loadSessions = loadSessions;
  window.openGlobalCommands = openGlobalCommands;
  window.openSessionCommands = openSessionCommands;
  window.connectSession = connectSession;
  window.connectRemote = connectRemote;
  window.showSessionList = showSessionList;
  window.workspaceIframeQuery = workspaceIframeQuery;
  window.copySessionTab = copySessionTab;
})(jQuery);
