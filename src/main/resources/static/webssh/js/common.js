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
if (location.href.indexOf('index.html') === -1) {
  port = parent.getUrlParameter && parent.getUrlParameter('port') || 22;
}
let tagId = window.localStorage.getItem("tagId" + port);