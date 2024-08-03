package com.terry.webssh;

import cn.hutool.extra.spring.SpringUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.env.Environment;

/**
 * webssh 启动类
 *
 * @author terry
 * @version 1.0
 * @date 2024/3/12 15:59
 */
@SpringBootApplication
@Slf4j
public class WebSshApp {

    public static void main(String[] args) {
        SpringApplication.run(WebSshApp.class);
        Environment env = SpringUtil.getBean(Environment.class);
        Integer port = env.getProperty("local.server.port", Integer.class, 8080);
        log.info("webssh访问地址 http://{}:{}/webssh/page/index.html", "localhost", port);
    }
}
