(function ($) {
  'use strict';

  var tagId = '';
  var snapshot = null;
  var selectedPid = null;
  var procSort = { key: 'cpu', dir: -1 };
  var portSort = { key: 'local', dir: 1 };
  var histCpu = [];
  var histMem = [];
  var histDisk = [];
  var histNet = [];
  var histAccel = {};
  var accelNavKey = '';
  var perfView = 'cpu';
  var PERF_COLOR = { cpu: '#00b294', mem: '#0078d7', disk: '#b146c2', net: '#ca5010', gpu: '#76b900', npu: '#e67e22' };
  var lastNet = null;
  var lastAt = 0;
  var timer = null;

  function query(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch (e) {
      return '';
    }
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) {
      return n + ' B';
    }
    var u = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) + ' ' + u[i];
  }

  function fmtUptime(sec) {
    sec = Number(sec) || 0;
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (d > 0) {
      return d + ' 天 ' + h + ' 小时';
    }
    if (h > 0) {
      return h + ' 小时 ' + m + ' 分';
    }
    return m + ' 分钟';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cmp(a, b, key) {
    var av = a[key];
    var bv = b[key];
    if (av == null) {
      av = '';
    }
    if (bv == null) {
      bv = '';
    }
    if (typeof av === 'number' || typeof bv === 'number') {
      return (Number(av) || 0) - (Number(bv) || 0);
    }
    return String(av).localeCompare(String(bv), 'zh', { numeric: true, sensitivity: 'base' });
  }

  function pushHist(arr, v) {
    arr.push(v);
    if (arr.length > 60) {
      arr.shift();
    }
  }

  function drawSpark(canvas, data, color, fixedMax) {
    if (!canvas || !canvas.getContext) {
      return;
    }
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 200;
    var h = canvas.clientHeight || 72;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!data.length) {
      return;
    }
    var max = fixedMax > 0 ? fixedMax : 1;
    if (!(fixedMax > 0)) {
      for (var i = 0; i < data.length; i++) {
        if (data[i] > max) {
          max = data[i];
        }
      }
    }
    var pad = 2;
    ctx.beginPath();
    for (var j = 0; j < data.length; j++) {
      var x = data.length === 1 ? 0 : (j / (data.length - 1)) * w;
      var y = h - (Math.min(data[j], max) / max) * (h - pad * 2) - pad;
      if (j === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function diskPercent() {
    var disks = (snapshot && snapshot.disks) || [];
    var used = 0;
    var size = 0;
    disks.forEach(function (d) {
      used += Number(d.used) || 0;
      size += Number(d.size) || 0;
    });
    return size ? Math.round(used * 1000 / size) / 10 : 0;
  }

  function statRow(label, value) {
    return '<div><span class="k">' + esc(label) + '</span><br><span class="v">' + value + '</span></div>';
  }

  function accelerators() {
    return (snapshot && snapshot.accelerators) ? snapshot.accelerators : [];
  }

  function findAccel(id) {
    var list = accelerators();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function accelIcon(kind) {
    if (kind === 'npu') {
      return '<span class="nav-ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h10v3H3V2zm0 4.5h10V12H9.5v2H6.5v-2H3V6.5zM5 8v2.5h6V8H5z"/></svg></span>';
    }
    return '<span class="nav-ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v7H9.5v1.5H11V13H5v-1.5h1.5V10H2V3zm1.5 1.5v4h9v-4h-9z"/></svg></span>';
  }

  function ensureAccelNav() {
    var list = accelerators();
    var key = list.map(function (a) { return a.id; }).join('|');
    var $box = $('#perfAccelNav');
    if (!$box.length) {
      return;
    }
    if (accelNavKey !== key) {
      accelNavKey = key;
      var html = '';
      list.forEach(function (a) {
        html += '<button type="button" class="perf-nav-item" data-perf="' + esc(a.id) + '">'
          + '<div class="nav-top">' + accelIcon(a.kind)
          + '<span class="nav-label">' + esc(a.label || a.name) + '</span>'
          + '<span class="nav-val" id="navVal-' + esc(a.id) + '">--</span></div>'
          + '<canvas id="navSpark-' + esc(a.id) + '"></canvas></button>';
      });
      $box.html(html);
      if ((perfView.indexOf('gpu-') === 0 || perfView.indexOf('npu-') === 0) && !findAccel(perfView)) {
        perfView = 'cpu';
      }
      $('.perf-nav-item').removeClass('active');
      $('.perf-nav-item[data-perf="' + perfView + '"]').addClass('active');
    }
  }

  function load() {
    if (!tagId) {
      $('#tmHost').text('缺少登录标识');
      return;
    }
    $.ajax({
      url: baseUrl + '/monitor',
      data: { tagId: tagId },
      timeout: 20000
    }).done(function (res) {
      if (!res || res.status !== 200) {
        $('#tmHost').text(res && res.message ? res.message : '采集失败');
        return;
      }
      snapshot = res.result || {};
      var now = Date.now();
      var cpu = Number(snapshot.cpuPercent) || 0;
      var mem = Number(snapshot.memPercent) || 0;
      pushHist(histCpu, cpu);
      pushHist(histMem, mem);
      var rx = snapshot.net && snapshot.net.rxBytes;
      var tx = snapshot.net && snapshot.net.txBytes;
      var rate = 0;
      if (lastNet && lastAt) {
        var dt = Math.max(0.5, (now - lastAt) / 1000);
        rate = Math.max(0, ((rx - lastNet.rx) + (tx - lastNet.tx)) / dt);
      }
      lastNet = { rx: rx, tx: tx };
      lastAt = now;
      pushHist(histNet, rate);
      snapshot._netRate = rate;
      pushHist(histDisk, diskPercent());
      (snapshot.accelerators || []).forEach(function (a) {
        if (!histAccel[a.id]) {
          histAccel[a.id] = [];
        }
        pushHist(histAccel[a.id], Number(a.util) || 0);
      });
      paint();
    }).fail(function () {
      $('#tmHost').text('采集失败');
    });
  }

  function paint() {
    if (!snapshot) {
      return;
    }
    $('#tmHost').text((snapshot.host || '') + ' · ' + (snapshot.cores || '?') + ' 核 · 运行 ' + fmtUptime(snapshot.uptimeSec));
    paintProc();
    paintPerf();
    paintPorts();
  }

  function heatColor(pct) {
    var t = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
    var h = 52 - t * 34;
    var l = 96 - t * 42;
    return 'hsl(' + h + ',88%,' + l + '%)';
  }

  /** Windows 任务管理器式热力格：底色随数值加深，数字叠在格子里 */
  function heatTd(pct, text, active) {
    return '<td class="num heat' + (active ? ' col-on' : '') + '" style="background:' + heatColor(pct) + '">' + esc(text) + '</td>';
  }

  function paintProcHeaders() {
    var cpu = Number(snapshot.cpuPercent) || 0;
    var mem = Number(snapshot.memPercent) || 0;
    var used = Number(snapshot.memUsed) || 0;
    $('#cpuHeadTotal').text(cpu.toFixed(0) + '%');
    $('#memHeadTotal').text(mem.toFixed(0) + '%');
    $('#rssHeadTotal').text(fmtBytes(used));
    $('#thCpu').css('background', heatColor(cpu));
    $('#thMem').css('background', heatColor(mem));
    $('#thRss').css('background', heatColor(mem));
  }

  function paintProc() {
    paintProcHeaders();
    var q = $.trim($('#procSearch').val()).toLowerCase();
    var rows = (snapshot.processes || []).slice();
    if (q) {
      rows = rows.filter(function (p) {
        return String(p.name || '').toLowerCase().indexOf(q) >= 0
          || String(p.cmd || '').toLowerCase().indexOf(q) >= 0
          || String(p.user || '').toLowerCase().indexOf(q) >= 0
          || String(p.pid).indexOf(q) >= 0;
      });
    }
    rows.sort(function (a, b) {
      return cmp(a, b, procSort.key) * procSort.dir;
    });
    var maxRss = 0;
    rows.forEach(function (p) {
      var rss = Number(p.rss) || 0;
      if (rss > maxRss) {
        maxRss = rss;
      }
    });
    var html = '';
    rows.forEach(function (p) {
      var sel = selectedPid === p.pid ? ' selected' : '';
      var cpu = Number(p.cpu) || 0;
      var memPct = Number(p.mem) || 0;
      var rss = Number(p.rss) || 0;
      var rssHeat = maxRss > 0 ? (rss / maxRss * 100) : 0;
      html += '<tr class="' + sel + '" data-pid="' + p.pid + '">'
        + '<td>' + esc(p.name) + '</td>'
        + '<td class="num">' + p.pid + '</td>'
        + '<td>' + esc(p.user) + '</td>'
        + heatTd(cpu, cpu.toFixed(1) + '%', procSort.key === 'cpu')
        + heatTd(memPct, memPct.toFixed(1) + '%', procSort.key === 'mem')
        + heatTd(rssHeat, fmtBytes(rss), procSort.key === 'rss')
        + '<td>' + esc(p.stat) + '</td>'
        + '<td class="cmd" title="' + esc(p.cmd) + '">' + esc(p.cmd) + '</td>'
        + '</tr>';
    });
    $('#procTable tbody').html(html || '<tr><td colspan="8">无进程数据</td></tr>');
    $('#procTable th').removeClass('sorted');
    $('#procTable th[data-k="' + procSort.key + '"]').addClass('sorted');
    $('#btnKill').prop('disabled', selectedPid == null);
    $('#tmFoot').text('进程 ' + rows.length + ' / ' + (snapshot.processes || []).length + ' · 每 2 秒刷新');
  }

  function paintPerf() {
    var cpu = Number(snapshot.cpuPercent) || 0;
    var memPct = Number(snapshot.memPercent) || 0;
    var diskPct = diskPercent();
    var rate = snapshot._netRate || 0;
    $('#navCpuVal').text(cpu.toFixed(0) + '%');
    $('#navMemVal').text(memPct.toFixed(0) + '%');
    $('#navDiskVal').text(diskPct.toFixed(0) + '%');
    $('#navNetVal').text(fmtBytes(rate) + '/s');
    drawSpark(document.getElementById('navCpuSpark'), histCpu, PERF_COLOR.cpu, 100);
    drawSpark(document.getElementById('navMemSpark'), histMem, PERF_COLOR.mem, 100);
    drawSpark(document.getElementById('navDiskSpark'), histDisk, PERF_COLOR.disk, 100);
    drawSpark(document.getElementById('navNetSpark'), histNet, PERF_COLOR.net);
    ensureAccelNav();
    accelerators().forEach(function (a) {
      var util = Number(a.util) || 0;
      $('#navVal-' + a.id).text(util.toFixed(0) + '%');
      var color = a.kind === 'npu' ? PERF_COLOR.npu : PERF_COLOR.gpu;
      drawSpark(document.getElementById('navSpark-' + a.id), histAccel[a.id] || [], color, 100);
    });

    var accel = findAccel(perfView);
    if (accel) {
      var color = accel.kind === 'npu' ? PERF_COLOR.npu : PERF_COLOR.gpu;
      $('#perfTitle').text((accel.label || accel.name) + ' · ' + (accel.name || ''));
      $('#perfBig').text((Number(accel.util) || 0).toFixed(0) + '%');
      $('#perfStats').html(
        statRow('类型', accel.kind === 'npu' ? 'NPU（算能）' : 'GPU（NVIDIA）')
          + statRow('型号', esc(accel.name || '-'))
          + statRow('利用率', (Number(accel.util) || 0).toFixed(1) + '%')
          + statRow('显存/设备内存', fmtBytes(accel.memUsed) + ' / ' + fmtBytes(accel.memTotal))
          + (accel.temp ? statRow('温度', Number(accel.temp).toFixed(0) + ' °C') : '')
          + (accel.power ? statRow('功耗', Number(accel.power).toFixed(1) + ' W') : '')
      );
      $('#perfDisks').html('');
      drawSpark(document.getElementById('perfMainChart'), histAccel[accel.id] || [], color, 100);
      return;
    }

    var titles = { cpu: 'CPU', mem: '内存', disk: '磁盘', net: '以太网' };
    var big = cpu.toFixed(0) + '%';
    var stats = '';
    var disksHtml = '';
    if (perfView === 'mem') {
      big = memPct.toFixed(0) + '%';
      stats = statRow('使用中', fmtBytes(snapshot.memUsed))
        + statRow('可用', fmtBytes(snapshot.memAvail))
        + statRow('已提交', fmtBytes(snapshot.memUsed) + ' / ' + fmtBytes(snapshot.memTotal))
        + statRow('已缓存', fmtBytes(Math.max(0, (Number(snapshot.memTotal) || 0) - (Number(snapshot.memUsed) || 0) - (Number(snapshot.memAvail) || 0))))
        + statRow('分页池/交换', fmtBytes(snapshot.swapUsed) + ' / ' + fmtBytes(snapshot.swapTotal))
        + statRow('已安装', fmtBytes(snapshot.memTotal));
      drawSpark(document.getElementById('perfMainChart'), histMem, PERF_COLOR.mem, 100);
    } else if (perfView === 'disk') {
      big = diskPct.toFixed(0) + '%';
      var disks = snapshot.disks || [];
      var used = 0;
      var size = 0;
      disks.forEach(function (d) {
        used += Number(d.used) || 0;
        size += Number(d.size) || 0;
        disksHtml += '<div class="perf-disk-row"><span>' + esc(d.mount || d.fs) + '</span><span>'
          + (d.percent || 0) + '% · ' + fmtBytes(d.used) + ' / ' + fmtBytes(d.size) + '</span></div>';
      });
      stats = statRow('活动时间', diskPct.toFixed(1) + '%')
        + statRow('容量', fmtBytes(used) + ' / ' + fmtBytes(size))
        + statRow('卷数量', String(disks.length));
      drawSpark(document.getElementById('perfMainChart'), histDisk, PERF_COLOR.disk, 100);
    } else if (perfView === 'net') {
      big = fmtBytes(rate) + '/s';
      stats = statRow('吞吐量', fmtBytes(rate) + '/s')
        + statRow('累计接收', fmtBytes(snapshot.net && snapshot.net.rxBytes))
        + statRow('累计发送', fmtBytes(snapshot.net && snapshot.net.txBytes));
      drawSpark(document.getElementById('perfMainChart'), histNet, PERF_COLOR.net);
    } else {
      stats = statRow('利用率', cpu.toFixed(1) + '%')
        + statRow('逻辑处理器', String(snapshot.cores || '-'))
        + statRow('进程', String((snapshot.processes || []).length))
        + statRow('运行时间', fmtUptime(snapshot.uptimeSec))
        + statRow('负载 (1/5/15)', (snapshot.load1 || '-') + ' / ' + (snapshot.load5 || '-') + ' / ' + (snapshot.load15 || '-'))
        + statRow('主机', esc(snapshot.host || '-'));
      drawSpark(document.getElementById('perfMainChart'), histCpu, PERF_COLOR.cpu, 100);
    }
    $('#perfTitle').text(titles[perfView] || 'CPU');
    $('#perfBig').text(big);
    $('#perfStats').html(stats);
    $('#perfDisks').html(disksHtml);
  }

  function paintPorts() {
    var q = $.trim($('#portSearch').val()).toLowerCase();
    var rows = (snapshot.ports || []).slice();
    if (q) {
      rows = rows.filter(function (p) {
        return String(p.proto || '').toLowerCase().indexOf(q) >= 0
          || String(p.local || '').toLowerCase().indexOf(q) >= 0
          || String(p.process || '').toLowerCase().indexOf(q) >= 0
          || String(p.pid == null ? '' : p.pid).indexOf(q) >= 0;
      });
    }
    rows.sort(function (a, b) {
      return cmp(a, b, portSort.key) * portSort.dir;
    });
    var html = '';
    rows.forEach(function (p) {
      html += '<tr>'
        + '<td>' + esc(p.proto) + '</td>'
        + '<td>' + esc(p.local) + '</td>'
        + '<td class="num">' + (p.pid == null ? '' : p.pid) + '</td>'
        + '<td>' + esc(p.process) + '</td>'
        + '</tr>';
    });
    $('#portTable tbody').html(html || '<tr><td colspan="4">无监听端口（部分系统需 root 才能看到进程名）</td></tr>');
    $('#portTable th').removeClass('sorted');
    $('#portTable th[data-k="' + portSort.key + '"]').addClass('sorted');
  }

  function killSelected() {
    if (selectedPid == null) {
      return;
    }
    if (!confirm('结束 PID ' + selectedPid + ' ？')) {
      return;
    }
    $.post(baseUrl + '/monitor/kill', { tagId: tagId, pid: selectedPid })
      .done(function (res) {
        if (res.status !== 200) {
          alert(res.message || '结束失败');
          return;
        }
        selectedPid = null;
        load();
      })
      .fail(function () {
        alert('结束失败');
      });
  }

  $(function () {
    tagId = query('tagId') || query('tid');
    try {
      if (!tagId && window.parent && typeof window.parent.getWebsshStoredTagId === 'function') {
        tagId = window.parent.getWebsshStoredTagId({
          id: query('sessionId'),
          port: query('port')
        }) || '';
      }
    } catch (e) { /* ignore */ }

    $('.tm-tab').on('click', function () {
      var tab = $(this).data('tab');
      $('.tm-tab').removeClass('active');
      $(this).addClass('active');
      $('.tm-pane').removeClass('active');
      $('#pane-' + tab).addClass('active');
      if (snapshot) {
        paint();
        if (tab === 'perf') {
          setTimeout(paintPerf, 40);
        }
      }
    });
    $('#btnRefresh').on('click', load);
    $('#perfNav').on('click', '.perf-nav-item', function () {
      perfView = $(this).data('perf') || 'cpu';
      $('.perf-nav-item').removeClass('active');
      $(this).addClass('active');
      if (snapshot) {
        paintPerf();
      }
    });
    $('#btnKill').on('click', killSelected);
    $('#procSearch').on('input', function () {
      if (snapshot) {
        paintProc();
      }
    });
    $('#portSearch').on('input', function () {
      if (snapshot) {
        paintPorts();
      }
    });
    $('#procTable').on('click', 'tbody tr[data-pid]', function () {
      selectedPid = Number($(this).data('pid'));
      paintProc();
    });
    $('#procTable').on('click', 'th[data-k]', function () {
      var k = $(this).data('k');
      if (procSort.key === k) {
        procSort.dir *= -1;
      } else {
        procSort.key = k;
        procSort.dir = k === 'name' || k === 'user' || k === 'cmd' ? 1 : -1;
      }
      paintProc();
    });
    $('#portTable').on('click', 'th[data-k]', function () {
      var k = $(this).data('k');
      if (portSort.key === k) {
        portSort.dir *= -1;
      } else {
        portSort.key = k;
        portSort.dir = 1;
      }
      paintPorts();
    });
    load();
    timer = setInterval(load, 2000);
    $(window).on('beforeunload', function () {
      if (timer) {
        clearInterval(timer);
      }
    });
  });
})(jQuery);
