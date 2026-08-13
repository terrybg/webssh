/**
 * Session tabs: fixed "会话列表" + dynamic remote panes.
 * No "新建会话" button — remotes are opened from the list.
 */
var remoteTabSeq = 0;

$(function () {
  $('.remote-tabs').on('click', '.shell-menu', function (e) {
    if ($(e.target).hasClass('shell-remove')) {
      return;
    }
    changeMenu('.shell', $(this).attr('route'));
  });

  $('.remote-tabs').on('click', '.shell-remove', function () {
    var $link = $(this).closest('.shell-menu');
    var route = $link.attr('route');
    if (!route || route === 'list' || $link.hasClass('list-tab')) {
      return false;
    }
    var currentRoute = $('.shell-menu.active').attr('route');
    $link.parent().remove();
    $('.shell-tab-pane[route="' + route + '"]').remove();
    if (window.openSessionTabs) {
      Object.keys(window.openSessionTabs).forEach(function (sid) {
        if (String(window.openSessionTabs[sid]) === String(route)) {
          var $other = $('.shell-menu[data-session-id="' + sid + '"]').not('[route="' + route + '"]').first();
          if ($other.length) {
            window.openSessionTabs[sid] = $other.attr('route');
          } else {
            delete window.openSessionTabs[sid];
          }
        }
      });
    }
    if (currentRoute === route) {
      var $last = $('.shell-menu').last();
      if ($last.length) {
        changeMenu('.shell', $last.attr('route'));
      } else {
        changeMenu('.shell', 'list');
      }
    }
    return false;
  });
});

function changeTabTitle(type, name, route) {
  var selector = route
    ? '.' + type + '-menu[route="' + route + '"] .remote-tab-title'
    : '.' + type + '-menu.active .remote-tab-title';
  $(selector).text(name || '会话');
}

function changeMenu(before, route) {
  $(before + '-menu').removeClass('active');
  var $link = $(before + '-menu[route="' + route + '"]');
  $link.addClass('active');
  $(before + '-tab-pane').removeClass('show').removeClass('active').hide();
  var $pane = $(before + '-tab-pane[route="' + route + '"]');
  $pane.addClass('show').addClass('active').show();

  if (route !== 'list') {
    var sid = $link.attr('data-session-id') || $pane.attr('data-session-id');
    var port = $link.attr('data-session-port') || $pane.attr('data-session-port');
    if (sid) {
      window.currentSessionId = sid;
    }
    if (port != null && port !== '') {
      window.currentSessionPort = parseInt(port, 10);
    }
  }
}

/**
 * Ensure a remote shell tab exists for sessionId; return route id.
 * options.forceNew === true → always open a new tab (used by「复制会话」).
 */
function ensureRemoteTab(session, options) {
  options = options || {};
  window.openSessionTabs = window.openSessionTabs || {};
  var sid = session.id;
  if (!options.forceNew) {
    var existing = window.openSessionTabs[sid];
    if (existing && $('.shell-menu[route="' + existing + '"]').length) {
      changeMenu('.shell', existing);
      return existing;
    }
  }

  remoteTabSeq += 1;
  var route = 's' + Date.now() + '-' + remoteTabSeq;
  // 记录“最近一个”路由，供列表点「远程」复用；复制会话会再开新 Tab
  window.openSessionTabs[sid] = route;
  var title = session.name || '会话';

  var port = session.port != null ? session.port : 22;
  $('.remote-tabs').append(
    '<li class="nav-item">' +
      '<a class="nav-link shell-menu" route="' + route + '" data-session-id="' + sid + '" data-session-port="' + port + '">' +
        '<span class="iconfont icon-cloudshellyunminglinghang"></span> ' +
        '<span class="remote-tab-title"></span> ' +
        '<span class="iconfont icon-shanchu2 m-lg-2 shell-remove"></span>' +
      '</a>' +
    '</li>'
  );
  $('.shell-menu[route="' + route + '"] .remote-tab-title').text(title);

  $('#tabPanes').append(
    '<div class="shell-tab-pane remote-pane" route="' + route + '" data-session-id="' + sid + '" data-session-port="' + port + '">' +
      '<div class="leftDiv">' +
        '<iframe class="resizable-iframe leftFrame" src=""></iframe>' +
      '</div>' +
      '<div class="move-bar" title="拖动调整宽度"></div>' +
      '<div class="rightDiv">' +
        '<iframe class="resizable-iframe rightFrame" src=""></iframe>' +
      '</div>' +
    '</div>'
  );

  changeMenu('.shell', route);
  return route;
}

window.changeTabTitle = changeTabTitle;
window.changeMenu = changeMenu;
window.ensureRemoteTab = ensureRemoteTab;
