package com.terry.webssh.application.pojo;

import lombok.Data;

/**
 * 文件服务
 *
 * @author terry
 * @version 1.0
 * @date 2024/3/13 11:30
 */
@Data
public class SftpFile {

    private String name;

    private boolean dir;

    private long size;

    private String createTime;

    private String modifyTime;
}
