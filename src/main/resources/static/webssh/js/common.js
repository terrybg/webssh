// 基础地址
// var baseUrl = `http://${document.location.hostname}:${document.location.port}/webssh/api`;
var baseUrl = `http://${document.location.hostname}:${document.location.port}/webssh/api`;
var wsUrl = `ws://${document.location.hostname}:${document.location.port}/webssh/websocket`;
var termUrl = `ws://${document.location.hostname}:${document.location.port}/terminal/websocket`;

function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function getQueryParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

var port = getUrlParameter('port') || 22;
try {
  // 检查是否不是在 'index.html' 页面上
  if (location.href.indexOf('index.html') === -1) {
    // Prefer iframe query, then parent session context, then parent URL
    port = getUrlParameter('port')
      || (window.parent && window.parent.currentSessionPort != null && window.parent.currentSessionPort)
      || (parent.getUrlParameter && parent.getUrlParameter('port'))
      || 22;
  }
} catch (e) {
  port = getUrlParameter('port') || 22; // 确保在跨域时回退到自身 query / 22
}
function normalizeTagId(v) {
  if (v == null) {
    return '';
  }
  v = String(v).trim();
  // ssh 断开时曾写入字符串 "null"
  if (!v || v === 'null' || v === 'undefined') {
    return '';
  }
  return v;
}

// 优先 URL 上的 tagId（父页注入），再读 localStorage
let tagId = normalizeTagId(getUrlParameter('tagId'))
  || normalizeTagId(getQueryParam('tagId'))
  || normalizeTagId(window.localStorage.getItem("tagId" + port));

function currentTagId() {
  return normalizeTagId(getUrlParameter('tagId'))
    || normalizeTagId(getQueryParam('tagId'))
    || normalizeTagId(window.localStorage.getItem("tagId" + port))
    || normalizeTagId(tagId)
    || normalizeTagId(window.parent && window.parent.localStorage
      && window.parent.localStorage.getItem("tagId" + port));
}

/** Update module tagId + localStorage + URL query so currentTagId() stops using a stale URL value. */
function applyTagId(newId) {
  newId = normalizeTagId(newId);
  if (!newId) {
    return false;
  }
  tagId = newId;
  try {
    window.localStorage.setItem('tagId' + port, newId);
  } catch (e0) { /* ignore */ }
  try {
    var u = new URL(window.location.href);
    u.searchParams.set('tagId', newId);
    window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e1) { /* ignore */ }
  return true;
}

function isSessionExpiredMessage(msg) {
  if (!msg) {
    return false;
  }
  var s = String(msg);
  return s.indexOf('未登录') >= 0 || s.indexOf('过期') >= 0;
}

/** Display label: 会话名(ip) for SFTP chrome / breadcrumbs */
function sessionDisplayLabel() {
  var name = '';
  var ip = '';
  try {
    name = normalizeTagId(getQueryParam('sessionName') || getUrlParameter('sessionName') || '');
  } catch (e0) { /* ignore */ }
  try {
    ip = normalizeTagId(getQueryParam('ip') || getUrlParameter('ip') || '');
  } catch (e1) { /* ignore */ }
  if (!name && !ip) {
    try {
      var sid = getQueryParam('sessionId') || sessionId;
      var cache = window.parent && window.parent.sessionsCache;
      if (sid && cache && cache[sid]) {
        name = cache[sid].name || '';
        ip = cache[sid].ip || '';
      }
    } catch (e2) { /* ignore */ }
  }
  if (name && ip) {
    return name + '(' + ip + ')';
  }
  return name || ip || '此电脑';
}

/** Window title: root = 名 (ip); child = 名 (ip) · leaf */
function sessionWindowTitleForPath(path) {
  var name = '';
  var ip = '';
  try {
    name = normalizeTagId(getQueryParam('sessionName') || getUrlParameter('sessionName') || '');
  } catch (e0) { /* ignore */ }
  try {
    ip = normalizeTagId(getQueryParam('ip') || getUrlParameter('ip') || '');
  } catch (e1) { /* ignore */ }
  if (!name && !ip) {
    try {
      var sid = getQueryParam('sessionId') || sessionId;
      var cache = window.parent && window.parent.sessionsCache;
      if (sid && cache && cache[sid]) {
        name = cache[sid].name || '';
        ip = cache[sid].ip || '';
      }
    } catch (e2) { /* ignore */ }
  }
  var host = '';
  if (name && ip) {
    host = name + ' (' + ip + ')';
  } else {
    host = name || ip || '文件';
  }
  var p = path == null ? '/' : String(path);
  if (!p || p === '/') {
    return host;
  }
  var parts = p.split('/').filter(Boolean);
  var leaf = parts.length ? parts[parts.length - 1] : p;
  return host + ' · ' + leaf;
}

let sessionId = getQueryParam('sessionId')
  || (window.parent && window.parent.currentSessionId)
  || null;

function monitorElementVisibility(element, onVisibleCallback, onHideCallback) {
  console.info('进来了');

  if (!element) {
    console.info('未指定要监控的元素');
    onVisibleCallback(); // 默认回调
    return;
  }

  let intervalId;

  // 记录元素的初始可见状态
  let previousVisibility = 'hidden';
  let previousDisplay = 'none';

  // 初始化状态
  const initialVisibility = getComputedStyle(element).visibility;
  const initialDisplay = getComputedStyle(element).display;

  // 如果初始状态是可见的，立即调用 onVisibleCallback 并停止监控
  if (initialVisibility !== 'hidden' && initialDisplay !== 'none') {
    if (typeof onVisibleCallback === 'function') {
      onVisibleCallback();
    }
    previousVisibility = initialVisibility;
    previousDisplay = initialDisplay;
    return () => {
      console.info('监控已停止');
    };
  } else {
    previousVisibility = initialVisibility;
    previousDisplay = initialDisplay;
  }

  // 开始监控
  intervalId = setInterval(() => {
    const currentVisibility = getComputedStyle(element).visibility;
    const currentDisplay = getComputedStyle(element).display;

    console.log('Visibility:', currentVisibility, 'Display:', currentDisplay);

    // 判断元素是否显示或隐藏
    if (currentVisibility !== 'hidden' && currentDisplay !== 'none') {
      // 元素显示，触发回调并停止监控
      if (typeof onVisibleCallback === 'function') {
        onVisibleCallback();
      }

      // 停止定时器
      clearInterval(intervalId);

      console.log('已停止监控，因为元素变为可见状态');
    } else {
      // 元素隐藏
      if (previousVisibility !== 'hidden' || previousDisplay !== 'none') {
        if (typeof onHideCallback === 'function') {
          onHideCallback();
        }
      }

      // 更新状态记录
      previousVisibility = currentVisibility;
      previousDisplay = currentDisplay;
    }
  }, 100); // 每 100 毫秒检查一次

  // 返回一个函数，用于手动停止监控
  return () => {
    clearInterval(intervalId);
    console.info('监控已通过手动调用停止');
  };
}

function loadTermx(callback) {
  const checkWidth = () => {
    const bodyWidth = $("body").width();
    if (bodyWidth > 0) {
      callback();
    } else {
      setTimeout(checkWidth, 200); // 200 毫秒后重试
    }
  };

  // 启动检查
  checkWidth();
}