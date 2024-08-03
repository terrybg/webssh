package com.terry.webssh.application.pojo;

import cn.hutool.extra.ssh.Sftp;
import com.jcraft.jsch.Channel;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import lombok.Data;
import org.springframework.web.socket.WebSocketSession;

/**
 * ssh连接信息
 * @version 1.0
 * @author terry
 * @date 2022/7/4
 */
@Data
public class SSHConnectInfo {

    /**
     * session
     */
    private WebSocketSession webSocketSession;

    /**
     * 站点信息
     */
    private String tagId;

    private String userId;
    private JSch jSch;
    private Channel channel;
    private Session session;
    /**
     * 字符编码
     */
    private String encoded;
    private Sftp sftp;
}
