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
var port = getUrlParameter('port') || 22;
try {
  // 检查是否不是在 'index.html' 页面上
  if (location.href.indexOf('index.html') === -1) {
    port = parent.getUrlParameter && parent.getUrlParameter('port') || 22;
  }
} catch (e) {
  port = 22; // 确保在跨域时 port 为 22
}
let tagId = window.localStorage.getItem("tagId" + port);

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