/**
 * Global / per-session command manager modal (Task 4).
 */
(function ($) {
  'use strict';

  var currentScope = 'global';
  var currentSessionId = null;
  var commandsCache = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scopeQuery() {
    var q = 'scope=' + encodeURIComponent(currentScope);
    if (currentScope === 'session' && currentSessionId) {
      q += '&sessionId=' + encodeURIComponent(currentSessionId);
    }
    return q;
  }

  function resetCommandForm() {
    $('#commandForm')[0].reset();
    $('#commandId').val('');
    $('#commandForm').removeClass('was-validated');
    $('#commandFormTitle').text('添加命令');
    $('#commandSubmitBtn').text('添加');
  }

  function renderCommandTable(items) {
    commandsCache = {};
    var $tbody = $('#commandTableBody');
    $tbody.empty();

    if (!items.length) {
      $('#commandEmptyState').show();
      $('#commandTable').hide();
      return;
    }

    $('#commandEmptyState').hide();
    $('#commandTable').show();

    items.forEach(function (item) {
      commandsCache[item.id] = item;
      var id = escapeHtml(item.id);
      var name = escapeHtml(item.name);
      var value = escapeHtml(item.value);
      $tbody.append(
        '<tr data-id="' + id + '">' +
          '<td>' + name + '</td>' +
          '<td><code class="command-value">' + value + '</code></td>' +
          '<td class="command-actions">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary btn-edit-command">编辑</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-danger btn-delete-command">删除</button>' +
          '</td>' +
        '</tr>'
      );
    });
  }

  function loadCommands() {
    $.get(baseUrl + '/commands?' + scopeQuery())
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '加载失败');
          return;
        }
        var items = res.result || [];
        if (!Array.isArray(items)) {
          items = [];
        }
        renderCommandTable(items);
      })
      .fail(function () {
        alert('加载命令失败');
      });
  }

  function collectFormPayload() {
    return {
      name: $.trim($('#commandName').val()),
      value: $.trim($('#commandValue').val())
    };
  }

  function saveCommand() {
    var form = $('#commandForm')[0];
    if (!form.checkValidity()) {
      $(form).addClass('was-validated');
      return;
    }

    var id = $('#commandId').val();
    var fields = collectFormPayload();
    var $btn = $('#commandSubmitBtn');
    $btn.prop('disabled', true);

    var req;
    if (id) {
      req = $.ajax({
        url: baseUrl + '/commands/' + encodeURIComponent(id) + '?' + scopeQuery(),
        type: 'PUT',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({ name: fields.name, value: fields.value })
      });
    } else {
      var body = {
        scope: currentScope,
        name: fields.name,
        value: fields.value
      };
      if (currentScope === 'session') {
        body.sessionId = currentSessionId;
      }
      req = $.ajax({
        url: baseUrl + '/commands',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(body)
      });
    }

    req
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '保存失败');
          return;
        }
        resetCommandForm();
        loadCommands();
      })
      .fail(function () {
        alert('保存失败');
      })
      .always(function () {
        $btn.prop('disabled', false);
      });
  }

  function startEditCommand(item) {
    $('#commandId').val(item.id || '');
    $('#commandName').val(item.name || '');
    $('#commandValue').val(item.value || '');
    $('#commandForm').removeClass('was-validated');
    $('#commandFormTitle').text('编辑命令');
    $('#commandSubmitBtn').text('保存');
    $('#commandName').focus();
  }

  function deleteCommand(id) {
    if (!confirm('确定删除该命令？')) {
      return;
    }
    $.ajax({
      url: baseUrl + '/commands/' + encodeURIComponent(id) + '?' + scopeQuery(),
      type: 'DELETE',
      dataType: 'json'
    })
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '删除失败');
          return;
        }
        if ($('#commandId').val() === id) {
          resetCommandForm();
        }
        loadCommands();
      })
      .fail(function () {
        alert('删除失败');
      });
  }

  function fillSettingsForm(settings) {
    settings = settings || {};
    $('#cmdAutoCollect').prop('checked', settings.autoCollect !== false);
    $('#cmdCollectLimit').val(
      settings.collectLimit != null ? settings.collectLimit : 1000
    );
    $('#cmdCollectLines').val(
      settings.collectLines != null ? settings.collectLines : 1
    );
  }

  function hideSettingsBar() {
    $('#commandSettingsBar').hide();
  }

  function loadSettings() {
    if (currentScope !== 'session' || !currentSessionId) {
      hideSettingsBar();
      return;
    }
    $('#commandSettingsBar').show();
    $.get(baseUrl + '/commands/settings?sessionId=' + encodeURIComponent(currentSessionId))
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '加载设置失败');
          fillSettingsForm(null);
          return;
        }
        fillSettingsForm(res.result || null);
      })
      .fail(function () {
        alert('加载设置失败');
        fillSettingsForm(null);
      });
  }

  function saveSettings() {
    if (currentScope !== 'session' || !currentSessionId) {
      return;
    }
    var limit = parseInt($('#cmdCollectLimit').val(), 10);
    var lines = parseInt($('#cmdCollectLines').val(), 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      alert('收集上限须为 1–1000');
      return;
    }
    if (isNaN(lines) || lines < 1 || lines > 50) {
      alert('收集行数须为 1–50');
      return;
    }
    var $btn = $('#cmdSettingsSaveBtn');
    $btn.prop('disabled', true);
    $.ajax({
      url: baseUrl + '/commands/settings?sessionId=' + encodeURIComponent(currentSessionId),
      type: 'PUT',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({
        autoCollect: $('#cmdAutoCollect').is(':checked'),
        collectLimit: limit,
        collectLines: lines
      })
    })
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '保存设置失败');
          return;
        }
        fillSettingsForm(res.result || null);
      })
      .fail(function () {
        alert('保存设置失败');
      })
      .always(function () {
        $btn.prop('disabled', false);
      });
  }

  /**
   * @param {{ scope: 'global'|'session', sessionId?: string, title: string }} options
   */
  function openCommandManager(options) {
    options = options || {};
    currentScope = options.scope === 'session' ? 'session' : 'global';
    currentSessionId = currentScope === 'session' ? (options.sessionId || null) : null;

    if (currentScope === 'session' && !currentSessionId) {
      alert('缺少 sessionId');
      return;
    }

    $('#commandModalTitle').text(options.title || (currentScope === 'global' ? '通用命令' : '常用命令'));
    resetCommandForm();
    renderCommandTable([]);
    if (currentScope === 'session') {
      loadSettings();
    } else {
      hideSettingsBar();
    }
    $('#commandModal').modal('show');
    loadCommands();
  }

  $(function () {
    $('#commandSubmitBtn').on('click', saveCommand);
    $('#commandResetBtn').on('click', function () {
      resetCommandForm();
    });
    $('#cmdSettingsSaveBtn').on('click', saveSettings);

    $('#commandForm').on('keydown', 'input, textarea', function (event) {
      if ((event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey) {
        if (event.target && event.target.tagName === 'TEXTAREA') {
          return;
        }
        event.preventDefault();
        saveCommand();
      }
    });

    $('#commandTableBody').on('click', '.btn-edit-command', function () {
      var id = $(this).closest('tr').data('id');
      var item = commandsCache[id];
      if (item) {
        startEditCommand(item);
      }
    });

    $('#commandTableBody').on('click', '.btn-delete-command', function () {
      var id = $(this).closest('tr').data('id');
      if (id) {
        deleteCommand(id);
      }
    });

    $('#commandModal').on('hidden.bs.modal', function () {
      resetCommandForm();
      hideSettingsBar();
      commandsCache = {};
    });
  });

  window.openCommandManager = openCommandManager;
})(jQuery);
