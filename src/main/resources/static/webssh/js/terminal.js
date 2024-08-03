let client = new WSSHClient(termUrl);
let term = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    scrollback: 1200,
    tabStopWidth: 8,
    screenKeys: true
});
var fitAddon=new window.FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();
// term.write('Hello Remote Shell...');
//reloadTerm();
window.onresize = function(){
    fitAddon.fit();
    // 获取浏览器窗口的宽度和高度
    // reloadTerm();
}
function reloadTerm(){
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    // 计算终端的列数和行数
    const cellWidth = 9; // 假设每个字符的宽度为 10 像素
    const cellHeight = 17; // 假设每个字符的高度为 20 像素
    const cols = Math.floor(screenWidth / cellWidth);
    const rows = Math.floor(screenHeight / cellHeight);
    term.resize(cols, rows);
}
term.onData(function (data) {
    // 键盘输入时的回调函数
    // fitAddon.fit();
    // client.send({"operate": "command", "tagId": tagId, "command": data});
});
$(function (){
    openTerminal();
})
function reload(){
    openTerminal();
}
function openTerminal() {
    // 已连接先关掉
    if (client._connection) {
        client.close();
        term.reset();
    }
    const options = { operate: 'connect', tagId: tagId };
    // 执行连接操作
    client.connect({
        onError: function (error) {
            // 连接失败回调
            termWrite(error + '\r\n');
        },
        onConnect: function () {
            // 连接成功回调
            client.send(options);
           /* term.write('\r\n');
            term.write('\x1b[32m  ______\r\n');
            term.write(' /\\__  _\\\r\n');
            term.write(' \\/_/\\ \\/    __   _ __   _ __   __  __    \r\n');
            term.write('    \\ \\ \\  /\'__`\\/\\`\'__\\/\\`\'__\\/\\ \\/\\ \\   \r\n');
            term.write('     \\ \\ \\/\\  __/\\ \\ \\/ \\ \\ \\/ \\ \\ \\_\\ \\  \r\n');
            term.write('      \\ \\_\\ \\____\\\\ \\_\\  \\ \\_\\  \\/`____ \\ \r\n');
            term.write('       \\/_/\\/____/ \\/_/   \\/_/   `/___/> \\\r\n');
            term.write('                                    /\\___/\r\n');
            term.write('                                    \\/__/\r\n');
            term.write(' __      __          __       ____    ____    __  __     \r\n');
            term.write('/\\ \\  __/\\ \\        /\\ \\     /\\  _`\\ /\\  _`\\ /\\ \\/\\ \\    \r\n');
            term.write('\\ \\ \\/\\ \\ \\ \\     __\\ \\ \\____\\ \\,\\L\\_\\ \\,L\\_\\ \\ \\_\\ \\   \r\n');
            term.write(' \\ \\ \\ \\ \\ \\ \\  /\'__`\\ \\ \'__`\\/_\\__ \\\\/_\\__ \\\\ \\  _  \\  \r\n');
            term.write('  \\ \\ \\_/ \\_\\ \\/\\  __/\\ \\ \\L\\ \\ /\\ \\L\\ \\ /\\ \\L\\ \\ \\ \\ \\ \\ \r\n');
            term.write('   \\ `\\___x___/\\ \\____\\\\ \\_,__/ \\ `\\____\\ `\\____\\ \\_\\ \\_\\\r\n');
            term.write('    \'\\/__//__/  \\/____/ \\/___/   \\/_____/\\/_____/\\/_/\\/_/\r\n');
            term.write('\x1b[0m\r\n');*/
            var command = getUrlParameter('command');
            termWrite('\x1b[32m' + command + "\r\n");
            client.send({"operate": "command", "tagId": tagId, "command": command});
        },
        onClose: function () {
            // 连接关闭回调
            termWrite("connection closed\r\n");
        },
        onData: function (data) {
            // 收到数据时回调
            termWrite(data);
        }
    });
}
function termWrite(msg){
    term.write(msg);
}
// 获取参数
function getQueryString(name) {
    var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
    var r = window.parent.location.search.substr(1).match(reg);
    if (r != null) {
        return unescape(r[2]);
    }
    return null;
}
// 设置编码
function setEncode(encode){
    $('.linux-encode').text(encode);
    client.send({"operate": "encoded", "tagId": tagId, "command": encode});
}
function logout(){
    window.localStorage.setItem("tagId" + port, null);
    parent.location.reload();
}