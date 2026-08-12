/**
 * Homepage session list CRUD (Task 3).
 * Stubs for 通用命令 / 常用命令 (Task 4) and 远程 (Task 5).
 */
(function ($) {
  'use strict';

  var sessionsCache = {};

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

  // Task 4 stub
  function openGlobalCommands() {
    console.log('TODO Task 4: open global commands');
  }

  // Task 4 stub
  function openSessionCommands(session) {
    console.log('TODO Task 4: open session commands', session && session.id);
  }

  // Task 5 stub
  function connectRemote(session) {
    console.log('TODO Task 5: connect remote', session && session.id);
  }

  $(function () {
    loadSessions();

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
      var id = $(this).closest('tr').data('id');
      var session = sessionsCache[id];
      if (session) {
        openEditModal(session);
      }
    });

    $('#sessionTableBody').on('click', '.btn-delete-session', function () {
      var id = $(this).closest('tr').data('id');
      if (id) {
        deleteSession(id);
      }
    });

    $('#sessionTableBody').on('click', '.btn-session-commands', function () {
      var id = $(this).closest('tr').data('id');
      openSessionCommands(sessionsCache[id]);
    });

    $('#sessionTableBody').on('click', '.btn-remote-session', function () {
      var id = $(this).closest('tr').data('id');
      connectRemote(sessionsCache[id]);
    });
  });

  // Expose for Task 4/5 wiring
  window.loadSessions = loadSessions;
  window.openGlobalCommands = openGlobalCommands;
  window.openSessionCommands = openSessionCommands;
  window.connectRemote = connectRemote;
})(jQuery);
