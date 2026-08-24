/**
 * Global / per-session command manager modal (Task 4).
 */
(function ($) {
  'use strict';

  var currentScope = 'global';
  var currentSessionId = null;
  var commandsCache = {};
  var allCommands = [];
  var searchQuery = '';
  var sortKey = 'name';
  var sortDir = 'asc';
  var pageIndex = 1;
  var pageSize = 20;

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

  function compareText(a, b) {
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'zh', {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function filteredCommands() {
    var q = searchQuery;
    var list = allCommands;
    if (q) {
      list = list.filter(function (item) {
        var name = String(item.name || '').toLowerCase();
        var value = String(item.value || '').toLowerCase();
        return name.indexOf(q) >= 0 || value.indexOf(q) >= 0;
      });
    }
    var key = sortKey;
    var dir = sortDir === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var av = key === 'value' ? a.value : a.name;
      var bv = key === 'value' ? b.value : b.name;
      return compareText(av, bv) * dir;
    });
  }

  function updateSortMarks() {
    $('#commandTable thead th.sortable').each(function () {
      var key = $(this).data('sort');
      var mark = '';
      if (key === sortKey) {
        mark = sortDir === 'desc' ? '▼' : '▲';
      }
      $(this).find('.sort-mark').text(mark);
    });
  }

  function renderCommandTable(items) {
    commandsCache = {};
    allCommands = Array.isArray(items) ? items.slice() : [];
    allCommands.forEach(function (item) {
      if (item && item.id) {
        commandsCache[item.id] = item;
      }
    });
    pageIndex = 1;
    paintCommandPage();
  }

  function paintCommandPage() {
    var $tbody = $('#commandTableBody');
    $tbody.empty();
    var filtered = filteredCommands();
    var total = filtered.length;
    var size = pageSize || 20;
    var pages = Math.max(1, Math.ceil(total / size) || 1);
    if (pageIndex > pages) {
      pageIndex = pages;
    }
    if (pageIndex < 1) {
      pageIndex = 1;
    }
    var start = (pageIndex - 1) * size;
    var pageItems = filtered.slice(start, start + size);

    if (!total) {
      $('#commandEmptyState').text(allCommands.length ? '没有匹配的命令' : '暂无命令，请在下方添加').show();
      $('#commandTableWrap').hide();
      $('#commandPager').toggle(!!allCommands.length);
    } else {
      $('#commandEmptyState').hide();
      $('#commandTableWrap').show();
      $('#commandPager').show();
      pageItems.forEach(function (item) {
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

    var from = total ? start + 1 : 0;
    var to = start + pageItems.length;
    $('#commandPagerInfo').text('共 ' + total + ' 条' + (total ? '，第 ' + from + '–' + to + ' 条' : ''));
    $('#commandPageNum').text(pageIndex + ' / ' + pages);
    $('#commandPagePrev').prop('disabled', pageIndex <= 1);
    $('#commandPageNext').prop('disabled', pageIndex >= pages);
    updateSortMarks();
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
    fillSettingsForm(null);
  }

  function loadSettings() {
    if (currentScope !== 'session' || !currentSessionId) {
      hideSettingsBar();
      return;
    }
    $('#commandSettingsBar').show();
    fillSettingsForm(null);
    var $btn = $('#cmdSettingsSaveBtn');
    $btn.prop('disabled', true);
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
      })
      .always(function () {
        $btn.prop('disabled', false);
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
    searchQuery = '';
    sortKey = 'name';
    sortDir = 'asc';
    pageIndex = 1;
    pageSize = parseInt($('#commandPageSize').val(), 10) || 20;
    $('#commandSearch').val('');
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

  function importCommonCommands() {
    var msg = currentScope === 'global'
      ? '将把内置约 1000 条常见运维命令合并到「通用命令」；已存在的相同命令内容会跳过。继续？'
      : '将把内置约 1000 条常见运维命令合并到当前服务器「常用命令」；已存在的相同命令内容会跳过。继续？';
    if (!confirm(msg)) {
      return;
    }
    var $btn = $('#commandImportCommonBtn');
    $btn.prop('disabled', true).text('导入中…');
    $.ajax({
      url: baseUrl + '/commands/import-common?' + scopeQuery(),
      type: 'POST',
      dataType: 'json'
    })
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '导入失败');
          return;
        }
        var r = res.result || {};
        alert('导入完成：新增 ' + (r.imported || 0) + ' 条，跳过 ' + (r.skipped || 0) + ' 条（种子共 ' + (r.total || 0) + ' 条）');
        loadCommands();
      })
      .fail(function () {
        alert('导入失败');
      })
      .always(function () {
        $btn.prop('disabled', false).text('导入常见命令');
      });
  }

  $(function () {
    $('#commandSubmitBtn').on('click', saveCommand);
    $('#commandResetBtn').on('click', function () {
      resetCommandForm();
    });
    $('#commandImportCommonBtn').on('click', importCommonCommands);
    $('#cmdSettingsSaveBtn').on('click', saveSettings);

    var searchTimer = null;
    $('#commandSearch').on('input', function () {
      var val = $.trim($(this).val()).toLowerCase();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchQuery = val;
        pageIndex = 1;
        paintCommandPage();
      }, 120);
    });
    $('#commandPageSize').on('change', function () {
      pageSize = parseInt($(this).val(), 10) || 20;
      pageIndex = 1;
      paintCommandPage();
    });
    $('#commandPagePrev').on('click', function () {
      if (pageIndex > 1) {
        pageIndex -= 1;
        paintCommandPage();
        $('#commandTableWrap').scrollTop(0);
      }
    });
    $('#commandPageNext').on('click', function () {
      pageIndex += 1;
      paintCommandPage();
      $('#commandTableWrap').scrollTop(0);
    });
    $('#commandTable').on('click', 'thead th.sortable', function () {
      var key = $(this).data('sort');
      if (!key) {
        return;
      }
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = 'asc';
      }
      pageIndex = 1;
      paintCommandPage();
    });

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

    $('#commandModal').on('shown.bs.modal', function () {
      $('#commandSearch').trigger('focus');
    });
    $('#commandModal').on('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F' || e.keyCode === 70)) {
        e.preventDefault();
        $('#commandSearch').trigger('focus').trigger('select');
      }
    });
    $('#commandModal').on('hidden.bs.modal', function () {
      resetCommandForm();
      hideSettingsBar();
      commandsCache = {};
      allCommands = [];
      searchQuery = '';
      $('#commandSearch').val('');
    });
  });

  window.openCommandManager = openCommandManager;
})(jQuery);
