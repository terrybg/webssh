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

    /** 权限八进制，如 755 */
    private String permissions;

    /** 权限符号串，如 rwxr-xr-x */
    private String permissionText;

    /** 所有者 uid（字符串） */
    private String owner;

    /** 组 gid（字符串） */
    private String group;
}
