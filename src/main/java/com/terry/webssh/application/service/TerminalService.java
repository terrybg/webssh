package com.terry.webssh.application.service;

import cn.hutool.json.JSONUtil;
import com.jcraft.jsch.JSch;
import com.terry.webssh.application.pojo.SSHConnectInfo;
import com.terry.webssh.application.handle.RemoteWebSocketHandler;
import com.terry.webssh.application.pojo.WebSSHData;
import com.terry.webssh.application.constant.ConstantPool;
import com.terry.webssh.util.SinglePtyExecutor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.*;

/**
 * WebSSH业务逻辑实现
 * @version 1.0
 * @author terry
 * @date 2022/7/4
 */
@Service
@Slf4j
public class TerminalService extends RemoteWebSocketHandler {
    // 存放ssh连接信息的map
    public static Map<String, SSHConnectInfo> sshMap = new ConcurrentHashMap<>();

    private static String charsetName = StandardCharsets.UTF_8.name();

    /**
     * 初始化连接
     * @param session
     */
    @Override
    public void initConnection(WebSocketSession session) {
        SSHConnectInfo sshConnectInfo = new SSHConnectInfo();
        sshConnectInfo.setWebSocketSession(session);
        sshConnectInfo.setJSch(new JSch());
        String uuid = String.valueOf(session.getAttributes().get(ConstantPool.USER_UUID_KEY));
        sshConnectInfo.setUserId(uuid);

        // 低内存限制，只能有一个websocket 连接
        /*sshMap.forEach((k, v) -> {
            try {
                v.getWebSocketSession().close();
            } catch (IOException e) {
                e.printStackTrace();
            }
            sshMap.remove(k);
        });*/

        // 将这个ssh连接信息放入map中
        sshMap.put(uuid, sshConnectInfo);
        log.info("初始化连接 sshMap {}", sshMap.size());
    }

    /**
     * @Description: 处理客户端发送的数据
     * @Param: [buffer, session]
     * @return: void
     * @Author: NoCortY
     * @Date: 2020/3/7
     */
    @Override

    public void recvHandle(String buffer, WebSocketSession session) {
        WebSSHData webSSHData = JSONUtil.toBean(buffer, WebSSHData.class);
        if (ConstantPool.WEBSSH_OPERATE_COMMAND.equals(webSSHData.getOperate())) {
            SinglePtyExecutor.getInstance().autoExecute(webSSHData.getCommand(), (result) -> {
                try {
                    this.sendMessage(session, (result + "\r\n").getBytes());
                } catch (Throwable t) {
                    t.printStackTrace();
                }
            });
        } else if (ConstantPool.WEBSSH_OPERATE_ENCODED.equals(webSSHData.getOperate())) {
            charsetName = webSSHData.getCommand();
        }
    }

    /**
     * 关闭连接
     * @param session
     */
    @Override
    public void close(WebSocketSession session) {
        String userId = String.valueOf(session.getAttributes().get(ConstantPool.USER_UUID_KEY));
        SSHConnectInfo sshConnectInfo = sshMap.get(userId);
        if (sshConnectInfo != null) {
            // 断开连接
            if (sshConnectInfo.getChannel() != null) {
                sshConnectInfo.getChannel().disconnect();
            }
            // map中移除
            sshMap.remove(userId);
        }
        SinglePtyExecutor.getInstance().stopCommand();
        log.info("关闭连接 sshMap {}", sshMap.size());
    }
}
