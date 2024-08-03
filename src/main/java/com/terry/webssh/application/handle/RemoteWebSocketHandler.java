package com.terry.webssh.application.handle;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.*;

import java.io.IOException;

/**
 * WebSocket处理器
 * @version 1.0
 * @author terry
 * @date 2022/7/4
 */
@Slf4j
public abstract class RemoteWebSocketHandler implements WebSocketHandler {

    /**
     * 用户连接上WebSocket的回调
     * @param webSocketSession
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession webSocketSession) {
        initConnection(webSocketSession);
    }

    /**
     * 收到消息的回调
     * @param webSocketSession
     * @param webSocketMessage
     */
    @Override
    public void handleMessage(WebSocketSession webSocketSession, WebSocketMessage<?> webSocketMessage) {
        if (webSocketMessage instanceof TextMessage) {
            // 调用service接收消息
            recvHandle(((TextMessage) webSocketMessage).getPayload(), webSocketSession);
        } else if (webSocketMessage instanceof BinaryMessage) {

        } else if (webSocketMessage instanceof PongMessage) {

        } else {
            log.info("Unexpected WebSocket message type: " + webSocketMessage);
        }
    }

    /**
     * 出现错误的回调
     * @param webSocketSession
     * @param throwable
     */
    @Override
    public void handleTransportError(WebSocketSession webSocketSession, Throwable throwable) {
        log.error("数据传输错误");
    }

    /**
     * 连接关闭的回调
     * @param webSocketSession
     * @param closeStatus
     */
    @Override
    public void afterConnectionClosed(WebSocketSession webSocketSession, CloseStatus closeStatus) {
        // 调用service关闭连接
        close(webSocketSession);
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }

    /**
     * 初始化连接
     */
    protected abstract void initConnection(WebSocketSession webSocketSession);

    /**
     * 处理客户段发的数据
     */
    protected abstract void recvHandle(String message, WebSocketSession webSocketSession);

    /**
     * 数据写回前端 for websocket
     */
    public void sendMessage(WebSocketSession session, byte[] buffer) {
        TextMessage textMessage = new TextMessage(buffer);
        try {
            session.sendMessage(textMessage);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /**
     * 关闭连接
     */
    protected abstract void close(WebSocketSession webSocketSession);
}
