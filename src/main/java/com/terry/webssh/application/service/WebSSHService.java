package com.terry.webssh.application.service;

import cn.hutool.cache.CacheUtil;
import cn.hutool.cache.impl.FIFOCache;
import cn.hutool.core.thread.ThreadUtil;
import cn.hutool.core.util.StrUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jcraft.jsch.Channel;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.terry.webssh.application.handle.RemoteWebSocketHandler;
import com.terry.webssh.application.pojo.SSHConnectInfo;
import com.terry.webssh.application.pojo.Server;
import com.terry.webssh.application.pojo.WebSSHData;
import com.terry.webssh.application.constant.ConstantPool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSSH业务逻辑实现
 * @version 1.0
 * @author terry
 * @date 2022/7/4
 */
@Service
@Slf4j
public class WebSSHService extends RemoteWebSocketHandler {
    // 存放ssh连接信息的map
    public static Map<String, SSHConnectInfo> sshMap = new ConcurrentHashMap<>();

    // 页面登录的
    public static Map<String, Server> webLoginMap = new ConcurrentHashMap<>();
    // public static Map<String, Session> webSshMap = new ConcurrentHashMap<>();
    // 最大 100个回话，会话共用，key(IP:端口号)
    public static FIFOCache<String, SSHConnectInfo> webSshMap = CacheUtil.newFIFOCache(100);

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
        // 将这个ssh连接信息放入map中
        sshMap.put(uuid, sshConnectInfo);
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
        WebSSHData webSSHData;
        ObjectMapper objectMapper = new ObjectMapper();
        try {
            webSSHData = objectMapper.readValue(buffer, WebSSHData.class);
        } catch (IOException e) {
            log.error("JSON转换异常: {}", e.getMessage());
            return;
        }
        String userId = String.valueOf(session.getAttributes().get(ConstantPool.USER_UUID_KEY));
        SSHConnectInfo sshConnectInfo = sshMap.get(userId);
        if (ConstantPool.WEBSSH_OPERATE_CONNECT.equals(webSSHData.getOperate())) {
            // 登录推送到站端
            sshConnectInfo.setTagId(webSSHData.getTagId());
            // TODO 这里的线程池，同时只能10个连接
            ThreadUtil.execAsync(() -> {
                try {
                    // 获取账号密码
                    Server server = webLoginMap.get(sshConnectInfo.getTagId());
                    connectToSSH(sshConnectInfo, server);
                } catch (Exception e) {
                    String msg = "ssh连接异常: " + e.getMessage();
                    log.error(msg);
                    this.sendMessage(sshConnectInfo.getWebSocketSession(), msg.getBytes());
                    close(sshConnectInfo.getWebSocketSession());
                }
            });
            return;
        }
        if (ConstantPool.WEBSSH_OPERATE_COMMAND.equals(webSSHData.getOperate())) {
            String command = webSSHData.getCommand();
            // 当前目录
            if (sshConnectInfo != null) {
                // 发送指令到站端
                try {
                    transToSSH(sshConnectInfo.getChannel(), command);
                } catch (IOException e) {
                    log.error("webssh连接异常");
                    log.error("异常信息:{}", e.getMessage());
                    close(session);
                }
            }
            return;
        }
        if (ConstantPool.WEBSSH_OPERATE_ENCODED.equals(webSSHData.getOperate())) {
            sshConnectInfo.setEncoded(webSSHData.getCommand());
        } else {
            log.error("不支持的操作");
            close(session);
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
    }

    /**
     * 使用jsch连接终端
     * @param sshConnectInfo
     * @throws JSchException
     * @throws IOException
     */
    private void connectToSSH(SSHConnectInfo sshConnectInfo, Server server) throws JSchException, IOException {
        Properties config = new Properties();
        config.put("StrictHostKeyChecking", "no");
        // 获取jsch的会话 读取配置文件参数
        Session session = sshConnectInfo.getJSch().getSession(server.getUserName(), server.getIp(), server.getPort());
        session.setConfig(config);
        // 设置密码
        session.setPassword(server.getPassword());
        // 连接超时30s
        session.connect(30000);
        // 开启shell通道
        Channel channel = session.openChannel("shell");
        // 通道连接 超时时间3s
        channel.connect(3000);
        // 设置channel
        sshConnectInfo.setChannel(channel);

        // 转发消息
        //transToSSH(channel, "\r");
        sshConnectInfo.setSession(session);

        // 读取终端返回的信息流
        InputStream inputStream = channel.getInputStream();
        try {
            int i = 0;
            // 循环读取
            byte[] buffer = new byte[1024];
            // 如果没有数据来，线程会一直阻塞在这个地方等待数据。
            while ((i = inputStream.read(buffer)) != -1) {
                byte[] bytes = Arrays.copyOfRange(buffer, 0, i);
                if (StrUtil.isNotEmpty(sshConnectInfo.getEncoded())) {
                    // String data = new String(bytes, sshConnectInfo.getEncoded());
                    bytes = new String(bytes, sshConnectInfo.getEncoded()).getBytes();
                }
                sendMessage(sshConnectInfo.getWebSocketSession(), bytes);
            }
        } finally {
            // 断开连接后关闭会话
            session.disconnect();
            channel.disconnect();
            if (inputStream != null) {
                inputStream.close();
            }
        }
    }

    /**
     * 将消息转发到终端
     * @param channel
     * @param command
     * @throws IOException
     */
    private void transToSSH(Channel channel, String command) throws IOException {
        if (channel != null) {
            OutputStream outputStream = channel.getOutputStream();
            outputStream.write(command.getBytes());
            outputStream.flush();
        }
    }
}
