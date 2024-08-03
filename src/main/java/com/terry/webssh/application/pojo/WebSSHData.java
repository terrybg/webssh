package com.terry.webssh.application.pojo;

import lombok.Data;

/**
 * web ssh 配置
 * @version 1.0
 * @author terry
 * @date 2022/7/4
 */
@Data
public class WebSSHData {
    // 操作
    private String operate;
    // 站点信息
    private String tagId;
    // 命令
    private String command = "";
}
