package com.terry.webssh.application.pojo;

import lombok.Data;

/**
 * 服务器列表（t_server）
 * @author terry
 * @version 1.0
 * @date 2022/1/23 19:33
 */
@Data
public class Server {

    private String id;

    private String name;

    private String remark;

    private String createTime;

    private String createBy;

    private String ip;

    private String userName;

    private String password;

    private Integer port;

    private String obd;

    private String obdTime;

    public Server() {

    }

    public Server(String ip, String userName, String password, Integer port) {
        this.ip = ip;
        this.userName = userName;
        this.password = password;
        this.port = port;
    }
}
