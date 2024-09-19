package com.terry.webssh.application.service;

import cn.hutool.cache.CacheUtil;
import cn.hutool.cache.impl.FIFOCache;
import cn.hutool.json.JSONUtil;
import cn.hutool.system.SystemUtil;
import com.jcraft.jsch.Channel;
import com.jcraft.jsch.JSch;
import com.terry.webssh.application.pojo.SSHConnectInfo;
import com.terry.webssh.application.handle.RemoteWebSocketHandler;
import com.terry.webssh.application.pojo.Server;
import com.terry.webssh.application.pojo.WebSSHData;
import com.terry.webssh.application.constant.ConstantPool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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

    // 页面登录的
    public static Map<String, Server> webLoginMap = new ConcurrentHashMap<>();
    // public static Map<String, Session> webSshMap = new ConcurrentHashMap<>();
    // 最大 100个回话，会话共用，key(IP:端口号)
    public static FIFOCache<String, SSHConnectInfo> webSshMap = CacheUtil.newFIFOCache(100);

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
        WebSSHData webSSHData = JSONUtil.toBean(buffer, WebSSHData.class);
        if (ConstantPool.WEBSSH_OPERATE_COMMAND.equals(webSSHData.getOperate())) {
            //String command = webSSHData.getCommand();
            BufferedReader stdInput = null;
            BufferedReader stdError = null;
            try {
                String commandPrefix = "";
                String type = "";
                if (SystemUtil.getOsInfo().isWindows()) {
                    commandPrefix = "cmd.exe";
                    type = "/c";
                }
                if (SystemUtil.getOsInfo().isLinux()) {
                    commandPrefix = "/bin/sh";
                    type = "-c";
                }
                // 以Runtime执行命令
                String[] command = {
                        commandPrefix,
                        type,
                        webSSHData.getCommand()
                };
                Process process = Runtime.getRuntime().exec(command);

                // 用于读取标准输出流
                stdInput = new BufferedReader(new InputStreamReader(process.getInputStream(), charsetName));

                // 用于读取错误输出流
                stdError = new BufferedReader(new InputStreamReader(process.getErrorStream(), charsetName));

                // 读取标准输出流
                String s = null;
                while ((s = stdInput.readLine()) != null) {
                    this.sendMessage(session, (s + "\r\n").getBytes());
                }

                // 读取错误输出流
                while ((s = stdError.readLine()) != null) {
                    this.sendMessage(session, (s + "\r\n").getBytes());
                }
                // 等待命令执行完成
                process.waitFor();

            } catch (Exception e) {
                e.printStackTrace();
                this.sendMessage(session, (e.getMessage() + "\r\n").getBytes());
            } finally {
                // 关闭流
                try {
                    if (stdInput != null) {
                        stdInput.close();
                    }
                    if (stdError != null) {
                        stdError.close();
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        } else if (ConstantPool.WEBSSH_OPERATE_ENCODED.equals(webSSHData.getOperate())) {
            charsetName = webSSHData.getCommand();
        }
        return;
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
