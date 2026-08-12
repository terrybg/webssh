package com.terry.webssh.application.pojo;

import lombok.Data;

@Data
public class SessionConfig {
    private String id;
    private String name;
    private String ip;
    private Integer port;
    private String userName;
    private String password;
    private Long updatedAt;
}
