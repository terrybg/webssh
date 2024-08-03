function WSSHClient(url) {
    this.url = url || wsUrl;
};

WSSHClient.prototype.connect = function (options) {
    if (window.WebSocket) {
        // 如果支持websocket
        this._connection = new WebSocket(this.url);
    } else {
        // 否则报错
        options.onError('WebSocket Not Supported');
        return;
    }

    this._connection.onopen = function () {
        options.onConnect();
    };

    this._connection.onmessage = function (evt) {
        const data = evt.data.toString();
        // data = base64.decode(data);
        options.onData(data);
    };

    this._connection.onclose = function (evt) {
        options.onClose();
    };
};

WSSHClient.prototype.send = function (data) {
    this._connection.send(JSON.stringify(data));
};

WSSHClient.prototype.close = function () {
    // 发送指令
    this._connection.close();
}