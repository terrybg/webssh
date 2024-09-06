let client = new WSSHClient();
let xtermTheme = localStorage.getItem('xtermTheme') || 'dark';
let term = new Terminal({
    // 计算屏幕高度动态rows
    // rows: 30,
    // cols: 40,
    // rows: parseInt(window.innerHeight / 25),//parseInt(window.innerHeight / 24),
    // 光标闪烁
    cursorBlink: true,
    // 光标样式  null | 'block' | 'underline' | 'bar'
    cursorStyle: "block",
    //回滚
    scrollback: 1200,
    //制表宽度
    tabStopWidth: 8,
    screenKeys: true,
    theme: getColor(xtermTheme)
});
// 修改terminal的高度为body的高度
/*document.getElementById('terminal').style.height = window.innerHeight + 'px';
var term = new Terminal({cursorBlink: true});
term.open(document.getElementById('terminal'));*/
// xterm fullscreen config

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
    client.send({"operate": "command", "tagId": tagId, "command": data});
});
$(function (){
    openTerminal();
    // 查询快捷键
    $.ajax({
        url: `../data/dict.json`,
        type: 'GET',
        contentType: 'application/json;charset=UTF-8',
        dataType: 'JSON',
        success: function (res) {
            res.result.forEach(item => {
                $(`<li class="list-group-item bg-dark" data-key="${item.value}">${item.name}<br>${item.value}</li>`).appendTo('#shortcut').click(function (){
                    // 换行并输入起始符“$”
                    // term.focus();
                    term.paste($(this).attr('data-key'));
                });
            })
        }
    });
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
            term.write('Error: ' + error + '\r\n');
        },
        onConnect: function () {
            // 连接成功回调
            client.send(options);
            term.write('\r\n');
            term.write('\x1b[32m  ______\r\n');
            // term.write(' /\\__  _\\\r\n');
            // term.write(' \\/_/\\ \\/    __   _ __   _ __   __  __    \r\n');
            // term.write('    \\ \\ \\  /\'__`\\/\\`\'__\\/\\`\'__\\/\\ \\/\\ \\   \r\n');
            // term.write('     \\ \\ \\/\\  __/\\ \\ \\/ \\ \\ \\/ \\ \\ \\_\\ \\  \r\n');
            // term.write('      \\ \\_\\ \\____\\\\ \\_\\  \\ \\_\\  \\/`____ \\ \r\n');
            // term.write('       \\/_/\\/____/ \\/_/   \\/_/   `/___/> \\\r\n');
            // term.write('                                    /\\___/\r\n');
            // term.write('                                    \\/__/\r\n');
            term.write(' __      __          __       ____    ____    __  __     \r\n');
            term.write('/\\ \\  __/\\ \\        /\\ \\     /\\  _`\\ /\\  _`\\ /\\ \\/\\ \\    \r\n');
            term.write('\\ \\ \\/\\ \\ \\ \\     __\\ \\ \\____\\ \\,\\L\\_\\ \\,L\\_\\ \\ \\_\\ \\   \r\n');
            term.write(' \\ \\ \\ \\ \\ \\ \\  /\'__`\\ \\ \'__`\\/_\\__ \\\\/_\\__ \\\\ \\  _  \\  \r\n');
            term.write('  \\ \\ \\_/ \\_\\ \\/\\  __/\\ \\ \\L\\ \\ /\\ \\L\\ \\ /\\ \\L\\ \\ \\ \\ \\ \\ \r\n');
            term.write('   \\ `\\___x___/\\ \\____\\\\ \\_,__/ \\ `\\____\\ `\\____\\ \\_\\ \\_\\\r\n');
            term.write('    \'\\/__//__/  \\/____/ \\/___/   \\/_____/\\/_____/\\/_/\\/_/\r\n');
            term.write('\x1b[0m\r\n');
            term.write('\t\t\x1b[31mWelcome 远程调试 终端\x1b[0m\r\n');

        },
        onClose: function () {
            // 连接关闭回调
            term.write("connection closed\r\n");
        },
        onData: function (data) {
            // 收到数据时回调
            term.write(data);
        }
    });
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
// 切换主题
// let theme = 'dark';
function setTheme(theme){
    localStorage.setItem('xtermTheme', theme);
    term.setOption('theme', getColor(theme))
    openTerminal();
}

function getColor(theme){
    if (theme === 'blue') {
        // 更改终端主题
        return {background: '#012b58'}
    } else if (theme === 'dark') {
        return {background: '#000'}
    } else if (theme === 'white') {
        return {
            foreground: '#333333',  // 深灰色字体
            background: '#FFFFFF',  // 白色背景
            cursor: '#007BFF',      // 蓝色光标
            selection: '#CCCCCC',   // 浅灰色选中背景
        };
    } else if (theme === 'green') {
        return {
            background: '#006400',  // 白色背景
        };
    }
}