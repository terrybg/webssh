package com.terry.webssh.application.pojo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 系统字典
 * @author terry
 * @version 1.0
 * @date 2022/1/23 19:33
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class Dict {

    private String id;

    private String name;

    private String value;
}
